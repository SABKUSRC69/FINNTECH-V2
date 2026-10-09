import { expect, it, vi } from 'vitest'
import request from 'supertest'
import { readListenerConfiguration } from '../src/runtime-config.js'
import { readAuthConfiguration } from '../src/auth/config.js'
import { betaEmailAllowed, createBetaAuthGuard, registerBeta, type BetaConfiguration } from '../src/auth/beta.js'
import { authSubjectAllowed } from '../src/auth/authorization.js'
import { createApp } from '../src/app.js'
import type { AuthRuntime } from '../src/auth/runtime.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'

const beta: BetaConfiguration = { access: 'invited', registrationsOpen: true, invitedEmails: new Set(['invited@example.invalid']) }
const cloud = { NODE_ENV: 'production', TRACKER_RUNTIME_MODE: 'cloud-beta', PORT: '10000', DATABASE_URL: 'postgresql://beta_app:synthetic-only@ep-synthetic.neon.tech/finntech_beta?sslmode=verify-full',
  TRACKER_BETA_DATABASE_HOST: 'ep-synthetic.neon.tech',
  BETTER_AUTH_SECRET: 's'.repeat(64), TRACKER_ORIGIN: 'https://synthetic.onrender.com', TRACKER_RECOVERY_MODE: 'off', TRACKER_BETA_DATA_MODE: 'synthetic', TRACKER_BETA_ACCESS: 'public', TRACKER_BETA_REGISTRATIONS_OPEN: 'true' }
const authRequest = (email: string, path = 'sign-up/email', extra: Record<string, string> = {}) => new Request(`https://synthetic.onrender.com/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ email, password: 'synthetic-only-password' }) })
it('keeps local loopback/PORT guards and permits cloud binding only with explicit production mode', () => {
  expect(readListenerConfiguration({})).toEqual({ host: '127.0.0.1', port: 4174 })
  expect(() => readListenerConfiguration({ PORT: '10000' })).toThrow('PORT is unsupported')
  expect(() => readListenerConfiguration({ TRACKER_HOST: '0.0.0.0' })).toThrow('127.0.0.1')
  expect(readListenerConfiguration(cloud)).toEqual({ host: '0.0.0.0', port: 10000 })
  for (const PORT of ['', '1.5', '-1', '65536', 'abc']) expect(() => readListenerConfiguration({ ...cloud, PORT })).toThrow()
  expect(() => readListenerConfiguration({ ...cloud, NODE_ENV: 'test' })).toThrow()
})
it('rejects real data/recovery/owner targets/incomplete beta configurations before startup', () => {
  expect(readAuthConfiguration(cloud)?.beta?.access).toBe('public')
  expect(readAuthConfiguration(cloud)?.secureCookies).toBe(true)
  for (const delta of [{ TRACKER_BETA_DATA_MODE: 'real' }, { TRACKER_RECOVERY_MODE: 'synthetic-3a' }, { TRACKER_BETA_ACCESS: '' },
    { DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5441/finntech_recovery_3a_20261007' }, { TRACKER_BETA_REGISTRATIONS_OPEN: '' },
    { TRACKER_BETA_ACCESS: 'invited' }]) expect(() => readAuthConfiguration({ ...cloud, ...delta })).toThrow()
})
it('enforces invitations on direct Auth requests while public access requires its explicit mode', async () => {
  const guard = createBetaAuthGuard(beta, 'synthetic-key')
  expect((await guard(authRequest('outsider@example.invalid')))?.status).toBe(403)
  expect((await guard(authRequest('outsider@example.invalid', 'sign-in/email')))?.status).toBe(403)
  expect(await guard(authRequest('Invited@example.invalid'))).toBeUndefined()
  expect(betaEmailAllowed(beta, 'OUTSIDER@example.invalid')).toBe(false)
  expect(await createBetaAuthGuard({ ...beta, access: 'public' }, 'synthetic-key')(authRequest('outsider@example.invalid'))).toBeUndefined()
})
it('closes new registration without locking existing login/logout/backup; spoof IP cannot reset account bucket', async () => {
  const guard = createBetaAuthGuard({ ...beta, access: 'public', registrationsOpen: false }, 'synthetic-key')
  expect((await guard(authRequest('synthetic@example.invalid')))?.status).toBe(403)
  expect(await guard(authRequest('synthetic@example.invalid', 'sign-in/email'))).toBeUndefined()
  expect(await guard(new Request('https://synthetic.onrender.com/api/auth/sign-out', { method: 'POST' }))).toBeUndefined()
  const limited = createBetaAuthGuard({ ...beta, access: 'public' }, 'synthetic-key')
  for (let n = 0; n < 10; n++) expect(await limited(authRequest('same@example.invalid', 'sign-in/email', { 'X-Forwarded-For': `198.51.100.${n}` }))).toBeUndefined()
  expect((await limited(authRequest('same@example.invalid', 'sign-in/email', { 'X-Forwarded-For': '203.0.113.1' })))?.status).toBe(429)
})
it('bounds Auth bodies and rejects malformed JSON before calling the library', async () => {
  const guard = createBetaAuthGuard({ ...beta, access: 'public' }, 'synthetic-key')
  const oversized = new Request('https://synthetic.onrender.com/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ email: 'synthetic@example.invalid', password: 'x'.repeat(17000) }) })
  expect((await guard(oversized))?.status).toBe(413)
  expect((await guard(new Request('https://synthetic.onrender.com/api/auth/sign-up/email', { method: 'POST', body: '{' })))?.status).toBe(403)
})
it('denies invited subject before owner mapping, including /me/get-session; public auth still requires sessions', async () => {
  const identity = vi.fn()
  const auth = { options: { baseURL: cloud.TRACKER_ORIGIN, secret: cloud.BETTER_AUTH_SECRET }, api: { getSession: vi.fn(async () => ({ user: { id: 'synthetic' } })) },
    handler: vi.fn(async () => Response.json({ user: { id: 'synthetic' } })) } as unknown as AuthRuntime
  registerBeta(auth, beta)
  const database = { demoWorkspace: { findUnique: vi.fn(async () => null) }, authUser: { findUnique: vi.fn(async () => ({ email: 'outsider@example.invalid' })) }, authIdentity: { findUnique: identity } } as unknown as PrismaClient
  expect(await authSubjectAllowed(auth, database, 'synthetic')).toBe(false)
  const app = createApp({ auth, database })
  expect((await request(app).get('/api/me').set('X-Owner-Id', 'forged')).status).toBe(403)
  expect((await request(app).get('/api/auth/get-session')).body).toBeNull()
  expect(identity).not.toHaveBeenCalled()
})
it('readiness is fail closed and does not confuse health process availability with database readiness', async () => {
  expect((await request(createApp()).get('/api/ready')).status).toBe(503)
})
