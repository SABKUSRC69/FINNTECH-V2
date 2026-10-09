import { randomBytes } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import { createDemoRequestGuard, demoCodeMatches, demoSubjectAllowed, registerDemo } from '../src/auth/demo.js'
import { readAuthConfiguration } from '../src/auth/config.js'
import type { AuthRuntime } from '../src/auth/runtime.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'

describe('demo configuration and boundary', () => {
  it('requires explicit isolated cloud Beta, validates limits, keeps code server-only and fails closed', () => {
    const code = randomBytes(24).toString('hex')
    const env = { NODE_ENV: 'production', TRACKER_RUNTIME_MODE: 'cloud-beta', TRACKER_ORIGIN: 'https://synthetic.onrender.com',
      DATABASE_URL: `postgresql://beta_app:${randomBytes(24).toString('hex')}@ep-synthetic.neon.tech/finntech_beta?sslmode=verify-full`, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      TRACKER_BETA_ACCESS: 'public', TRACKER_BETA_DATA_MODE: 'synthetic', TRACKER_BETA_REGISTRATIONS_OPEN: 'false', TRACKER_RECOVERY_MODE: 'off', TRACKER_BETA_DATABASE_HOST: 'ep-synthetic.neon.tech',
      FINNTECH_DEMO_ENABLED: 'true', FINNTECH_DEMO_ACCESS_CODE: code }
    const result = readAuthConfiguration(env)!
    expect(result.demo).toMatchObject({ enabled: true, epoch: '1', expiresIn: 14400, accountLimit: 100 })
    expect(result.beta?.registrationsOpen).toBe(false)
    for (const change of [{ FINNTECH_DEMO_ACCESS_CODE: '' }, { FINNTECH_DEMO_SESSION_SECONDS: '0' }, { FINNTECH_DEMO_ACCOUNT_LIMIT: '5001' }, { FINNTECH_DEMO_ENABLED: 'yes' }]) {
      expect(() => readAuthConfiguration({ ...env, ...change })).toThrow('Invalid isolated demo configuration')
    }
    expect(readAuthConfiguration({ ...env, FINNTECH_DEMO_ENABLED: 'false', FINNTECH_DEMO_ACCESS_CODE: '' })?.demo?.enabled).toBe(false)
  })
  it('checks exact code without trimming, coercion or oversized input', () => {
    const code = randomBytes(24).toString('hex')
    expect(demoCodeMatches(code, code)).toBe(true)
    for (const wrong of [undefined, { code }, ` ${code}`, `${code} `, 'x'.repeat(1024), randomBytes(24).toString('hex')]) expect(demoCodeMatches(wrong, code)).toBe(false)
  })
  it('bounds chunked bodies before parsing and does not trust spoofed proxy IPs to evade the service limit', async () => {
    const guard = createDemoRequestGuard(), make = (body: string) => new Request('https://synthetic.onrender.com/api/auth/demo/enter', { method: 'POST', body })
    expect((await guard(make('x'.repeat(1025))))?.status).toBe(413)
    for (let i = 0; i < 29; i++) await guard(make('{}'))
    const forged = make('{}'); forged.headers.set('X-Forwarded-For', '203.0.113.9')
    expect((await guard(forged))?.status).toBe(429)
  })
  it('preserves normal users; demo needs an unexpired matching epoch; entry disable is independent', async () => {
    const auth = {} as AuthRuntime
    const find = vi.fn(async () => null as { epoch: string; expiresAt: Date } | null)
    const database = { demoWorkspace: { findUnique: find } } as unknown as PrismaClient
    expect(await demoSubjectAllowed(auth, database, 'normal')).toBe(true)
    const configuration = { enabled: false, code: '', epoch: '1', expiresIn: 60, accountLimit: 10 }
    registerDemo(auth, configuration)
    find.mockResolvedValue({ epoch: '1', expiresAt: new Date(Date.now() + 60000) })
    expect(await demoSubjectAllowed(auth, database, 'demo')).toBe(true)
    configuration.epoch = '2'; expect(await demoSubjectAllowed(auth, database, 'demo')).toBe(false)
    find.mockResolvedValue({ epoch: '2', expiresAt: new Date(Date.now() - 1) }); expect(await demoSubjectAllowed(auth, database, 'demo')).toBe(false)
    expect(await demoSubjectAllowed({} as AuthRuntime, database, 'demo')).toBe(false)
  })
  it('bounds a stalled upload before endpoint parsing and releases its timer', async () => {
    vi.useFakeTimers()
    try {
      const request = new Request('https://synthetic.onrender.com/api/auth/demo/enter', { method: 'POST', body: new ReadableStream(), duplex: 'half' } as RequestInit)
      const operation = createDemoRequestGuard()(request)
      await vi.advanceTimersByTimeAsync(5000)
      expect((await operation)?.status).toBe(400)
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
