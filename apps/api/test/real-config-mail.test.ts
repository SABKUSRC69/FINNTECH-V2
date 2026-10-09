import { expect, it, vi } from 'vitest'
import { readAuthConfiguration } from '../src/auth/config.js'
import { readListenerConfiguration } from '../src/runtime-config.js'
import { BrevoDeliverySink } from '../src/auth/mail.js'
import { seal } from '../src/auth/delivery.js'
import { boundedAuthBody } from '../src/auth/real.js'
import { realSignupAllowed, realEmailAllowed } from '../src/auth/real.js'

const key = 'a'.repeat(64), origin = 'https://real.example.test'
const environment = { NODE_ENV: 'production', TRACKER_RUNTIME_MODE: 'cloud-real', PORT: '10000',
  DATABASE_URL: 'postgresql://personal_app:unit-test-only@ep-unit.us-east-2.aws.neon.tech/personal_finance?sslmode=verify-full',
  BETTER_AUTH_SECRET: 'b'.repeat(64), TRACKER_ORIGIN: origin, TRACKER_DATA_MODE: 'real',
  TRACKER_REAL_DATABASE_HOST: 'ep-unit.us-east-2.aws.neon.tech', TRACKER_REAL_DATABASE_NAME: 'personal_finance', TRACKER_REAL_DATABASE_ROLE: 'personal_app',
  TRACKER_REAL_SUPPORT_EMAIL: 'support@example.test',
  TRACKER_RECOVERY_MODE: 'real-email', TRACKER_RECOVERY_OUTBOX_KEY: key,
  TRACKER_MAIL_PROVIDER: 'brevo', TRACKER_MAIL_API_KEY: 'c'.repeat(48), TRACKER_MAIL_SENDER: 'sender@example.test', TRACKER_MAIL_SENDER_CONFIRMED: 'owner-verified' }
