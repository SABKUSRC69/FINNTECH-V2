import { describe, it, expect } from 'vitest'
import { expenseBreakdown, valueAssets } from '../src/analytics.js'

describe('expense percentages and display reference valuations', () => {
  it('uses only active expense rows and reports food 40 percent without floats', () => {
    const row = { categoryId: 'food', type: 'expense' as const, amount: '4000', voidedAt: null }
    expect(expenseBreakdown([row, { ...row, categoryId: 'rent', amount: '6000' }, { ...row, type: 'income', amount: '100' }, { ...row, amount: '50', voidedAt: 'cancelled' }])).toEqual({ total: '10000', categories: [{ categoryId: 'rent', amount: '6000', percent: '60' }, { categoryId: 'food', amount: '4000', percent: '40' }] })
    expect(expenseBreakdown([])).toEqual({ total: '0', categories: [] })
    expect(expenseBreakdown([row, row]).categories[0]?.percent).toBe('100')
  })
  it('half-even display rounding and overflow remain explicit', () => {
    const row = { type: 'expense' as const, categoryId: 'a', amount: '1', voidedAt: null }
    expect(expenseBreakdown([row, { ...row, categoryId: 'b', amount: '2' }]).categories.find(row => row.categoryId === 'a')?.percent).toBe('33.33')
    expect(() => expenseBreakdown([{ ...row, amount: '999999999999999999.99' }, row])).toThrow()
  })
  it('includes all portfolios, uses market value and a direct rate, not a USD peg', () => {
    expect(valueAssets(['100', '0.1'], [{ portfolioId: 'A', asset: 'BTC', quantity: '0.00000001' }, { portfolioId: 'B', asset: 'BTC', quantity: '0.1' }], new Map([['BTC', '60000']]), '33.62')).toMatchObject({ cashThb: '100.1', totalThb: '201820.12', complete: true })
  })
  it('missing prices/rate produce incomplete totals, while genuine empty/zero portfolios need no FX', () => {
    const row = { portfolioId: 'A', asset: 'BTC', quantity: '1' }
    expect(valueAssets(['100'], [row], new Map(), '33')).toMatchObject({ totalThb: null, knownThb: '100', complete: false })
    expect(valueAssets(['100'], [row], new Map([['BTC', '60000']]), null).holdings[0]).toMatchObject({ usdt: '60000', thb: null })
    expect(valueAssets([], [{ ...row, quantity: '0' }], new Map(), null)).toMatchObject({ complete: true, totalThb: '0' })
    expect(() => valueAssets([], [row, row], new Map(), null)).toThrow('Duplicate')
  })
  it('rounds THB at the valuation row and refuses aggregate or product overflow', () => {
    const row = { portfolioId: 'A', asset: 'BTC', quantity: '1' }
    expect(valueAssets([], [row], new Map([['BTC', '1.005']]), '1').totalThb).toBe('1')
    expect(valueAssets([], [row], new Map([['BTC', '1.015']]), '1').totalThb).toBe('1.02')
    expect(valueAssets(['999999999999999999.99'], [row], new Map([['BTC', '1']]), '1')).toMatchObject({ totalThb: null, knownThb: null, complete: false })
    expect(valueAssets([], [row], new Map([['BTC', '99999999999999999999']]), '33')).toMatchObject({ totalThb: null, complete: false })
  })
})
