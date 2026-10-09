import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import RecoveryPanel, { takeRecoveryLink } from './RecoveryPanel'
import App from '../App'
import { StrictMode } from 'react'
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); vi.restoreAllMocks() })
it('captures link in memory and removes sensitive query from history', () => {
  history.replaceState(null, '', '/account/reset?token=synthetic-only')
  expect(takeRecoveryLink()).toEqual({ kind: 'reset', token: 'synthetic-only' })
  expect(location.search).toBe(''); expect(localStorage.getItem('token')).toBeNull()
})
it('requires password confirmation and sends once; unknown outcome clears fields and prevents automatic/new-password retry', async () => {
  const mock = vi.fn(async () => reply({}, 503)); vi.stubGlobal('fetch', mock)
  render(<RecoveryPanel link={{ kind: 'reset', token: 'synthetic-only' }} close={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('รหัสผ่านใหม่'), { target: { value: 'synthetic-long-password' } })
  fireEvent.change(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), { target: { value: 'synthetic-other-value' } })
  fireEvent.submit(screen.getByRole('form')); expect(mock).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), { target: { value: 'synthetic-long-password' } })
  fireEvent.submit(screen.getByRole('form')); fireEvent.submit(screen.getByRole('form'))
  await screen.findByText(/ไม่ส่งรหัสผ่านซ้ำอัตโนมัติ/)
  expect(mock).toHaveBeenCalledTimes(1)
  expect((screen.getByLabelText('รหัสผ่านใหม่') as HTMLInputElement).value).toBe('')
  expect((screen.getByRole('button', { name: 'ยืนยันรหัสผ่านใหม่' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByRole('form')); expect(mock).toHaveBeenCalledTimes(1)
})
it('locks close/navigation during a request and does not consume verification on mount', async () => {
  let resolve!: (reply: unknown) => void
  const mock = vi.fn(() => new Promise(value => { resolve = value })), lock = vi.fn(), close = vi.fn(); vi.stubGlobal('fetch', mock)
  render(<RecoveryPanel link={{ kind: 'verify', token: 'synthetic-only' }} close={close} lock={lock} />)
  expect(mock).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันอีเมลนี้' }))
  expect(lock).toHaveBeenCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'กลับไปเข้าสู่ระบบ' })); expect(close).not.toHaveBeenCalled()
  resolve(reply({ status: true })); await screen.findByText('ยืนยันอีเมลแล้ว กรุณาเข้าสู่ระบบตามปกติ')
  expect(lock).toHaveBeenLastCalledWith(false)
})
it('signup awaiting verification is not treated as rollback or resubmitted because there is no session', async () => {
  const mock = vi.fn(async (path: string) => path === '/api/health' ? reply({ status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' }, capabilities: { recovery: true } })
    : path === '/api/auth/get-session' ? reply(null) : reply({ awaitingVerification: true }))
  vi.stubGlobal('fetch', mock); render(<App />)
  await waitFor(() => expect((screen.getByRole('button', { name: 'สมัครบัญชี' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'สมัครบัญชี' }))
  for (const [label, value] of [['ชื่อที่ใช้แสดง', 'Synthetic'], ['อีเมล', 'synthetic@example.invalid'], ['รหัสผ่าน', 'synthetic-long-password'], ['ยืนยันรหัสผ่าน', 'synthetic-long-password']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } })
  fireEvent.submit(screen.getByRole('form', { name: 'ฟอร์มสมัครบัญชี' }))
  await screen.findByText(/สมัครบัญชีแล้ว รอยืนยันอีเมล/)
  expect(screen.queryByText('ตรวจสอบสถานะอีกครั้ง')).toBeNull()
  expect(mock.mock.calls.filter(([path]) => path === '/api/auth/sign-up/email')).toHaveLength(1)
  expect((screen.getByRole('button', { name: 'สร้างบัญชี' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByRole('form', { name: 'ฟอร์มสมัครบัญชี' }))
  expect(mock.mock.calls.filter(([path]) => path === '/api/auth/sign-up/email')).toHaveLength(1)
})
it('feature-off deep links remove the token before API reads and do not expose recovery controls under StrictMode', async () => {
  history.replaceState(null, '', '/account/reset?token=synthetic-only')
  const searches: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    searches.push(location.search)
    return path === '/api/health' ? reply({ status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' } }) : reply(null)
  }))
  render(<StrictMode><App /></StrictMode>)
  await screen.findByRole('form', { name: 'ฟอร์มเข้าสู่ระบบ' })
  await waitFor(() => expect(searches.length).toBeGreaterThan(0))
  expect(searches.every(search => search === '')).toBe(true)
  expect(screen.queryByRole('region', { name: 'กู้คืนและยืนยันบัญชี' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'ลืมรหัสผ่าน / เริ่มยืนยันอีเมล' })).toBeNull()
})
