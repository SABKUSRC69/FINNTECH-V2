import { useEffect, useState } from 'react'
import { usePresentation } from '../presentation'
import { stockMarketSnapshotSchema, type StockMarketSnapshot } from '@finntech/contracts'
import { displayDecimal, trackerRequest, TrackerRequestError } from './client'
import StockHoldings from './StockHoldings'
import FreeStockPrices from './FreeStockPrices'

const connectionLabels: Record<StockMarketSnapshot['connection'], string> = {
  NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่า Alpaca key ฝั่ง server', CONNECTING: 'กำลังเชื่อมต่อข้อมูล IEX',
  STREAMING: 'เชื่อมต่อ feed IEX แล้ว', UNAVAILABLE: 'ยังเชื่อมต่อ Alpaca ไม่ได้',
}
const clock = (value: string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })

export default function StockPrices({ expired,lock=()=>{},blocked=false,refreshRevision=0,mediaEnabled=true }: { expired: () => void;lock?:(value:boolean)=>void;blocked?:boolean;refreshRevision?:number;mediaEnabled?:boolean }): JSX.Element {
  const { money } = usePresentation()
  const [snapshot, setSnapshot] = useState<StockMarketSnapshot | null>(null)
  const [message, setMessage] = useState('')
  const [viewTime, setViewTime] = useState(Date.now())
  useEffect(() => {
    let mounted = true
    let socket: WebSocket | null = null
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let failures = 0, fetching = false
    const accept = (value: unknown) => {
      const parsed = stockMarketSnapshotSchema.parse(value)
      if (mounted) { setSnapshot(parsed); setMessage(''); setViewTime(Date.now()) }
    }
    const refresh = async () => {
      if (fetching) return
      fetching = true
      try { accept(await trackerRequest('stocks/market')) }
      catch (error) {
        if (mounted) {
          setSnapshot(null)
          setMessage('ข้อมูลราคายังไม่พร้อม หรือบัญชีนี้ไม่มีสิทธิ์ใช้ key ที่ตั้งไว้ ราคาจะแสดงเป็น N/A')
          if (error instanceof TrackerRequestError && error.expired) expired()
        }
      } finally { fetching = false }
    }
    const connect = () => {
      if (!mounted || typeof WebSocket === 'undefined') return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/stocks`)
      socket.onmessage = event => {
        try { accept(JSON.parse(String(event.data))); failures = 0 }
        catch { if (mounted) { setSnapshot(null); setMessage('รูปแบบข้อมูลราคายังไม่พร้อม') } }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (mounted) { failures = Math.min(failures + 1, 5); reconnect = setTimeout(connect, 1000 * 2 ** failures) }
      }
    }
    void refresh(); connect()
    const poll = setInterval(() => { void refresh() }, 15_000)
    // Expire prices locally even if both our API and stream become unreachable.
    const age = setInterval(() => setViewTime(Date.now()), 1000)
    return () => { mounted = false; clearInterval(poll); clearInterval(age); if (reconnect) clearTimeout(reconnect); socket?.close() }
  }, [refreshRevision])

  return <section className="space-y-5" aria-label="ราคาหุ้นสหรัฐ">
    <FreeStockPrices refreshRevision={refreshRevision}/>
    <StockHoldings mediaEnabled={mediaEnabled} snapshot={snapshot} now={viewTime} expired={expired} lock={lock} blocked={blocked} refreshRevision={refreshRevision}/>
    {snapshot?.connection !== 'NOT_CONFIGURED' && snapshot !== null && <div className="journal-stock-intro tracker-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">ติดตามหุ้นและ ETF สหรัฐ · USD</h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">Alpaca Basic · ราคา last trade จาก IEX เท่านั้น ไม่ใช่ราคาครบทุกตลาดสหรัฐ · สูงสุด 30 หลักทรัพย์</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">Watchlist ไม่ใช่รายการที่คุณถือจริง แยกจากการถือครอง ไม่รวมยอดตามรายชื่อที่ติดตาม ราคา IEX ใช้ได้เฉพาะเจ้าของ key ตามสิทธิ์เดิม ผู้ใช้ทั่วไปบันทึกต้นทุนและประวัติได้แม้ราคา N/A</p>
      <p role="status" className="mt-4 text-sm font-medium text-teal-800">{message || (snapshot ? connectionLabels[snapshot.connection] : 'กำลังตรวจการเชื่อมต่อ…')}</p>
    </div>}
    {snapshot?.connection !== 'NOT_CONFIGURED' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {snapshot?.quotes.map(quote => {
        const fresh = quote.status === 'LIVE' && quote.observedAt !== null && quote.receivedAt!==null
          && viewTime - Date.parse(quote.observedAt) >=0 && viewTime - Date.parse(quote.observedAt) <= 30_000
          && viewTime - Date.parse(quote.receivedAt)>=0 && viewTime - Date.parse(quote.receivedAt)<=30_000
        return <article key={quote.symbol} aria-label={`ราคา ${quote.symbol}`} className="tracker-card rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{quote.symbol}</h3><span className="text-xs text-slate-500">{fresh ? 'ราคาสด IEX' : quote.price ? 'ราคาเก่า / ตลาดอาจปิด' : 'ราคาไม่พร้อม'}</span></div>
          <p className="mt-3 break-all text-xl font-semibold tabular-nums">{quote.price ? money(displayDecimal(quote.price)) : 'N/A'} <span className="text-xs text-slate-400">USD</span></p>
          <p className="mt-3 text-xs leading-6 text-slate-500">เวลารายการล่าสุด: {quote.observedAt ? clock(quote.observedAt) : 'N/A'}</p>
        </article>
      })}
    </div>}
    {message && <p role="status" className="text-xs text-slate-500">การประเมินอัตโนมัติผ่าน API: {message}</p>}
    {snapshot?.connection !== 'NOT_CONFIGURED' && snapshot !== null && <p className="text-xs leading-6 text-slate-500">ราคาผ่าน backend และส่งเข้าเว็บทุก 5 วินาที · อายุรายการเกิน 30 วินาทีถือว่าเก่า · การเชื่อมต่อสำเร็จไม่ได้หมายความว่ามีการซื้อขายใหม่ตลอดเวลา · ใช้ส่วนตัวเฉพาะเจ้าของ key</p>}
  </section>
}
