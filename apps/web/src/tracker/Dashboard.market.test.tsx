import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketSnapshot } from '@finntech/contracts'
import Dashboard from './Dashboard'

const start = Date.parse('2026-10-05T01:00:00.000Z')
const portfolioId = '00000000-0000-4000-8000-000000000003'
let socket: TestSocket

class TestSocket {
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { socket = this }
  close = vi.fn()
}

function snapshot(age = 0): MarketSnapshot {
  return { quotes: [{ asset: 'BTC', price: '100', status: 'LIVE',
    receivedAt: new Date(Date.now() - age).toISOString(), source: 'Binance public' }] }
}

async function setup(initial: MarketSnapshot, secondAsset = false, pollFails = false): Promise<void> {
  let marketCalls = 0
  vi.stubGlobal('WebSocket', TestSocket)
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/crypto/market' && ++marketCalls > 1 && pollFails) throw new Error('synthetic offline')
    const body = path.startsWith('/api/finance?')
      ? { month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [], transactions: [], budgets: [] }
      : path === '/api/crypto'
        ? { quoteCurrency: 'USDT', portfolios: [{ id: portfolioId, name: 'สังเคราะห์' }], trades: [],
          holdings: (secondAsset ? ['BTC', 'ETH'] : ['BTC']).map(asset => ({ portfolioId, asset, quantity: '1', totalCost: '1', realizedPnl: '2' })) }
        : path === '/api/cash' ? { accounts: [] }
        : initial
    return { ok: true, status: 200, json: async () => body }
  }))
  await act(async () => { render(<Dashboard name="สังเคราะห์" logout={vi.fn()} expired={vi.fn()} authBusy={false} />) })
  fireEvent.click(screen.getByRole('button', { name: 'พอร์ตคริปโต' }))
  fireEvent.change(screen.getByLabelText('พอร์ตที่ดู'), { target: { value: portfolioId } })
}

function assertUnavailable(): void {
  expect(screen.queryByText('ราคาอ้างอิงพร้อม')).toBeNull()
  expect(screen.getByText('มูลค่ารวม: N/A')).toBeTruthy()
  expect(screen.getByText('กำไร/ขาดทุนยังไม่รับรู้ N/A')).toBeTruthy()
  expect(screen.getByText('สัดส่วนพอร์ต N/A')).toBeTruthy()
  expect(screen.getByText('ต้นทุน 1.00 USDT')).toBeTruthy()
  expect(screen.getByText('กำไร/ขาดทุนรับรู้ 2.00 USDT')).toBeTruthy()
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('crypto UI local expiration and recovery', () => {
  it('rejects a delayed LIVE snapshot on arrival without using its old price for valuations', async () => {
    await setup(snapshot(30_001))
    assertUnavailable()
    expect(screen.getByText('ราคาล้าสมัย')).toBeTruthy()
    expect(screen.getByText('ราคาล่าสุดที่ได้รับ (ไม่ใช้คำนวณ) 100.00 USDT')).toBeTruthy()
  })
  it('expires at 30,001 ms without a new WS event, even if polls keep returning LIVE', async () => {
    await setup(snapshot())
    expect(screen.getByText('มูลค่ารวม: 100.00 USDT')).toBeTruthy()
    expect(screen.getByText('กำไร/ขาดทุนยังไม่รับรู้ 99.00 USDT')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(screen.getByText('ราคาอ้างอิงพร้อม')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    assertUnavailable()
    expect(screen.getByText('ราคาล้าสมัย')).toBeTruthy()
  })
  it('keeps fresh WS observations when polling fails, but expires them without new frames', async () => {
    await setup(snapshot(31_000), false, true)
    assertUnavailable()
    act(() => socket.onmessage?.({ data: JSON.stringify(snapshot()) }))
    expect(screen.getByText('ราคาอ้างอิงพร้อม')).toBeTruthy()
    expect(screen.getByText('มูลค่ารวม: 100.00 USDT')).toBeTruthy()
    expect(screen.getByText('สัดส่วนพอร์ต 100.00%')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(screen.getByText('ราคาอ้างอิงพร้อม')).toBeTruthy()
    expect(screen.getByText('มูลค่ารวม: 100.00 USDT')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001) })
    assertUnavailable()
    expect(screen.getByText('ราคาล้าสมัย')).toBeTruthy()
  })
  it('rechecks immediately on focus or visibility change after timer suspension', async () => {
    await setup(snapshot())
    vi.setSystemTime(start + 31_000)
    fireEvent.focus(window)
    assertUnavailable()
    act(() => socket.onmessage?.({ data: JSON.stringify(snapshot()) }))
    expect(screen.getByText('ราคาอ้างอิงพร้อม')).toBeTruthy()
    vi.setSystemTime(start + 62_000)
    fireEvent(document, new Event('visibilitychange'))
    assertUnavailable()
    await act(async () => {})
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
    expect(socket.close).toHaveBeenCalledOnce()
  })
  it('withholds total and all allocations if one held asset is stale, while keeping fresh asset P&L', async () => {
    const initial = snapshot()
    initial.quotes.push({ asset: 'ETH', price: '200', status: 'LIVE',
      receivedAt: new Date(start - 31_000).toISOString(), source: 'Binance public' })
    await setup(initial, true)
    expect(screen.getByText('มูลค่ารวม: N/A')).toBeTruthy()
    const btc = screen.getByRole('heading', { name: 'BTC' }).closest('article')!
    const eth = screen.getByRole('heading', { name: 'ETH' }).closest('article')!
    expect(within(btc).getByText('กำไร/ขาดทุนยังไม่รับรู้ 99.00 USDT')).toBeTruthy()
    expect(within(eth).getByText('กำไร/ขาดทุนยังไม่รับรู้ N/A')).toBeTruthy()
    expect(screen.getAllByText('สัดส่วนพอร์ต N/A')).toHaveLength(2)
  })
})
