import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StockPrices from './StockPrices'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
const timestamp = new Date().toISOString()
function snapshot(connection = 'NOT_CONFIGURED', price: string | null = null, status = 'UNAVAILABLE') {
  return { source: 'Alpaca IEX', currency: 'USD', connection, quotes: [{ symbol: 'AAPL', price, status, observedAt: price ? timestamp : null, receivedAt: price ? timestamp : null }] }
}
function fixture(body: unknown) {
  vi.stubGlobal('WebSocket', undefined)
  const fetch = vi.fn(async (path: string) => ({ ok: true, status: 200, json: async () => path==='/api/stocks'?{quoteCurrency:'USD',portfolios:[],holdings:[],trades:[]}:body }))
  vi.stubGlobal('fetch', fetch)
  render(<StockPrices expired={vi.fn()} />)
  return fetch
}
describe('US stock watchlist', () => {
  it('shows an honest setup state, no synthetic prices, no holdings or combined currency totals', async () => {
    const fetch = fixture(snapshot())
    expect(await screen.findByText('ราคาหุ้นและกราฟ · ฟรี')).toBeTruthy()
    expect(screen.getByTitle('ราคาหุ้น AAPL โดย TradingView')).toBeTruthy()
    expect(screen.queryByText('ยังไม่ได้ตั้งค่า Alpaca key ฝั่ง server')).toBeNull()
    expect(screen.getByText(/ยังไม่ส่งตัวเลขกลับมาคำนวณ/)).toBeTruthy()
    expect(fetch.mock.calls.some(call=>call[0]==='/api/stocks/market')).toBe(true)
    expect(await screen.findByText('ยังไม่มีการถือครองในพอร์ตที่เลือก')).toBeTruthy()
  })
  it('displays validated decimal strings without reducing their precision', async () => {
    fixture(snapshot('STREAMING', '123.123456789012345678', 'LIVE'))
    expect(await screen.findByText('123.123456789012345678', { exact: false })).toBeTruthy()
    expect(screen.getByText('ราคาสด IEX')).toBeTruthy()
  })
  it('does not mark an old trade LIVE just because a response was recently received', async () => {
    const body = snapshot('STREAMING', '123', 'LIVE')
    body.quotes[0]!.observedAt = '2020-01-01T00:00:00Z'
    fixture(body)
    expect(await screen.findByText(/^(ราคาไม่สด|ตลาดปิด · ราคาล่าสุด)$/)).toBeTruthy()
    expect(screen.queryByText('ราคาสด IEX')).toBeNull()
  })
  it('rejects provider/financial JSON numbers and recovers safely from offline or denied access', async () => {
    const body = snapshot('STREAMING', '123', 'LIVE') as unknown as { quotes: { price: unknown }[] }
    body.quotes[0]!.price = 123
    fixture(body)
    await waitFor(() => expect(screen.getAllByRole('status').find(e => e.textContent?.startsWith('การประเมินอัตโนมัติผ่าน API'))?.textContent).toContain('N/A'))
    expect(screen.queryByText('ราคาสด IEX')).toBeNull()
  })
})
