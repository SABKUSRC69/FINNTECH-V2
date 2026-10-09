import type { FinanceOverview } from '@finntech/contracts'
import { expenseBreakdown } from '@finntech/finance'
import { displayDecimal } from './client'
import { usePresentation } from '../presentation'

export default function ExpenseBreakdown({ finance }: { finance: FinanceOverview }): JSX.Element {
  const { money, hidden } = usePresentation()
  let breakdown: ReturnType<typeof expenseBreakdown>
  try { breakdown = expenseBreakdown(finance.transactions) }
  catch { return <section className="tracker-card p-5" role="alert">สัดส่วนรายจ่าย N/A · ยอดเกินขอบเขตหรือข้อมูลไม่ถูกต้อง</section> }
  return <section className="tracker-card rounded-2xl p-5 sm:p-6" aria-label="สัดส่วนรายจ่าย">
    <h2 className="text-lg font-semibold">รายจ่ายไปกับอะไรบ้าง</h2>
    <p className="mt-2 text-sm text-slate-500">เดือน {finance.month} · คิดจากรายจ่ายทั้งหมด {money(displayDecimal(breakdown.total))} THB · ไม่รวมรายการยกเลิก</p>
    {breakdown.categories.length === 0 ? <p className="mt-5 text-sm text-slate-500">ยังไม่มีรายจ่ายในเดือนนี้ จึงยังไม่มีสัดส่วน</p> :
      <ul className="mt-5 space-y-4">{breakdown.categories.map(row => <li key={row.categoryId}>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{finance.categories.find(category => category.id === row.categoryId)?.name ?? 'ไม่ระบุหมวดหมู่'}</span><span className="font-semibold tabular-nums">{money(displayDecimal(row.amount))} THB · {money(row.percent)}%</span></div>
        {!hidden && <svg className="expense-bar mt-2" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect className="expense-track" width="100" height="4" rx="2" /><rect className="expense-fill" width={row.percent} height="4" rx="2" /></svg>}
      </li>)}</ul>}
    <p className="mt-4 text-xs text-slate-500">สัดส่วน = รายจ่ายหมวดนั้น ÷ รายจ่ายทั้งหมด × 100 · ปัดเพื่อแสดงผล 2 ตำแหน่ง ผลรวมเปอร์เซ็นต์อาจคลาดเคลื่อนเล็กน้อย</p>
  </section>
}
