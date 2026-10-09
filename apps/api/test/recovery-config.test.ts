import { expect, it } from 'vitest'
import { readAuthConfiguration } from '../src/auth/config.js'
import { seal, openEnvelope } from '../src/auth/delivery.js'

const base = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://recovery_fixture:synthetic-test-only@127.0.0.1:5441/finntech_recovery_3a_20261007',
  BETTER_AUTH_SECRET: 's'.repeat(64), TRACKER_ORIGIN: 'http://127.0.0.1:4197' }
const enabled = { ...base, TRACKER_RECOVERY_MODE: 'synthetic-3a', TRACKER_RECOVERY_CONFIRM: 'synthetic-only', TRACKER_RECOVERY_OUTBOX_KEY: 'a'.repeat(64), TRACKER_RECOVERY_SINK_DIRECTORY: 'C:/synthetic/mailbox' }
it('keeps recovery off by default and rejects rollout outside the exact synthetic target', () => {
  expect(readAuthConfiguration(base)?.recovery).toBeUndefined()
  expect(readAuthConfiguration(enabled)?.recovery?.resetExpiresIn).toBe(900)
  for (const delta of [{ TRACKER_RECOVERY_MODE: 'on' }, { TRACKER_RECOVERY_CONFIRM: '' }, { TRACKER_ORIGIN: 'http://127.0.0.1:4173' },
    { DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5435/finntech_auth_test' }, { TRACKER_RECOVERY_OUTBOX_KEY: 'weak' }]) {
    expect(() => readAuthConfiguration({ ...enabled, ...delta })).toThrow('restricted')
  }
})
it('encrypts the minimal local message and rejects tampering/wrong key', () => {
  const key = 'a'.repeat(64), message = { email: 'synthetic@example.invalid', kind: 'reset' as const, link: 'http://127.0.0.1:4197/account/reset?token=synthetic-token' }
  const envelope = seal(message, key)
  expect(envelope).not.toContain(message.email); expect(envelope).not.toContain('synthetic-token')
  expect(openEnvelope(envelope, key)).toEqual(message)
  expect(() => openEnvelope(envelope, 'b'.repeat(64))).toThrow()
})
