// SYNTHETIC token values only.
import { it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import MarketKey from './MarketKey'

const TOKEN = 'SyntheticTiingoToken0123456789abcd'
type State = { available: boolean; status: 'NONE' | 'ACTIVE' | 'REMOVED'; hint: string | null; version: number | null }
function setup(initial: State, reject: string | null = null) {
  let state = { ...initial }
  const writes: { path: string; body: any }[] = []
  const fetch = vi.fn(async (path: string, o: RequestInit = {}) => {
    const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
    if (o.method === 'POST') {
      const body = JSON.parse(String(o.body)); writes.push({ path, body })
      if (path === '/api/market-key') { if (reject) return reply({ error: { code: reject } }, reject === 'MARKET_KEY_REJECTED' ? 422 : 424); state = { ...state, status: 'ACTIVE', hint: body.token.slice(-4), version: (state.version ?? 0) + 1 }; return reply({ status: 'ACTIVE', hint: state.hint, version: state.version }) }
      state = { ...state, status: 'REMOVED', hint: null, version: state.version! + 1 }; return reply({ status: 'REMOVED', version: state.version })
    }
    return reply({ provider: 'TIINGO', updatedAt: state.status === 'NONE' ? null : '2026-10-10T01:00:00.000Z', ...state })
  })
  vi.stubGlobal('fetch', fetch)
  render(<MarketKey disabled={false} lock={vi.fn()} expired={vi.fn()} />)
  return { writes }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('validates locally, requires the personal-use confirmation, sends the key once and then shows only the last 4', async () => {
  const { writes } = setup({ available: true, status: 'NONE', hint: null, version: null })
  const input = await screen.findByLabelText('API Token ของ Tiingo')
  expect(input.getAttribute('type')).toBe('password')
  fireEvent.change(input, { target: { value: 'too short' } }); fireEvent.submit(screen.getByRole('form', { name: 'บันทึก key ราคาปิด' }))
  expect(screen.getByRole('alert').textContent).toMatch(/อย่างน้อย 20 ตัว/)
  fireEvent.change(input, { target: { value: ` ${TOKEN} ` } }); fireEvent.submit(screen.getByRole('form', { name: 'บันทึก key ราคาปิด' }))
  expect(screen.getByRole('alert').textContent).toMatch(/ติ๊กยืนยัน/); expect(writes).toHaveLength(0)
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.submit(screen.getByRole('form', { name: 'บันทึก key ราคาปิด' }))
  await screen.findByText(/เชื่อมต่อแล้ว · key ลงท้าย ••••abcd/)
  expect(writes).toEqual([{ path: '/api/market-key', body: { provider: 'TIINGO', token: TOKEN, confirmPersonalUse: true, expectedVersion: null } }])
  expect(screen.getByRole('status').textContent).toMatch(/เปิดหน้าสินทรัพย์รวมเพื่อดึงราคาปิด/)
  expect(document.body.textContent).not.toContain(TOKEN)
  expect(screen.queryByLabelText('API Token ของ Tiingo')).toBeNull()
})
it('a rejected key is not saved and the message says so', async () => {
  setup({ available: true, status: 'NONE', hint: null, version: null }, 'MARKET_KEY_REJECTED')
  fireEvent.change(await screen.findByLabelText('API Token ของ Tiingo'), { target: { value: TOKEN } }); fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.submit(screen.getByRole('form', { name: 'บันทึก key ราคาปิด' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Tiingo ปฏิเสธ key นี้.*ระบบไม่ได้บันทึก key/)
  expect(screen.queryByTestId('market-key-active')).toBeNull()
})
it('removal needs a confirmation, sends the current version and returns to the empty state', async () => {
  const { writes } = setup({ available: true, status: 'ACTIVE', hint: 'wxyz', version: 3 })
  fireEvent.click(await screen.findByRole('button', { name: 'ลบ key' }))
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันลบ key' }))
  await screen.findByText(/ยังไม่มี key ที่ใช้งาน/)
  expect(writes).toEqual([{ path: '/api/market-key/remove', body: { expectedVersion: 3 } }])
  expect(screen.getByRole('status').textContent).toMatch(/รายการซื้อขาย ต้นทุน และราคาที่กรอกเองยังอยู่ครบ/)
})
it('servers without key support say so instead of showing a form', async () => {
  setup({ available: false, status: 'NONE', hint: null, version: null })
  await screen.findByText(/server นี้ยังไม่เปิดให้ใส่ key/); expect(screen.queryByLabelText('API Token ของ Tiingo')).toBeNull()
})
