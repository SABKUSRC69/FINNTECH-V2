import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { displayDecimal } from './client'
const categoryId = '00000000-0000-4000-8000-000000000001'
const finance = { month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [{ id: categoryId, name: 'อาหาร', type: 'expense' }], transactions: [], budgets: [] }
const transactionId = '00000000-0000-4000-8000-000000000002'
const portfolioId = '00000000-0000-4000-8000-000000000003'
const tradeId = '00000000-0000-4000-8000-000000000004'
const cashId = '00000000-0000-4000-8000-000000000005'
const cash = { accounts: [{ id: cashId, name: 'กระเป๋าเงิน', balance: '1000.00', currency: 'THB', asOf: '2026-01-01', version: 1 }] }
function setup(operation?: (options: RequestInit) => Promise<unknown>, withHistory = false) {
  vi.stubGlobal('WebSocket', undefined)
  const writes: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit = {}) => {
    let body: unknown
    if (options.method === 'POST') { writes.push(options); body = operation ? await operation(options) : { id: categoryId } }
    else if (path.startsWith('/api/finance?')) body = { ...finance, transactions: withHistory ? [{ id: transactionId, type: 'expense', amount: '1.25', date: '2026-10-04', note: 'ทดสอบ', categoryId }] : [] }
    else if (path === '/api/crypto') body = { quoteCurrency: 'USDT', portfolios: withHistory ? [{ id: portfolioId, name: 'ทดสอบพอร์ต' }] : [], holdings: [], trades: withHistory ? [{ id: tradeId, portfolioId, asset: 'BTC', side: 'buy', quantity: '0.00000001', price: '2', fee: '0', realizedPnl: '0', date: '2026-10-04' }] : [] }
    else if (path === '/api/cash') body = cash
    else body = { quotes: [] }
    return { ok: true, status: 200, json: async () => body }
  }))
  render(<Dashboard name="สังเคราะห์" logout={vi.fn()} expired={vi.fn()} authBusy={false} />)
  return writes
}
async function fill(amount: string) {
  const form = screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })
  await waitFor(() => expect(within(form).getByRole('button', { name: 'บันทึกรายการ' }).hasAttribute('disabled')).toBe(false))
  fireEvent.change(within(form).getByLabelText(/หมวดหมู่/), { target: { value: categoryId } })
  fireEvent.change(within(form).getByLabelText('จ่ายจากบัญชีเงินสด'), { target: { value: cashId } })
  fireEvent.change(within(form).getByLabelText('จำนวนเงิน THB'), { target: { value: amount } })
  return form
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('tracker UI mutation boundaries', () => {
  it('clears validation only when switching sections and sends no write', async () => {
    const writes = setup()
    fireEvent.submit(await fill('1.001'))
    const message = await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'รายรับรายจ่าย' }))
    expect(screen.getByRole('alert')).toBe(message)
    fireEvent.click(screen.getByRole('button', { name: 'งบประมาณ' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'รายรับรายจ่าย' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(writes).toHaveLength(0)
  })
  it('clears completed success on navigation without repeating the write', async () => {
    const writes = setup()
    fireEvent.submit(await fill('1.25'))
    await screen.findByText('บันทึกสำเร็จ')
    const nav = screen.getByRole('button', { name: 'งบประมาณ' })
    await waitFor(() => expect(nav.hasAttribute('disabled')).toBe(false))
    fireEvent.click(nav)
    expect(screen.queryByText('บันทึกสำเร็จ')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'รายรับรายจ่าย' }))
    expect(screen.queryByText('บันทึกสำเร็จ')).toBeNull()
    expect(writes).toHaveLength(1)
  })
  it('keeps navigation and logout locked through in-flight and repeated unknown outcomes', async () => {
    let rejectWrite!: (error: Error) => void
    let calls = 0
    const writes = setup(() => {
      if (++calls === 1) return new Promise((_resolve, reject) => { rejectWrite = reject })
      if (calls === 2) return Promise.reject(new Error('synthetic lost response again'))
      return Promise.resolve({ id: categoryId })
    })
    fireEvent.submit(await fill('0.1'))
    const nav = screen.getByRole('button', { name: 'งบประมาณ' })
    expect(nav.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'ออกจากระบบ' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(nav)
    expect(screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })).toBeTruthy()
    rejectWrite(new Error('synthetic lost response'))
    const retry = await screen.findByRole('button', { name: 'ลองส่งคำขอเดิมอีกครั้ง' })
    const message = screen.getByRole('alert').textContent
    fireEvent.click(nav)
    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(writes).toHaveLength(1)
    fireEvent.click(retry)
    await waitFor(() => expect(writes).toHaveLength(2))
    await waitFor(() => expect(retry.hasAttribute('disabled')).toBe(false))
    expect(nav.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe(message)
    fireEvent.click(retry)
    await screen.findByText('บันทึกสำเร็จ')
    await waitFor(() => expect(nav.hasAttribute('disabled')).toBe(false))
    expect(writes).toHaveLength(3)
    for (const write of writes.slice(1)) {
      expect(write.body).toBe(writes[0]?.body)
      expect(write.headers).toEqual(writes[0]?.headers)
    }
    fireEvent.click(nav)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(writes).toHaveLength(3)
  })
  it('keeps maximum amounts as strings and validates scale before sending', async () => {
    const writes = setup()
    fireEvent.submit(await fill('1.001'))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('ข้อมูลไม่ถูกต้อง'))
    expect(writes).toHaveLength(0)
    fireEvent.submit(await fill('999999999999999999.99'))
    await screen.findByText('บันทึกสำเร็จ')
    expect(JSON.parse(String(writes[0]?.body)).amount).toBe('999999999999999999.99')
    expect(displayDecimal('999999999999999999.99')).toBe('999,999,999,999,999,999.99')
  })
  it('retries an unknown commit with identical frozen payload and key', async () => {
    let calls = 0
    const writes = setup(async () => { if (++calls === 1) throw new Error('synthetic lost response'); return { id: categoryId } })
    fireEvent.submit(await fill('0.1'))
    const retry = await screen.findByRole('button', { name: 'ลองส่งคำขอเดิมอีกครั้ง' })
    expect(screen.getByLabelText('จำนวนเงิน THB').hasAttribute('disabled')).toBe(true)
    fireEvent.click(retry)
    await screen.findByText('บันทึกสำเร็จ')
    expect(writes).toHaveLength(2)
    expect(writes[1]?.body).toBe(writes[0]?.body)
    expect(writes[1]?.headers).toEqual(writes[0]?.headers)
  })
  it('edits using a correction request and retains its key after a lost response', async () => {
    let calls = 0
    const writes = setup(async () => { if (++calls === 1) throw new Error('synthetic lost response'); return { id: transactionId } }, true)
    fireEvent.click(await screen.findByRole('button', { name: 'แก้ไขรายการ' }))
    expect((screen.getByLabelText('จำนวนเงิน THB') as HTMLInputElement).value).toBe('1.25')
    fireEvent.change(screen.getByLabelText('จำนวนเงิน THB'), { target: { value: '2.5' } })
    fireEvent.change(screen.getByLabelText('เหตุผลการแก้ไข'), { target: { value: 'บันทึกผิด' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ลองส่งคำขอเดิมอีกครั้ง' }))
    await screen.findByText('บันทึกสำเร็จ')
    expect(writes).toHaveLength(2)
    expect(writes[1]?.body).toBe(writes[0]?.body)
    expect(writes[1]?.headers).toEqual(writes[0]?.headers)
    expect(JSON.parse(String(writes[0]?.body))).toMatchObject({ action: 'replace', reason: 'บันทึกผิด', entry: { amount: '2.5' } })
    expect(vi.mocked(fetch).mock.calls.some(([path]) => path === `/api/finance/transactions/${transactionId}/corrections`)).toBe(true)
  })
  it('requires confirmation and a reason before voiding, and cancel sends nothing', async () => {
    const writes = setup(undefined, true)
    fireEvent.click(await screen.findByRole('button', { name: 'ยกเลิกรายการ' }))
    const dialog = screen.getByRole('dialog', { name: 'ยืนยันยกเลิกรายการ' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'กลับโดยไม่ยกเลิก' }))
    expect(writes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกรายการ' }))
    fireEvent.change(screen.getByLabelText('เหตุผลการยกเลิก'), { target: { value: 'ซ้ำ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันยกเลิกรายการ' }))
    await screen.findByText('บันทึกสำเร็จ')
    expect(JSON.parse(String(writes[0]?.body))).toEqual({ action: 'void', reason: 'ซ้ำ' })
  })
  it('locks the original crypto asset/portfolio while editing and sends only editable fields', async () => {
    const writes = setup(undefined, true)
    await screen.findByRole('button', { name: 'แก้ไขรายการ' })
    fireEvent.click(screen.getByRole('button', { name: 'พอร์ตคริปโต' }))
    fireEvent.change(screen.getByLabelText('พอร์ตที่ดู'), { target: { value: portfolioId } })
    const editTrade = screen.getByRole('button', { name: 'แก้ไขประวัติ' })
    await waitFor(() => expect(editTrade.hasAttribute('disabled')).toBe(false))
    fireEvent.click(editTrade)
    expect(screen.getByLabelText('สินทรัพย์').hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('พอร์ตที่ดู').hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('ราคาต่อหน่วย USDT'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('เหตุผลการแก้ไข'), { target: { value: 'ราคาผิด' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))
    await screen.findByText('บันทึกสำเร็จ')
    const body = JSON.parse(String(writes[0]?.body))
    expect(body).toMatchObject({ action: 'replace', entry: { quantity: '0.00000001', price: '3' } })
    expect(body.entry).not.toHaveProperty('asset')
    expect(body.entry).not.toHaveProperty('portfolioId')
    expect(vi.mocked(fetch).mock.calls.some(([path]) => path === `/api/crypto/trades/${tradeId}/corrections`)).toBe(true)
  })
})
