import { describe, it, expect } from 'vitest'
import { cashInputSchema, cashUpdateSchema, backupDocumentSchema } from '../src/index.js'
const cash = { name: ' เงินสด ', balance: '0', currency: 'THB', asOf: '2026-10-05' }
describe('cash snapshot contracts', () => {
  it('permits zero cash, normalizes names, rejects negative/number/overscale/invalid dates', () => {
    expect(cashInputSchema.parse(cash).name).toBe('เงินสด')
    for (const balance of ['-0', '-1', '1.001', 100, null, '1e2', ' 1']) expect(cashInputSchema.safeParse({ ...cash, balance }).success).toBe(false)
    expect(cashInputSchema.safeParse({ ...cash, asOf: '2026-02-30' }).success).toBe(false)
    expect(cashInputSchema.safeParse({ ...cash, ownerId: 'external' }).success).toBe(false)
    expect(cashUpdateSchema.safeParse({ ...cash, expectedVersion: 0 }).success).toBe(false)
  })
  it('keeps strict v1 compatibility and requires cash whitelist in v2', () => {
    const document = { format: 'FINNTECH_TRACKER_BACKUP', version: 1, provenance: 'USER_ENTERED', exportedAt: '2026-10-05T00:00:00.000Z', categories: [], transactions: [], budgets: [], portfolios: [], trades: [] }
    expect(backupDocumentSchema.parse(document)).toEqual(document)
    expect(backupDocumentSchema.safeParse({ ...document, version: 2 }).success).toBe(false)
    const account = { ...cash, id: '00000000-0000-4000-8000-000000000001' }
    expect(backupDocumentSchema.safeParse({ ...document, version: 2, cashAccounts: [account] }).success).toBe(true)
    expect(backupDocumentSchema.safeParse({ ...document, version: 2, cashAccounts: [account, account] }).success).toBe(false)
  })
})
