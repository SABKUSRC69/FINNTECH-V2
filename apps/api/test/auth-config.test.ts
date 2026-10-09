import { describe, expect, it } from 'vitest'
import { readAuthConfiguration } from '../src/auth/config.js'

const valid = {
  DATABASE_URL: 'postgresql://synthetic:synthetic-only@127.0.0.1:5435/finntech_auth_test',
  BETTER_AUTH_SECRET: 's'.repeat(64), TRACKER_ORIGIN: 'http://127.0.0.1:4173',
}

describe('server Auth configuration boundary', () => {
  it('keeps the existing skeleton dormant without Auth environment', () => {
    expect(readAuthConfiguration({})).toBeUndefined()
    expect(readAuthConfiguration({ DATABASE_URL: valid.DATABASE_URL })).toBeUndefined()
  })
  it('rejects partial, placeholder and weak configuration without revealing values', () => {
    expect(() => readAuthConfiguration({ TRACKER_ORIGIN: valid.TRACKER_ORIGIN })).toThrow('Auth requires')
    expect(() => readAuthConfiguration({ ...valid, BETTER_AUTH_SECRET: '<PLACEHOLDER>' })).toThrow('non-placeholder')
    expect(() => readAuthConfiguration({ ...valid, DATABASE_URL: 'invalid' })).toThrow('values withheld')
  })
  it('accepts only one exact origin and requires HTTPS outside local development', () => {
    for (const origin of ['http://example.invalid', 'http://127.0.0.1:4173/path', 'http://user@127.0.0.1:4173']) {
      expect(() => readAuthConfiguration({ ...valid, TRACKER_ORIGIN: origin })).toThrow()
    }
    expect(() => readAuthConfiguration({ ...valid, NODE_ENV: 'production' })).toThrow('HTTPS')
    expect(() => readAuthConfiguration({ NODE_ENV: 'production' })).toThrow('Auth requires')
    expect(readAuthConfiguration(valid)?.secureCookies).toBe(false)
    expect(readAuthConfiguration({ ...valid, TRACKER_ORIGIN: 'https://example.invalid', NODE_ENV: 'production' })?.secureCookies).toBe(true)
  })
})
