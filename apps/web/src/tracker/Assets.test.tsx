import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { it, expect, afterEach, vi } from 'vitest'
import Assets from './Assets'
import type { MarketSnapshot } from '@finntech/contracts'
const now = Date.now(), receivedAt = new Date(now).toISOString()
const portfolioId = '00000000-0000-4000-8000-000000000001'
const crypto = { quoteCurrency: 'USDT' as const, portfolios: [{ id: portfolioId, name: 'พอร์ต A' }], holdings: [{ portfolioId, asset: 'BTC', quantity: '1', totalCost: '1', realizedPnl: '0' }], trades: [] }
const market: MarketSnapshot = { quotes: [{ asset: 'BTC', price: '2', status: 'LIVE', receivedAt, source: 'Binance public' }] }
const extraBody=(path:string)=>path==='/api/stocks'?{quoteCurrency:'USD',portfolios:[],holdings:[],trades:[]}:path==='/api/assets/manual'?{assets:[]}:path==='/api/stocks/market'?{source:'Alpaca IEX',currency:'USD',connection:'NOT_CONFIGURED',quotes:[]}:null
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('renders fresh conversions, expires locally, and keeps unknown writes on the original key', async () => {
  const writes: RequestInit[] = []
  let lost = true
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit) => {
    if (options.method !== 'GET') {
      writes.push(options)
      if (lost) { lost = false; throw new Error('lost response') }
    }
    const body = path === '/api/reference-rate' ? { base: 'USDT', quote: 'THB', rate: '33', receivedAt, status: 'FRESH', source: 'Bitkub public', kind: 'LAST_PRICE_SNAPSHOT' } : { accounts: [] }
    return { ok: true, status: 200, json: async () => extraBody(path)??body }
  }))
  const props = { crypto, market, now, expired: vi.fn(), lock: vi.fn() }
  const { rerender } = render(<Assets {...props} />)
  await screen.findByText('BTC · 1 หน่วย · 2.00 USDT ≈ 66.00 THB')
  fireEvent.change(screen.getByLabelText('ชื่อเงินสดหรือบัญชี'), { target: { value: 'เงินสด' } })
  fireEvent.change(screen.getByLabelText('ยอดคงเหลือ THB'), { target: { value: '1.001' } })
  fireEvent.submit(screen.getByRole('form', { name: 'บันทึกเงินสด' })); expect(writes).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('ยอดคงเหลือ THB'), { target: { value: '0.1' } })
  fireEvent.submit(screen.getByRole('form', { name: 'บันทึกเงินสด' }))
  fireEvent.click(await screen.findByRole('button', { name: 'ตรวจผลบันทึกเงินสดด้วยคำขอเดิม' }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[0]?.body).toBe(writes[1]?.body); expect(writes[0]?.headers).toEqual(writes[1]?.headers)
  expect(JSON.parse(String(writes[0]?.body)).balance).toBe('0.1')
  await screen.findByText('บันทึกยอดเงินสดสำเร็จ')
  rerender(<Assets {...props} now={now + 30001} />)
  expect(screen.getByText(/BTC · 1 หน่วย · N\/A USDT ≈ N\/A THB/)).toBeTruthy()
})

it('clears the read error after automatic recovery', async () => {
  vi.useFakeTimers()
  let offline = true
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (offline && path === '/api/reference-rate') throw new Error('synthetic outage')
    const body = path === '/api/reference-rate'
      ? { base: 'USDT', quote: 'THB', rate: '33', receivedAt, status: 'FRESH', source: 'Bitkub public', kind: 'LAST_PRICE_SNAPSHOT' }
      : { accounts: [] }
    return { ok: true, status: 200, json: async () => extraBody(path)??body }
  }))
  await act(async () => { render(<Assets crypto={crypto} market={market} now={now} expired={vi.fn()} lock={vi.fn()} />) })
  expect(screen.getByText('อ่านข้อมูลสินทรัพย์ไม่สำเร็จ ยังสรุปยอดรวมไม่ได้')).toBeTruthy()
  offline = false
  await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
  expect(screen.queryByText('อ่านข้อมูลสินทรัพย์ไม่สำเร็จ ยังสรุปยอดรวมไม่ได้')).toBeNull()
  expect(screen.getByText('BTC · 1 หน่วย · 2.00 USDT ≈ 66.00 THB')).toBeTruthy()
})
