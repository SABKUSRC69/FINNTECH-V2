import { usePresentation } from '../presentation'

export const stockSymbols: Record<string, string> = { AAPL: 'NASDAQ:AAPL', MSFT: 'NASDAQ:MSFT', NVDA: 'NASDAQ:NVDA', AMZN: 'NASDAQ:AMZN', GOOGL: 'NASDAQ:GOOGL', TSLA: 'NASDAQ:TSLA', SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ' }
export function validateStockExpression(expression: string): void {
  if (!/^(?:NASDAQ:(?:AAPL|MSFT|NVDA|AMZN|GOOGL|TSLA|QQQ)|AMEX:SPY)(?:\*\d+(?:\.\d+)?)?(?:\+(?:NASDAQ:(?:AAPL|MSFT|NVDA|AMZN|GOOGL|TSLA|QQQ)|AMEX:SPY)\*\d+(?:\.\d+)?)*(?:-\d+(?:\.\d+)?)?$/.test(expression) || expression.length > 1024) throw new Error('Invalid stock expression')
}
export function quoteWidgetUrl(expression: string, theme: 'light' | 'dark'): string {
  validateStockExpression(expression)
  return `https://s.tradingview.com/embed-widget/single-quote/?locale=en#${encodeURIComponent(JSON.stringify({symbol:expression,colorTheme:theme,locale:'en',width:'100%',height:101,isTransparent:false}))}`
}
/** No chart/history download. Formula callers must obtain portfolio consent first. */
export default function StockQuote({expression,title,revision=0}:{expression:string;title:string;revision?:number}):JSX.Element {
  const {theme}=usePresentation()
  return <div className="journal-stock-quote"><iframe key={`${expression}-${theme}-${revision}`} title={title} src={quoteWidgetUrl(expression,theme)} width="100%" height="101" loading="eager" referrerPolicy="no-referrer" /></div>
}
