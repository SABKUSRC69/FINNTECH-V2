import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { randomBytes } from 'node:crypto'

const healthy = { status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' } }
const session = { user: { name: 'ผู้ทดสอบ' } }
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function fixture(initialSession: unknown = null, demo = false) {
  vi.stubGlobal('WebSocket', undefined)
  let current = initialSession
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === '/api/health') return reply({ ...healthy, ...(demo ? { demo: { enabled: true } } : {}) })
    if (path === '/api/auth/get-session') return reply(current)
    if (path === '/api/me') return reply(current ? { ownerId: 'synthetic-server-owner', ...(demo ? { demo: true } : {}) } : {}, current ? 200 : 401)
    if (path.startsWith('/api/finance?')) return reply({ month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [], transactions: [], budgets: [] })
    if (path === '/api/crypto') return reply({ quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] })
    if (path === '/api/crypto/market') return reply({ quotes: [] })
    if (options?.method === 'POST') { if (!path.endsWith('/prepare') && !path.endsWith('/reset')) current = path.endsWith('sign-out') ? null : session; return reply({}) }
    throw new Error('unexpected test route')
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function loginForm() {
  return screen.findByRole('form', { name: 'ฟอร์มเข้าสู่ระบบ' })
}
function fillLogin(form: HTMLElement) {
  fireEvent.change(within(form).getByLabelText('อีเมล'), { target: { value: 'synthetic@example.invalid' } })
  fireEvent.change(within(form).getByLabelText('รหัสผ่าน'), { target: { value: 'synthetic-test-only-value' } })
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Thai Auth UI', () => {
  it('actual pre-entry invalid-code rejection remains editable and a corrected code reuses the prepared request', async () => {
    const mock = fixture(null, true); render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ทดลองใช้งาน' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'ทดลองใช้งาน' }))
    const field = screen.getByLabelText('รหัสทดลอง') as HTMLInputElement
    fireEvent.change(field, { target: { value: 'synthetic-invalid-code' } })
    mock.mockResolvedValueOnce(reply({ prepared: true })).mockResolvedValueOnce(reply({}, 403))
    fireEvent.submit(screen.getByRole('form', { name: 'เข้า DEMO' }))
    await screen.findByText('รหัสทดลองไม่ถูกต้อง หรือเจ้าของยังไม่เปิด DEMO')
    expect(field.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'เริ่มพื้นที่ทดลองใหม่' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('link', { name: 'FINNTECH หน้าหลัก' })).toBeTruthy()
    const corrected = randomBytes(24).toString('hex')
    fireEvent.change(field, { target: { value: corrected } }); fireEvent.submit(screen.getByRole('form', { name: 'เข้า DEMO' }))
    await screen.findByText('สวัสดี ผู้ทดสอบ')
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/prepare')).toHaveLength(1)
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/reset')).toHaveLength(0)
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/enter').map(([, options]) => options?.body)).toEqual([JSON.stringify({ code: 'synthetic-invalid-code' }), JSON.stringify({ code: corrected })])
  })
  it.each([
    ['/api/health', 503, {}], ['/api/auth/get-session', 503, {}], ['/api/me', 503, {}],
    ['/api/health', 200, {}], ['/api/auth/get-session', 200, { user: { name: false } }], ['/api/me', 200, {}],
  ])('keeps the original DEMO request locked after entry succeeds but %s (%s) verification fails', async (failedRoute, status, body) => {
    const mock = fixture(null, true), normal = mock.getMockImplementation()!
    let entered = false, failed = false
    mock.mockImplementation(async (path, options) => {
      if (entered && !failed && path === failedRoute) { failed = true; return reply(body, status as number) }
      const response = await normal(path, options)
      if (path === '/api/auth/demo/enter') entered = true
      return response
    })
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ทดลองใช้งาน' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'ทดลองใช้งาน' }))
    const code = randomBytes(24).toString('hex'), field = screen.getByLabelText('รหัสทดลอง') as HTMLInputElement
    fireEvent.change(field, { target: { value: code } }); fireEvent.submit(screen.getByRole('form', { name: 'เข้า DEMO' }))
    const retry = await screen.findByRole('button', { name: 'ตรวจผลคำขอ DEMO เดิม' })
    expect(field.disabled).toBe(true); expect(field.value).toBe(code)
    for (const label of ['เข้าสู่ระบบ', 'สมัครบัญชี', 'ทดลองใช้งาน', 'เริ่มพื้นที่ทดลองใหม่', 'เข้าพื้นที่ทดลอง']) expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('link', { name: 'FINNTECH หน้าหลัก' })).toBeNull()
    fireEvent.submit(screen.getByRole('form', { name: 'เข้า DEMO' }))
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/enter')).toHaveLength(1)
    fireEvent.click(retry); await screen.findByText('สวัสดี ผู้ทดสอบ')
    const writes = mock.mock.calls.filter(([path]) => path === '/api/auth/demo/enter')
    expect(writes).toHaveLength(2); expect(writes.map(([, options]) => options?.body)).toEqual([JSON.stringify({ code }), JSON.stringify({ code })])
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/prepare')).toHaveLength(1)
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/reset')).toHaveLength(0)
    expect(storage).not.toHaveBeenCalled(); expect(screen.queryByLabelText('รหัสทดลอง')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ออกและเริ่มพื้นที่ทดลองใหม่' }))
    expect((await screen.findByLabelText('รหัสทดลอง') as HTMLInputElement).value).toBe('')
  })
  it('requires confirmed signed-out state even across another failed read and a still-signed-in reconciliation', async () => {
    const mock = fixture(session, true), normal = mock.getMockImplementation()!
    let loggedOut = false, failures = 0
    mock.mockImplementation(async (path, options) => {
      if (loggedOut && path === '/api/health' && failures < 2) { failures++; return reply({}, 503) }
      if (loggedOut && failures === 2 && path === '/api/auth/get-session') return reply(session)
      if (loggedOut && failures === 2 && path === '/api/me') { failures++; return reply({ ownerId: 'synthetic-server-owner', demo: true }) }
      const response = await normal(path, options); if (path === '/api/auth/sign-out') loggedOut = true; return response
    })
    render(<App />); await screen.findByText('สวัสดี ผู้ทดสอบ')
    fireEvent.click(screen.getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ออกและเริ่มพื้นที่ทดลองใหม่' }))
    for (const count of [2, 3]) {
      fireEvent.click(await screen.findByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' }))
      await waitFor(() => expect(failures).toBe(count))
      await waitFor(() => expect(screen.getByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' }).hasAttribute('disabled')).toBe(false))
      for (const name of ['เข้าสู่ระบบ', 'สมัครบัญชี', 'ทดลองใช้งาน']) for (const button of screen.getAllByRole('button', { name })) expect(button.hasAttribute('disabled')).toBe(true)
      expect(screen.queryByRole('link', { name: 'FINNTECH หน้าหลัก' })).toBeNull()
    }
    fireEvent.click(screen.getByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' }))
    const field = await screen.findByLabelText('รหัสทดลอง'); await waitFor(() => expect(field.hasAttribute('disabled')).toBe(false))
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/reset')).toHaveLength(0)
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/sign-out')).toHaveLength(1)
  })
  it.each(['/api/health', '/api/auth/get-session', '/api/me'])('keeps fresh logout locked after success and failed %s reconciliation, then permits deliberate fresh entry', async failedRoute => {
    const mock = fixture(session, true), normal = mock.getMockImplementation()!
    let loggedOut = false, failed = false
    mock.mockImplementation(async (path, options) => {
      if (loggedOut && !failed && path === '/api/auth/get-session' && failedRoute === '/api/me') return reply(session)
      if (loggedOut && !failed && path === failedRoute) { failed = true; return reply({}, 503) }
      const response = await normal(path, options)
      if (path === '/api/auth/sign-out') loggedOut = true
      return response
    })
    render(<App />); await screen.findByText('สวัสดี ผู้ทดสอบ')
    fireEvent.click(screen.getByRole('button', { name: 'บัญชีและดูแลข้อมูล' }))
    const fresh = await screen.findByRole('button', { name: 'ออกและเริ่มพื้นที่ทดลองใหม่' })
    fireEvent.click(fresh)
    const retry = await screen.findByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' })
    expect(fresh.hasAttribute('disabled')).toBe(true)
    for (const label of ['ออกจากระบบ', 'ออกจากระบบบัญชีนี้', 'ไปสำรองและกู้คืนข้อมูล', 'รายรับรายจ่าย']) expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true)
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/reset')).toHaveLength(0)
    fireEvent.click(fresh); expect(mock.mock.calls.filter(([path]) => path === '/api/auth/sign-out')).toHaveLength(1)
    fireEvent.click(retry)
    const field = await screen.findByLabelText('รหัสทดลอง')
    await waitFor(() => expect(field.hasAttribute('disabled')).toBe(false))
    // Account reconciliation itself never creates or resets a workspace.
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/reset')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มพื้นที่ทดลองใหม่' }))
    await screen.findByText('พร้อมเริ่มพื้นที่ใหม่ กรอกรหัสทดลองอีกครั้ง')
    expect(mock.mock.calls.filter(([path]) => path === '/api/auth/demo/reset')).toHaveLength(1)
  })
  it('returning demo browser resumes its authenticated session without submitting a new demo code', async () => {
    const mock = fixture(session, true); render(<App />)
    await screen.findByText('สวัสดี ผู้ทดสอบ')
    expect(screen.getByText('DEMO — ข้อมูลทดลอง', { exact: true })).toBeTruthy()
    expect(mock.mock.calls.filter(([,options]) => options?.method === 'POST')).toHaveLength(0)
  })
  it('demo lost response prevents changing login mode or leaving via the brand; retry resumes the original attempt', async () => {
    const mock = fixture(null, true)
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ทดลองใช้งาน' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'ทดลองใช้งาน' }))
    const code = randomBytes(24).toString('hex')
    fireEvent.change(screen.getByLabelText('รหัสทดลอง'), { target: { value: code } })
    mock.mockResolvedValueOnce(reply({ prepared: true })).mockRejectedValueOnce(new Error('synthetic response loss'))
    fireEvent.submit(screen.getByRole('form', { name: 'เข้า DEMO' }))
    const retry = await screen.findByRole('button', { name: 'ตรวจผลคำขอ DEMO เดิม' })
    for (const label of ['เข้าสู่ระบบ', 'สมัครบัญชี', 'ทดลองใช้งาน']) expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('link', { name: 'FINNTECH หน้าหลัก' })).toBeNull()
    fireEvent.click(retry); await screen.findByText('สวัสดี ผู้ทดสอบ')
    const writes = mock.mock.calls.filter(([path]) => path === '/api/auth/demo/enter')
    expect(writes).toHaveLength(2); expect(writes[0]![1]?.body).toBe(writes[1]![1]?.body)
    expect(screen.getByText('DEMO — ข้อมูลทดลอง', { exact: true })).toBeTruthy()
  })
  it('shows working sign-in/signup controls, masked password and the disclaimer without balances', async () => {
    fixture()
    render(<App />)
    const form = await loginForm()
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
    expect(screen.getByText('ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน')).toBeTruthy()
    expect(within(form).getByLabelText('รหัสผ่าน').getAttribute('type')).toBe('password')
    expect(screen.queryByText('LIVE')).toBeNull()
    expect(screen.queryByText('เครดิตเริ่มต้น')).toBeNull()
  })

  it('logs in, verifies server ownership, clears password and logs out without localStorage', async () => {
    const fetchMock = fixture()
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)
    const form = await loginForm()
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
    fillLogin(form)
    fireEvent.submit(form)
    expect(await screen.findByText('สวัสดี ผู้ทดสอบ')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/me')).toBe(true)
    expect(storage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))
    const signedOut = await loginForm()
    await waitFor(() => expect((within(signedOut).getByLabelText('รหัสผ่าน') as HTMLInputElement).value).toBe(''))
  })

  it('restores a signed-in session on page initialization', async () => {
    fixture(session)
    render(<App />)
    expect(await screen.findByText('สวัสดี ผู้ทดสอบ')).toBeTruthy()
    expect(screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })).toBeTruthy()
  })

  it('sends only one login request while a response is pending despite repeated submission', async () => {
    const mock = fixture()
    render(<App />)
    const form = await loginForm()
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
    fillLogin(form)
    let release!: (value: ReturnType<typeof reply>) => void
    mock.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
      .mockResolvedValueOnce(reply(healthy)).mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(reply({ ownerId: 'server-owner' }))
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(mock.mock.calls.filter(([,options]) => options?.method === 'POST')).toHaveLength(1)
    release(reply({}))
    expect(await screen.findByText('สวัสดี ผู้ทดสอบ')).toBeTruthy()
  })

  it('rejects mismatched signup passwords before sending and registers after they match', async () => {
    const fetchMock = fixture()
    render(<App />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'สมัครบัญชี' }))
    const form = screen.getByRole('form', { name: 'ฟอร์มสมัครบัญชี' })
    fireEvent.change(within(form).getByLabelText('ชื่อที่ใช้แสดง'), { target: { value: 'ผู้ทดสอบ' } })
    fillLogin(form)
    fireEvent.change(within(form).getByLabelText('ยืนยันรหัสผ่าน'), { target: { value: 'different-synthetic-value' } })
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'รหัสผ่านทั้งสองช่องต้องตรงกัน')
    expect(fetchMock.mock.calls.some(([,options]) => options?.method === 'POST')).toBe(false)
    fireEvent.change(within(form).getByLabelText('ยืนยันรหัสผ่าน'), { target: { value: 'synthetic-test-only-value' } })
    fireEvent.submit(form)
    expect(await screen.findByText('สวัสดี ผู้ทดสอบ')).toBeTruthy()
  })

  it('shows safe Thai errors for rejected login and clears the supplied password', async () => {
    const mock = fixture()
    render(<App />)
    const form = await loginForm()
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
    fillLogin(form)
    mock.mockImplementationOnce(async () => reply({ message: 'untrusted server detail' }, 401))
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง')
    expect((within(form).getByLabelText('รหัสผ่าน') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('untrusted server detail')).toBeNull()
  })

  it('blocks resubmission after an uncertain response until explicit status reconciliation', async () => {
    const mock = fixture()
    render(<App />)
    const form = await loginForm()
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
    fillLogin(form)
    mock.mockImplementationOnce(async () => { throw new Error('synthetic disconnected response') })
    fireEvent.submit(form)
    const retry = await screen.findByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' })
    expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(true)
    fireEvent.submit(form)
    expect(mock.mock.calls.filter(([,options]) => options?.method === 'POST')).toHaveLength(1)
    fireEvent.click(retry)
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
  })

  it('requires reconciliation if login succeeded but the following session read failed', async () => {
    const mock = fixture()
    render(<App />)
    const form = await loginForm()
    await waitFor(() => expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(false))
    fillLogin(form)
    mock.mockImplementationOnce(async () => reply({}))
    mock.mockImplementationOnce(async () => reply({}, 503))
    fireEvent.submit(form)
    expect(await screen.findByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' })).toBeTruthy()
    expect(within(form).getByRole('button', { name: 'เข้าสู่ระบบ' }).hasAttribute('disabled')).toBe(true)
  })

  it('disables forms when Auth/database is unavailable and supports retry', async () => {
    const mock = fixture()
    mock.mockImplementationOnce(async () => reply({ ...healthy, checks: { ...healthy.checks, database: 'error' } }))
    render(<App />)
    const retry = await screen.findByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' })
    expect(screen.getByRole('form', { name: 'ฟอร์มเข้าสู่ระบบ' }).querySelector('input')?.hasAttribute('disabled')).toBe(true)
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByLabelText('อีเมล').hasAttribute('disabled')).toBe(false))
  })
})
