import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cashOverviewSchema, cashInputSchema, referenceRateSchema, stockOverviewSchema,manualAssetOverviewSchema,stockMarketSnapshotSchema,type StockOverview,type ManualAssetOverview,type StockMarketSnapshot,type CashOverview, type CryptoOverview, type MarketSnapshot, type ReferenceRate } from '@finntech/contracts'
import { valueAssets,valueMixedAssets,valuePosition,parseCryptoDecimal } from '@finntech/finance'
import { valuationOverviewSchema,type ValuationOverview } from '@finntech/contracts'
import {selectReference} from './valuationPolicy'
import ValuationReferences from './ValuationReferences'
import { displayDecimal, trackerRequest, TrackerRequestError } from './client'
import { isFreshCryptoQuote } from './marketFreshness'
import { usePresentation } from '../presentation'
import ManualAssets from './ManualAssets'
import StockPortfolioValue from './StockPortfolioValue'

type Pending = { path: string; method: string; body: unknown; key: string }
const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
const stockPosition=(quantity:string,cost:string,price:string|null)=>{try{return valuePosition(quantity,cost,price)}catch{return {value:null,unrealized:null}}}
export default function Assets({ crypto, market, now, expired, lock }: { crypto: CryptoOverview | null; market: MarketSnapshot; now: number; expired: () => void; lock: (value: boolean) => void }): JSX.Element {
  const { money } = usePresentation()
  const [cash, setCash] = useState<CashOverview | null>(null), [rate, setRate] = useState<ReferenceRate | null>(null)
  const [stocks,setStocks]=useState<StockOverview|null>(null),[manual,setManual]=useState<ManualAssetOverview|null>(null),[stockPrices,setStockPrices]=useState<StockMarketSnapshot|null>(null),[manualLocked,setManualLocked]=useState(false)
  const [references,setReferences]=useState<ValuationOverview|null>(null),[referenceLocked,setReferenceLocked]=useState(false),[referenceTarget,setReferenceTarget]=useState<{symbol:string;request:number}|null>(null)
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
      const extra=await Promise.allSettled([trackerRequest('stocks'),trackerRequest('assets/manual'),trackerRequest('stocks/market'),trackerRequest('valuation/references')])
      if(extra.some(result=>result.status==='rejected'&&result.reason instanceof TrackerRequestError&&result.reason.expired))expired()
      if(mounted.current){setStocks(extra[0].status==='fulfilled'?stockOverviewSchema.parse(extra[0].value):null);setManual(extra[1].status==='fulfilled'?manualAssetOverviewSchema.parse(extra[1].value):null);setStockPrices(extra[2].status==='fulfilled'?stockMarketSnapshotSchema.parse(extra[2].value):null)}
      if(mounted.current){const parsed=extra[3].status==='fulfilled'?valuationOverviewSchema.safeParse(extra[3].value):null;setReferences(parsed?.success?parsed.data:null)}
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
  const freshRate = rate?.status === 'FRESH' && rate.rate !== null && rate.receivedAt !== null && now - Date.parse(rate.receivedAt) >= 0 && now - Date.parse(rate.receivedAt) <= 30000
  const prices = new Map(market.quotes.filter(quote => isFreshCryptoQuote(quote, now)).map(quote => [quote.asset, quote.price!]))
  let valued: ReturnType<typeof valueAssets> | null = null
  try { if (cash && crypto) valued = valueAssets(cash.accounts.map(row => row.balance), crypto.holdings, prices, freshRate ? rate!.rate : null) } catch { /* Invalid/overflow totals must remain unavailable. */ }
  const selectedStocks=new Map((stocks?.holdings??[]).map(r=>[r.symbol,selectReference(r.symbol,references,stockPrices,now)]))
  const eligibleStocks=new Map([...selectedStocks].flatMap(([symbol,r])=>r.value===null?[]:[[symbol,r.value] as [string,string]]))
  const usdFx=selectReference('USDTHB',references,stockPrices,now)
  let mixed:ReturnType<typeof valueMixedAssets>|null=null
  try{if(valued&&stocks&&manual)mixed=valueMixedAssets(valued,stocks.holdings,eligibleStocks,manual.assets,freshRate?rate!.rate:null,usdFx.value)}catch{/* Incomplete or unrepresentable aggregate remains N/A. */}
  const disabled = busy || !!pending ||manualLocked||referenceLocked||loading || !cash
  const requestReference=(symbol:string)=>setReferenceTarget({symbol,request:Date.now()})
  const display = (value: string | null | undefined) => value == null ? 'N/A' : money(displayDecimal(value))
  return <section className="journal-assets" aria-label="สินทรัพย์รวม">
    <div className="journal-assets-heading"><h2 className="text-xl font-semibold">สินทรัพย์รวมของคุณ</h2><p className="mt-2 text-sm text-slate-500">เงินสด + คริปโต + หุ้น/ETF + สินทรัพย์ประเมินเอง · แยกสกุลและวันที่ประเมิน</p></div>
    <div className="journal-assets-summary"><div className="tracker-card tracker-balance-card rounded-2xl p-5"><p className="text-sm">สินทรัพย์รวมเทียบบาท · มูลค่าอ้างอิง</p><p className="mt-3 break-all text-3xl font-semibold tabular-nums" data-testid="assets-total">{display(mixed?.totalThb)} <span className="text-sm">THB</span></p><p className="mt-2 text-xs">{mixed?.complete ? 'ครบตามสินทรัพย์ที่บันทึก · ประมาณการตามแหล่งและวันอ้างอิงด้านล่าง ไม่ใช่มูลค่าที่รับประกันซื้อขายได้' : 'ข้อมูลยังไม่ครบ · ราคา/อัตราไม่พร้อม หรือยอดเกินขอบเขต'}</p></div>
      <div className="tracker-card rounded-2xl p-5"><p className="text-sm">เงินสดที่บันทึก</p><p className="mt-3 break-all text-2xl font-semibold">{display(valued?.cashThb)} THB</p>{!mixed?.complete && <p className="mt-2 break-all text-sm">ยอดที่ประเมินได้บางส่วน: {display(mixed?.knownThb)} THB · ไม่ใช่ยอดรวมทั้งหมด</p>}</div></div>
    <section className="tracker-card rounded-2xl p-5 space-y-3"><h3 className="font-semibold">ยอดตามสกุล · ไม่ใช่ยอดที่บวกข้ามสกุลได้</h3><p className="break-all">เงินสดและสินทรัพย์ประเมินเอง THB: {display(mixed?.native.THB)} THB</p><p className="break-all">คริปโตและสินทรัพย์ประเมินเอง USDT: {display(mixed?.native.USDT)} USDT</p><p className="break-all">หุ้นและสินทรัพย์ประเมินเอง USD: {display(mixed?.native.USD)} USD</p><p className="break-all text-sm">USD ที่ประเมินได้บางส่วน: {display(mixed?.knownNative.USD)} USD · มูลค่าหุ้นคูณอัตรา USD/THB แยกจาก USDT/THB</p>
     {stocks?.holdings.map(row=>{const reference=selectedStocks.get(row.symbol)!,position=stockPosition(row.quantity,row.totalCost,reference.value);return <article className="border-t pt-3 space-y-2 break-all" key={row.portfolioId+row.symbol}><p>{row.symbol} · {money(row.quantity)} หุ้น · ต้นทุน {display(row.totalCost)} USD</p><p>มูลค่าอ้างอิง {display(position.value)} USD · กำไร/ขาดทุนยังไม่รับรู้ {display(position.unrealized)} USD</p><p className="text-xs">ราคา {display(reference.value)} USD ต่อหุ้น · {reference.source} · {reference.state} · {reference.asOf?new Date(reference.asOf).toLocaleString('th-TH'):'ไม่มีวันอ้างอิง'}</p>{reference.value===null&&!parseCryptoDecimal(row.quantity).isZero()&&<p role="status">ขาดราคาอ้างอิง {row.symbol} จึงยังรวมมูลค่าหุ้นนี้ไม่ได้</p>}<button className="auth-secondary" disabled={disabled} onClick={()=>requestReference(row.symbol)}>ตั้งราคาอ้างอิง {row.symbol}</button></article>})}
     {!usdFx.value&&mixed&&parseCryptoDecimal(mixed.knownNative.USD).gt('0')&&<p role="status">ขาดอัตรา USD/THB · แสดงมูลค่า USD ได้ แต่ยังแปลงเป็นบาทไม่ได้</p>}
     {valued?.holdings.filter(r=>r.thb===null).map(r=><p key={r.portfolioId+r.asset} role="status">คริปโต {r.asset}: ขาดราคาสดหรือ USDT/THB สด</p>)}
    </section>
    <section className="tracker-card rounded-2xl p-5 space-y-3"><h3 className="font-semibold">อัตราอ้างอิง USD → THB</h3><p>1 USD ≈ {display(usdFx.value)} THB · {usdFx.state}</p><p className="text-sm break-all">{usdFx.source} · ณ {usdFx.asOf?new Date(usdFx.asOf).toLocaleString('th-TH'):'N/A'}</p><p className="text-xs">ECB เป็นอัตราอ้างอิงรายวัน แปลงจากอัตราต่อ EUR ไม่ใช่ราคาแลกเงินสด ไม่ใช่ USDT และไม่รวมค่าธรรมเนียม · <a className="underline" href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noreferrer">ข้อมูลต้นทาง ECB</a></p><button className="auth-secondary" disabled={disabled} onClick={()=>requestReference('USDTHB')}>ตั้งอัตรา USD/THB ของคุณ</button></section>
    <ValuationReferences data={references} loading={loading} blocked={busy||!!pending||manualLocked} lock={setReferenceLocked} expired={expired} refresh={load} target={referenceTarget}/>
    {stocks && <StockPortfolioValue holdings={stocks.holdings} />}
    <ManualAssets expired={expired} lock={setManualLocked} blocked={busy||!!pending||referenceLocked} changed={()=>{void load()}}/>
    <div className="tracker-card journal-asset-portfolios rounded-2xl p-5"><h3 className="font-semibold">พอร์ตทั้งหมด</h3>{crypto?.portfolios.length === 0 && <p className="mt-3 text-sm text-slate-500">ยังไม่มีพอร์ต ไปที่พอร์ตคริปโตเพื่อบันทึกประวัติด้วยมือ</p>}
      {crypto?.portfolios.map(portfolio => <div className="mt-4 border-t border-slate-100 pt-4" key={portfolio.id}><h4 className="font-medium">{portfolio.name}</h4>{crypto.holdings.filter(row => row.portfolioId === portfolio.id).length === 0 && <p className="mt-2 text-sm text-slate-500">ยังไม่มีสินทรัพย์ในพอร์ตนี้</p>}{valued?.holdings.filter(row => row.portfolioId === portfolio.id).map(row => <p className="mt-2 break-all text-sm" key={row.asset}>{row.asset} · {money(row.quantity)} หน่วย · {display(row.usdt)} USDT ≈ {display(row.thb)} THB</p>)}</div>)}
      <p className="mt-4 text-xs leading-6 text-slate-500">ราคาคริปโต: Binance public · รวมทุกพอร์ตตามจำนวนที่ถือ ไม่ใช้ต้นทุนซื้อเป็นราคาปัจจุบัน หุ้นที่ดูราคาอย่างเดียวยังไม่ถือเป็นสินทรัพย์ของคุณ</p></div>
    <div className="tracker-card journal-rate rounded-2xl p-5"><h3 className="font-semibold">อัตราอ้างอิง USDT → THB</h3><p className="mt-2 text-sm">1 USDT ≈ {freshRate ? display(rate!.rate) : 'N/A'} THB · {freshRate ? 'ข้อมูลยังสด' : 'ยังไม่มีข้อมูลสด'}</p><p className="mt-2 text-xs leading-6 text-slate-500">Bitkub public · ราคาซื้อขายล่าสุดของคู่ USDT_THB (ไม่ใช่ USD/THB) · เวลารับข้อมูล: {rate?.receivedAt ? new Date(rate.receivedAt).toLocaleString('th-TH') : 'N/A'}<br />ผู้ให้ข้อมูลไม่ระบุเวลาซื้อขายของราคานี้ อ้างอิง snapshot ที่รับมาเท่านั้น ไม่ใช่ราคาที่รับประกันว่าจะแลกได้ ไม่รวม spread/ค่าธรรมเนียม · เกิน 30 วินาทีใช้คำนวณไม่ได้</p></div>
    <div className="tracker-card journal-cash-editor rounded-2xl p-5"><h3 className="font-semibold">เงินสด / ยอดบัญชีที่คุณถือ</h3><p className="mt-2 text-sm leading-7 text-slate-500">กรอกยอดคงเหลือปัจจุบันของแต่ละบัญชี ไม่ต้องกรอกเลขบัญชี รายรับรายจ่ายจะไม่เพิ่มหรือลดยอดนี้อัตโนมัติ อย่านับยอดเดียวกันซ้ำหลายชื่อ</p>
      {cash?.accounts.map(row => <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3" key={row.id}><div><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-slate-500">ยอด ณ {row.asOf}</p></div><p className="break-all font-semibold">{display(row.balance)} THB</p><button className="auth-secondary" disabled={disabled} onClick={() => { setEditing(row); setName(row.name); setBalance(row.balance); setAsOf(row.asOf) }}>แก้ยอดเงินสด</button></div>)}
      <form aria-label="บันทึกเงินสด" className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="auth-label">ชื่อเงินสดหรือบัญชี<input className="auth-input" maxLength={100} required disabled={disabled} value={name} onChange={event => setName(event.target.value)} placeholder="เช่น เงินสดติดตัว" /></label><label className="auth-label">ยอดคงเหลือ THB<input className="auth-input" inputMode="decimal" required disabled={disabled} value={balance} onChange={event => setBalance(event.target.value)} /></label>
        <label className="auth-label">ยอด ณ วันที่<input className="auth-input" type="date" required disabled={disabled} value={asOf} onChange={event => setAsOf(event.target.value)} /></label><button className="auth-primary self-end" disabled={disabled}>{editing ? 'บันทึกยอดใหม่' : 'เพิ่มยอดเงินสด'}</button>{editing && <button type="button" className="auth-secondary" disabled={disabled} onClick={clearForm}>เลิกแก้ยอด</button>}
      </form></div>
    {loading && <p className="journal-assets-feedback" role="status">กำลังโหลดสินทรัพย์…</p>}{loadFailed && <p className="journal-assets-feedback text-sm" role="alert">อ่านข้อมูลสินทรัพย์ไม่สำเร็จ ยังสรุปยอดรวมไม่ได้</p>}{message && <p className="journal-assets-feedback text-sm" role="alert">{message}</p>}
    {pending && <div className="journal-assets-feedback tracker-card rounded-2xl p-5"><p className="text-sm">ยังไม่ทราบผล ห้ามสร้างคำขอใหม่หรือปิดหน้า ตรวจผลด้วยข้อมูลและ key เดิม</p><button className="auth-primary mt-3" disabled={busy} onClick={() => { void send(pending) }}>ตรวจผลบันทึกเงินสดด้วยคำขอเดิม</button></div>}
    <button className="journal-assets-feedback auth-secondary" disabled={disabled} onClick={() => { void load() }}>โหลดสินทรัพย์ล่าสุด</button>
    <p className="journal-assets-note text-xs leading-6 text-slate-500">ต้นทุนและประวัติยังเป็นสกุลเดิม การเทียบบาทไม่เปลี่ยนต้นทุนที่บันทึก · ไม่รวมสินทรัพย์นอกระบบหรือหนี้สิน จึงไม่ใช่มูลค่าสุทธิทั้งหมดของคุณ</p>
  </section>
}
