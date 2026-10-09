import { describe, expect, it } from 'vitest'
import {
  cryptoTradeInputSchema,
  financeTransactionInputSchema,
  healthResponseSchema,
} from '../src/index.js'
import { parseCryptoDecimal, parseThbDecimal, serializeCrypto, serializeThb } from '@finntech/finance'

function validTrade(overrides: Record<string, unknown> = {}) {
  return {
    side: 'buy',
    asset: 'BTC',
    quantity: '0.00000001',
    price: '65000',
    fee: '0',
    quoteCurrency: 'USDT',
    ...overrides,
  }
}

function collectNumberPaths(value: unknown, path = '$'): string[] {
  if (typeof value === 'number') return [path]
  if (Array.isArray(value)) return value.flatMap((entry, index) => collectNumberPaths(entry, `${path}[${index}]`))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => collectNumberPaths(entry, `${path}.${key}`))
  }
  return []
}

describe('shared finance validation contracts', () => {
  it('normalizes validated ASCII asset symbols to uppercase without provider mapping', () => {
    for (const asset of ['btc', 'BtC', 'BTC']) {
      expect(cryptoTradeInputSchema.parse(validTrade({ asset })).asset).toBe('BTC')
    }
    expect(cryptoTradeInputSchema.parse(validTrade({ asset: 'asset_1-a' })).asset).toBe('ASSET_1-A')
    for (const asset of ['', ' btc', 'btc ', 'BTC/USDT', 'ß', 'บิตคอยน์', 'ＡＢＣ', 'a'.repeat(33), 1, null]) {
      expect(cryptoTradeInputSchema.safeParse(validTrade({ asset })).success).toBe(false)
    }
  })

  it('keeps the existing process health contract unchanged', () => {
    expect(healthResponseSchema.safeParse({
      status: 'ok',
      service: 'tracker-api',
      checks: { process: 'ok', database: 'not_configured', auth: 'not_configured' },
    }).success).toBe(true)
  })

  it('accepts positive THB income and expense amounts only', () => {
    for (const type of ['income', 'expense']) {
      expect(financeTransactionInputSchema.safeParse({ type, amount: '0.01', currency: 'THB' }).success).toBe(true)
    }

    for (const amount of ['0', '-0.01', '1.234', '1e2', 1, null, [], {}]) {
      expect(financeTransactionInputSchema.safeParse({ type: 'income', amount, currency: 'THB' }).success).toBe(false)
    }
    expect(financeTransactionInputSchema.safeParse({ type: 'income', amount: '1', currency: 'USDT' }).success).toBe(false)
    expect(financeTransactionInputSchema.safeParse({
      type: 'income', amount: '1', currency: 'THB', extraAmount: 1,
    }).success).toBe(false)
  })

  it('accepts positive crypto quantity/price and non-negative USDT fee', () => {
    expect(cryptoTradeInputSchema.safeParse(validTrade()).success).toBe(true)
    expect(cryptoTradeInputSchema.safeParse(validTrade({ side: 'sell', fee: '0.00000001' })).success).toBe(true)

    for (const quantity of ['0', '-0.00000001', '1e-8', 0, null, [], {}]) {
      expect(cryptoTradeInputSchema.safeParse(validTrade({ quantity })).success).toBe(false)
    }
    for (const price of ['0', '-1', '1.0000000000000000001', 1]) {
      expect(cryptoTradeInputSchema.safeParse(validTrade({ price })).success).toBe(false)
    }
    for (const fee of ['-0.01', '1.0000000000000000001', true, null]) {
      expect(cryptoTradeInputSchema.safeParse(validTrade({ fee })).success).toBe(false)
    }
    expect(cryptoTradeInputSchema.safeParse(validTrade({ quoteCurrency: 'THB' })).success).toBe(false)
  })

  it('round-trips canonical decimal strings through JSON without financial numbers', () => {
    const payload = {
      transaction: financeTransactionInputSchema.parse({
        type: 'expense',
        amount: serializeThb(parseThbDecimal('0.30')),
        currency: 'THB',
      }),
      trade: cryptoTradeInputSchema.parse(validTrade({
        quantity: serializeCrypto(parseCryptoDecimal('0.00000001')),
        price: serializeCrypto(parseCryptoDecimal('65000.000000000000000000')),
        fee: serializeCrypto(parseCryptoDecimal('0.000000000000000000')),
      })),
    }

    const decoded: unknown = JSON.parse(JSON.stringify(payload))
    expect(collectNumberPaths(decoded)).toEqual([])
    expect(financeTransactionInputSchema.safeParse((decoded as { transaction: unknown }).transaction).success).toBe(true)
    expect(cryptoTradeInputSchema.safeParse((decoded as { trade: unknown }).trade).success).toBe(true)
    expect((decoded as { transaction: { amount: string } }).transaction.amount).toBe('0.3')
    expect((decoded as { trade: { price: string; fee: string } }).trade.price).toBe('65000')
    expect((decoded as { trade: { fee: string } }).trade.fee).toBe('0')
  })
})
