import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import Assets from './Assets'
import { selectReference } from './valuationPolicy'
import { submitAuth } from '../auth/client'

const newId = '00000000-0000-4000-8000-0000000000aa'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function finance(categories: { id: string; name: string; type: 'income' | 'expense' }[]) {
  return { month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories, transactions: [], budgets: [] }
}
function setupDashboard(options: { failFinance?: boolean } = {}) {
  vi.stubGlobal('WebSocket', undefined)
  let categories: { id: string; name: string; type: 'income' | 'expense' }[] = []
  let failFinance = options.failFinance ?? false
  const writes: { path: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body))
      writes.push({ path, body })
      if (path === '/api/finance/categories') { categories = [...categories, { id: newId, name: body.name, type: body.type }]; return { ok: true, status: 200, json: async () => ({ id: newId }) } }
      if (path === '/api/finance/categories/starter') { categories = [{ id: newId, name: 'อาหารและเครื่องดื่ม', type: 'expense' }]; return { ok: true, status: 200, json: async () => ({ id: 'owner', created: 13 }) } }
      return { ok: true, status: 200, json: async () => ({ id: newId }) }
    }
    if (path.startsWith('/api/finance?')) {
      if (failFinance) return { ok: false, status: 503, json: async () => ({ error: { code: 'STORAGE_UNAVAILABLE' } }) }
      return { ok: true, status: 200, json: async () => finance(categories) }
    }
    if (path === '/api/crypto') return { ok: true, status: 200, json: async () => ({ quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] }) }
    return { ok: true, status: 200, json: async () => ({ quotes: [] }) }
  }))
  render(<Dashboard name="สังเคราะห์" logout={vi.fn()} expired={vi.fn()} authBusy={false} />)
  return { writes, recover: () => { failFinance = false } }
}

describe('F3 category setup keeps the transaction draft', () => {
  it('explains the empty list, creates inline without clearing the draft, and selects the new category', async () => {
    const { writes } = setupDashboard()
    expect(await screen.findByText('ยังไม่มีหมวดรายจ่าย เพิ่มหมวดหมู่เพื่อเริ่มบันทึก')).toBeTruthy()
    const form = screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })
    fireEvent.change(within(form).getByLabelText('จำนวนเงิน THB'), { target: { value: '250.75' } })
    fireEvent.change(within(form).getByLabelText('บันทึกช่วยจำ'), { target: { value: 'มื้อกลางวัน' } })
    fireEvent.change(within(form).getByLabelText('ชื่อหมวดใหม่'), { target: { value: 'อาหาร' } })
    fireEvent.click(within(form).getByRole('button', { name: 'เพิ่มหมวดนี้' }))
    await screen.findByText('บันทึกสำเร็จ')
    await waitFor(() => expect((within(form).getByLabelText(/^หมวดหมู่/) as HTMLSelectElement).value).toBe(newId))
    expect((within(form).getByLabelText('จำนวนเงิน THB') as HTMLInputElement).value).toBe('250.75')
    expect((within(form).getByLabelText('บันทึกช่วยจำ') as HTMLInputElement).value).toBe('มื้อกลางวัน')
    expect(writes).toEqual([{ path: '/api/finance/categories', body: { name: 'อาหาร', type: 'expense' } }])
  })
  it('does not submit the transaction when Enter is pressed in the inline category name', async () => {
    const { writes } = setupDashboard()
    const form = screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })
    const name = await within(form).findByLabelText('ชื่อหมวดใหม่')
    fireEvent.change(name, { target: { value: 'เดินทาง' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    await screen.findByText('บันทึกสำเร็จ')
    expect(writes.map(w => w.path)).toEqual(['/api/finance/categories'])
  })
  it('adds starter labels through one owner write and creates no transaction', async () => {
    const { writes } = setupDashboard()
    fireEvent.click(await screen.findByRole('button', { name: 'เพิ่มหมวดหมู่พื้นฐาน' }))
    await screen.findByText('บันทึกสำเร็จ')
    expect(writes).toEqual([{ path: '/api/finance/categories/starter', body: {} }])
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'อาหารและเครื่องดื่ม' }).length).toBeGreaterThan(0))
  })
  it('shows a retryable load error instead of an empty category state', async () => {
    const { recover } = setupDashboard({ failFinance: true })
    const retry = await screen.findByRole('button', { name: 'ลองโหลดหมวดหมู่อีกครั้ง' })
    expect(screen.queryByText(/ยังไม่มีหมวดรายจ่าย/)).toBeNull()
    recover(); fireEvent.click(retry)
    expect(await screen.findByText('ยังไม่มีหมวดรายจ่าย เพิ่มหมวดหมู่เพื่อเริ่มบันทึก')).toBeTruthy()
  })
})

describe('F7 unconfigured stock feed', () => {
  it('is reported as missing with manual guidance, not as a provider error', () => {
    const market = { source: 'Alpaca IEX', currency: 'USD', connection: 'NOT_CONFIGURED', quotes: [{ symbol: 'AAPL', price: null, observedAt: null, receivedAt: null, status: 'UNAVAILABLE' }] } as never
    const selected = selectReference('AAPL', null, market, Date.now())
    expect(selected.state).toBe('MISSING')
    expect(selected.value).toBeNull()
    expect(selected.source).toContain('ตั้งราคาอ้างอิงเอง')
  })
})

describe('F8 asset total while loading', () => {
  it('says it is loading instead of claiming data is incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<Assets crypto={null} market={{ quotes: [] }} now={Date.now()} expired={vi.fn()} lock={vi.fn()} />)
    expect(screen.getByTestId('assets-total').textContent).toBe('กำลังโหลด…')
    expect(screen.queryByText(/ข้อมูลยังไม่ครบ/)).toBeNull()
  })
})

describe('F10 sign-in after a deletion request', () => {
  it('explains the pending deletion only when the server reports it after credential checks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 'ACCOUNT_DELETION_PENDING' } }) })))
    await expect(submitAuth('sign-in', { email: 'a@example.test', password: 'x'.repeat(12) })).rejects.toThrow('คำขอลบบัญชี')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ code: 'INVALID_EMAIL_OR_PASSWORD' }) })))
    await expect(submitAuth('sign-in', { email: 'a@example.test', password: 'x'.repeat(12) })).rejects.toThrow('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
  })
})
