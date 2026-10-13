import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'
import TrackerNavigation from './TrackerNavigation'
import Account from './Account'
const cashId = '00000000-0000-4000-8000-0000000000c1'
const categoryId = '00000000-0000-4000-8000-000000000001'
const transactionId = '00000000-0000-4000-8000-000000000002'
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function setup(lostPath?: string) {
  vi.stubGlobal('WebSocket', undefined)
  const writes: { path: string; options: RequestInit }[] = []
  let signedIn = true, lost = false
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit = {}) => {
    if (options.method === 'POST') {
      writes.push({ path, options })
      if (path === lostPath && !lost) { lost = true; throw new Error('synthetic response loss') }
      if (path === '/api/auth/sign-out') signedIn = false
      return reply({ id: transactionId })
    }
    if (path === '/api/health') return reply({ status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' } })
    if (path === '/api/auth/get-session') return reply(signedIn ? { user: { name: 'ชื่อจาก session สังเคราะห์' } } : null)
    if (path === '/api/me') return reply({ ownerId: 'synthetic-owner' })
    if (path.startsWith('/api/finance?')) return reply({ month: '2026-10', currency: 'THB', income: '0', expense: '1.25', balance: '-1.25', categories: [{ id: categoryId, type: 'expense', name: 'อาหาร' }], transactions: [{ id: transactionId, categoryId, type: 'expense', amount: '1.25', date: '2026-10-07', note: '' }], budgets: [] })
    if (path === '/api/crypto') return reply({ quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] })
    if (path === '/api/cash') return reply({ accounts: [{ id: cashId, name: 'กระเป๋าเงิน', balance: '1000.00', currency: 'THB', asOf: '2026-01-01', version: 1 }] })
    if (path === '/api/stocks') return reply({quoteCurrency:'USD',portfolios:[],holdings:[],trades:[]})
    if (path === '/api/assets/manual') return reply({assets:[]})
    if (path === '/api/reference-rate') return reply({ base: 'USDT', quote: 'THB', rate: null, receivedAt: null, status: 'UNAVAILABLE', source: 'Bitkub public', kind: 'LAST_PRICE_SNAPSHOT' })
    if (path === '/api/stocks/market') return reply({ source: 'Alpaca IEX', currency: 'USD', connection: 'NOT_CONFIGURED', quotes: [] })
    return reply({ quotes: [] })
  }))
  render(<App />)
  return writes
}
async function ready() { await screen.findByRole('button', { name: 'แก้ไขรายการ' }) }
function mobile() { return within(screen.getByRole('navigation', { name: 'เมนูมือถือ' })) }
async function more() {
  fireEvent.click(mobile().getByRole('button', { name: 'เพิ่มเติม' }))
  return within(await screen.findByRole('dialog', { name: 'เพิ่มเติม' }))
}
async function fillFinance(value: string) {
  await ready()
  fireEvent.change(screen.getByLabelText('หมวดหมู่'), { target: { value: categoryId } })
  fireEvent.change(screen.getByLabelText('จ่ายจากบัญชีเงินสด'), { target: { value: cashId } })
  fireEvent.change(screen.getByLabelText('จำนวนเงิน THB'), { target: { value } })
  return screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })
}

it.each(['stock','manual'] as const)('keeps all navigation/logout guarded during unknown %s writes and retries the identical request',async(kind)=>{
 const writes=setup(kind==='stock'?'/api/stocks/portfolios':'/api/assets/manual');await ready()
 if(kind==='stock'){
  fireEvent.click((await more()).getByRole('button',{name:'ราคาหุ้นสหรัฐ'}))
  await waitFor(()=>expect(screen.getByLabelText('ชื่อพอร์ตหุ้น').hasAttribute('disabled')).toBe(false))
  fireEvent.change(screen.getByLabelText('ชื่อพอร์ตหุ้น'),{target:{value:'Synthetic stock'}})
  fireEvent.submit(screen.getByRole('form',{name:'สร้างพอร์ตหุ้น'}))
 }else{
  fireEvent.click(mobile().getByRole('button',{name:'ภาพรวม'}))
  await waitFor(()=>expect(screen.getByLabelText('ชื่อสินทรัพย์อื่น').hasAttribute('disabled')).toBe(false))
  fireEvent.change(screen.getByLabelText('ชื่อสินทรัพย์อื่น'),{target:{value:'Synthetic manual'}})
  fireEvent.change(screen.getByLabelText('มูลค่าประเมินรวม'),{target:{value:'100.10'}})
  fireEvent.submit(screen.getByRole('form',{name:'บันทึกสินทรัพย์ประเมินเอง'}))
 }
 const retry=await screen.findByRole('button',{name:kind==='stock'?'ตรวจผลหุ้นด้วยคำขอเดิม':'ตรวจผลสินทรัพย์ด้วยคำขอเดิม'})
 expect(screen.getByRole('button',{name:'ออกจากระบบ'}).hasAttribute('disabled')).toBe(true)
 fireEvent.click((await more()).getByRole('button',{name:'สำรองข้อมูล'}))
 expect(screen.getByRole('heading',{level:1,name:kind==='stock'?'ราคาหุ้นสหรัฐ':'สินทรัพย์รวม'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'ปิดเพิ่มเติม'}));fireEvent.click(retry)
 await waitFor(()=>expect(writes).toHaveLength(2))
 expect(writes[0]?.options.body).toBe(writes[1]?.options.body);expect(writes[0]?.options.headers).toEqual(writes[1]?.options.headers)
 await waitFor(()=>expect(screen.getByRole('button',{name:'ออกจากระบบ'}).hasAttribute('disabled')).toBe(false))
})

