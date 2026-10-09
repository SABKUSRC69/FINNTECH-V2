import React, { useState } from 'react'
import { formatNumber } from '../../utils/formatters'

function statusName(status) {
  return status?.status || 'UNAVAILABLE'
}

function emptyMessage(status, label) {
  if (statusName(status) === 'STALE') return `ข้อมูล ${label} ล่าสุดเก่า รอการอัปเดตจาก Bitkub`
  if (statusName(status) === 'LIVE') return `ยังไม่มีข้อมูล ${label} ใน snapshot ล่าสุด`
  return `ยังไม่มีข้อมูล ${label} จาก Bitkub`
}

function tickerMessage(status) {
  const name = statusName(status)
  if (name === 'LIVE') return 'สถานะราคา ticker: LIVE • ราคาจาก feed'
  if (name === 'STALE') return 'สถานะราคา ticker: STALE • ราคาที่แสดงไม่ใช่ราคาสด'
  if (name === 'DEMO') return 'สถานะราคา ticker: DEMO • ราคาอ้างอิงจำลอง'
  return `สถานะราคา ticker: ${name} • ไม่มีราคาที่พร้อมยืนยัน`
}

export default function OrderBook({
  currentPrice = null,
  orderBook = { asks: [], bids: [] },
  recentTrades = [],
  pair = {},
  bookStatus = { status: 'UNAVAILABLE' },
  tradeStatus = { status: 'UNAVAILABLE' },
  tickerStatus = { status: 'UNAVAILABLE' },
  orderRulesVerified = false,
}) {
  const [activeTab, setActiveTab] = useState('book')
  const baseAsset = pair.baseAsset || pair.symbol?.split('/')[0] || 'BTC'
  const quoteAsset = pair.quoteAsset || pair.symbol?.split('/')[1] || 'THB'
  const asks = Array.isArray(orderBook.asks) ? orderBook.asks.slice(0, 6).reverse() : []
  const bids = Array.isArray(orderBook.bids) ? orderBook.bids.slice(0, 6) : []
  const maxTotal = Math.max(...asks.map((item) => item.total), ...bids.map((item) => item.total), 1)
  const quotePrefix = quoteAsset === 'THB' ? '฿' : `${quoteAsset} `
  const tickerState = statusName(tickerStatus)
  const hasDisplayPrice = ['LIVE', 'STALE', 'DEMO'].includes(tickerState)
    && Number.isFinite(Number(currentPrice))
    && Number(currentPrice) > 0
  const paperOrderStatus = orderRulesVerified === true
    ? 'คำสั่ง PAPER • จำลองเท่านั้น'
    : 'คำสั่ง PAPER พักอยู่'

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0c1017] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 shadow-sm text-xs font-mono">
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 mb-2.5">
        <button onClick={() => setActiveTab('book')} title={bookStatus?.source} className={`flex-1 py-1 rounded-md text-xs font-semibold ${activeTab === 'book' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}>
          Order Book ({statusName(bookStatus)})
        </button>
        <button onClick={() => setActiveTab('trades')} title={tradeStatus?.source} className={`flex-1 py-1 rounded-md text-xs font-semibold ${activeTab === 'trades' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}>
          Trades ({statusName(tradeStatus)})
        </button>
      </div>

      {activeTab === 'book' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-3 text-[10px] text-slate-500 font-semibold mb-1 px-1">
            <span>ราคา ({quoteAsset})</span><span className="text-right">จำนวน ({baseAsset})</span><span className="text-right">สะสม</span>
          </div>
          <div className="space-y-0.5 overflow-hidden min-h-[90px]">
            {asks.length === 0 ? <p className="py-7 text-center text-slate-500 text-[10px]">{emptyMessage(bookStatus, 'Order Book')}</p> : asks.map((ask, idx) => (
              <div key={`ask-${ask.price}-${idx}`} className="grid grid-cols-3 py-0.5 px-1 relative text-[11px] items-center rounded">
                <div className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none rounded" style={{ width: `${(ask.total / maxTotal) * 100}%` }} />
                <span className="text-rose-400 font-semibold relative z-10">{quotePrefix}{formatNumber(ask.price, pair.precision || 2)}</span>
                <span className="text-right text-slate-300 relative z-10">{formatNumber(ask.size, pair.amountPrecision || 4)}</span>
                <span className="text-right text-slate-500 relative z-10">{formatNumber(ask.total, pair.amountPrecision || 4)}</span>
              </div>
            ))}
          </div>
          <div className="py-2 my-1 px-3 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 rounded-xl">
            <div className="flex flex-col">
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-emerald-400">{hasDisplayPrice ? `${quotePrefix}${formatNumber(currentPrice, pair.precision || 2)}` : '—'}</span>
              <span className="text-[9px] text-slate-400">{tickerMessage(tickerStatus)}</span>
              <span className="text-[9px] text-slate-400">{paperOrderStatus}</span>
            </div>
            <span className="text-[10px] text-slate-500">Spread: {asks.length && bids.length ? formatNumber(asks[0].price - bids[0].price, pair.precision || 2) : '—'}</span>
          </div>
          <div className="space-y-0.5 overflow-hidden min-h-[90px]">
            {bids.length === 0 ? <p className="py-7 text-center text-slate-500 text-[10px]">{emptyMessage(bookStatus, 'Order Book')}</p> : bids.map((bid, idx) => (
              <div key={`bid-${bid.price}-${idx}`} className="grid grid-cols-3 py-0.5 px-1 relative text-[11px] items-center rounded">
                <div className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none rounded" style={{ width: `${(bid.total / maxTotal) * 100}%` }} />
                <span className="text-emerald-400 font-semibold relative z-10">{quotePrefix}{formatNumber(bid.price, pair.precision || 2)}</span>
                <span className="text-right text-slate-300 relative z-10">{formatNumber(bid.size, pair.amountPrecision || 4)}</span>
                <span className="text-right text-slate-500 relative z-10">{formatNumber(bid.total, pair.amountPrecision || 4)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-3 text-[10px] text-slate-500 font-semibold mb-2 px-1">
            <span>ราคา ({quoteAsset})</span><span className="text-right">จำนวน ({baseAsset})</span><span className="text-right">เวลา ICT</span>
          </div>
          <div className="space-y-1 overflow-y-auto pr-1">
            {recentTrades.length === 0 && <p className="py-8 text-center text-slate-500 text-[11px]">{emptyMessage(tradeStatus, 'trades')}</p>}
            {recentTrades.map((trade) => (
              <div key={trade.id} className="grid grid-cols-3 py-1 px-1 text-[11px] items-center rounded">
                <span className={`font-semibold ${trade.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{quotePrefix}{formatNumber(trade.price, pair.precision || 2)}</span>
                <span className="text-right text-slate-300 font-medium">{formatNumber(trade.amount, pair.amountPrecision || 4)}</span>
                <span className="text-right text-slate-500">{trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false }) : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 pt-1 border-t border-slate-200 dark:border-slate-800 text-[9px] text-slate-500 flex flex-col gap-1">
        {(() => {
          const status = activeTab === 'book' ? bookStatus : tradeStatus
          const time = status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ไม่มี timestamp'
          return <span title={status?.source}>{status?.source || 'Bitkub public feed'} • {status?.timestampType === 'provider' ? 'provider time' : 'received'} {time} ICT</span>
        })()}
        <span>{paperOrderStatus}</span>
      </div>
    </div>
  )
}
