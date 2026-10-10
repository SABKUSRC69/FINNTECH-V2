exec(open(__file__.replace('edit-assets.py','edit-backend.py'),encoding='utf-8').read().split("p='packages/contracts")[0])
write('apps/web/src/tracker/HeldAssets.tsx','''import {usePresentation} from '../presentation'
import {displayDecimal} from './client'
export type HeldAssetRow={id:string;kind:'cash'|'stock'|'crypto'|'manual';name:string;account:string;quantity:string;native:string|null;currency:string;thb:string|null;status?:string|undefined}
export default function HeldAssets({rows,loading}:{rows:HeldAssetRow[];loading:boolean}) {
 const {money}=usePresentation(),display=(v:string|null)=>v===null?'N/A':money(displayDecimal(v))
 return <section className="tracker-card journal-held-assets rounded-2xl p-5" aria-label="สินทรัพย์ที่คุณถือ" data-testid="held-assets"><h3 className="text-lg font-semibold">สินทรัพย์ที่คุณถือ</h3><p className="mt-1 text-xs">เงินสด · หุ้น/ETF · คริปโต · สินทรัพย์อื่น</p>
 {!rows.length&&<p className="mt-4 text-sm" role="status">{loading?'กำลังโหลดรายการ…':'ยังไม่มีสินทรัพย์ที่บันทึก'}</p>}
 {!!rows.length&&<div className="journal-held-scroll" tabIndex={0} role="region" aria-label="รายการสินทรัพย์และมูลค่าเทียบบาท"><table className="journal-held-table"><caption className="sr-only">สินทรัพย์ที่ถือ แยกบัญชีและพอร์ต</caption><thead><tr><th scope="col">สินทรัพย์ / บัญชี</th><th scope="col">จำนวน / ยอดเงิน</th><th scope="col">มูลค่าเทียบบาท</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} data-holding-kind={row.kind}><td><p className="font-semibold">{row.name}</p><p className="text-xs">{row.account}</p>{row.status&&<p className="mt-1 text-xs">{row.status}</p>}</td><td className="journal-held-quantity">{money(row.quantity)}</td><td className="journal-held-value"><p className="font-semibold">{display(row.thb)} THB</p>{row.currency!=='THB'&&<p className="text-xs">{display(row.native)} {row.currency}</p>}</td></tr>)}</tbody></table></div>}
 </section>
}
''')
p='apps/web/src/tracker/Assets.tsx';s=read(p)
s="import HeldAssets, {type HeldAssetRow} from './HeldAssets'\n"+s
s=s.replace(',valuationReferenceInputSchema','').replace(',valuePosition',',serializeCrypto')
s=s.replace("import { useOwnedWrite } from './useOwnedWrite'\n",'')
start=s.index('const stockPosition=');end=s.index('export default',start);s=s[:start]+s[end:]
start=s.index('  const [autoLocked');end=s.index('  const {overview:references',start);s=s[:start]+s[end:]
s=s.replace('||autoLocked','').replace(',autoLocked','')
# Keep price controls below all holdings and account editors. Valuation policy stays unchanged.
start=s.index('  let stockSummary:');end=s.index('  const daily=',start)
s=s[:start]+'''  let stockSummary:ReturnType<typeof summarizeStockHoldings>|null=null
  try{if(stocks)stockSummary=summarizeStockHoldings(stocks.holdings,eligibleStocks)}catch{}
'''+s[end:]
start=s.index('  return <section className="journal-assets"')
s=s[:start]+'''  const convert=(value:string|null,currency:string):string|null=>{
    try{if(value===null)return null;if(parseCryptoDecimal(value).isZero())return '0.00';const fx=currency==='THB'?'1':currency==='USD'?usdFx.value:freshRate?rate!.rate:null;return fx?serializeThb(parseCryptoDecimal(value).times(fx)):null}catch{return null}
  }
  const held:HeldAssetRow[]=[]
  for(const row of cash?.accounts??[])held.push({id:'cash-'+row.id,kind:'cash',name:row.name,account:'เงินสด / บัญชี · '+row.asOf,quantity:displayDecimal(row.balance)+' THB',native:row.balance,currency:'THB',thb:row.balance})
  for(const row of stocks?.holdings??[]){
    if(!parseCryptoDecimal(row.quantity).gt('0'))continue
    const reference=selectedStocks.get(row.symbol)!
    let native:string|null=null;try{if(reference.value)native=serializeCrypto(parseCryptoDecimal(row.quantity).times(reference.value))}catch{}
    held.push({id:'stock-'+row.portfolioId+row.symbol,kind:'stock',name:row.symbol,account:stocks!.portfolios.find(p=>p.id===row.portfolioId)?.name??'พอร์ตหุ้น',quantity:displayDecimal(row.quantity,0)+' หุ้น',native,currency:'USD',thb:convert(native,'USD'),status:reference.value?`${reference.source} · ${referenceDateLabel(reference)}`:'ราคาไม่พร้อม'})
  }
  for(const row of crypto?.holdings??[]){
    if(!parseCryptoDecimal(row.quantity).gt('0'))continue
    const position=valued?.holdings.find(p=>p.portfolioId===row.portfolioId&&p.asset===row.asset)
    held.push({id:'crypto-'+row.portfolioId+row.asset,kind:'crypto',name:row.asset,account:crypto!.portfolios.find(p=>p.id===row.portfolioId)?.name??'พอร์ตคริปโต',quantity:displayDecimal(row.quantity,0)+' หน่วย',native:position?.usdt??null,currency:'USDT',thb:position?.thb??null,status:position?.thb?'Binance · ราคาสด':'ราคา / อัตราไม่พร้อม'})
  }
  for(const row of manual?.assets??[])held.push({id:'manual-'+row.id,kind:'manual',name:row.name,account:'ประเมินเอง · '+row.date,quantity:row.quantity===null?'—':displayDecimal(row.quantity,0)+' '+row.unit,native:row.value,currency:row.currency,thb:convert(row.value,row.currency)})
  return <section className="journal-assets" aria-label="สินทรัพย์รวม">
    <div className="journal-assets-heading"><h2 className="text-xl font-semibold">สินทรัพย์รวมของคุณ</h2><p className="mt-2 text-sm">รวมเงินสดและสินทรัพย์ที่บันทึก · เทียบเป็นบาท</p></div>
    <div className="journal-assets-summary"><div className="tracker-card tracker-balance-card rounded-2xl p-5"><p className="text-sm">สินทรัพย์รวมเทียบบาท · มูลค่าอ้างอิง</p><p className="mt-3 break-all text-3xl font-semibold tabular-nums" data-testid="assets-total">{!mixed&&loading?'กำลังโหลด…':<>{display(mixed?.totalThb)} <span className="text-sm">THB</span></>}</p><p className="mt-2 text-xs">{mixed?.complete?'ตามราคาและอัตราอ้างอิงล่าสุด':'ยังขาดราคา / อัตรา หรือข้อมูลไม่ครบ'}</p></div>
      <div className="tracker-card rounded-2xl p-5"><p className="text-sm">เงินสดที่บันทึก</p><p className="mt-3 break-all text-2xl font-semibold" data-testid="assets-cash">{display(valued?.cashThb)} THB</p><p className="mt-2 text-xs">ปรับตามรายรับรายจ่ายและการซื้อขายที่เชื่อมบัญชี</p></div></div>
    <HeldAssets rows={held} loading={loading}/>
    <section className="tracker-card rounded-2xl p-5 space-y-3"><h3 className="font-semibold">ยอดตามสกุล</h3><p>THB: {display(mixed?.native.THB)}</p><p>USDT: {display(mixed?.native.USDT)}</p><p>USD: {display(mixed?.native.USD)}</p>
      {!mixed?.complete&&<p className="text-xs">ประเมินได้บางส่วน {display(mixed?.knownThb)} THB · ยังไม่ใช่ยอดรวม</p>}
      {stockSummary&&<div className="border-t pt-3 text-sm" data-testid="stock-summary"><p>ต้นทุนหุ้น/ETF {display(stockSummary.costUsd)} USD</p><p>กำไร/ขาดทุนยังไม่รับรู้ {display(stockSummary.unrealizedUsd)} USD</p>{!stockSummary.complete&&<p role="status" data-testid="stock-missing">ขาดราคา: {stockSummary.missing.join(', ')}</p>}</div>}
    </section>
    <div className="tracker-card journal-cash-editor rounded-2xl p-5"><h3 className="font-semibold">เงินสด / ยอดบัญชีที่คุณถือ</h3><p className="mt-2 text-xs">ยอดตั้งต้นหรือปรับยอดจริง · รายการใหม่ที่เชื่อมบัญชีเพิ่มลดให้อัตโนมัติ</p>
      {cash?.accounts.map(row=><div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3" key={row.id}><div><p className="font-medium">{row.name}</p><p className="mt-1 text-xs">ยอด ณ {row.asOf}</p></div><p className="break-all font-semibold">{display(row.balance)} THB</p><button className="auth-secondary" disabled={disabled} onClick={()=>{setEditing(row);setName(row.name);setBalance(row.balance);setAsOf(row.asOf)}}>แก้ยอดเงินสด</button></div>)}
      <form aria-label="บันทึกเงินสด" className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="auth-label">ชื่อเงินสดหรือบัญชี<input className="auth-input" maxLength={100} required disabled={disabled} value={name} onChange={e=>setName(e.target.value)} placeholder="เช่น เงินสดติดตัว"/></label><label className="auth-label">ยอดคงเหลือ THB<input className="auth-input" inputMode="decimal" required disabled={disabled} value={balance} onChange={e=>setBalance(e.target.value)}/></label>
        <label className="auth-label">ยอด ณ วันที่<input className="auth-input" type="date" required disabled={disabled} value={asOf} onChange={e=>setAsOf(e.target.value)}/></label><button className="auth-primary self-end" disabled={disabled}>{editing?'บันทึกยอดใหม่':'เพิ่มยอดเงินสด'}</button>{editing&&<button type="button" className="auth-secondary" disabled={disabled} onClick={clearForm}>เลิกแก้ยอด</button>}
      </form></div>
    <ManualAssets expired={expired} lock={setManualLocked} blocked={busy||!!pending||referenceLocked} changed={()=>{void load()}}/>
    {stocks&&<StockPortfolioValue holdings={stocks.holdings}/>}
    <section className="journal-price-tools space-y-4" aria-label="ราคาและการอัปเดต">
      <div className="tracker-card rounded-2xl p-5 space-y-3"><h3 className="font-semibold">ราคาและการอัปเดต</h3>
        <p className="text-xs" data-testid="daily-close-status">หุ้น/ETF: {daily?.provider==='READY'?`${daily.source} · ราคาปิด ${daily.expectedSession}`:daily?.provider==='NOT_LICENSED'?'ยังไม่มีสิทธิ์ราคาปิด':'เชื่อม key ส่วนตัวในหน้าบัญชี หรือกรอกราคาเอง'}{daily?.attribution&&<> · <a className="underline" href={daily.attribution.url} target="_blank" rel="noreferrer">{daily.attribution.label}</a></>}</p>
        {daily?.retention==='TRANSIENT'&&<p className="text-xs">ราคาปิดตรวจทุก 30 นาทีขณะเปิดดู</p>}
        <p className="text-xs">คริปโต: Binance · เกิน 30 วินาทีแสดง N/A</p>
        <p className="text-sm" data-testid="usd-thb-label">USD → THB: {display(usdFx.value)} · {usdFx.source} · {usdFx.asOf?new Date(usdFx.asOf).toLocaleDateString('th-TH'):'N/A'}</p>
        <p className="text-sm">USDT → THB: {freshRate?display(rate!.rate):'N/A'} · Bitkub · {rate?.receivedAt?new Date(rate.receivedAt).toLocaleTimeString('th-TH'):'N/A'}</p>
        {stockMarket.access==='owner'&&stockPrices&&stockPrices.connection!=='STREAMING'&&stockPrices.connection!=='NOT_CONFIGURED'&&<p className="text-xs" role="status">Alpaca: {stockConnectionLabel(stockPrices.connection)}</p>}
        <div className="flex flex-wrap gap-3"><button type="button" className="auth-secondary" disabled={disabled} onClick={()=>{void load()}}>โหลดสินทรัพย์ล่าสุด</button><button type="button" className="auth-secondary" disabled={disabled||readingReferences} onClick={()=>{void loadReferences(true)}}>{readingReferences?'กำลังอัปเดต…':'อัปเดตราคาปิด'}</button><button type="button" className="auth-secondary" disabled={disabled} onClick={()=>requestReference('USDTHB')}>ตั้งอัตรา USD/THB</button></div>
      </div>
      <ValuationReferences data={references} loading={loading} blocked={busy||!!pending||manualLocked} lock={setReferenceLocked} expired={expired} refresh={load} target={referenceTarget}/>
    </section>
    {loading&&<p className="journal-assets-feedback" role="status">กำลังโหลดสินทรัพย์…</p>}{loadFailed&&<p className="journal-assets-feedback" role="alert">โหลดสินทรัพย์ไม่สำเร็จ</p>}{message&&<p className="journal-assets-feedback" role="alert">{message}</p>}
    {pending&&<div className="journal-assets-feedback tracker-card rounded-2xl p-5"><p>ยังไม่ทราบผลบันทึกเงินสด</p><button className="auth-primary mt-3" disabled={busy} onClick={()=>{void send(pending)}}>ตรวจผลด้วยคำขอเดิม</button></div>}
    <p className="journal-assets-note text-xs">มูลค่าอ้างอิงตามสินทรัพย์ที่บันทึก · ยังไม่หักหนี้สิน</p>
  </section>
}
'''
write(p,s)
p='apps/web/src/tracker/ValuationReferences.tsx';s=read(p)
start=s.index('  <p className="text-sm leading-7">');end=s.index('  {!data',start)
s=s[:start]+'''  <p className="text-xs">กรอก USD ต่อหุ้น หรือ THB ต่อ USD · ปิด “ใช้ค่าที่กรอก” เพื่อกลับไปใช้อัตโนมัติ</p>
  <p className="text-xs">ราคา/อัตราที่กรอกเองใช้ได้ 7 วัน · ราคาสด 30 วินาที</p>
'''+s[end:];write(p,s)
p='apps/web/src/journal.css';s=read(p);s=sub(s,'.journal-cash-editor { grid-column:2; grid-row:3 / span 2; }','.journal-cash-editor { grid-column:2; grid-row:4 / span 2; }')
s+='''
.journal-held-assets,.journal-price-tools { grid-column:1 / -1; min-width:0; }
.journal-held-scroll { overflow-x:auto; margin-top:16px; }
.journal-held-table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
.journal-held-table th { text-align:left; font-size:13px; color:var(--muted); padding:10px 12px; border-bottom:1px dashed var(--line); }
.journal-held-table td { padding:16px 12px; vertical-align:top; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
.journal-held-table tr:last-child td { border-bottom:0; }
.journal-held-table th:first-child,.journal-held-table td:first-child { width:48%; padding-left:0; }
.journal-held-table th:last-child,.journal-held-value { text-align:right; }
.journal-held-quantity { white-space:nowrap; }
@media(max-width:640px) {
 .journal-held-table { font-size:13px; }
 .journal-held-table th,.journal-held-table td { padding:12px 6px; }
 .journal-held-table th:first-child,.journal-held-table td:first-child { width:42%; }
 .journal-held-quantity { white-space:normal; }
 .journal-held-value { min-width:88px; }
}
''';write(p,s)
print('Unified holdings section and compact bottom price tools updated.')
