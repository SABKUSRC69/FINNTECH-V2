import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, LineStyle, CrosshairMode } from 'lightweight-charts'
import { formatNumber } from '../../utils/formatters'
import { liveMarketService, mergeHistoricalCandlesWithTrades } from '../../services/liveMarketService'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D']
const EMPTY_TRADES = Object.freeze([])
const EMPTY_CANDLES = Object.freeze([])
const EMPTY_HISTORY_STATE = Object.freeze({ status: 'LOADING', candles: EMPTY_CANDLES, source: 'กำลังโหลด Bitkub historical OHLC' })
const hasRange = (range) => range && Number.isFinite(range.from) && Number.isFinite(range.to) && range.from < range.to

const captureChartView = (timeScale, candles) => {
  if (!candles.length) return null

  let logicalRange = null
  let visibleRange = null
  try { logicalRange = timeScale?.getVisibleLogicalRange?.() || null } catch {}
  try { visibleRange = timeScale?.getVisibleRange?.() || null } catch {}

  if (hasRange(logicalRange)) {
    const center = (logicalRange.from + logicalRange.to) / 2
    const anchorIndex = Math.max(0, Math.min(candles.length - 1, Math.round(center)))
    const anchorTime = candles[anchorIndex]?.time
    if (anchorTime !== undefined) {
      return {
        kind: 'logical',
        range: { from: logicalRange.from, to: logicalRange.to },
        anchorIndex,
        anchorTime,
      }
    }
  }

  // A single candle gives a degenerate time range (from === to); it cannot
  // represent the user's zoom. Use a logical range when available, otherwise
  // let the chart fit the newly loaded data.
  return hasRange(visibleRange) ? { kind: 'time', range: visibleRange } : null
}

const restoreChartView = (timeScale, snapshot, candles) => {
  if (!snapshot || !candles.length) return false
  try {
    if (snapshot.kind === 'logical') {
      const nextAnchorIndex = candles.findIndex((candle) => candle.time === snapshot.anchorTime)
      if (nextAnchorIndex < 0) return false
      const shift = nextAnchorIndex - snapshot.anchorIndex
      timeScale?.setVisibleLogicalRange?.({
        from: snapshot.range.from + shift,
        to: snapshot.range.to + shift,
      })
      return true
    }
    if (snapshot.kind === 'time') {
      timeScale?.setVisibleRange?.(snapshot.range)
      return true
    }
  } catch {}
  return false
}

