import { describe, expect, it } from 'vitest'
import { replayCryptoTrades } from '../src/index.js'

describe('owned-scope chronological ledger', () => {
  it('includes USDT fees, removes stored partial cost, and empties a full sale', () => {
    const result = replayCryptoTrades([
      { id: 'a', side: 'buy', quantity: '3', price: '1', fee: '1' },
      { id: 'b', side: 'sell', quantity: '1', price: '2', fee: '0.1' },
      { id: 'c', side: 'sell', quantity: '2', price: '2', fee: '0' },
    ])
    expect(result.trades[1]?.costRemoved).toBe('1.333333333333333333')
    expect(result.trades[2]?.costRemoved).toBe('2.666666666666666667')
    expect(result.quantity).toBe('0'); expect(result.totalCost).toBe('0')
    expect(result.realizedPnl).toBe('1.9'); expect(result.averageCost).toBeNull()
  })
  it('uses half-even accounting quantization for product and partial cost', () => {
    const result = replayCryptoTrades([
      { id: 'a', side: 'buy', quantity: '2', price: '0.000000000000000001', fee: '0.000000000000000001' },
      { id: 'b', side: 'sell', quantity: '1', price: '0.000000000000000001', fee: '0' },
    ])
    expect(result.trades[1]?.costRemoved).toBe('0.000000000000000002')
    expect(result.totalCost).toBe('0.000000000000000001')
    expect(result.realizedPnl).toBe('-0.000000000000000001')
  })
  it('rejects oversell at any history step even when a later buy would cover it', () => {
    expect(() => replayCryptoTrades([
      { id: 'a', side: 'sell', quantity: '0.00000001', price: '1', fee: '0' },
      { id: 'b', side: 'buy', quantity: '1', price: '1', fee: '0' },
    ])).toThrow('oversell')
  })
  it('rejects storage overflow and keeps independent scopes independent', () => {
    expect(() => replayCryptoTrades([{ id: 'a', side: 'buy', quantity: '99999999999999999999', price: '2', fee: '0' }])).toThrow()
    const make = (price: string) => replayCryptoTrades([{ id: 'a', side: 'buy', quantity: '0.00000001', price, fee: '0' }])
    expect(make('10').totalCost).toBe('0.0000001'); expect(make('20').totalCost).toBe('0.0000002')
  })
  it('keeps internal average precision and does not reject a valid stored cost due to display overflow', () => {
    const result = replayCryptoTrades([{ id: 'a', side: 'buy', quantity: '3', price: '1', fee: '1' }])
    expect(result.averageCost?.toString()).toBe(`1.${'3'.repeat(79)}`)
    const tiny = replayCryptoTrades([{ id: 'a', side: 'buy', quantity: '0.000000000000000001', price: '1', fee: '1000' }])
    expect(tiny.totalCost).toBe('1000.000000000000000001')
    expect(tiny.averageCost?.gt('99999999999999999999')).toBe(true)
  })
})
