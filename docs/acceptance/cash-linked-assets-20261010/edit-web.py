exec(open(__file__.replace('edit-web.py','edit-backend.py'),encoding='utf-8').read().split("p='packages/contracts")[0])
p='packages/contracts/src/index.ts';s=read(p);s=s.replace('cashAccountId?:string|null','cashAccountId?:string|null|undefined').replace('cashSettlementSchema>|null','cashSettlementSchema>|null|undefined');write(p,s)
p='apps/api/src/tracker/backup.ts';s=read(p);s=s.replace('cashAccountId?:string|null','cashAccountId?:string|null|undefined').replace('amountThb:string}|null}', 'amountThb:string}|null|undefined}');write(p,s)
p='apps/api/src/tracker/service.ts';s=read(p);s=sub(s,"  return ownedMutation(db, owner, 'finance.transactions.create', key, value, async tx => {", "  return ownedMutation(db, owner, 'finance.transactions.create', key, value, async tx => {\n    await mediaLock(tx)");write(p,s)
write('apps/web/src/tracker/CashSettlementFields.tsx','''import type {CashOverview} from '@finntech/contracts'
import {displayDecimal} from './client'
import {usePresentation} from '../presentation'
export function CashAccountField({accounts,value,onChange,disabled,label}:{accounts:CashOverview['accounts'];value:string;onChange:(v:string)=>void;disabled:boolean;label:string}) {
 const {money}=usePresentation()
 return <label className="auth-label sm:col-span-2">{label}<select className="auth-input" required disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">เลือกบัญชีเงินสด</option>{accounts.map(row=><option key={row.id} value={row.id}>{row.name} · {money(displayDecimal(row.balance))} THB</option>)}</select>{!accounts.length&&<span className="text-xs" role="status">เพิ่มยอดตั้งต้นที่หน้า “สินทรัพย์รวม” ก่อนบันทึก</span>}</label>
}
export default function CashSettlementFields({accounts,accountId,setAccountId,amount,setAmount,side,disabled,legacy=false}:{accounts:CashOverview['accounts'];accountId:string;setAccountId:(v:string)=>void;amount:string;setAmount:(v:string)=>void;side:'buy'|'sell';disabled:boolean;legacy?:boolean}) {
 if(legacy)return <p className="sm:col-span-2 text-xs" role="status">รายการเดิมก่อนเชื่อมเงินสด · แก้ประวัติเท่านั้น</p>
 return <><CashAccountField accounts={accounts} value={accountId} onChange={setAccountId} disabled={disabled} label={side==='buy'?'จ่ายจากบัญชีเงินสด':'รับเข้าบัญชีเงินสด'}/><label className="auth-label sm:col-span-2">{side==='buy'?'เงินบาทที่จ่ายจริง รวมค่าธรรมเนียม':'เงินบาทที่ได้รับจริง หลังหักค่าธรรมเนียม'}<input className="auth-input" inputMode="decimal" required disabled={disabled} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/><span className="text-xs">ใช้ยอดเงินบาทจริงของรายการนี้</span></label></>
}
''')
p='apps/web/src/tracker/Dashboard.tsx';s=read(p);s="import CashSettlementFields, {CashAccountField} from './CashSettlementFields'\n"+s
s=sub(s,'  budgetInputSchema,','  cashOverviewSchema, type CashOverview, budgetInputSchema,')
s=sub(s,"  const [market, setMarket]", "  const [cash, setCash] = useState<CashOverview>({accounts:[]})\n  const [financeCashId,setFinanceCashId]=useState(''),[tradeCashId,setTradeCashId]=useState(''),[cashAmount,setCashAmount]=useState('')\n  const [legacyFinance,setLegacyFinance]=useState(false),[legacyTrade,setLegacyTrade]=useState(false)\n  const [market, setMarket]")
s=sub(s,'    setSection(next)\n',"    setSection(next)\n    if(next==='finance'||next==='crypto')void load()\n")
s=sub(s,"    setEditingFinance(null);", "    setLegacyFinance(false); setLegacyTrade(false); setCashAmount('')\n    setEditingFinance(null);")
s=sub(s,'    setAmount(row.amount);', "    setLegacyFinance(!row.cashAccountId); setFinanceCashId(row.cashAccountId??'')\n    setAmount(row.amount);")
s=sub(s,'    setSide(row.side);',"    setLegacyTrade(!row.cashSettlement); setTradeCashId(row.cashSettlement?.accountId??''); setCashAmount(row.cashSettlement?.amountThb??'')\n    setSide(row.side);")
s=sub(s,"const [f, c] = await Promise.all([trackerRequest(`finance?month=${selected}`), trackerRequest('crypto')])", "const [f, c, a] = await Promise.all([trackerRequest(`finance?month=${selected}`), trackerRequest('crypto'),trackerRequest('cash')])\n      const accounts=cashOverviewSchema.parse(a);setCash(accounts)")
s=sub(s,'const entry = { ...(financeImage?', 'const entry = { ...(!legacyFinance?{cashAccountId:financeCashId}:{}), ...(financeImage?')
s=sub(s,'const entry = { ...(cryptoImage?', 'const entry = { ...(!legacyTrade?{cashSettlement:{accountId:tradeCashId,amountThb:cashAmount}}:{}), ...(cryptoImage?')
s=sub(s,'          <label className="auth-label">จำนวนเงิน THB', '''          {legacyFinance?<p className="sm:col-span-2 text-xs" role="status">รายการเดิมก่อนเชื่อมเงินสด · แก้ประวัติเท่านั้น</p>:<CashAccountField accounts={cash.accounts} value={financeCashId} onChange={setFinanceCashId} disabled={disabled} label={type==='income'?'รับเข้าบัญชีเงินสด':'จ่ายจากบัญชีเงินสด'}/>}
          <label className="auth-label">จำนวนเงิน THB''')
