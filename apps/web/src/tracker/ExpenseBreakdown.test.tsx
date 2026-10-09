import { render, screen, cleanup } from '@testing-library/react'
import { it, expect, afterEach } from 'vitest'
import type { FinanceOverview } from '@finntech/contracts'
import ExpenseBreakdown from './ExpenseBreakdown'
afterEach(cleanup)
it('renders category percentages and an honest empty state', () => {
  const data: FinanceOverview = { month: '2026-10', currency: 'THB', income: '0', expense: '10000', balance: '-10000', budgets: [], categories: [{ id: 'a', name: 'อาหาร', type: 'expense' }, { id: 'b', name: 'บ้าน', type: 'expense' }], transactions: ['4000', '6000'].map((amount, i) => ({ id: String(i), categoryId: i === 0 ? 'a' : 'b', amount, type: 'expense', date: '2026-10-05', note: '', voidedAt: null, voidReason: null })) }
  const { rerender } = render(<ExpenseBreakdown finance={data} />)
  expect(screen.getByText('4,000.00 THB · 40%')).toBeTruthy()
  expect(screen.getByText('6,000.00 THB · 60%')).toBeTruthy()
  rerender(<ExpenseBreakdown finance={{ ...data, transactions: [] }} />)
  expect(screen.getByText(/ยังไม่มีรายจ่ายในเดือนนี้/)).toBeTruthy()
})
