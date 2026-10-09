import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import RecoveryPanel, { takeRecoveryLink } from './auth/RecoveryPanel'

const health = { status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' }, capabilities: { recovery: true }, real: { registrationsOpen: true } }
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body })
it('public password mode honestly discloses absent verification/recovery and preserves signup reconciliation', async () => {
  vi.stubGlobal('WebSocket', undefined)
  let signedIn = false, signup = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/health') return reply({ ...health, capabilities: { recovery: false }, real: { registrationsOpen: true, authenticationMode: 'email-password' } })
    if (url === '/api/auth/get-session') return reply(signedIn ? { user: { name: 'Student' } } : null)
    if (url === '/api/me') return reply({ ownerId: 'synthetic-owner' })
    if (url === '/api/auth/sign-up/email' && options?.method === 'POST') { signup++; signedIn = true; return reply({}) }
    if (url.startsWith('/api/finance?')) return reply({ month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [], transactions: [], budgets: [] })
    if (url === '/api/crypto') return reply({ quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] })
    if (url === '/api/crypto/market') return reply({ quotes: [] })
    throw new Error('unexpected test request')
  }))
  render(<App />)
  await screen.findByText(/อีเมลใช้เป็นชื่อบัญชีโดยยังไม่ยืนยัน/)
  expect(screen.queryByRole('button', { name: 'ลืมรหัสผ่าน / เริ่มยืนยันอีเมล' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'สมัครบัญชี' }))
  for (const [label, value] of [['ชื่อที่ใช้แสดง', 'Student'], ['อีเมล', 'student@example.test'], ['รหัสผ่าน', 'synthetic-long-password'], ['ยืนยันรหัสผ่าน', 'synthetic-long-password']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } })
  const form = screen.getByRole('form', { name: 'ฟอร์มสมัครบัญชี' })
  fireEvent.submit(form); fireEvent.submit(form)
  await screen.findByText('สวัสดี Student')
  expect(signup).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
  await screen.findByText(/บัญชีอีเมลและรหัสผ่าน — อีเมลยังไม่ยืนยัน/)
  expect(screen.queryByText(/^ยืนยันอีเมลแล้ว/)).toBeNull()
})
it('offers staging signup from the boolean capability while public registration remains closed',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>reply(url==='/api/health'?{...health,real:{registrationsOpen:false,stagingEnrollment:true}}:null)))
  render(<App/>);await screen.findByText('บัญชีส่วนบุคคล ต้องยืนยันอีเมลก่อนเข้าใช้ เริ่มด้วยรายการว่าง')
  fireEvent.click(screen.getByRole('button',{name:'สมัครบัญชี'}))
  expect(screen.getByRole('form',{name:'ฟอร์มสมัครบัญชี'})).toBeTruthy()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/') })

it('uses fragment recovery links, removes token before requests, and never consumes a scanner GET', () => {
  history.replaceState(null, '', '/account/verify#token=synthetic-test-only')
  expect(takeRecoveryLink()).toEqual({ kind: 'verify', token: 'synthetic-test-only' }); expect(location.hash).toBe('')
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  render(<RecoveryPanel real link={{ kind: 'verify', token: 'synthetic-test-only' }} close={vi.fn()} />)
  expect(screen.queryByText(/ไม่มีการส่งอีเมลออกภายนอก/)).toBeNull(); expect(fetcher).not.toHaveBeenCalled()
})
it('keeps real registrations closed and never relabels or offers DEMO', async () => {
  const fetcher = vi.fn(async (url: string) => reply(url === '/api/health' ? { ...health, real: { registrationsOpen: false } } : null))
  vi.stubGlobal('fetch', fetcher); render(<App />)
  await screen.findByText('ยังปิดรับสมัครบัญชีใหม่ระหว่างตรวจรับ')
  fireEvent.click(screen.getByRole('button', { name: 'สมัครบัญชี' }))
  expect(screen.queryByRole('form', { name: 'ฟอร์มสมัครบัญชี' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'ทดลองใช้งาน' })).toBeNull()
  expect(fetcher.mock.calls).toHaveLength(2)
})
it('shows real email instructions after verified-required signup and blocks duplicate submission', async () => {
  const fetcher = vi.fn(async (url: string) => reply(url === '/api/health' ? health : url === '/api/auth/get-session' ? null : { awaitingVerification: true }))
  vi.stubGlobal('fetch', fetcher); render(<App />)
  await screen.findByText('บัญชีส่วนบุคคล ต้องยืนยันอีเมลก่อนเข้าใช้ เริ่มด้วยรายการว่าง')
  fireEvent.click(screen.getByRole('button', { name: 'สมัครบัญชี' }))
  for (const [label, value] of [['ชื่อที่ใช้แสดง', 'Synthetic'], ['อีเมล', 'synthetic@example.test'], ['รหัสผ่าน', 'synthetic-long-password'], ['ยืนยันรหัสผ่าน', 'synthetic-long-password']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } })
  fireEvent.submit(screen.getByRole('form', { name: 'ฟอร์มสมัครบัญชี' })); await screen.findByText(/กรุณาตรวจกล่องจดหมายและ spam/)
  fireEvent.submit(screen.getByRole('form', { name: 'ฟอร์มสมัครบัญชี' }))
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/auth/sign-up/email')).toHaveLength(1)
  expect(screen.queryByText(/ช่องทางอีเมลทดสอบในเครื่อง/)).toBeNull()
})
it.each(['accepted', 'lost-response'])('keeps logout reconciliation locked while the old account is still reported (%s)', async outcome => {
  vi.stubGlobal('WebSocket', undefined)
  let signedIn = true, writes = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/health') return reply(health)
    if (url === '/api/auth/get-session') return reply(signedIn ? { user: { name: 'Synthetic real' } } : null)
    if (url === '/api/me') return reply({ ownerId: 'synthetic-owner' })
    if (url.startsWith('/api/finance?')) return reply({ month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [], transactions: [], budgets: [] })
    if (url === '/api/crypto') return reply({ quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] })
    if (url === '/api/crypto/market') return reply({ quotes: [] })
    if (url === '/api/auth/sign-out' && options?.method === 'POST') { writes++; if (outcome === 'lost-response') throw new Error('synthetic response loss'); return reply({}) }
    throw new Error('unexpected test request')
  }))
  render(<App />); await screen.findByText('สวัสดี Synthetic real')
  fireEvent.click(screen.getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
  fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบบัญชีนี้' }))
  const reconcile = await screen.findByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' })
  expect(screen.getByRole('button', { name: 'ออกจากระบบบัญชีนี้' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(reconcile)
  await screen.findByText('ยังยืนยันผลบัญชีไม่ได้ กรุณาตรวจสอบสถานะอีกครั้ง')
  expect(screen.queryByRole('link', { name: 'FINNTECH หน้าหลัก' })).toBeNull(); expect(writes).toBe(1)
  signedIn = false; fireEvent.click(screen.getByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' }))
  const form = await screen.findByRole('form', { name: 'ฟอร์มเข้าสู่ระบบ' })
  await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
  expect(writes).toBe(1)
})
