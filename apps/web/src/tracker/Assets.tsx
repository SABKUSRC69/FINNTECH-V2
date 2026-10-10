import HeldAssets, {type HeldAssetRow} from './HeldAssets'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cashOverviewSchema, cashInputSchema, referenceRateSchema, stockOverviewSchema,manualAssetOverviewSchema,type StockOverview,type ManualAssetOverview,type StockMarketSnapshot,type CashOverview, type CryptoOverview, type MarketSnapshot, type ReferenceRate } from '@finntech/contracts'
import { valueAssets,valueMixedAssets,serializeCrypto,parseCryptoDecimal,serializeThb,summarizeStockHoldings } from '@finntech/finance'
import { useValuationReferences } from './useValuationReferences'
import {selectReference,stockConnectionLabels} from './valuationPolicy'
import ValuationReferences from './ValuationReferences'
import { displayDecimal, trackerRequest, TrackerRequestError } from './client'
import { isFreshCryptoQuote } from './marketFreshness'
import { usePresentation } from '../presentation'
import ManualAssets from './ManualAssets'
import StockPortfolioValue from './StockPortfolioValue'
import { useStockMarket } from './stockMarket'

type Pending = { path: string; method: string; body: unknown; key: string }
const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
export default function Assets({ crypto, market, now, expired, lock }: { crypto: CryptoOverview | null; market: MarketSnapshot; now: number; expired: () => void; lock: (value: boolean) => void }): JSX.Element {
  const { money } = usePresentation()
  const [cash, setCash] = useState<CashOverview | null>(null), [rate, setRate] = useState<ReferenceRate | null>(null)
  const [stocks,setStocks]=useState<StockOverview|null>(null),[manual,setManual]=useState<ManualAssetOverview|null>(null),[manualLocked,setManualLocked]=useState(false)
  const stockMarket=useStockMarket(expired),stockPrices:StockMarketSnapshot|null=stockMarket.snapshot
  const {overview:references,load:loadReferences,reading:readingReferences}=useValuationReferences(expired)
  const [referenceLocked,setReferenceLocked]=useState(false),[referenceTarget,setReferenceTarget]=useState<{symbol:string;request:number}|null>(null)
  const [name, setName] = useState(''), [balance, setBalance] = useState(''), [asOf, setAsOf] = useState(today())
  const [editing, setEditing] = useState<CashOverview['accounts'][number] | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [pending, setPending] = useState<Pending | null>(null), [message, setMessage] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const writing = useRef(false), mounted = useRef(true)
  useEffect(() => { lock(busy || !!pending||manualLocked||referenceLocked); return () => lock(false) }, [busy, pending,manualLocked,referenceLocked,lock])
  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [accounts, fx] = await Promise.all([trackerRequest('cash'), trackerRequest('reference-rate')])
      if (mounted.current) { setCash(cashOverviewSchema.parse(accounts)); setRate(referenceRateSchema.parse(fx)); setLoadFailed(false) }
      // Independent reads: failed pricing never prevents viewing recorded USD costs/manual assets.
      // Stock prices arrive from the shared live store (useStockMarket), not from this 15 s reconciliation.
      const extra=await Promise.allSettled([trackerRequest('stocks'),trackerRequest('assets/manual'),loadReferences()])
      if(extra.some(result=>result.status==='rejected'&&result.reason instanceof TrackerRequestError&&result.reason.expired))expired()
      if(mounted.current){setStocks(extra[0].status==='fulfilled'?stockOverviewSchema.parse(extra[0].value):null);setManual(extra[1].status==='fulfilled'?manualAssetOverviewSchema.parse(extra[1].value):null)}
    } catch (error) {
      if (mounted.current) { setCash(null); setRate(null); setLoadFailed(true) }
      if (error instanceof TrackerRequestError && error.expired) expired()
    } finally { if (mounted.current) setLoading(false) }
  }
  useEffect(() => {
    mounted.current = true; void load()
    const timer = setInterval(() => { if (!writing.current) void load() }, 15000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])
  function clearForm(): void { setEditing(null); setName(''); setBalance(''); setAsOf(today()) }
  async function send(request: Pending): Promise<void> {
    if (writing.current) return
    writing.current = true; setBusy(true); setMessage('')
    try {
      await trackerRequest(request.path, request.method, request.body, request.key)
      setPending(null); clearForm(); setMessage('บันทึกยอดเงินสดสำเร็จ'); await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
      if (error instanceof TrackerRequestError && error.unknownOutcome) setPending(request)
      else { setPending(null); await load() }
      if (error instanceof TrackerRequestError && error.expired) expired()
    } finally { writing.current = false; setBusy(false) }
  }
  function submit(event: FormEvent): void {
    event.preventDefault()
    if (writing.current || busy || pending || manualLocked || referenceLocked || !cash || loading) return
    const input = cashInputSchema.safeParse({ name, balance, currency: 'THB', asOf })
    if (!input.success) { setMessage('ตรวจชื่อ ยอดเงินบาทที่ไม่ติดลบ (ทศนิยมไม่เกิน 2 ตำแหน่ง) และวันที่อีกครั้ง'); return }
    void send({ path: editing ? `cash/${editing.id}` : 'cash', method: editing ? 'PATCH' : 'POST', body: editing ? { ...input.data, expectedVersion: editing.version } : input.data, key: globalThis.crypto.randomUUID() })
  }
  // Responses may arrive between clock ticks. Judge them at this render's time, while preserving
  // the 30 s upper age limit and rejecting timestamps in the future.
  const valuationNow = Math.max(now, Date.now())
  const freshRate = rate?.status === 'FRESH' && rate.rate !== null && rate.receivedAt !== null && valuationNow - Date.parse(rate.receivedAt) >= 0 && valuationNow - Date.parse(rate.receivedAt) <= 30000
  const prices = new Map(market.quotes.filter(quote => isFreshCryptoQuote(quote, valuationNow)).map(quote => [quote.asset, quote.price!]))
  let valued: ReturnType<typeof valueAssets> | null = null
  try { if (cash && crypto) valued = valueAssets(cash.accounts.map(row => row.balance), crypto.holdings, prices, freshRate ? rate!.rate : null) } catch { /* Invalid/overflow totals must remain unavailable. */ }
  // A live event re-renders immediately; evaluate it at its receipt time rather than the last 1 s tick.
  const stockNow=Math.max(valuationNow,stockMarket.receivedAt)
  const selectedStocks=new Map((stocks?.holdings??[]).map(r=>[r.symbol,selectReference(r.symbol,references,stockPrices,stockNow)]))
  const eligibleStocks=new Map([...selectedStocks].flatMap(([symbol,r])=>r.value===null?[]:[[symbol,r.value] as [string,string]]))
  const usdFx=selectReference('USDTHB',references,stockPrices,stockNow)
  let mixed:ReturnType<typeof valueMixedAssets>|null=null
  try{if(valued&&stocks&&manual)mixed=valueMixedAssets(valued,stocks.holdings,eligibleStocks,manual.assets.filter(row=>!row.archived),freshRate?rate!.rate:null,usdFx.value)}catch{/* Incomplete or unrepresentable aggregate remains N/A. */}
  let stockSummary:ReturnType<typeof summarizeStockHoldings>|null=null
  try{if(stocks)stockSummary=summarizeStockHoldings(stocks.holdings,eligibleStocks)}catch{}
  const daily=references?.dailyCloses
  const disabled = busy || !!pending ||manualLocked||referenceLocked||loading || !cash
  const requestReference=(symbol:string)=>setReferenceTarget({symbol,request:Date.now()})
  const display = (value: string | null | undefined) => value == null ? 'N/A' : money(displayDecimal(value))
  const convert=(value:string|null,currency:string):string|null=>{
    try{if(value===null)return null;if(parseCryptoDecimal(value).isZero())return '0.00';const fx=currency==='THB'?'1':currency==='USD'?usdFx.value:freshRate?rate!.rate:null;return fx?serializeThb(parseCryptoDecimal(value).times(fx)):null}catch{return null}
  }
  const held:HeldAssetRow[]=[]
  for(const row of cash?.accounts??[])held.push({id:'cash-'+row.id,kind:'cash',name:row.name,account:'เงินสด · ตั้งยอด '+row.asOf+' · ปรับตามรายการหลังจากนั้น',quantity:displayDecimal(row.balance)+' THB',native:row.balance,currency:'THB',thb:row.balance})
  for(const row of stocks?.holdings??[]){
    if(!parseCryptoDecimal(row.quantity).gt('0'))continue
    const reference=selectedStocks.get(row.symbol)!
    let native:string|null=null;try{if(reference.value)native=serializeCrypto(parseCryptoDecimal(row.quantity).times(reference.value))}catch{}
    held.push({id:'stock-'+row.portfolioId+row.symbol,kind:'stock',name:row.symbol,account:stocks!.portfolios.find(p=>p.id===row.portfolioId)?.name??'พอร์ตหุ้น',quantity:displayDecimal(row.quantity,0)+' หุ้น',native,currency:'USD',thb:convert(native,'USD'),status:reference.value?(reference.close?`${daily?.source??'ราคาปิด'} · ${reference.close.tradingDate}${reference.close.status==='DELAYED'?' · รอวันล่าสุด':''}${reference.close.problem&&reference.close.problem!=='NOT_YET_PUBLISHED'&&reference.close.fetchedAt?` · อัปเดตไม่สำเร็จ ใช้ราคาที่ดึงเมื่อ ${new Date(reference.close.fetchedAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`:''}`:reference.state==='MANUAL'?`กรอกเอง · ${reference.asOf?new Date(reference.asOf).toLocaleDateString('th-TH'):''}`:'Alpaca IEX · ราคาสด'):'ราคาไม่พร้อม'})
  }
  for(const row of crypto?.holdings??[]){
    if(!parseCryptoDecimal(row.quantity).gt('0'))continue
    const position=valued?.holdings.find(p=>p.portfolioId===row.portfolioId&&p.asset===row.asset)
    held.push({id:'crypto-'+row.portfolioId+row.asset,kind:'crypto',name:row.asset,account:crypto!.portfolios.find(p=>p.id===row.portfolioId)?.name??'พอร์ตคริปโต',quantity:displayDecimal(row.quantity,0)+' หน่วย',native:position?.usdt??null,currency:'USDT',thb:position?.thb??null,status:position?.thb?'Binance · ราคาสด':'ราคา / อัตราไม่พร้อม'})
  }
  for(const row of (manual?.assets??[]).filter(row=>!row.archived))held.push({id:'manual-'+row.id,kind:'manual',name:row.name,account:'ประเมินเอง · '+row.date,quantity:row.quantity===null?'—':displayDecimal(row.quantity,0)+' '+row.unit,native:row.value,currency:row.currency,thb:convert(row.value,row.currency)})
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
        <p className="text-sm" data-testid="usd-thb-label">USD → THB: {display(usdFx.value)} · {usdFx.state==='MANUAL'?'กรอกเอง':'ECB รายวัน'} · {usdFx.asOf?new Date(usdFx.asOf).toLocaleDateString('th-TH'):'N/A'}</p>
        <p className="text-sm">USDT → THB: {freshRate?display(rate!.rate):'N/A'} · Bitkub · {rate?.receivedAt?new Date(rate.receivedAt).toLocaleTimeString('th-TH'):'N/A'}</p>
        {stockMarket.access==='owner'&&stockPrices&&stockPrices.connection!=='STREAMING'&&stockPrices.connection!=='NOT_CONFIGURED'&&<p className="text-xs" role="status">Alpaca: {stockConnectionLabels[stockPrices.connection]}</p>}
        <div className="flex flex-wrap gap-3"><button type="button" className="auth-secondary" disabled={busy||!!pending||manualLocked||referenceLocked||loading} onClick={()=>{void load()}}>โหลดสินทรัพย์ล่าสุด</button><button type="button" className="auth-secondary" disabled={disabled||readingReferences} onClick={()=>{void loadReferences(true)}}>{readingReferences?'กำลังอัปเดต…':'อัปเดตราคาปิด'}</button><button type="button" className="auth-secondary" disabled={disabled} onClick={()=>requestReference('USDTHB')}>ตั้งอัตรา USD/THB</button></div>
      </div>
      <ValuationReferences data={references} loading={loading} blocked={busy||!!pending||manualLocked} lock={setReferenceLocked} expired={expired} refresh={load} target={referenceTarget}/>
    </section>
    {loading&&<p className="journal-assets-feedback" role="status">กำลังโหลดสินทรัพย์…</p>}{loadFailed&&<p className="journal-assets-feedback" role="alert">โหลดสินทรัพย์ไม่สำเร็จ</p>}{message&&<p className="journal-assets-feedback" role="alert">{message}</p>}
    {pending&&<div className="journal-assets-feedback tracker-card rounded-2xl p-5"><p>ยังไม่ทราบผลบันทึกเงินสด</p><button className="auth-primary mt-3" disabled={busy} onClick={()=>{void send(pending)}}>ตรวจผลด้วยคำขอเดิม</button></div>}
    <p className="journal-assets-note text-xs">มูลค่าอ้างอิงตามสินทรัพย์ที่บันทึก · ยังไม่หักหนี้สิน</p>
  </section>
}
