// SYNTHETIC tokens and secrets only.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { MarketKeyCipher, PersonalDailyCloses } from '../src/tracker/market-keys.js'

const SECRET = 'synthetic-auth-secret-0123456789abcdef-XYZ', TOKEN = 'SyntheticTiingoToken0123456789abcdef'
const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b'
describe('personal market key encryption', () => {
  it('round-trips, never stores the token in clear and uses a fresh IV each time', () => {
    const cipher = new MarketKeyCipher(SECRET), one = cipher.seal(A, TOKEN), two = cipher.seal(A, TOKEN)
    expect(cipher.open(A, one)).toBe(TOKEN)
    expect(one.includes(Buffer.from(TOKEN))).toBe(false)
    expect(one.equals(two)).toBe(false)
    expect(one[0]).toBe(1); expect(one.length).toBe(1 + 12 + 16 + TOKEN.length)
  })
  it('a row moved to another owner, a tampered byte or another server secret cannot be decrypted', () => {
    const cipher = new MarketKeyCipher(SECRET), sealed = cipher.seal(A, TOKEN)
    expect(() => cipher.open(B, sealed)).toThrow()
    const tampered = Buffer.from(sealed); tampered[tampered.length - 1]! ^= 1
    expect(() => cipher.open(A, tampered)).toThrow()
    expect(() => new MarketKeyCipher(SECRET + '!').open(A, sealed)).toThrow()
    expect(() => cipher.open(A, Buffer.from([2, ...sealed.subarray(1)]))).toThrow()
    expect(() => new MarketKeyCipher('short')).toThrow()
  })
  it('request digests are keyed and owner-bound, not a plain hash of the token', () => {
    const cipher = new MarketKeyCipher(SECRET)
    expect(cipher.digest(A, TOKEN)).toMatch(/^[0-9a-f]{64}$/)
    expect(cipher.digest(A, TOKEN)).not.toBe(cipher.digest(B, TOKEN))
    expect(cipher.digest(A, TOKEN)).not.toBe(createHash('sha256').update(TOKEN).digest('hex'))
    expect(new MarketKeyCipher(SECRET + '!').digest(A, TOKEN)).not.toBe(cipher.digest(A, TOKEN))
  })
})

describe('personal market key service (fake storage)', () => {
  const KEY = '00000000-0000-4000-8000-0000000000aa'
  it('a retried save that already committed returns its receipt without contacting the provider again', async () => {
    const cipher = new MarketKeyCipher(SECRET), receipt = { status: 'ACTIVE', hint: 'cdef', version: 1 }
    const payload = { provider: 'TIINGO', token: cipher.digest(A, TOKEN), confirmPersonalUse: true, expectedVersion: null }
    const db = { idempotencyKey: { findUnique: async () => ({ requestSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), receipt }) } } as unknown as PrismaClient
    let verified = 0
    const keys = new PersonalDailyCloses(db, cipher, () => ({ source: 'x', attribution: { label: 'x', url: 'https://example.test' }, latestClose: async () => { verified++; throw new Error('provider down') } }))
    expect(await keys.save(A, KEY, { provider: 'TIINGO', token: TOKEN, confirmPersonalUse: true, expectedVersion: null })).toEqual(receipt)
    expect(verified).toBe(0)
  })
  it('an undecryptable key (rotated secret) reports authentication failure without contacting the provider and is logged once', async () => {
    const sealed = new MarketKeyCipher(SECRET + '-old').seal(A, TOKEN), logs: string[] = []
    const db = {
      ownerMarketKey: { findUnique: async () => ({ status: 'ACTIVE', ciphertext: sealed, version: 3 }) },
      stockHolding: { findMany: async () => [{ symbol: 'AAPL' }] },
    } as unknown as PrismaClient
    let providerCalls = 0
    const keys = new PersonalDailyCloses(db, new MarketKeyCipher(SECRET), () => {
      providerCalls++
      throw new Error('An undecryptable key must not contact the provider')
    }, Date.now, line => logs.push(line))
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await keys.snapshotFor(A)).toMatchObject({
        retention: 'TRANSIENT', keySource: 'ACCOUNT', keyVersion: 3,
        quotes: [{ symbol: 'AAPL', close: null, status: 'ERROR', problem: 'AUTH_FAILED' }],
      })
    }
    expect(providerCalls).toBe(0)
    expect(logs).toHaveLength(1)
  })
})
