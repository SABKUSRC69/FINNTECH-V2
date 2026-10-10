import { useEffect, useState } from 'react'
import { usePresentation } from '../presentation'
import { displayDecimal } from './client'
import StockHoldings from './StockHoldings'
import FreeStockPrices from './FreeStockPrices'
import { useStockMarket } from './stockMarket'
import { liveStockQuote, stockConnectionLabels } from './valuationPolicy'

const clock = (value: string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })

export default function StockPrices({ expired,lock=()=>{},blocked=false,refreshRevision=0,mediaEnabled=true }: { expired: () => void;lock?:(value:boolean)=>void;blocked?:boolean;refreshRevision?:number;mediaEnabled?:boolean }): JSX.Element {
  const { money } = usePresentation()
  const market = useStockMarket(expired, refreshRevision), snapshot = market.snapshot
  const [tick, setTick] = useState(Date.now())
  // Expire prices locally even if both our API and stream become unreachable.
  useEffect(() => { const age = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(age) }, [])
  const viewTime = Math.max(tick, market.receivedAt)
  const message = market.access === 'denied' ? 'บัญชีนี้ไม่ใช่เจ้าของ Alpaca key ที่ตั้งไว้ ราคาอัตโนมัติจึงเป็น N/A ใช้กราฟฟรีหรือตั้งราคาอ้างอิงเองได้'
    : market.access === 'unavailable' ? 'ข้อมูลราคายังไม่พร้อม ราคาจะแสดงเป็น N/A' : ''

  return <section className="space-y-5" aria-label="ราคาหุ้นสหรัฐ">
    <FreeStockPrices refreshRevision={refreshRevision}/>
    <StockHoldings mediaEnabled={mediaEnabled} snapshot={snapshot} now={viewTime} expired={expired} lock={lock} blocked={blocked} refreshRevision={refreshRevision}/>
    {snapshot?.connection !== 'NOT_CONFIGURED' && snapshot !== null && <div className="journal-stock-intro tracker-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">ติดตามหุ้นและ ETF สหรัฐ · USD</h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">Alpaca Basic · ราคา last trade จาก IEX เท่านั้น ไม่ใช่ราคาครบทุกตลาดสหรัฐ · สูงสุด 30 หลักทรัพย์ (หุ้นที่ถืออยู่มาก่อน แล้วจึง watchlist)</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">ราคา IEX ใช้ได้เฉพาะเจ้าของ key ตามเงื่อนไขใช้งานส่วนตัวของ Alpaca ผู้ใช้อื่นบันทึกต้นทุนและประวัติได้ และตั้งราคาอ้างอิงเองได้</p>
      <p role="status" className="mt-4 text-sm font-medium text-teal-800">{stockConnectionLabels[snapshot.connection]}{snapshot.session === 'CLOSED' ? ' · ตลาดสหรัฐปิด (นอกเวลา 09:30–16:00 นิวยอร์ก) ราคาล่าสุดไม่นับเป็นราคาสด' : ''}</p>
      {snapshot.excluded && snapshot.excluded.length > 0 && <p className="mt-2 text-xs">เกินเพดาน 30 จึงไม่ได้ติดตาม: {snapshot.excluded.join(', ')}</p>}
    </div>}
    {snapshot?.connection !== 'NOT_CONFIGURED' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {snapshot?.quotes.map(quote => {
        const fresh = !!liveStockQuote(quote.symbol, snapshot, viewTime)
        return <article key={quote.symbol} aria-label={`ราคา ${quote.symbol}`} className="tracker-card rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{quote.symbol}</h3><span className="text-xs text-slate-500">{fresh ? 'ราคาสด IEX' : !quote.price ? 'ราคาไม่พร้อม' : quote.status === 'CLOSED' ? 'ตลาดปิด · ราคาล่าสุด' : 'ราคาไม่สด'}</span></div>
          <p className="mt-3 break-all text-xl font-semibold tabular-nums">{quote.price ? money(displayDecimal(quote.price)) : 'N/A'} <span className="text-xs text-slate-400">USD</span></p>
          <p className="mt-3 text-xs leading-6 text-slate-500">เวลารายการล่าสุด: {quote.observedAt ? clock(quote.observedAt) : 'N/A'}</p>
        </article>
      })}
    </div>}
    {message && <p role="status" className="text-xs text-slate-500">การประเมินอัตโนมัติผ่าน API: {message}</p>}
    {snapshot?.connection !== 'NOT_CONFIGURED' && snapshot !== null && <p className="text-xs leading-6 text-slate-500">ราคาส่งจาก backend ทันทีที่มีรายการใหม่ (รวบไม่เกินวินาทีละครั้ง) และตรวจซ้ำทุก 15 วินาที · อายุรายการเกิน 30 วินาทีถือว่าเก่า · การเชื่อมต่อสำเร็จไม่ได้หมายความว่ามีการซื้อขายใหม่ตลอดเวลา · ใช้ส่วนตัวเฉพาะเจ้าของ key</p>}
  </section>
}
