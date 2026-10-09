import { describe, it, expect, vi } from 'vitest'
import { ReferenceFxRelay } from '../src/tracker/fx.js'
const metadata = { error: 0, result: [{ symbol: 'USDT_THB', base_asset: 'USDT', quote_asset: 'THB', status: 'active' }] }
describe('public FX relay (fixture/unit evidence)', () => {
  it('checks actual pair metadata, deduplicates concurrent refresh, expires without promoting receipt time', async () => {
    let now = Date.parse('2026-10-05T00:00:00Z')
    const fetcher = vi.fn(async (url: unknown) => new Response(JSON.stringify(String(url).endsWith('symbols') ? metadata : [{ symbol: 'USDT_THB', last: '33.620000000000000001' }])))
    const relay = new ReferenceFxRelay(fetcher as typeof fetch, () => now)
    expect(relay.snapshot().status).toBe('UNAVAILABLE')
    await Promise.all([relay.refresh(), relay.refresh()])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(relay.snapshot()).toMatchObject({ rate: '33.620000000000000001', status: 'FRESH', source: 'Bitkub public' })
    fetcher.mockRejectedValue(new Error('unavailable'))
    now += 30001
    expect(relay.snapshot().status).toBe('STALE')
    await relay.refresh()
    expect(relay.snapshot().receivedAt).toBe('2026-10-05T00:00:00.000Z')
  })
  it('rejects wrong/inactive pair, invalid, exponent or missing prices without a peg fallback', async () => {
    for (const last of ['0', '-1', '1e2', 'NaN', '33.0000000000000000001']) {
      const relay = new ReferenceFxRelay((async (url: unknown) => new Response(JSON.stringify(String(url).endsWith('symbols') ? metadata : [{ symbol: 'USDT_THB', last }]))) as typeof fetch)
      await relay.refresh(); expect(relay.snapshot().rate).toBeNull()
    }
    const relay = new ReferenceFxRelay((async () => new Response(JSON.stringify({ ...metadata, result: [{ ...metadata.result[0], base_asset: 'USD' }] }))) as typeof fetch)
    await relay.refresh(); expect(relay.snapshot().rate).toBeNull()
  })
})
