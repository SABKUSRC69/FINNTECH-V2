import { useState } from 'react'
import { STOCK_INSTRUMENTS } from '@finntech/contracts'
import { usePresentation } from '../presentation'
import StockQuote, {stockSymbols} from './StockQuote'

const exchange: Record<string, string> = { AAPL: 'NASDAQ', MSFT: 'NASDAQ', NVDA: 'NASDAQ', AMZN: 'NASDAQ', GOOGL: 'NASDAQ', TSLA: 'NASDAQ', SPY: 'AMEX', QQQ: 'NASDAQ' }

/** Provider-owned embeds; no account, shares, cost, session, or API key is sent. */
export function stockWidgetUrl(symbol: string, theme: 'light' | 'dark'): string {
  if (!STOCK_INSTRUMENTS.some(row => row.symbol === symbol) || !exchange[symbol]) throw new Error('Unsupported widget symbol')
  const config = { symbols: [[symbol, `${exchange[symbol]}:${symbol}|1D`]], colorTheme: theme,
    locale: 'en', width: '100%', height: '100%', autosize: true, chartOnly: false,
    showVolume: false, hideMarketStatus: false, hideSymbolLogo: false,
    scalePosition: 'right', scaleMode: 'Normal', valuesTracking: '1',
    changeMode: 'price-and-percent', dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D'],
    chartType: 'area', lineWidth: 2, fontSize: '10', headerFontSize: 'medium',
  }
  return `https://s.tradingview.com/embed-widget/symbol-overview/?locale=en#${encodeURIComponent(JSON.stringify(config))}`
}

export default function FreeStockPrices({refreshRevision=0}:{refreshRevision?:number}): JSX.Element {
  const { theme } = usePresentation()
  const [symbol, setSymbol] = useState('AAPL'), [revision, setRevision] = useState(0)
  const [chart, setChart] = useState(false)
  return <section aria-label="ราคาหุ้นฟรี" className="tracker-card rounded-2xl p-5 space-y-4">
    <div><h2 className="text-xl font-semibold">ราคาหุ้นและกราฟ · ฟรี</h2><p className="mt-2 text-sm leading-7 text-slate-500">เลือกหุ้นหรือ ETF เพื่อดูราคาโดยไม่ต้องรอกราฟ ไม่ต้องสมัครบริการหรือใส่ API key</p></div>
    <div className="journal-stock-picker flex flex-wrap gap-2" aria-label="เลือกหุ้นที่ดูราคา">{STOCK_INSTRUMENTS.map(row => <button key={row.symbol} type="button" className="auth-secondary" aria-pressed={symbol === row.symbol} onClick={() => setSymbol(row.symbol)}>{row.symbol}</button>)}</div>
    <StockQuote expression={stockSymbols[symbol]!} title={`ราคาหุ้น ${symbol} โดย TradingView`} revision={revision+refreshRevision}/>
    <button type="button" className="auth-secondary" aria-expanded={chart} onClick={()=>setChart(value=>!value)}>{chart?'ปิดกราฟราคา':'ดูกราฟราคา'}</button>
    {chart && <div className="journal-stock-widget"><iframe key={`${symbol}-${theme}-${revision}-${refreshRevision}`} title={`ราคาและกราฟหุ้น ${symbol} โดย TradingView`} src={stockWidgetUrl(symbol, theme)} width="100%" height="100%" referrerPolicy="no-referrer" loading="eager" /></div>}
    <p className="text-xs leading-6 text-slate-500"><a href={`https://www.tradingview.com/symbols/${exchange[symbol]}-${symbol}/`} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">{symbol} โดย TradingView</a> · ราคาอาจหน่วงเวลาตามตลาด ดูสถานะที่กราฟ · เมื่อตลาดปิดจะแสดงราคาล่าสุด</p>
    <div className="flex flex-wrap items-center gap-3"><button type="button" className="auth-secondary" onClick={() => setRevision(value => value + 1)}>โหลดราคาอีกครั้ง</button><p className="text-xs text-slate-500">ถ้าราคาหรือกราฟไม่ขึ้น ใช้ลิงก์ TradingView ด้านบนได้</p></div>
    <p className="text-xs leading-6 text-slate-500">ราคานี้แสดงจากผู้ให้ข้อมูลโดยตรง และยังไม่ส่งตัวเลขกลับมาคำนวณยอดรวมในเว็บ เลือกพอร์ตหุ้นด้านล่างแล้วเปิดกราฟฟรีเพื่อดูมูลค่าและกำไร/ขาดทุนจากจำนวนที่ถือได้</p>
  </section>
}