it('supports explicit email/password mode without provider secrets and never enables recovery implicitly', () => {
  const input = { ...environment, TRACKER_REAL_AUTH_MODE: 'email-password', TRACKER_RECOVERY_MODE: 'off',
    TRACKER_MAIL_API_KEY: '', TRACKER_MAIL_SENDER: '', TRACKER_RECOVERY_OUTBOX_KEY: '', TRACKER_REAL_SUPPORT_EMAIL: '',
    TRACKER_REAL_REGISTRATIONS_OPEN: 'true', TRACKER_REAL_ACCEPTANCE_APPROVED: 'review-approved' }
  const config = readAuthConfiguration(input)!
  expect(config.real?.authenticationMode).toBe('email-password')
  expect(config.real?.registrationsOpen).toBe(true)
  expect(config.recovery).toBeUndefined()
  for (const delta of [{ TRACKER_RECOVERY_MODE: 'real-email' }, { TRACKER_REAL_AUTH_MODE: 'typo' },
    { TRACKER_REAL_ACCEPTANCE_APPROVED: '' }, { FINNTECH_DEMO_ENABLED: 'false' }, { TRACKER_REAL_DATABASE_NAME: 'finntech_beta' }]) {
    expect(() => readAuthConfiguration({ ...input, ...delta })).toThrow()
  }
})
it('staging enrollment keeps public signup closed and enforces normalized private membership',()=>{
  const config=readAuthConfiguration({...environment,TRACKER_REAL_ENROLLMENT_MODE:'staging',TRACKER_REAL_STAGING_EMAILS:' Owner@Example.test '})!.real!
  expect(config.registrationsOpen).toBe(false)
  expect(realSignupAllowed(config,'owner@example.test')).toBe(true)
  expect(realSignupAllowed(config,'other@example.test')).toBe(false)
  expect(realEmailAllowed(config,'other@example.test')).toBe(false)
  for(const delta of [{TRACKER_REAL_STAGING_EMAILS:''},{TRACKER_REAL_ENROLLMENT_MODE:'closed'},{TRACKER_REAL_REGISTRATIONS_OPEN:'true'},{TRACKER_REAL_STAGING_EMAILS:'invalid'}])
    expect(()=>readAuthConfiguration({...environment,TRACKER_REAL_ENROLLMENT_MODE:'staging',TRACKER_REAL_STAGING_EMAILS:'owner@example.test',...delta})).toThrow()
})
it('real configuration defaults registration closed and remains distinct from synthetic beta', () => {
  const config = readAuthConfiguration(environment)!
  expect(config.real?.registrationsOpen).toBe(false); expect(config.beta).toBeUndefined(); expect(config.demo).toBeUndefined()
  expect(config.recovery?.mode).toBe('real-email'); expect(config.secureCookies).toBe(true)
  expect(readListenerConfiguration(environment)).toEqual({ host: '0.0.0.0', port: 10000 })
})
it.each([
  { TRACKER_DATA_MODE: 'synthetic' }, { DATABASE_URL: environment.DATABASE_URL.replace('personal_finance', 'finntech_beta') },
  { TRACKER_REAL_DATABASE_NAME: 'finntech_beta' }, { TRACKER_REAL_DATABASE_ROLE: 'beta_app' }, { TRACKER_REAL_DATABASE_HOST: 'other.neon.tech' },
  { DATABASE_URL: environment.DATABASE_URL.replace('verify-full', 'require') }, { FINNTECH_DEMO_ENABLED: 'false' },
  { TRACKER_REAL_REGISTRATIONS_OPEN: 'true' }, { TRACKER_MAIL_PROVIDER: 'synthetic' }, { TRACKER_MAIL_API_KEY: '' },
  { TRACKER_MAIL_SENDER_CONFIRMED: '' }, { TRACKER_REAL_MAIL_ATTEMPT_LIMIT: '301' }, { TRACKER_RECOVERY_MODE: 'synthetic-3a' },
  { TRACKER_ORIGIN: 'http://127.0.0.1:4198' }, { NODE_ENV: 'test' },
  { TRACKER_REAL_SUPPORT_EMAIL: '' }, { TRACKER_REAL_DATABASE_LIMIT_BYTES: '999999999' },
])('fails closed for inconsistent real-use settings %#', delta => {
  expect(() => readAuthConfiguration({ ...environment, ...delta })).toThrow()
})
it('keeps provider listener restrictions in the real cloud mode', () => {
  for (const delta of [{ PORT: '' }, { NODE_ENV: 'test' }, { TRACKER_HOST: '127.0.0.1' }, { TRACKER_API_PORT: '4198' }]) expect(() => readListenerConfiguration({ ...environment, ...delta })).toThrow()
})
it('sends minimal HTTPS mail with a stable job id across retries; token stays in fragment', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }))
  const sink = new BrevoDeliverySink({ provider: 'brevo', apiKey: environment.TRACKER_MAIL_API_KEY, sender: environment.TRACKER_MAIL_SENDER }, key, origin, fetcher)
  const id = '10000000-0000-4000-8000-000000000001', envelope = seal({ email: 'recipient@example.test', kind: 'verify', link: `${origin}/account/verify#token=test-only` }, key)
  await sink.deliver(id, envelope); await sink.deliver(id, envelope)
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.brevo.com/v3/smtp/email', 'https://api.brevo.com/v3/smtp/email'])
  expect(fetcher.mock.calls.map(([, options]) => options?.body)).toEqual([fetcher.mock.calls[0]![1]!.body, fetcher.mock.calls[0]![1]!.body])
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string)
  expect(body.headers['Idempotency-Key']).toBe(id); expect(body.to).toEqual([{ email: 'recipient@example.test' }])
  expect(body.textContent).toContain('#token=test-only'); expect(body).not.toHaveProperty('attachment')
})
it.each([429, 500, 403])('withholds provider details and never follows redirects/errors (%s)', async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret-provider-body', { status }))
  const sink = new BrevoDeliverySink({ provider: 'brevo', apiKey: 'test-only', sender: 'sender@example.test' }, key, origin, fetcher)
  await expect(sink.deliver('10000000-0000-4000-8000-000000000001', seal({ email: 'recipient@example.test', kind: 'notice' }, key))).rejects.toThrow('mail_delivery_unconfirmed')
  expect(fetcher.mock.calls[0]![1]!.redirect).toBe('error')
})
it('accepts only the provider duplicate receipt and rejects hostile links without calling the network', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"code":"duplicate_parameter"}', { status: 400 }))
  const sink = new BrevoDeliverySink({ provider: 'brevo', apiKey: 'test-only', sender: 'sender@example.test' }, key, origin, fetcher)
  await sink.deliver('10000000-0000-4000-8000-000000000001', seal({ email: 'recipient@example.test', kind: 'notice' }, key))
  for (const link of ['https://hostile.test/account/reset#token=test', `${origin}/account/reset?token=test`, `${origin}/account/verify#token=test`]) {
    await expect(sink.deliver('10000000-0000-4000-8000-000000000002', seal({ email: 'recipient@example.test', kind: 'reset', link }, key))).rejects.toThrow('mail_delivery_rejected')
  }
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('bounds authentication bodies including invalid JSON and arrays', async () => {
  const request = (body: string) => new Request(`${origin}/api/auth/sign-in/email`, { method: 'POST', body })
  expect(await boundedAuthBody(request('{"email":"test@example.test"}'))).toEqual({ email: 'test@example.test' })
  for (const body of ['[]', 'null', 'not-json', JSON.stringify({ email: 'x'.repeat(16384) })]) expect(await boundedAuthBody(request(body))).toBeUndefined()
})