s=sub(s,'        {!demo&&<ReceiptAssist key={\'crypto-', '        <CashSettlementFields accounts={cash.accounts} accountId={tradeCashId} setAccountId={setTradeCashId} amount={cashAmount} setAmount={setCashAmount} side={side} disabled={disabled||!portfolioId} legacy={legacyTrade}/>\n        {!demo&&<ReceiptAssist key={\'crypto-')
s=sub(s,'categoryLabel={categoryLabel} money=', 'categoryLabel={categoryLabel} cashLabel={id=>cash.accounts.find(row=>row.id===id)?.name??\'บัญชีเงินสด\'} money=')
s=sub(s,'เริ่มถือครองเดิมด้วยประวัติซื้อและต้นทุนที่ทราบ ไม่หักเงินสดอัตโนมัติ', 'รายการซื้อขายใหม่ปรับเงินสดตามเงินบาทจริงที่กรอก')
s=sub(s,'{t.voidedAt && <p', '''<p className="mt-1 text-xs">{t.cashSettlement?`${cash.accounts.find(a=>a.id===t.cashSettlement!.accountId)?.name??'เงินสด'} · ${money(displayDecimal(t.cashSettlement.amountThb))} THB`:'รายการเดิม · ไม่เชื่อมเงินสด'}</p>{t.voidedAt && <p''')
write(p,s)
p='apps/web/src/tracker/FinanceHistory.tsx';s=read(p);s=sub(s,'finance, categoryLabel, money,','finance, categoryLabel, cashLabel, money,');s=sub(s,'mediaEnabled?:boolean;', 'cashLabel?: (id:string)=>string; mediaEnabled?:boolean;');s=sub(s,"{row.note && <small>{row.note}</small>}","{row.note && <small>{row.note}</small>}<p className=\"mt-1 text-xs\">{row.cashAccountId?cashLabel?.(row.cashAccountId)??'บัญชีเงินสด':'รายการเดิม · ไม่เชื่อมเงินสด'}</p>");write(p,s)
p='apps/web/src/tracker/StockHoldings.tsx';s=read(p);s="import CashSettlementFields from './CashSettlementFields'\n"+s
s=sub(s,' STOCK_INSTRUMENTS,',' cashOverviewSchema,type CashOverview,STOCK_INSTRUMENTS,')
s=sub(s,' const [attachmentId,setAttachmentId]'," const [cash,setCash]=useState<CashOverview>({accounts:[]}),[cashId,setCashId]=useState(''),[cashAmount,setCashAmount]=useState(''),[legacy,setLegacy]=useState(false)\n const [attachmentId,setAttachmentId]")
s=sub(s,"const [raw]=await Promise.all([trackerRequest('stocks'),loadReferences()]);", "const [raw,accounts]=await Promise.all([trackerRequest('stocks'),trackerRequest('cash'),loadReferences()]);setCash(cashOverviewSchema.parse(accounts));")
s=sub(s,"function cancel(){setEditing(null);", "function cancel(){setLegacy(false);setCashAmount('');setEditing(null);")
s=sub(s,'const entry={...(attachmentId?', 'const entry={...(!legacy?{cashSettlement:{accountId:cashId,amountThb:cashAmount}}:{}),...(attachmentId?')
s=sub(s,'ติดตามสิ่งที่ถืออยู่ภายนอก ไม่มีการส่งคำสั่งหรือหักเงินสด ไม่รองรับ split/dividend หรือ corporate actions อัตโนมัติ','บันทึกการซื้อขายที่เกิดขึ้นแล้ว · ปรับเงินสดในบัญชีที่เลือก · split/dividend บันทึกเอง')
s=sub(s,'    {mediaEnabled&&<ReceiptAssist key={receiptReset}', '    <CashSettlementFields accounts={cash.accounts} accountId={cashId} setAccountId={setCashId} amount={cashAmount} setAmount={setCashAmount} side={side} disabled={disabled} legacy={legacy}/>\n    {mediaEnabled&&<ReceiptAssist key={receiptReset}')
s=sub(s,"setEditing(row.id);setSymbol", "setEditing(row.id);setLegacy(!row.cashSettlement);setCashId(row.cashSettlement?.accountId??'');setCashAmount(row.cashSettlement?.amountThb??'');setSymbol")
s=sub(s,'<p>{row.note}</p>{mediaEnabled', '<p>{row.note}</p><p className="text-xs">{row.cashSettlement?`${cash.accounts.find(a=>a.id===row.cashSettlement!.accountId)?.name??\'เงินสด\'} · ${display(row.cashSettlement.amountThb)} THB`:\'รายการเดิม · ไม่เชื่อมเงินสด\'}</p>{mediaEnabled')
write(p,s)
p='apps/web/src/tracker/client.ts';s=read(p);s=sub(s,'const messages: Record<string, string> = {','''const messages: Record<string, string> = {
  CASH_ACCOUNT_REQUIRED: 'เลือกบัญชีเงินสดและกรอกเงินบาทจริงก่อนบันทึก หากใช้หน้าเก่าให้โหลดเว็บใหม่',
  CASH_ACCOUNT_NOT_FOUND: 'ไม่พบบัญชีเงินสดที่เลือก กรุณาโหลดข้อมูลล่าสุด',
  CASH_INSUFFICIENT: 'ยอดเงินสดไม่พอ รายการนี้ยังไม่ถูกบันทึก ตรวจยอดจริงในหน้าสินทรัพย์รวม',
  LEGACY_CASH_LINK: 'รายการเดิมแก้ประวัติได้ แต่ไม่ปรับยอดเงินสดย้อนหลัง', ''');write(p,s)
print('Cash selection and actual THB settlement forms updated.')
