import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Assets from './Assets'
import { resetStockMarketForTests } from './stockMarket'
import { expectHeld, heldRow } from './heldAssetsTestUtils'

const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString()
const referenceId = '00000000-0000-4000-8000-0000000000a1'
class FakeSocket {
  static instances: FakeSocket[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) { FakeSocket.instances.push(this) }
  close() { this.onclose?.() }
  push(value: unknown) { act(() => { this.onmessage?.({ data: JSON.stringify(value) }) }) }
}
const quote = (price: string | null, status = 'LIVE', observedAt = new Date().toISOString()) =>
  ({ source: 'Alpaca IEX', currency: 'USD', connection: 'STREAMING', session: 'REGULAR', excluded: [], quotes: [{ symbol: 'AAPL', price, status, observedAt: price ? observedAt : null, receivedAt: price ? new Date().toISOString() : null }] })
function setup(options: { marketStatus?: number; manual?: { value: string; enabled: boolean } } = {}) {
  FakeSocket.instances = []
  vi.stubGlobal('WebSocket', FakeSocket)
  let manual = options.manual
  const writes: { path: string; body: Record<string, unknown> }[] = []
  const fetch = vi.fn(async (path: string, init: RequestInit = {}) => {
    const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
    if (init.method === 'POST') { const body = JSON.parse(String(init.body)); writes.push({ path, body }); if (path === '/api/valuation/references') manual = { value: body.value, enabled: body.enabled }; return reply({ id: referenceId }) }
    if (path === '/api/cash') return reply({ accounts: [] })
    if (path === '/api/reference-rate') return reply({ base: 'USDT', quote: 'THB', rate: null, receivedAt: null, status: 'UNAVAILABLE', source: 'Bitkub public', kind: 'LAST_PRICE_SNAPSHOT' })
    if (path === '/api/stocks') return reply({ quoteCurrency: 'USD', portfolios: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'US' }], holdings: [{ portfolioId: '00000000-0000-4000-8000-0000000000b1', symbol: 'AAPL', quantity: '0.5', totalCost: '75', realizedPnl: '0' }], trades: [] })
    if (path === '/api/assets/manual') return reply({ assets: [] })
    if (path === '/api/valuation/references') return reply({ references: manual ? [{ id: referenceId, symbol: 'AAPL', currency: 'USD', source: 'MANUAL', value: manual.value, asOf: today, updatedAt: today, enabled: manual.enabled, version: 1 }] : [],
      usdThb: { source: 'ECB', kind: 'DAILY', status: 'DAILY', rate: '35', asOf: today, receivedAt: today } })
    if (path === '/api/stocks/market') return options.marketStatus ? reply({ error: { code: 'STOCK_ACCESS_REQUIRED' } }, options.marketStatus) : reply(quote(null))
    return reply({})
  })
  vi.stubGlobal('fetch', fetch)
  render(<Assets crypto={{ quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] }} market={{ quotes: [] }} now={Date.now()} expired={vi.fn()} lock={vi.fn()} />)
  return { fetch, writes, marketCalls: () => fetch.mock.calls.filter(c => c[0] === '/api/stocks/market').length }
}
const total = () => screen.getByTestId('assets-total').textContent
afterEach(() => { cleanup(); resetStockMarketForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Alpaca IEX events reach Assets without reload or manual entry', () => {
  it('values the holding from each streamed last trade at the daily ECB rate, labelled as a reference conversion', async () => {
    const { marketCalls } = setup()
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    expect(FakeSocket.instances[0]!.url).toMatch(/\/ws\/stocks$/)
    await waitFor(() => expect(heldRow('AAPL', 'US')).toBeTruthy())
    const calls = marketCalls()
    FakeSocket.instances[0]!.push(quote('200'))
    await waitFor(() => expect(total()).toContain('3,500.00'))
    expectHeld('AAPL', ['Alpaca IEX · ราคาสด', '0.5 หุ้น', '3,500.00 THB', '100.00 USD'], 'US')
    expect(screen.getByTestId('stock-summary').textContent).toContain('กำไร/ขาดทุนยังไม่รับรู้ 25.00 USD')
    expect(screen.getByTestId('usd-thb-label').textContent).toMatch(/35\.00 · ECB รายวัน/)
    FakeSocket.instances[0]!.push(quote('210.5'))
    await waitFor(() => expect(total()).toContain('3,683.75'))
    expect(marketCalls()).toBe(calls) // the update came from the stream, not another REST poll
  })
  it('keeps a manual override over a live price and returns to automatic without deleting it', async () => {
    const { writes } = setup({ manual: { value: '190', enabled: true } })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    await waitFor(() => expect(heldRow('AAPL', 'US')).toBeTruthy())
    FakeSocket.instances[0]!.push(quote('200'))
    await waitFor(() => expect(total()).toContain('3,325.00'))
    expectHeld('AAPL', ['กรอกเอง', '95.00 USD'], 'US')
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข / เปิดปิด AAPL' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'ใช้ค่าที่กรอกแทนอัตโนมัติ' }))
    fireEvent.submit(screen.getByRole('form', { name: 'บันทึกราคาอ้างอิง' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/valuation/references', body: { symbol: 'AAPL', value: '190', enabled: false, expectedVersion: 1 } })
    await waitFor(() => expect(total()).toContain('3,500.00'))
    expectHeld('AAPL', ['Alpaca IEX · ราคาสด', '100.00 USD'], 'US')
  })
  it('keeps a closed-market last trade out of the total', async () => {
    setup()
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    await waitFor(() => expect(heldRow('AAPL', 'US')).toBeTruthy())
    FakeSocket.instances[0]!.push({ ...quote('199', 'CLOSED', new Date(Date.now() - 3600_000).toISOString()), session: 'CLOSED' })
    await waitFor(() => expectHeld('AAPL', ['ราคาไม่พร้อม', 'N/A THB', 'N/A USD'], 'US'))
    expect(total()).toContain('N/A')
  })
  it('never opens the stock socket for an account that is not the key owner', async () => {
    const { marketCalls } = setup({ marketStatus: 403 })
    await waitFor(() => expect(marketCalls()).toBe(1))
    await waitFor(() => expectHeld('AAPL', ['ราคาไม่พร้อม', 'N/A THB'], 'US'))
    expect(FakeSocket.instances).toHaveLength(0)
  })
})