export default function TradingChart({
  pair,
  recentTrades = EMPTY_TRADES,
  currentPrice = null,
  ticker = null,
  dataStatus = 'UNAVAILABLE',
  dataSource = 'Bitkub public market feed',
  dataUpdatedAt = null,
  dataTimestampType = 'received',
  tradeStatus = { status: 'UNAVAILABLE' },
  providerSymbol = null,
  tickDirection = 'none',
  limitOrders = [],
  onCancelLimitOrder,
}) {
  const [timeframe, setTimeframe] = useState('15m')
  const [ohlc, setOhlc] = useState(null)
  const [historyState, setHistoryState] = useState({ status: 'LOADING', candles: [], source: 'กำลังรอ Bitkub historical OHLC' })
  const [historyRequest, setHistoryRequest] = useState(0)
  const chartContainerRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const priceLinesRef = useRef([])
  const chartDataRef = useRef({ key: null, viewKey: null, candles: [] })
  const fittedViewRef = useRef(null)
  const retryViewRef = useRef(null)
  const quoteAsset = pair.quoteAsset || pair.symbol?.split('/')?.[1] || 'THB'
  const quotePrefix = quoteAsset === 'THB' ? '฿' : `${quoteAsset} `
  const activeLimitOrders = (limitOrders || []).filter((order) => order.symbol === pair.symbol)
  const historyMatchesView = historyState.symbol === pair.symbol && historyState.timeframe === timeframe
  const visibleHistoryState = historyMatchesView
    ? historyState
    : EMPTY_HISTORY_STATE
  const candles = useMemo(
    () => mergeHistoricalCandlesWithTrades(visibleHistoryState.candles, recentTrades, timeframe, {
      historyTo: visibleHistoryState.to,
      now: Date.now(),
    }),
    [visibleHistoryState.candles, visibleHistoryState.to, recentTrades, timeframe],
  )
  const historicalTimes = new Set((visibleHistoryState.candles || []).map((candle) => Number(candle.time)))
  const hasTradeOnlyCandles = visibleHistoryState.status === 'AVAILABLE' &&
    candles.some((candle) => !historicalTimes.has(Number(candle.time)))
  const hasCurrentPrice = Number.isFinite(Number(currentPrice)) && Number(currentPrice) > 0
  const has24hChange = ticker?.change24h !== null && ticker?.change24h !== undefined && Number.isFinite(Number(ticker.change24h))

  useEffect(() => {
    let active = true
    if (!providerSymbol) {
      setHistoryState({ status: 'UNAVAILABLE', candles: [], source: 'ไม่มี mapping จาก Bitkub /symbols', symbol: pair.symbol, timeframe })
      return () => { active = false }
    }

    setHistoryState({ status: 'LOADING', candles: [], source: 'กำลังโหลด Bitkub historical OHLC', symbol: pair.symbol, timeframe })
    liveMarketService.loadHistoricalCandles(pair.symbol, timeframe).then((result) => {
      if (active) setHistoryState({
        ...(result || { status: 'UNAVAILABLE', candles: [], source: 'Bitkub historical OHLC unavailable' }),
        symbol: pair.symbol,
        timeframe,
      })
    }).catch((error) => {
      if (active) setHistoryState({ status: 'UNAVAILABLE', candles: [], source: error?.message || 'Bitkub historical OHLC unavailable', symbol: pair.symbol, timeframe })
    })

    return () => { active = false }
  }, [pair.symbol, providerSymbol, timeframe, historyRequest])

  useEffect(() => {
    if (!chartContainerRef.current) return undefined
    const container = chartContainerRef.current
    const chart = createChart(container, {
      layout: { background: { color: '#0b0e14' }, textColor: '#94a3b8', fontSize: 11, fontFamily: 'monospace' },
      grid: { vertLines: { color: '#161e2e' }, horzLines: { color: '#161e2e' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1e2638', autoScale: true, scaleMargins: { top: 0.15, bottom: 0.15 } },
      timeScale: { borderColor: '#1e2638', timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#f43f5e', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#f43f5e',
    })
    chartInstanceRef.current = chart
    candleSeriesRef.current = candleSeries
    chart.subscribeCrosshairMove((param) => {
      if (!param?.time || !param.seriesData) return
      const bar = param.seriesData.get(candleSeries)
      if (bar) setOhlc({ open: bar.open, high: bar.high, low: bar.low, close: bar.close })
    })
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) chart.applyOptions({ width: rect.width, height: rect.height })
    })
    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartInstanceRef.current = null
      candleSeriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return
    const viewKey = `${pair.symbol}|${timeframe}`
    const key = `${viewKey}|${visibleHistoryState.status}`
    const previous = chartDataRef.current
    if (retryViewRef.current && retryViewRef.current.viewKey !== viewKey) retryViewRef.current = null
    const sameBar = (left, right) => left && right && left.time === right.time &&
      left.open === right.open && left.high === right.high && left.low === right.low && left.close === right.close
    const unchanged = previous.key === key && previous.candles.length === candles.length &&
      previous.candles.every((bar, index) => sameBar(bar, candles[index]))
    if (!unchanged) {
      const previousLast = previous.candles.at(-1)
      const nextLast = candles.at(-1)
      const barsBeforeLastUnchanged = previous.candles.slice(0, -1)
        .every((bar, index) => sameBar(bar, candles[index]))
      const updatedCurrentBar = previous.key === key && previous.candles.length === candles.length &&
        previousLast?.time === nextLast?.time && barsBeforeLastUnchanged && !sameBar(previousLast, nextLast)
      const appendedOneBar = previous.key === key && candles.length === previous.candles.length + 1 &&
        previous.candles.every((bar, index) => sameBar(bar, candles[index])) &&
        Number.isFinite(Number(previousLast?.time)) && Number(nextLast?.time) > Number(previousLast.time)

      if (updatedCurrentBar || appendedOneBar) {
        series.update(nextLast)
      } else {
        const timeScale = chartInstanceRef.current?.timeScale()
        const retryEntry = retryViewRef.current?.viewKey === viewKey
          ? retryViewRef.current
          : null
        const viewSnapshot = retryEntry
          ? retryEntry.snapshot
          : previous.viewKey === viewKey
            ? captureChartView(timeScale, previous.candles)
            : null
        series.setData(candles)
        if (candles.length) {
          const restored = viewSnapshot ? restoreChartView(timeScale, viewSnapshot, candles) : false
          if (restored) fittedViewRef.current = viewKey
          if (retryEntry && visibleHistoryState.status !== 'LOADING') {
            if (!restored && fittedViewRef.current === viewKey) fittedViewRef.current = null
            retryViewRef.current = null
          }
        } else if (retryEntry && visibleHistoryState.status !== 'LOADING') {
          retryViewRef.current = null
        }
      }
      chartDataRef.current = { key, viewKey, candles }
    }
    const latestCandle = candles.length ? candles[candles.length - 1] : null
    setOhlc((previous) => previous && latestCandle && previous.time === latestCandle.time &&
      previous.open === latestCandle.open && previous.high === latestCandle.high &&
      previous.low === latestCandle.low && previous.close === latestCandle.close
      ? previous
      : latestCandle)
  }, [candles, pair.symbol, timeframe, visibleHistoryState.status])

  useEffect(() => {
    if (visibleHistoryState.status === 'LOADING' || candles.length === 0) return
    const key = `${pair.symbol}|${timeframe}`
    if (fittedViewRef.current === key) return
    chartInstanceRef.current?.timeScale().fitContent()
    fittedViewRef.current = key
  }, [candles.length, pair.symbol, timeframe, visibleHistoryState.status])

  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return
    priceLinesRef.current.forEach((line) => {
      try { series.removePriceLine(line) } catch {}
    })
    priceLinesRef.current = []
    activeLimitOrders.forEach((order) => {
      if (!Number.isFinite(Number(order.targetPrice)) || Number(order.targetPrice) <= 0) return
      priceLinesRef.current.push(series.createPriceLine({
        price: Number(order.targetPrice), color: '#f59e0b', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true,
        title: `LIMIT ${order.side} @ ${quotePrefix}${formatNumber(order.targetPrice, pair.precision || 2)}`,
      }))
    })
    if (dataStatus === 'LIVE' && Number(ticker?.highestBid) > 0 && Number(ticker?.lowestAsk) > 0) {
      priceLinesRef.current.push(series.createPriceLine({
        price: Number(ticker.highestBid), color: '#06b6d4', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Bid ${quotePrefix}${formatNumber(ticker.highestBid, pair.precision || 2)}`,
      }))
      priceLinesRef.current.push(series.createPriceLine({
        price: Number(ticker.lowestAsk), color: '#f43f5e', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Ask ${quotePrefix}${formatNumber(ticker.lowestAsk, pair.precision || 2)}`,
      }))
    }
  }, [activeLimitOrders, dataStatus, ticker, pair.precision, quotePrefix])

  const statusStyle = dataStatus === 'LIVE'
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : dataStatus === 'STALE'
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-slate-400 border-slate-700 bg-slate-800/50'
  const latestTrade = recentTrades[0]
  const latestTradeTime = latestTrade?.timestamp
    ? new Date(latestTrade.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    : null
  const candleCoverage = candles.length
    ? `${new Date(candles[0].time * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} – ${new Date(candles[candles.length - 1].time * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`
    : null
  const historyReceivedAt = Number.isFinite(Number(visibleHistoryState.receivedAt)) && Number(visibleHistoryState.receivedAt) > 0
    ? new Date(Number(visibleHistoryState.receivedAt)).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    : null
  const candleSourceText = visibleHistoryState.status === 'AVAILABLE'
    ? `Bitkub REST /tradingview/history + ${hasTradeOnlyCandles ? 'partial OHLC จาก matched trades ใน bucket ที่ไม่มี history' : 'matched trades หลัง snapshot'} • ${candleCoverage || 'ยังไม่มีช่วงข้อมูล'}${historyReceivedAt ? ` • received ${historyReceivedAt} ICT` : ''}`
    : candles.length
      ? `แท่งจาก matched trades บางส่วน • ${candleCoverage} • history ${visibleHistoryState.status}`
      : `OHLC ${visibleHistoryState.status} • ${visibleHistoryState.source || 'ไม่มีข้อมูล'} • ไม่มี matched trades สำหรับสร้างแท่ง`

  return (
    <div className="flex flex-col h-full bg-[#0b0e14] border border-[#1e2638] rounded-3xl p-3.5 sm:p-5 shadow-2xl relative overflow-hidden font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-white text-lg">{pair.symbol}</strong>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">Spot</span>
            <span aria-label={`Ticker status ${dataStatus}`} className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${statusStyle}`}>Ticker: {dataStatus}</span>
            <span className="text-[10px] text-slate-500">ข้อมูลจาก feed เมื่อพร้อมใช้งาน / คำสั่ง PAPER</span>
          </div>
          <div className={`mt-1 flex flex-wrap items-baseline gap-2 font-mono ${tickDirection === 'down' ? 'text-rose-400' : 'text-emerald-400'}`}>
            <span className="text-xl sm:text-2xl font-extrabold">{hasCurrentPrice ? `${quotePrefix}${formatNumber(currentPrice, pair.precision || 2)}` : '—'}</span>
            <span className="text-xs text-slate-400">24h {has24hChange ? `${Number(ticker.change24h) > 0 ? '+' : ''}${Number(ticker.change24h)}%` : '—'}</span>
            <span className="text-xs text-slate-500">สูง {ticker?.high24h ? `${quotePrefix}${formatNumber(ticker.high24h, pair.precision || 2)}` : '—'}</span>
            <span className="text-xs text-slate-500">ต่ำ {ticker?.low24h ? `${quotePrefix}${formatNumber(ticker.low24h, pair.precision || 2)}` : '—'}</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Source: {dataSource || 'Bitkub public market feed'}{dataUpdatedAt ? ` • ${dataTimestampType === 'provider' ? 'provider time' : 'received'} ${new Date(dataUpdatedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} ICT` : ' • ไม่มี timestamp'}{latestTradeTime ? ` • trade time ${latestTradeTime} ICT` : ''}</div>
        </div>
        <div className="flex items-center gap-1 bg-slate-800/70 p-1 rounded-xl border border-slate-700/60 text-xs">
          {TIMEFRAMES.map((value) => (
            <button key={value} onClick={() => setTimeframe(value)} className={`px-2 py-1 rounded-lg font-medium ${timeframe === value ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}>{value}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[300px] w-full relative">
        <div ref={chartContainerRef} className="w-full h-full rounded-2xl overflow-hidden" />
        {candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e14]/80 text-center px-5 text-xs text-slate-400 pointer-events-none">
            {visibleHistoryState.status === 'LOADING'
              ? `กำลังโหลด OHLC ${timeframe} จาก Bitkub`
              : 'ยังไม่มีแท่ง OHLC หรือ matched trades ที่ตรวจสอบได้'}
          </div>
        )}
        {activeLimitOrders.length > 0 && (
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 max-w-xs">
            {activeLimitOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-950/80 text-amber-300 font-mono text-[11px]">
                <span>LIMIT {order.side} @ {quotePrefix}{formatNumber(order.targetPrice, pair.precision || 2)}</span>
                <button onClick={() => onCancelLimitOrder?.(order.id)} title="ยกเลิกคำสั่ง" className="w-5 h-5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-bold">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
        {ohlc ? (
          <div className="flex items-center gap-3">
            <span>O {quotePrefix}{formatNumber(ohlc.open, pair.precision || 2)}</span>
            <span>H {quotePrefix}{formatNumber(ohlc.high, pair.precision || 2)}</span>
            <span>L {quotePrefix}{formatNumber(ohlc.low, pair.precision || 2)}</span>
            <span>C {quotePrefix}{formatNumber(ohlc.close, pair.precision || 2)}</span>
          </div>
        ) : <span>OHLC: ยังไม่มีข้อมูล</span>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span aria-label={`Trades status ${tradeStatus?.status || 'UNAVAILABLE'}`}>Trades: {tradeStatus?.status || 'UNAVAILABLE'}</span>
          <span>{tradeStatus?.source || 'ยังไม่มี trades source'}</span>
          <span>{candleSourceText}</span>
          {providerSymbol && ['UNAVAILABLE', 'NO_DATA'].includes(visibleHistoryState.status) && (
            <button
              type="button"
              onClick={() => {
                const viewKey = `${pair.symbol}|${timeframe}`
                const previous = chartDataRef.current
                const candles = previous.viewKey === viewKey ? previous.candles : []
                const snapshot = captureChartView(chartInstanceRef.current?.timeScale(), candles)
                retryViewRef.current = { viewKey, snapshot }
                setHistoryRequest((value) => value + 1)
              }}
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >ลองโหลด history ใหม่</button>
          )}
          <span>PAPER trading</span>
        </div>
      </div>
    </div>
  )
}
