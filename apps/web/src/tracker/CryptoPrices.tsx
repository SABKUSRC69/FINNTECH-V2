import type { MarketSnapshot } from '@finntech/contracts'
import { displayDecimal } from './client'
import { isFreshCryptoQuote } from './marketFreshness'

const assets = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA']
const names: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', BNB: 'BNB', DOGE: 'Dogecoin', ADA: 'Cardano' }
const clock = (value: string) => new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })

/** Public reference prices are visible even before an owner creates a portfolio. */
export default function CryptoPrices({ market, now }: { market: MarketSnapshot; now: number }): JSX.Element {
  return <section className="tracker-card rounded-2xl p-5 space-y-4" aria-label="ราคาคริปโตแต่ละเหรียญ">
    <div><h3 className="text-lg font-semibold">ราคาคริปโตวันนี้</h3><p className="mt-2 text-sm text-slate-500">ดูราคาได้ทันที ไม่ต้องสร้างพอร์ต · Binance · ราคาต่อ 1 เหรียญเป็น USDT</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{assets.map(asset => {
      const quote = market.quotes.find(row => row.asset === asset), fresh = isFreshCryptoQuote(quote, now)
      return <article key={asset} aria-label={`ราคาคริปโต ${asset}`} className="rounded-xl border border-slate-200 p-4 min-w-0">
        <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{asset}</p><p className="text-xs text-slate-500">{names[asset]}</p></div><span className={`text-xs ${fresh ? 'text-teal-700' : 'text-slate-500'}`}>{fresh ? quote?.kind === 'TRADE' ? 'ราคาสด' : 'ราคาที่ดึงล่าสุด' : quote?.price ? 'ราคาเก่า' : 'กำลังรอราคา'}</span></div>
        <p className="mt-3 break-all text-xl font-semibold tabular-nums">{quote?.price ? displayDecimal(quote.price) : '—'} <span className="text-xs text-slate-500">USDT</span></p>
        <p className="mt-2 text-xs text-slate-500">{quote?.receivedAt ? `รับล่าสุด ${clock(quote.receivedAt)}` : 'กำลังเชื่อมต่อข้อมูลตลาด…'}</p>
      </article>
    })}</div>
    <p className="text-xs leading-6 text-slate-500">ราคาอัปเดตอัตโนมัติ เมื่อบันทึกจำนวนที่ถือ มูลค่าและกำไร/ขาดทุนคริปโตจะเปลี่ยนตามราคา · ราคาเกิน 30 วินาทีไม่ใช้ประเมินมูลค่าปัจจุบัน</p>
  </section>
}
