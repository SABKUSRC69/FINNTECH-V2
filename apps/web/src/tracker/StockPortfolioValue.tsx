import { useState } from 'react'
import { parseCryptoDecimal, serializeCrypto } from '@finntech/finance'
import { usePresentation } from '../presentation'
import StockQuote, {stockSymbols,validateStockExpression} from './StockQuote'

const instruments = stockSymbols
type Holdings = readonly { symbol: string; quantity: string; totalCost: string | null }[]

export function stockPortfolioFormula(holdings: Holdings): { value: string; unrealized: string | null } | null {
  try {
    const quantities = new Map<string, ReturnType<typeof parseCryptoDecimal>>()
    let cost = parseCryptoDecimal('0'), knownCost = true
    for (const row of holdings) {
      const quantity = parseCryptoDecimal(row.quantity)
      if (quantity.isZero()) continue
      if (!quantity.gt('0') || !instruments[row.symbol]) return null
      quantities.set(row.symbol, (quantities.get(row.symbol) ?? parseCryptoDecimal('0')).plus(quantity))
      if (row.totalCost === null) knownCost = false
      else { const amount = parseCryptoDecimal(row.totalCost); if (amount.lt('0')) return null; cost = cost.plus(amount) }
    }
    if (!quantities.size || quantities.size > 8) return null
    const value = [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([symbol, quantity]) => `${instruments[symbol]}*${serializeCrypto(quantity)}`).join('+')
    const unrealized = knownCost ? `${value}-${serializeCrypto(cost)}` : null
    if (value.length > 1024 || (unrealized?.length ?? 0) > 1024) return null
    return { value, unrealized }
  } catch { return null }
}

export function portfolioWidgetUrl(expression: string, theme: 'light' | 'dark'): string {
  // Only the validated catalog and canonical decimal operands can enter a provider expression.
  validateStockExpression(expression)
  const config = { symbols: [['Portfolio USD', `${expression}|1D`]], colorTheme: theme, locale: 'en',
    autosize: true, width: '100%', height: '100%', chartOnly: false, hideMarketStatus: false,
    hideSymbolLogo: true, showVolume: false, changeMode: 'price-and-percent',
    dateRanges: ['1m|1D', '3m|1D', '12m|1D'], chartType: 'area', lineWidth: 2,
  }
  return `https://s.tradingview.com/embed-widget/symbol-overview/?locale=en#${encodeURIComponent(JSON.stringify(config))}`
}

/** Opt-in covers updated quantities/costs in this mounted portfolio until closed. */
export default function StockPortfolioValue({ holdings }: { holdings: Holdings }): JSX.Element | null {
  const { theme, hidden } = usePresentation()
  const formula = stockPortfolioFormula(holdings)
  const [approved, setApproved] = useState(false), [mode, setMode] = useState<'value' | 'unrealized'>('value')
  const [chart,setChart]=useState(false)
  if (!formula) return null
  const expression = mode === 'unrealized' && formula.unrealized ? formula.unrealized : formula.value
  const ready = approved
  return <section className="mt-5 rounded-xl border border-slate-200 p-4 space-y-3" aria-label="มูลค่าพอร์ตหุ้นจากกราฟฟรี">
    <h3 className="font-semibold">มูลค่าและกำไร/ขาดทุนพอร์ต · กราฟฟรี</h3>
    <p className="text-sm leading-7">คำนวณจากจำนวนหุ้นที่คุณบันทึก × ราคาใน TradingView ส่วนกำไร/ขาดทุนยังไม่รับรู้หักต้นทุนคงเหลือรวมค่าธรรมเนียม ราคาหุ้นอาจหน่วงเวลา ดูสถานะในกราฟ</p>
    {!ready ? <><p className="text-sm leading-7">เมื่อเปิดกราฟ จะส่งเฉพาะสัญลักษณ์ จำนวนหุ้น และต้นทุนรวมไปให้ TradingView เพื่อคำนวณ และส่งค่าที่เปลี่ยนหลังบันทึกซื้อ/ขายอัตโนมัติขณะเปิดกราฟนี้ ไม่มีชื่อบัญชี ประวัติรายการ หรือข้อมูลเข้าสู่ระบบ ปิดกราฟหรือเปลี่ยนพอร์ตเพื่อหยุดการส่ง</p><button className="auth-primary" type="button" disabled={hidden} onClick={() => setApproved(true)}>ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ</button></> : <>
      <div className="journal-stock-picker flex flex-wrap gap-2"><button type="button" className="auth-secondary" aria-pressed={mode === 'value'} onClick={() => setMode('value')}>มูลค่าพอร์ต USD</button><button type="button" className="auth-secondary" disabled={!formula.unrealized} aria-pressed={mode === 'unrealized'} onClick={() => setMode('unrealized')}>กำไร/ขาดทุนยังไม่รับรู้ USD</button><button type="button" className="auth-secondary" onClick={() => setApproved(false)}>ปิดกราฟพอร์ต</button></div>
      {hidden ? <p>ซ่อนยอดเงินแล้ว · กราฟมูลค่าพอร์ตถูกซ่อนด้วย</p> : <><StockQuote expression={expression} title={`${mode === 'value' ? 'มูลค่าพอร์ตหุ้น' : 'กำไรขาดทุนพอร์ตหุ้น'} USD โดย TradingView`}/><button type="button" className="auth-secondary" aria-expanded={chart} onClick={()=>setChart(value=>!value)}>{chart?'ซ่อนกราฟย้อนหลังพอร์ต':'ดูกราฟย้อนหลังพอร์ต'}</button>{chart && <div className="journal-stock-widget"><iframe key={`${expression}-${theme}`} title={`กราฟ${mode === 'value' ? 'มูลค่าพอร์ตหุ้น' : 'กำไรขาดทุนพอร์ตหุ้น'} USD`} src={portfolioWidgetUrl(expression, theme)} width="100%" height="100%" referrerPolicy="no-referrer" /></div>}</>}
      <p className="text-xs">อัปเดตจำนวนและต้นทุนหลังบันทึกอัตโนมัติ · ราคายังขึ้นกับผู้ให้บริการ หากกล่องว่าง ลองปิดแล้วเปิดใหม่ · ปิดกราฟพอร์ตเพื่อหยุดการส่ง</p>
      <p className="text-xs"><a className="text-teal-700 underline" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">กราฟโดย TradingView</a> · ตัวเลขประเมินตามข้อมูลของผู้ให้บริการ ไม่เปลี่ยนยอดในบัญชี</p>
    </>}
    <p className="text-xs leading-6 text-slate-500">กราฟย้อนหลังใช้จำนวนที่ถือวันนี้ตลอดช่วง ไม่ใช่ประวัติมูลค่าพอร์ตจริง เปอร์เซ็นต์ในกราฟเป็นการเปลี่ยนแปลงของกราฟตามช่วงเวลา ไม่ใช่ผลตอบแทนเทียบต้นทุน · ไม่ดึงยอดจากกราฟมารวมในสินทรัพย์เทียบบาท ยอดรวมใช้ราคา/อัตราอ้างอิงของคุณในหน้าสินทรัพย์รวม</p>
  </section>
}