it.each(['งบประมาณ', 'สำรองข้อมูล', 'บัญชีและดูแลข้อมูล', 'ราคาหุ้นสหรัฐ'])('reaches %s through More and marks the secondary page active without writing', async label => {
  const writes = setup(); await ready()
  expect(mobile().getAllByRole('button')).toHaveLength(4)
  fireEvent.click((await more()).getByRole('button', { name: label }))
  expect(screen.getByRole('heading', { level: 1, name: label })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mobile().getByRole('button', { name: 'เพิ่มเติม' }).getAttribute('aria-current')).toBe('page')
  expect(mobile().getByRole('button', { name: 'เพิ่มเติม' }).getAttribute('aria-expanded')).toBe('false')
  expect(writes).toHaveLength(0)
})
it('keeps validation on sheet close, clears it on real navigation, and retains finance draft/month', async () => {
  const writes = setup()
  fireEvent.submit(await fillFinance('1.001'))
  const text = screen.getByRole('alert').textContent
  fireEvent.click((await more()).getByRole('button', { name: 'ปิดเพิ่มเติม' }))
  expect(screen.getByRole('alert').textContent).toBe(text)
  fireEvent.click(mobile().getByRole('button', { name: 'รายการ' }))
  expect(screen.getByRole('alert').textContent).toBe(text)
  fireEvent.click((await more()).getByRole('button', { name: 'งบประมาณ' }))
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(mobile().getByRole('button', { name: 'รายการ' }))
  expect((screen.getByLabelText('จำนวนเงิน THB') as HTMLInputElement).value).toBe('1.001')
  expect((screen.getByLabelText('เดือนที่ดู') as HTMLInputElement).value).toBe('2026-10')
  expect(writes).toHaveLength(0)
})
it('keeps all new navigation entries locked on unknown writes and presentation does not change the retry', async () => {
  const writes = setup('/api/finance/transactions')
  fireEvent.submit(await fillFinance('999999999999999999.99'))
  const retry = await screen.findByRole('button', { name: 'ลองส่งคำขอเดิมอีกครั้ง' })
  fireEvent.click(screen.getByRole('button', { name: 'เปิดโหมดมืด' }))
  fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
  expect((screen.getByLabelText('จำนวนเงิน THB') as HTMLInputElement).value).toBe('999999999999999999.99')
  for (const label of ['ภาพรวม', 'รายการ', 'พอร์ต']) expect(mobile().getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true)
  const sheet = await more()
  for (const label of ['งบประมาณ', 'สำรองข้อมูล', 'บัญชีและดูแลข้อมูล', 'ราคาหุ้นสหรัฐ']) {
    const button = sheet.getByRole('button', { name: label })
    expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button)
  }
  fireEvent.click(sheet.getByRole('button', { name: 'ปิดเพิ่มเติม' }))
  expect(screen.getByRole('button', { name: 'ออกจากระบบ' }).hasAttribute('disabled')).toBe(true)
  expect(writes).toHaveLength(1)
  fireEvent.click(retry); await screen.findByText('บันทึกสำเร็จ')
  expect(writes).toHaveLength(2)
  expect(writes[1]!.options.body).toBe(writes[0]!.options.body)
  expect(writes[1]!.options.headers).toEqual(writes[0]!.options.headers)
})
it('preserves the cash pending request when More is opened and closed', async () => {
  const writes = setup('/api/cash'); await ready()
  fireEvent.click(mobile().getByRole('button', { name: 'ภาพรวม' }))
  const save = await screen.findByRole('button', { name: 'เพิ่มยอดเงินสด' })
  await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false))
  fireEvent.change(screen.getByLabelText('ชื่อเงินสดหรือบัญชี'), { target: { value: 'สังเคราะห์' } })
  fireEvent.change(screen.getByLabelText('ยอดคงเหลือ THB'), { target: { value: '0.10' } })
  fireEvent.click(save)
  const retry = await screen.findByRole('button', { name: 'ตรวจผลด้วยคำขอเดิม' })
  const sheet = await more()
  expect(sheet.getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(sheet.getByRole('button', { name: 'ปิดเพิ่มเติม' }))
  fireEvent.click(retry); await screen.findByText('บันทึกยอดเงินสดสำเร็จ')
  expect(writes).toHaveLength(2); expect(writes[1]!.options.body).toBe(writes[0]!.options.body); expect(writes[1]!.options.headers).toEqual(writes[0]!.options.headers)
})
it('keeps a void request and its retry inside the modal and does not dismiss unknown outcome', async () => {
  const writes = setup(`/api/finance/transactions/${transactionId}/corrections`); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกรายการ' }))
  const dialog = screen.getByRole('dialog', { name: 'ยืนยันยกเลิกรายการ' })
  fireEvent.change(within(dialog).getByLabelText('เหตุผลการยกเลิก'), { target: { value: 'ทดสอบ' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันยกเลิกรายการ' }))
  const retry = await within(dialog).findByRole('button', { name: 'ลองส่งคำขอเดิมอีกครั้ง' })
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
  expect(dialog.isConnected).toBe(true)
  expect(within(dialog).getByRole('button', { name: 'ปิดยืนยันยกเลิกรายการ' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(retry); await screen.findByText('บันทึกสำเร็จ')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(writes).toHaveLength(2); expect(writes[1]!.options.body).toBe(writes[0]!.options.body); expect(writes[1]!.options.headers).toEqual(writes[0]!.options.headers)
})
it('uses the session name, links to backup and invokes the existing logout without unsupported actions', async () => {
  const writes = setup(); await ready()
  fireEvent.click((await more()).getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
  expect(screen.getByText('ชื่อจาก session สังเคราะห์', { exact: true })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /เปลี่ยนรหัสผ่าน|ลบบัญชี|กู้คืนบัญชี/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'ไปสำรองและกู้คืนข้อมูล' }))
  expect(screen.getByRole('heading', { level: 1, name: 'สำรองข้อมูล' })).toBeTruthy()
  fireEvent.click((await more()).getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
  fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบบัญชีนี้' }))
  await screen.findByRole('form', { name: 'ฟอร์มเข้าสู่ระบบ' })
  expect(writes.map(row => row.path)).toEqual(['/api/auth/sign-out'])
})
it('demo fresh/logout controls honor the same account navigation lock', () => {
  const fresh = vi.fn(), logout = vi.fn(), backup = vi.fn()
  const { rerender } = render(<Account name="DEMO" demo freshDemo={fresh} locked logout={logout} backup={backup} />)
  const reset = screen.getByRole('button', { name: 'ออกและเริ่มพื้นที่ทดลองใหม่' })
  expect(reset.hasAttribute('disabled')).toBe(true); fireEvent.click(reset)
  fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบบัญชีนี้' }))
  expect(fresh).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled()
  rerender(<Account name="DEMO" demo freshDemo={fresh} locked={false} logout={logout} backup={backup} />)
  fireEvent.click(reset); expect(fresh).toHaveBeenCalledOnce()
})
it('keeps an already open sheet dismissible when its navigation becomes locked', () => {
  const navigate = vi.fn(() => true)
  const props = { section: 'finance' as const, locked: false, navigate }
  const view = render(<TrackerNavigation {...props} />)
  fireEvent.click(mobile().getByRole('button', { name: 'เพิ่มเติม' }))
  view.rerender(<TrackerNavigation {...props} locked />)
  const dialog = screen.getByRole('dialog', { name: 'เพิ่มเติม' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
  expect(navigate).not.toHaveBeenCalled()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('locks account logout and backup actions when the shared navigation lock is set', () => {
  const logout = vi.fn(), backup = vi.fn()
  render(<Account name="session fixture" locked logout={logout} backup={backup} />)
  for (const button of screen.getAllByRole('button')) { expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button) }
  expect(logout).not.toHaveBeenCalled(); expect(backup).not.toHaveBeenCalled()
})
