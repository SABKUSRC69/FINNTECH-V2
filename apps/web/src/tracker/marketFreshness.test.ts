import { describe, expect, it } from 'vitest'
import type { MarketSnapshot } from '@finntech/contracts'
import { isFreshCryptoQuote } from './marketFreshness'

const now = Date.parse('2026-10-05T01:00:00.000Z')
const quote: MarketSnapshot['quotes'][number] = {
  asset: 'BTC', price: '100', status: 'LIVE',
  receivedAt: new Date(now).toISOString(), source: 'Binance public',
}

describe('crypto price freshness boundary', () => {
  it('uses provider time and local receipt independently; future/old trades cannot become LIVE on fresh receipt',()=>{
    expect(isFreshCryptoQuote({...quote,kind:'TRADE',observedAt:new Date(now-30001).toISOString()},now)).toBe(false)
    expect(isFreshCryptoQuote({...quote,kind:'TRADE',observedAt:new Date(now+1).toISOString()},now)).toBe(false)
    expect(isFreshCryptoQuote({...quote,kind:'TRADE',observedAt:new Date(now).toISOString()},now)).toBe(true)
    expect(isFreshCryptoQuote({...quote,kind:'REST_SNAPSHOT',observedAt:null},now)).toBe(true)
  })
  it.each([0, 29_999, 30_000])('accepts a LIVE quote aged %i ms', age => {
    expect(isFreshCryptoQuote(quote, now + age)).toBe(true)
  })
  it.each([30_001, 31_000])('rejects an expired LIVE quote aged %i ms', age => {
    expect(isFreshCryptoQuote(quote, now + age)).toBe(false)
  })
  it.each([
    { ...quote, status: 'STALE' as const },
    { ...quote, status: 'UNAVAILABLE' as const },
    { ...quote, price: null },
    { ...quote, receivedAt: null },
    { ...quote, receivedAt: 'invalid' },
    { ...quote, receivedAt: new Date(now + 1).toISOString() },
    undefined,
  ])('fails closed for missing, invalid or non-live observations (%j)', value => {
    expect(isFreshCryptoQuote(value, now)).toBe(false)
  })
})
