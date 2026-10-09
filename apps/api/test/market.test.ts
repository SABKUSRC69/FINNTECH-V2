import { describe, expect, it } from 'vitest'
import { MarketRelay } from '../src/tracker/market.js'
import { monthWindow } from '../src/tracker/service.js'

async function settle() { for (let index = 0; index < 10; index++) await Promise.resolve() }
describe('backend-only market relay', () => {
  it('uses Thai month boundaries including leap February, year rollover and the supported maximum year', () => {
    expect(monthWindow('2024-02').end.toISOString()).toBe('2024-02-29T17:00:00.000Z')
    expect(monthWindow('2026-12').start.toISOString()).toBe('2026-11-30T17:00:00.000Z')
    expect(monthWindow('2026-12').end.toISOString()).toBe('2026-12-31T17:00:00.000Z')
    expect(monthWindow('9999-12').end.toISOString()).toBe('9999-12-31T17:00:00.000Z')
  })
  it('validates metadata before enabling markets, rejects provider JSON numbers and marks old prices stale', async () => {
    let now = 1_800_000_000_000
    let requests = 0, offline = false
    const mock = (async (url: string) => {
      requests++
      if (offline) throw new Error('synthetic offline')
      if (url.includes('exchangeInfo')) return Response.json({ symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' }] })
      return Response.json({ symbol: 'BTCUSDT', price: '100.10' })
    }) as typeof fetch
    const relay = new MarketRelay(mock, () => now)
    expect((await relay.snapshot()).quotes[0]?.status).toBe('UNAVAILABLE')
    await settle()
    const snapshot = await relay.snapshot()
    expect(snapshot.quotes[0]?.price).toBe('100.1'); expect(snapshot.quotes[0]?.status).toBe('LIVE')
    expect(snapshot.quotes[1]?.status).toBe('UNAVAILABLE'); expect(requests).toBe(2)
    offline = true; now += 30_001
    expect((await relay.snapshot()).quotes[0]?.status).toBe('STALE')
    await settle()
    expect((await relay.snapshot()).quotes[0]?.price).toBe('100.1')
  })
  it('never enables a market without metadata and rejects a mismatched quote', async () => {
    const unavailable = new MarketRelay((async () => { throw new Error('offline') }) as typeof fetch)
    await unavailable.snapshot(); await settle()
    expect((await unavailable.snapshot()).quotes.every(q => q.status === 'UNAVAILABLE' && q.price === null)).toBe(true)
    const numeric = new MarketRelay((async (url: string) => Response.json(url.includes('exchangeInfo')
      ? { symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' }] }
      : { symbol: 'BTCUSDT', price: 100 })) as typeof fetch)
    await numeric.snapshot(); await settle()
    expect((await numeric.snapshot()).quotes[0]?.price).toBeNull()
  })
})
