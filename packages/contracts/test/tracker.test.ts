import { describe, expect, it } from 'vitest'
import { calendarDateSchema, calendarMonthSchema, financeEntrySchema, budgetInputSchema, tradeEntrySchema, financeCorrectionSchema, tradeCorrectionSchema } from '../src/index.js'
const categoryId = '00000000-0000-4000-8000-000000000001'
describe('tracker input boundaries', () => {
  it('checks real calendar days, leap years, months, and owner cannot be supplied', () => {
    expect(calendarDateSchema.safeParse('2024-02-29').success).toBe(true)
    for (const value of ['2025-02-29', '2026-02-30', '2026-13-01', '0000-01-01']) expect(calendarDateSchema.safeParse(value).success).toBe(false)
    expect(calendarMonthSchema.safeParse('2026-13').success).toBe(false)
    const entry = { type: 'expense', categoryId, amount: '0.1', currency: 'THB', date: '2026-10-04' }
    expect(financeEntrySchema.safeParse(entry).success).toBe(true)
    expect(financeEntrySchema.safeParse({ ...entry, ownerId: categoryId }).success).toBe(false)
  })
  it('rejects financial JSON numbers, excess scale and foreign currency', () => {
    for (const amount of [1, '1.001', '0', '-1', '1e2']) expect(budgetInputSchema.safeParse({ categoryId, month: '2026-10', amount, currency: 'THB' }).success).toBe(false)
    const input = { portfolioId: categoryId, side: 'buy', asset: 'btc', quantity: '0.00000001', price: '1', fee: '0', quoteCurrency: 'USDT', date: '2026-10-04' }
    expect(tradeEntrySchema.parse(input).asset).toBe('BTC')
    expect(tradeEntrySchema.safeParse({ ...input, quoteCurrency: 'THB' }).success).toBe(false)
  })
  it('requires an explicit correction action/reason and rejects ownership/scope overrides', () => {
    const entry = { type: 'expense', categoryId, amount: '1.25', currency: 'THB', date: '2026-10-04' }
    expect(financeCorrectionSchema.parse({ action: 'replace', reason: ' correct typo ', entry }).reason).toBe('correct typo')
    expect(financeCorrectionSchema.safeParse({ action: 'replace', reason: ' ', entry }).success).toBe(false)
    expect(financeCorrectionSchema.safeParse({ action: 'replace', reason: 'typo', entry: { ...entry, amount: 1 } }).success).toBe(false)
    expect(financeCorrectionSchema.safeParse({ action: 'void', reason: 'duplicate', entry }).success).toBe(false)
    expect(financeCorrectionSchema.safeParse({ action: 'void', reason: 'duplicate', ownerId: categoryId }).success).toBe(false)
    const trade = { side: 'buy', quantity: '0.00000001', price: '1', fee: '0', quoteCurrency: 'USDT', date: '2026-10-04' }
    expect(tradeCorrectionSchema.safeParse({ action: 'replace', reason: 'typo', entry: trade }).success).toBe(true)
    for (const extra of [{ asset: 'ETH' }, { portfolioId: categoryId }, { quantity: '0' }, { fee: '-1' }]) {
      expect(tradeCorrectionSchema.safeParse({ action: 'replace', reason: 'typo', entry: { ...trade, ...extra } }).success).toBe(false)
    }
    expect(tradeCorrectionSchema.safeParse({ action: 'void', reason: 'duplicate' }).success).toBe(true)
  })
})
