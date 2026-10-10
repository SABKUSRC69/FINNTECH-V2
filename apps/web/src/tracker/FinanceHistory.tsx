import Attachment from '../media/Attachment'
import type { FinanceOverview } from '@finntech/contracts'
import { displayDecimal } from './client'
import { unlinkedLabel } from './CashSettlementFields'
import { NotebookCat } from '../presentation'

type Entry = FinanceOverview['transactions'][number]
export default function FinanceHistory({ finance, categoryLabel, cashLabel, money, disabled, edit, cancel, mediaEnabled=false, mediaLock, expired }: {
  finance: FinanceOverview | null; categoryLabel: (id: string) => string; money: (value: string) => string
  cashLabel?: (id:string)=>string; mediaEnabled?:boolean;mediaLock?:((v:boolean)=>void);expired?:(()=>void);
  disabled: boolean; edit: (entry: Entry) => void; cancel: (entry: Entry) => void
}): JSX.Element {
  return <section className="tracker-card journal-history">
    <h2 className="text-lg font-semibold">รายการในเดือนนี้</h2>
    <p className="mt-2 text-xs text-slate-500">รายการยกเลิกเก็บไว้เป็นประวัติและไม่รวมในยอด การแก้ไขสร้างรายการทดแทน</p>
    {finance?.transactions.length === 0 && <div className="notebook-empty"><NotebookCat compact /><p className="text-sm text-slate-500">ยังไม่มีรายการ เริ่มจากบันทึกแรกของคุณ</p></div>}
    {!!finance?.transactions.length && <div className="journal-table-scroll mt-4" tabIndex={0} role="region" aria-label="ตารางรายการรายรับรายจ่าย เลื่อนแนวนอนได้">
      <table className="journal-table"><caption className="sr-only">ประวัติรายรับรายจ่าย หน่วย THB</caption>
        <thead><tr><th scope="col">วันที่</th><th scope="col">หมวดหมู่ / บันทึก</th><th scope="col" className="journal-number">จำนวนเงิน · THB</th><th scope="col">จัดการรายการ</th></tr></thead>
        <tbody>{finance.transactions.map(row => <tr key={row.id}>
          <td className="whitespace-nowrap">{row.date}</td>
          <td className="journal-record"><p className="font-medium">{categoryLabel(row.categoryId)}</p>{row.note && <small>{row.note}</small>}<p className="mt-1 text-xs">{row.cashAccountId?cashLabel?.(row.cashAccountId)??'บัญชีเงินสด':unlinkedLabel(row.inOpeningBalance)}</p>
            {row.voidedAt && <p className="mt-2 text-xs text-rose-700">ยกเลิกแล้ว · ไม่รวมยอด · {row.voidReason}</p>}</td>
          <td className={`journal-number font-semibold ${row.voidedAt ? 'text-slate-400 line-through' : row.type === 'income' ? 'text-teal-700' : 'text-slate-700'}`}>{row.type === 'income' ? '+' : '−'}{money(displayDecimal(row.amount))} THB</td>
          <td>{mediaEnabled&&mediaLock&&expired&&<Attachment kind="finance" id={row.id} disabled={disabled} lock={mediaLock} expired={expired}/>} {!row.voidedAt && <div className="journal-row-actions"><button type="button" className="text-teal-700" disabled={disabled} onClick={() => edit(row)}>แก้ไขรายการ</button><button type="button" className="text-rose-700" disabled={disabled} onClick={() => cancel(row)}>ยกเลิกรายการ</button></div>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>
}
