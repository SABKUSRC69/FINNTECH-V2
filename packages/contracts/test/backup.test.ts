import { describe, expect, it } from 'vitest'
import { backupDocumentSchema, backupRestoreSchema } from '../src/index.js'
const category = '00000000-0000-4000-8000-000000000001'
const timestamp = '2026-10-04T00:00:00.000Z'
const fixture = () => ({ format: 'FINNTECH_TRACKER_BACKUP', version: 1, provenance: 'USER_ENTERED', exportedAt: timestamp,
  categories: [{ id: category, name: 'อาหาร', type: 'expense' }], budgets: [], portfolios: [], trades: [],
  transactions: [{ id: '00000000-0000-4000-8000-000000000002', categoryId: category, type: 'expense', amount: '0.1', currency: 'THB', date: '2026-10-04', note: '', createdAt: timestamp, voidedAt: null, voidReason: null }],
})
describe('financial backup contracts', () => {
  it('retains identical-content rows with different IDs and financial strings through JSON', () => {
    const value = fixture(); value.transactions.push({ ...value.transactions[0]!, id: '00000000-0000-4000-8000-000000000003' })
    const parsed = backupDocumentSchema.parse(JSON.parse(JSON.stringify(value)))
    expect(parsed.transactions).toHaveLength(2); expect(parsed.transactions.map(row => row.amount)).toEqual(['0.1', '0.1'])
    expect(backupDocumentSchema.safeParse({ ...value, transactions: [value.transactions[0], value.transactions[0]] }).success).toBe(false)
  })
  it('rejects legacy files, credentials, owner claims, invalid scale and foreign references', () => {
    for (const extra of [{ provenance: 'LEGACY_DEMO' }, { format: 'legacy' }, { token: 'synthetic-placeholder' }, { ownerId: category }, { version: 2 }]) expect(backupDocumentSchema.safeParse({ ...fixture(), ...extra }).success).toBe(false)
    for (const extra of [{ amount: 1 }, { amount: '1.001' }, { categoryId: '00000000-0000-4000-8000-000000000009' }, { type: 'income' }, { voidedAt: timestamp, voidReason: null }]) {
      expect(backupDocumentSchema.safeParse({ ...fixture(), transactions: [{ ...fixture().transactions[0], ...extra }] }).success).toBe(false)
    }
  })
  it('requires preview digest and explicit consent; unknown restore fields are rejected', () => {
    const body = { backup: fixture(), previewDigest: 'a'.repeat(64), consent: true }
    expect(backupRestoreSchema.safeParse(body).success).toBe(true)
    expect(backupRestoreSchema.safeParse({ ...body, consent: false }).success).toBe(false)
    expect(backupRestoreSchema.safeParse({ ...body, previewDigest: 'invalid' }).success).toBe(false)
    expect(backupRestoreSchema.safeParse({ ...body, ownerId: category }).success).toBe(false)
  })
})
