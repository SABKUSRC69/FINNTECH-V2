import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PresentationControls, PresentationProvider, usePresentation } from './presentation'
import Dashboard from './tracker/Dashboard'

const categoryId = '00000000-0000-4000-8000-000000000001'
const portfolioId = '00000000-0000-4000-8000-000000000002'
const finance = {
  month: '2026-10', currency: 'THB', income: '103.42', expense: '3.42', balance: '100',
  categories: [{ id: categoryId, name: 'หมวดสังเคราะห์', type: 'expense' }], transactions: [],
  budgets: [{ id: categoryId, categoryId, month: '2026-10', amount: '25', spent: '3.42', remaining: '21.58' }],
}
const crypto = {
  quoteCurrency: 'USDT', portfolios: [{ id: portfolioId, name: 'พอร์ตสังเคราะห์' }],
  holdings: [{ portfolioId, asset: 'BTC', quantity: '0.00000001', totalCost: '0.00025', realizedPnl: '0' }],
  trades: [{ id: categoryId, portfolioId, asset: 'BTC', side: 'buy', quantity: '0.00000001', price: '25000', fee: '0', realizedPnl: '0', date: '2026-10-05' }],
}

function Surface({ children }: { children?: React.ReactNode }): JSX.Element {
  const { theme, money } = usePresentation()
  return <div data-testid="surface" data-theme={theme}><PresentationControls />
    {children ?? <><p>{money('999,999,999,999,999,999.99')}</p><p>{money('N/A')}</p><input aria-label="ค่าในช่องกรอก" defaultValue="0.00000001" /></>}
  </div>
}

const cashId = '00000000-0000-4000-8000-0000000000c1'
function dashboard(): RequestInit[] {
  const writes: RequestInit[] = []
  vi.stubGlobal('WebSocket', undefined)
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit = {}) => {
    if (options.method && options.method !== 'GET') writes.push(options)
    const value = options.method === 'POST' ? { id: categoryId }
      : path.startsWith('/api/finance?') ? finance : path === '/api/crypto' ? crypto : path === '/api/cash' ? { accounts: [{ id: cashId, name: 'กระเป๋าเงิน', balance: '1000.00', currency: 'THB', asOf: '2026-01-01', version: 1 }] } : { quotes: [] }
    return { ok: true, status: 200, json: async () => value }
  }))
  render(<PresentationProvider><Surface><Dashboard name="สังเคราะห์" logout={vi.fn()} expired={vi.fn()} authBusy={false} /></Surface></PresentationProvider>)
  return writes
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('tracker presentation preserves financial boundaries', () => {
  it('switches theme in memory without requests or localStorage writes', () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy)
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<PresentationProvider><Surface /></PresentationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'เปิดโหมดมืด' }))
    expect(screen.getByTestId('surface').getAttribute('data-theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'เปิดโหมดสว่าง' }))
    expect(screen.getByTestId('surface').getAttribute('data-theme')).toBe('light')
    expect(fetchSpy).not.toHaveBeenCalled(); expect(storageSpy).not.toHaveBeenCalled()
  })

  it('masks displayed strings, preserves N/A and does not change input precision', () => {
    render(<PresentationProvider><Surface /></PresentationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
    expect(screen.queryByText('999,999,999,999,999,999.99')).toBeNull()
    expect(screen.getByText('••••')).toBeTruthy(); expect(screen.getByText('N/A')).toBeTruthy()
    expect((screen.getByLabelText('ค่าในช่องกรอก') as HTMLInputElement).value).toBe('0.00000001')
    fireEvent.click(screen.getByRole('button', { name: 'แสดงยอดเงิน' }))
    expect(screen.getByText('999,999,999,999,999,999.99')).toBeTruthy()
  })

  it('starts fresh presentation state on remount instead of persisting account data', () => {
    const first = render(<PresentationProvider><Surface /></PresentationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'เปิดโหมดมืด' }))
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
    first.unmount()
    render(<PresentationProvider><Surface /></PresentationProvider>)
    expect(screen.getByTestId('surface').getAttribute('data-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('masks THB totals and budgets without changing the selected month or issuing writes', async () => {
    dashboard()
    await screen.findByText('103.42', { exact: false })
    const month = (screen.getByLabelText('เดือนที่ดู') as HTMLInputElement).value
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
    expect(screen.queryByText('103.42', { exact: false })).toBeNull()
    expect((screen.getByLabelText('เดือนที่ดู') as HTMLInputElement).value).toBe(month)
    fireEvent.click(screen.getByRole('button', { name: 'งบประมาณ' }))
    expect(screen.getByRole('button', { name: 'งบประมาณ' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('ใช้ไป •••• / •••• THB')).toBeTruthy()
    expect(screen.queryByText('21.58', { exact: false })).toBeNull()
    expect(vi.mocked(fetch).mock.calls.every(([, request]) => !request?.method || request.method === 'GET')).toBe(true)
  })

  it('masks crypto quantities/cost/history while leaving missing live prices as N/A', async () => {
    dashboard()
    await waitFor(() => expect(screen.getByRole('button', { name: 'บันทึกรายการ' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
    fireEvent.click(screen.getByRole('button', { name: 'พอร์ตคริปโต' }))
    fireEvent.change(screen.getByLabelText('พอร์ตที่ดู'), { target: { value: portfolioId } })
    expect(screen.getByText('ปริมาณ ••••')).toBeTruthy()
    expect(screen.getByText('กำไร/ขาดทุนยังไม่รับรู้ N/A')).toBeTruthy()
    expect(screen.queryByText('0.00000001', { exact: false })).toBeNull()
    expect(screen.queryByText('25,000.00', { exact: false })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'แสดงยอดเงิน' }))
    expect(screen.getByText('ปริมาณ 0.00000001')).toBeTruthy()
  })

  it('keeps the original decimal-string write path usable with amounts hidden', async () => {
    const writes = dashboard()
    await waitFor(() => expect(screen.getByRole('button', { name: 'บันทึกรายการ' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
    fireEvent.change(screen.getByLabelText('จำนวนเงิน THB'), { target: { value: '1.25' } })
    fireEvent.change(screen.getByLabelText('หมวดหมู่'), { target: { value: categoryId } })
    fireEvent.change(screen.getByLabelText('จ่ายจากบัญชีเงินสด'), { target: { value: cashId } })
    expect((screen.getByLabelText('จำนวนเงิน THB') as HTMLInputElement).value).toBe('1.25')
    expect(screen.getByRole('button', { name: 'บันทึกรายการ' }).hasAttribute('disabled')).toBe(false)
    fireEvent.submit(screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' }))
    await screen.findByText('บันทึกสำเร็จ')
    expect(writes).toHaveLength(1)
    expect(JSON.parse(String(writes[0]?.body))).toMatchObject({ amount: '1.25', currency: 'THB' })
    expect((writes[0]?.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith('/api/'))).toBe(true)
  })
})
