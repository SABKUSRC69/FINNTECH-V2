import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function setup(accounts: unknown[]) {
  vi.stubGlobal('WebSocket', undefined)
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    let body: unknown = { quotes: [] }
    if (path.startsWith('/api/finance?')) body = { month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [], transactions: [], budgets: [] }
    else if (path === '/api/crypto') body = { quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] }
    else if (path === '/api/cash') body = { accounts }
    return { ok: true, status: 200, json: async () => body }
  }))
  render(<Dashboard name="สังเคราะห์" logout={vi.fn()} expired={vi.fn()} authBusy={false} />)
}

it('points a user without a cash account to Assets from the finance form', async () => {
  setup([])
  const form = screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })
  fireEvent.click(await within(form).findByRole('button', { name: 'ไปที่สินทรัพย์รวม' }))
  const nav = screen.getByRole('navigation', { name: 'ส่วนการเงิน' })
  expect(within(nav).getByRole('button', { name: 'สินทรัพย์รวม' }).getAttribute('aria-current')).toBe('page')
})

it('shows no setup hint once a cash account exists', async () => {
  setup([{ id: '00000000-0000-4000-8000-0000000000c1', name: 'กระเป๋าเงิน', balance: '100.00', currency: 'THB', asOf: '2026-10-01', version: 1 }])
  const form = screen.getByRole('form', { name: 'บันทึกรายรับรายจ่าย' })
  await within(form).findByRole('option', { name: /กระเป๋าเงิน/ })
  expect(within(form).queryByRole('button', { name: 'ไปที่สินทรัพย์รวม' })).toBeNull()
})
