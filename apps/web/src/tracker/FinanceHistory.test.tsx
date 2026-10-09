import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { FinanceOverview } from '@finntech/contracts'
import FinanceHistory from './FinanceHistory'

afterEach(cleanup)
const entry = { id: 'synthetic-entry', categoryId: 'synthetic-category', type: 'expense' as const, amount: '999999999999999999.99', date: '2026-10-07', note: 'บันทึกภาษาไทยที่เก็บไว้ในประวัติ', voidedAt: null, voidReason: null }
const finance: FinanceOverview = { month: '2026-10', currency: 'THB', income: '0', expense: entry.amount, balance: '-999999999999999999.99', categories: [], transactions: [entry], budgets: [] }

it('keeps full Decimal text and uses the original entry for edit/void from the table', () => {
  const edit = vi.fn(), cancel = vi.fn()
  render(<FinanceHistory finance={finance} categoryLabel={() => 'หมวดหมู่ของฉัน'} money={value => value} disabled={false} edit={edit} cancel={cancel} />)
  const table = within(screen.getByRole('table', { name: 'ประวัติรายรับรายจ่าย หน่วย THB' }))
  expect(table.getByText('−999,999,999,999,999,999.99 THB')).toBeTruthy()
  expect(table.getByText(entry.note)).toBeTruthy()
  fireEvent.click(table.getByRole('button', { name: 'แก้ไขรายการ' }))
  fireEvent.click(table.getByRole('button', { name: 'ยกเลิกรายการ' }))
  expect(edit).toHaveBeenCalledExactlyOnceWith(entry)
  expect(cancel).toHaveBeenCalledExactlyOnceWith(entry)
  expect(entry.amount).toBe('999999999999999999.99')
})

it('blocks table actions during pending and preserves voided records without allowing another edit', () => {
  const edit = vi.fn(), cancel = vi.fn()
  const view = render(<FinanceHistory finance={finance} categoryLabel={() => 'อาหาร'} money={() => '••••'} disabled edit={edit} cancel={cancel} />)
  expect(screen.getByText('−•••• THB')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไขรายการ' }))
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกรายการ' }))
  expect(edit).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled()
  view.rerender(<FinanceHistory finance={{ ...finance, transactions: [{ ...entry, voidedAt: '2026-10-07T00:00:00Z', voidReason: 'แก้รายการผิด' }] }} categoryLabel={() => 'อาหาร'} money={value => value} disabled={false} edit={edit} cancel={cancel} />)
  expect(screen.getByText('ยกเลิกแล้ว · ไม่รวมยอด · แก้รายการผิด')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getAllByRole('row')).toHaveLength(2)
})
