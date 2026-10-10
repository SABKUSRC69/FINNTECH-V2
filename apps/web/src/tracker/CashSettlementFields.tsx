import type {CashOverview} from '@finntech/contracts'
import {displayDecimal} from './client'
import {usePresentation} from '../presentation'
type Accounts=CashOverview['accounts']
/** The account whose opening balance (asOf) is later than this record's date, or null. */
export const openingAccount=(accounts:Accounts,id:string,date:string)=>{const row=accounts.find(a=>a.id===id);return row&&date&&date<row.asOf?row:null}
/** History text for a record that does not move cash. */
export const unlinkedLabel=(inOpeningBalance:boolean|undefined)=>inOpeningBalance?'รวมในยอดตั้งต้นแล้ว · ไม่ปรับเงินสด':'รายการเดิม · ไม่เชื่อมเงินสด'
export function CashAccountField({accounts,value,onChange,disabled,label}:{accounts:Accounts;value:string;onChange:(v:string)=>void;disabled:boolean;label:string}) {
 const {money}=usePresentation()
 return <label className="auth-label sm:col-span-2">{label}<select className="auth-input" required disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">เลือกบัญชีเงินสด</option>{accounts.map(row=><option key={row.id} value={row.id}>{row.name} · {money(displayDecimal(row.balance))} THB</option>)}</select>{!accounts.length&&<span className="text-xs" role="status">เพิ่มยอดตั้งต้นที่หน้า “สินทรัพย์รวม” ก่อนบันทึก</span>}</label>
}
/** Shown only for a record dated before the account's opening date; checked by default. */
export function OpeningBalanceChoice({asOf,checked,onChange,disabled}:{asOf:string;checked:boolean;onChange:(v:boolean)=>void;disabled:boolean}) {
 return <label className="sm:col-span-2 flex items-start gap-2 text-sm" data-testid="opening-balance-choice"><input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span>รายการนี้เกิดก่อนวันตั้งยอดเงินสด ({asOf}) และรวมอยู่ในยอดนั้นแล้ว · บันทึกเป็นประวัติโดยไม่ปรับเงินสดอีก<br/><small>เอาติ๊กออกถ้ายอดตั้งต้นยังไม่รวมรายการนี้ ระบบจะปรับเงินสดตามปกติ</small></span></label>
}
export default function CashSettlementFields({accounts,accountId,setAccountId,amount,setAmount,side,disabled,legacy=false,legacyLabel,date,included,setIncluded}:{accounts:Accounts;accountId:string;setAccountId:(v:string)=>void;amount:string;setAmount:(v:string)=>void;side:'buy'|'sell';disabled:boolean;legacy?:boolean;legacyLabel?:string|undefined;date:string;included:boolean;setIncluded:(v:boolean)=>void}) {
 if(legacy)return <p className="sm:col-span-2 text-xs" role="status">{legacyLabel??'รายการเดิมก่อนเชื่อมเงินสด'} · แก้ประวัติเท่านั้น</p>
 const opening=openingAccount(accounts,accountId,date)
 return <><CashAccountField accounts={accounts} value={accountId} onChange={setAccountId} disabled={disabled} label={side==='buy'?'จ่ายจากบัญชีเงินสด':'รับเข้าบัญชีเงินสด'}/>
  {opening&&<OpeningBalanceChoice asOf={opening.asOf} checked={included} onChange={setIncluded} disabled={disabled}/>}
  {!(opening&&included)&&<label className="auth-label sm:col-span-2">{side==='buy'?'เงินบาทที่จ่ายจริง รวมค่าธรรมเนียม':'เงินบาทที่ได้รับจริง หลังหักค่าธรรมเนียม'}<input className="auth-input" inputMode="decimal" required disabled={disabled} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/><span className="text-xs">ใช้ยอดเงินบาทจริงของรายการนี้</span></label>}</>
}
/** Request fields for a new trade: an opening-balance record names the account but moves no money. */
export function tradeCash(accounts:Accounts,accountId:string,amount:string,date:string,included:boolean) {
 return openingAccount(accounts,accountId,date)?(included?{cashSettlement:{accountId},inOpeningBalance:true}:{cashSettlement:{accountId,amountThb:amount},inOpeningBalance:false}):{cashSettlement:{accountId,amountThb:amount}}
}
