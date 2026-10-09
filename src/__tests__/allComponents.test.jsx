import React from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const chartHarness = vi.hoisted(() => ({
  instances: [],
  fitContent: vi.fn(),
  setData: vi.fn(),
  update: vi.fn(),
  visibleRange: null,
  setVisibleRange: vi.fn(),
  visibleLogicalRange: null,
  setVisibleLogicalRange: vi.fn((range) => { chartHarness.visibleLogicalRange = range }),
  getVisibleRange: vi.fn((data) => {
    if (!data?.length) return null
    if (data.length === 1) return { from: data[0].time, to: data[0].time }
    return chartHarness.visibleRange
  }),
  getVisibleLogicalRange: vi.fn((data) => data?.length ? chartHarness.visibleLogicalRange : null),
}))

// Mock ResizeObserver for happy-dom
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Mock lightweight-charts to prevent canvas/DOM parser errors in happy-dom
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => {
    const series = {
      data: [],
      setData: vi.fn((data) => {
        series.data = data.map((bar) => ({ ...bar }))
        chartHarness.setData(data)
      }),
      update: vi.fn((bar) => {
        chartHarness.update(bar)
        const lastIndex = series.data.length - 1
        const last = series.data[lastIndex]
        if (!last || bar.time > last.time) series.data.push({ ...bar })
        else if (bar.time === last.time) series.data[lastIndex] = { ...bar }
        else throw new Error('Cannot update chart series with an older time')
      }),
      createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
      removePriceLine: vi.fn(),
    }
    const chart = {
      applyOptions: vi.fn(),
      addSeries: vi.fn(() => series),
      removeSeries: vi.fn(),
      timeScale: vi.fn(() => ({
        fitContent: chartHarness.fitContent,
        getVisibleRange: () => chartHarness.getVisibleRange(series.data),
        getVisibleLogicalRange: () => chartHarness.getVisibleLogicalRange(series.data),
        setVisibleRange: chartHarness.setVisibleRange,
        setVisibleLogicalRange: chartHarness.setVisibleLogicalRange,
      })),
      subscribeCrosshairMove: vi.fn(),
      unsubscribeCrosshairMove: vi.fn(),
      remove: vi.fn(),
    }
    chartHarness.instances.push({ chart, series })
    return chart
  }),
  CandlestickSeries: 'CandlestickSeries',
  LineStyle: { Dashed: 1, Solid: 0 },
  CrosshairMode: { Normal: 0 },
}))

// Mock recharts ResponsiveContainer
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div style={{ width: 500, height: 300 }}>{children}</div>,
  }
})

import App from '../App'
import forexFactoryService from '../services/forexFactoryService'
import liveMarketService from '../services/liveMarketService'
import DashboardView from '../components/dashboard/DashboardView'
import TradingTerminal from '../components/trading/TradingTerminal'
import OrderBook from '../components/trading/OrderBook'
import TransactionManager from '../components/transactions/TransactionManager'
import CalculatorsView from '../components/calculators/CalculatorsView'
import PortfolioView from '../components/portfolio/PortfolioView'
import ForexNewsView from '../components/news/ForexNewsView'
import TradingChart from '../components/trading/TradingChart'
import TradingViewSignalModal from '../components/trading/TradingViewSignalModal'
import PriceAlertModal from '../components/trading/PriceAlertModal'
import SpotDepositModal from '../components/trading/SpotDepositModal'
import SpotWithdrawModal from '../components/trading/SpotWithdrawModal'
import ErrorBoundary from '../components/common/ErrorBoundary'
import authService from '../services/authService'
import { ZERO_SPOT_BALANCES } from '../services/spotTradingService'
import legacyPortfolio560fb4f from './fixtures/portfolio-560fb4f.json'

function makeAccountSnapshot(balance, note) {
  return {
    balance,
    spotBalances: { ...ZERO_SPOT_BALANCES, THB: balance },
    transactions: [{
      id: `tx-${note}`,
      date: '2026-09-20',
      type: 'income',
      category: 'salary',
      categoryName: 'Salary',
      amount: 10,
      note,
    }],
    portfolio: [],
    openOrders: [],
    tradeHistory: [],
    cancelledOrderIds: [],
    priceAlerts: [],
    positions: [],
  }
}

describe('All Components Smoke & Render Test', () => {
  beforeEach(() => {
    chartHarness.instances.length = 0
    chartHarness.fitContent.mockClear()
    chartHarness.setData.mockClear()
    chartHarness.update.mockClear()
    chartHarness.visibleRange = null
    chartHarness.visibleLogicalRange = null
    chartHarness.setVisibleRange.mockClear()
    chartHarness.setVisibleLogicalRange.mockClear()
    chartHarness.getVisibleRange.mockClear()
    chartHarness.getVisibleLogicalRange.mockClear()
    chartHarness.setVisibleRange.mockImplementation((range) => { chartHarness.visibleRange = range })
    localStorage.clear()
    if (typeof window.confirm !== 'function') {
      Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: () => false })
    }
    if (typeof window.alert !== 'function') {
      Object.defineProperty(window, 'alert', { configurable: true, writable: true, value: () => {} })
    }
    vi.spyOn(liveMarketService, 'init').mockResolvedValue(false)
  })

  afterEach(() => vi.restoreAllMocks())

  it('Root App renders successfully', () => {
    expect(() => {
      render(<App />)
    }).not.toThrow()
  })

  it('passes and displays ticker and trade-feed statuses independently in the real terminal chart', async () => {
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockResolvedValue({
      status: 'UNAVAILABLE', candles: [], source: 'history unavailable in this test',
    })
    const makeSnapshot = (tickerStatus, tradesStatus) => ({
      prices: { 'BTC/THB': 100 },
      tickers: { 'BTC/THB': { last: 100, change24h: null, high24h: null, low24h: null } },
      symbolStatuses: { 'BTC/THB': { status: tickerStatus, source: 'ticker fixture', lastUpdated: null } },
      tradeStatuses: { 'BTC/THB': { status: tradesStatus, source: 'trade fixture', lastUpdated: null } },
      orderBooks: { 'BTC/THB': { asks: [], bids: [] } },
      bookStatuses: { 'BTC/THB': { status: 'UNAVAILABLE', source: 'book fixture' } },
      recentTrades: { 'BTC/THB': [{ id: 'trade-1', timestamp: Date.now(), price: 100, amount: 0.01, side: 'BUY' }] },
      symbolMappings: { 'BTC/THB': { providerSymbol: 'BTC_THB' } },
    })
    const props = { marketSnapshot: makeSnapshot('LIVE', 'STALE'), spotBalances: { ...ZERO_SPOT_BALANCES, THB: 500000 }, openOrders: [], tradeHistory: [] }
    const view = render(<TradingTerminal {...props} />)

    expect(await screen.findByLabelText('Ticker status LIVE')).toBeDefined()
    expect(screen.getByLabelText('Trades status STALE')).toBeDefined()
    expect(screen.getByText('trade fixture')).toBeDefined()
    expect(screen.getByText('สถานะราคา ticker: LIVE • ราคาจาก feed')).toBeDefined()
    expect(screen.getAllByText('คำสั่ง PAPER พักอยู่', { exact: true }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/แท่งจาก matched trades บางส่วน/)).toBeDefined()

    view.rerender(<TradingTerminal {...props} marketSnapshot={makeSnapshot('STALE', 'LIVE')} />)
    expect(await screen.findByLabelText('Ticker status STALE')).toBeDefined()
    expect(screen.getByLabelText('Trades status LIVE')).toBeDefined()
    expect(screen.getByText('สถานะราคา ticker: STALE • ราคาที่แสดงไม่ใช่ราคาสด')).toBeDefined()
  })

  it('keeps OrderBook ticker and paused PAPER status separate and consistent in its footer', () => {
    render(
      <OrderBook
        currentPrice={100}
        pair={{ symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2, amountPrecision: 8 }}
        orderBook={{ asks: [], bids: [] }}
        bookStatus={{ status: 'LIVE', source: 'book fixture' }}
        tradeStatus={{ status: 'UNAVAILABLE', source: 'trades fixture' }}
        tickerStatus={{ status: 'STALE', source: 'ticker fixture' }}
        orderRulesVerified={false}
      />,
    )

    expect(screen.getByText('สถานะราคา ticker: STALE • ราคาที่แสดงไม่ใช่ราคาสด')).toBeDefined()
    expect(screen.getAllByText('คำสั่ง PAPER พักอยู่', { exact: true })).toHaveLength(2)
    expect(screen.queryByText(/PAPER execution/i)).toBeNull()
    expect(screen.queryByText('Paper trading')).toBeNull()
  })

  it('labels verified PAPER orders as simulated in both the price panel and footer', () => {
    render(
      <OrderBook
        currentPrice={100}
        pair={{ symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2, amountPrecision: 8 }}
        orderBook={{ asks: [], bids: [] }}
        bookStatus={{ status: 'LIVE', source: 'book fixture' }}
        tradeStatus={{ status: 'UNAVAILABLE', source: 'trades fixture' }}
        tickerStatus={{ status: 'LIVE', source: 'ticker fixture' }}
        orderRulesVerified
      />,
    )

    expect(screen.getByText('สถานะราคา ticker: LIVE • ราคาจาก feed')).toBeDefined()
    expect(screen.getAllByText('คำสั่ง PAPER • จำลองเท่านั้น', { exact: true })).toHaveLength(2)
    expect(screen.queryByText('Paper trading')).toBeNull()
  })

  it('disables mobile PAPER Buy/Sell until pair rules are verified while keeping demo deposit and alerts available', async () => {
    const reason = 'ยังยืนยัน quantity_step ของ Bitkub ไม่ได้ จึงพักคำสั่ง PAPER'
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockResolvedValue({
      status: 'UNAVAILABLE', candles: [], source: 'history unavailable in this test',
    })
    const marketSnapshot = {
      prices: { 'BTC/THB': 100 },
      tickers: { 'BTC/THB': { last: 100, change24h: null, high24h: null, low24h: null } },
      symbolStatuses: { 'BTC/THB': { status: 'LIVE', source: 'ticker fixture', lastUpdated: Date.now() } },
      tradeStatuses: { 'BTC/THB': { status: 'UNAVAILABLE', source: 'trades fixture', lastUpdated: null } },
      orderBooks: { 'BTC/THB': { asks: [], bids: [] } },
      bookStatuses: { 'BTC/THB': { status: 'UNAVAILABLE', source: 'book fixture' } },
      recentTrades: { 'BTC/THB': [] },
      symbolMappings: {
        'BTC/THB': { providerSymbol: 'BTC_THB', orderRulesVerified: false, orderRulesReason: reason },
      },
    }

    render(
      <TradingTerminal
        marketSnapshot={marketSnapshot}
        spotBalances={{ ...ZERO_SPOT_BALANCES, THB: 500000 }}
        openOrders={[]}
        tradeHistory={[]}
      />,
    )

    expect(await screen.findByText(/history unavailable in this test/)).toBeDefined()
    const buyButton = screen.getByRole('button', { name: 'ซื้อ PAPER' })
    const sellButton = screen.getByRole('button', { name: 'ขาย PAPER' })
    expect(buyButton.disabled).toBe(true)
    expect(sellButton.disabled).toBe(true)
    expect(screen.getByText(`คำสั่ง PAPER พักอยู่: ${reason}`)).toBeDefined()
    expect(screen.getByText('ไม่มีคำสั่งรอจับคู่ในขณะนี้ — คำสั่ง PAPER พักอยู่ จึงยังตั้ง Limit ใหม่ไม่ได้')).toBeDefined()
    expect(screen.getAllByText('ฟีดราคา LIVE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('คำสั่ง PAPER พักอยู่', { exact: true }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/PAPER execution/i)).toBeNull()

    expect(screen.getAllByTitle('ฝากเงิน QR').every((button) => !button.disabled)).toBe(true)
    expect(screen.getAllByTitle('ตั้งเตือนราคา').every((button) => !button.disabled)).toBe(true)

    fireEvent.click(buyButton)
    fireEvent.click(sellButton)
    expect(screen.queryByText('คำสั่ง Spot PAPER / DEMO')).toBeNull()
  })

  it('retries failed history and ignores responses from an old pair or timeframe', async () => {
    const requests = []
    const now = Date.now()
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockImplementation((symbol, timeframe) => new Promise((resolve) => {
      requests.push({ symbol, timeframe, resolve })
    }))
    const btc = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const eth = { symbol: 'ETH/THB', baseAsset: 'ETH', quoteAsset: 'THB', precision: 2 }
    const recentTrades = [{ id: 'partial-before-switch', timestamp: now, price: 10, amount: 1, side: 'BUY' }]
    const view = render(<TradingChart pair={btc} providerSymbol="BTC_THB" recentTrades={recentTrades} />)
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toMatchObject({ symbol: 'BTC/THB', timeframe: '15m' })

    await act(async () => requests[0].resolve({ status: 'UNAVAILABLE', candles: [], source: 'network unavailable' }))
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(1))
    chartHarness.visibleLogicalRange = { from: -2, to: 3 }
    fireEvent.click(await screen.findByRole('button', { name: 'ลองโหลด history ใหม่' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    await waitFor(() => expect(chartHarness.setVisibleLogicalRange).toHaveBeenCalled())
    chartHarness.setVisibleLogicalRange.mockClear()
    expect(requests[1]).toMatchObject({ symbol: 'BTC/THB', timeframe: '15m' })

    fireEvent.click(screen.getByRole('button', { name: '1h' }))
    await waitFor(() => expect(requests).toHaveLength(3))
    expect(requests[2]).toMatchObject({ symbol: 'BTC/THB', timeframe: '1h' })
    await act(async () => requests[1].resolve({
      status: 'AVAILABLE', to: 20_000, receivedAt: 20_000_000,
      candles: [{ time: 18_000, open: 1, high: 1, low: 1, close: 1 }],
    }))

    view.rerender(<TradingChart pair={eth} providerSymbol="ETH_THB" />)
    await waitFor(() => expect(requests).toHaveLength(4))
    expect(requests[3]).toMatchObject({ symbol: 'ETH/THB', timeframe: '1h' })
    await act(async () => requests[2].resolve({
      status: 'AVAILABLE', to: 30_000, receivedAt: 30_000_000,
      candles: [{ time: 25_200, open: 2, high: 2, low: 2, close: 2 }],
    }))
    await act(async () => requests[3].resolve({
      status: 'AVAILABLE', to: 40_000, receivedAt: 40_000_000,
      candles: [{ time: 36_000, open: 3, high: 4, low: 2, close: 3.5 }],
    }))

    await waitFor(() => expect(chartHarness.setData.mock.calls.some(([bars]) => bars?.[0]?.open === 3)).toBe(true))
    const populatedDatasets = chartHarness.setData.mock.calls.map(([bars]) => bars).filter((bars) => bars?.length)
    expect(populatedDatasets.at(-1)).toEqual([{ time: 36_000, open: 3, high: 4, low: 2, close: 3.5 }])
    expect(populatedDatasets.flat().some((bar) => bar.open === 1 || bar.open === 2)).toBe(false)
    expect(chartHarness.fitContent).toHaveBeenCalledTimes(2)
    expect(chartHarness.setVisibleLogicalRange).not.toHaveBeenCalled()
  })

  it('updates a proven-new current trade without refitting the user zoom', async () => {
    const now = Date.now()
    const bucket = Math.floor((now / 1000) / 900) * 900
    const historyTo = Math.floor(now / 1000) - 10
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockResolvedValue({
      status: 'AVAILABLE',
      to: historyTo,
      receivedAt: now,
      candles: [{ time: bucket, open: 100, high: 105, low: 95, close: 101 }],
    })
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const props = { pair, providerSymbol: 'BTC_THB' }
    const view = render(<TradingChart {...props} />)
    await waitFor(() => expect(chartHarness.fitContent).toHaveBeenCalledTimes(1))
    chartHarness.fitContent.mockClear()

    const newTrade = { id: 'new-current-trade', timestamp: Date.now(), price: 110, amount: 0.01, side: 'BUY' }
    view.rerender(<TradingChart {...props} recentTrades={[newTrade]} />)
    await waitFor(() => expect(chartHarness.update).toHaveBeenCalledWith({
      time: bucket, open: 100, high: 110, low: 95, close: 110,
    }))
    expect(chartHarness.fitContent).not.toHaveBeenCalled()
  })

  it('loads every missing bar into the chart series when history grows from one to three bars', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const currentBucket = Math.floor(nowSeconds / 900) * 900
    const historyTime = currentBucket - 2700
    const historyTo = historyTime + 899
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockResolvedValue({
      status: 'AVAILABLE',
      to: historyTo,
      receivedAt: Date.now(),
      candles: [{ time: historyTime, open: 100, high: 105, low: 95, close: 101 }],
    })
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const props = { pair, providerSymbol: 'BTC_THB' }
    const view = render(<TradingChart {...props} />)
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toEqual([
      { time: historyTime, open: 100, high: 105, low: 95, close: 101 },
    ]))

    const trades = [
      { id: 'new-bar-1', timestamp: (historyTime + 900 + 10) * 1000, price: 110, amount: 0.01, side: 'BUY' },
      { id: 'new-bar-2', timestamp: (historyTime + 1800 + 10) * 1000, price: 120, amount: 0.02, side: 'SELL' },
    ]
    view.rerender(<TradingChart {...props} recentTrades={trades} />)

    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toEqual([
      { time: historyTime, open: 100, high: 105, low: 95, close: 101 },
      { time: historyTime + 900, open: 110, high: 110, low: 110, close: 110 },
      { time: historyTime + 1800, open: 120, high: 120, low: 120, close: 120 },
    ]))
    expect(chartHarness.update).not.toHaveBeenCalled()
  })

  it('labels a real trade candle in a bucket missing from otherwise available history as partial', async () => {
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockResolvedValue({
      status: 'AVAILABLE', to: 8000, receivedAt: Date.now(),
      candles: [{ time: 3600, open: 100, high: 110, low: 95, close: 105 }],
    })
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const recentTrades = [{ id: 'uncovered-bucket-trade', timestamp: 7_210_000, price: 120, amount: 0.1, side: 'BUY' }]
    render(<TradingChart pair={pair} providerSymbol="BTC_THB" recentTrades={recentTrades} />)

    await waitFor(() => expect(chartHarness.instances[0]?.series.data.map((bar) => bar.time)).toEqual([3600, 7200]))
    expect(await screen.findByText(/partial OHLC จาก matched trades ใน bucket ที่ไม่มี history/)).toBeDefined()
  })

  it('preserves zoom around a single partial candle by shifting its logical range into full history', async () => {
    const now = Date.now()
    const nowSeconds = Math.floor(now / 1000)
    const currentBucket = Math.floor(nowSeconds / 900) * 900
    const historyTime = currentBucket - 1800
    const historyTo = nowSeconds - 10
    const responses = [
      { status: 'UNAVAILABLE', candles: [], source: 'temporary network failure' },
      {
        status: 'AVAILABLE', to: historyTo, receivedAt: Date.now(),
        candles: [
          { time: historyTime, open: 90, high: 95, low: 85, close: 92 },
          { time: historyTime + 900, open: 92, high: 98, low: 90, close: 96 },
          { time: currentBucket, open: 96, high: 101, low: 94, close: 100 },
        ],
      },
    ]
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockImplementation(async () => responses.shift())
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const recentTrades = [{
      id: 'partial-current', timestamp: now, price: 100, amount: 0.01, side: 'BUY',
    }]
    render(<TradingChart pair={pair} providerSymbol="BTC_THB" recentTrades={recentTrades} />)
    expect(await screen.findByRole('button', { name: 'ลองโหลด history ใหม่' })).toBeDefined()
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(1))

    const singleCandleTimeScale = chartHarness.instances[0].chart.timeScale()
    expect(singleCandleTimeScale.getVisibleRange()).toEqual({ from: currentBucket, to: currentBucket })
    const userLogicalRange = { from: -4, to: 4 }
    chartHarness.visibleLogicalRange = userLogicalRange
    chartHarness.fitContent.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'ลองโหลด history ใหม่' }))

    expect(await screen.findByText(/Bitkub REST \/tradingview\/history/)).toBeDefined()
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(3))
    expect(chartHarness.instances[0].series.data[0].time).toBe(historyTime)
    expect(chartHarness.visibleLogicalRange).toEqual({ from: -2, to: 6 })
    expect(chartHarness.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: -2, to: 6 })
    expect(chartHarness.fitContent).not.toHaveBeenCalled()
  })

  it('fits loaded history after retry when the chart had no candles and no visible range', async () => {
    const currentBucket = Math.floor((Date.now() / 1000) / 900) * 900
    const historyTime = currentBucket - 1800
    const responses = [
      { status: 'UNAVAILABLE', candles: [], source: 'temporary network failure' },
      {
        status: 'AVAILABLE', to: currentBucket, receivedAt: Date.now(),
        candles: [
          { time: historyTime, open: 90, high: 95, low: 85, close: 92 },
          { time: historyTime + 900, open: 92, high: 98, low: 90, close: 96 },
          { time: currentBucket, open: 96, high: 101, low: 94, close: 100 },
        ],
      },
    ]
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockImplementation(async () => responses.shift())
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    render(<TradingChart pair={pair} providerSymbol="BTC_THB" />)
    expect(await screen.findByRole('button', { name: 'ลองโหลด history ใหม่' })).toBeDefined()
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toEqual([]))
    const emptyTimeScale = chartHarness.instances[0].chart.timeScale()
    expect(emptyTimeScale.getVisibleRange()).toBeNull()
    expect(emptyTimeScale.getVisibleLogicalRange()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'ลองโหลด history ใหม่' }))

    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(3))
    expect(chartHarness.instances[0].series.data[0].time).toBe(historyTime)
    expect(chartHarness.fitContent).toHaveBeenCalledTimes(1)
    expect(chartHarness.setVisibleRange).not.toHaveBeenCalled()
    expect(chartHarness.setVisibleLogicalRange).not.toHaveBeenCalled()
  })

  it('fits new history after retry when the previous logical-range anchor is absent', async () => {
    const requests = []
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockImplementation(() => new Promise((resolve) => requests.push(resolve)))
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const props = { pair, providerSymbol: 'BTC_THB' }
    const partialTrade = [{ id: 'anchor-trade', timestamp: 3_610_000, price: 100, amount: 0.1, side: 'BUY' }]
    const view = render(<TradingChart {...props} recentTrades={partialTrade} />)
    await waitFor(() => expect(requests).toHaveLength(1))
    await act(async () => requests[0]({ status: 'UNAVAILABLE', candles: [], source: 'temporary network failure' }))
    expect(await screen.findByRole('button', { name: 'ลองโหลด history ใหม่' })).toBeDefined()
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(1))
    expect(chartHarness.instances[0].series.data[0].time).toBe(3600)

    chartHarness.visibleLogicalRange = { from: -2, to: 2 }
    fireEvent.click(screen.getByRole('button', { name: 'ลองโหลด history ใหม่' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    await waitFor(() => expect(chartHarness.setVisibleLogicalRange).toHaveBeenCalled())
    chartHarness.setVisibleLogicalRange.mockClear()
    chartHarness.fitContent.mockClear()

    view.rerender(<TradingChart {...props} recentTrades={[]} />)
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toEqual([]))
    await act(async () => requests[1]({
      status: 'AVAILABLE', to: 12_000, receivedAt: Date.now(),
      candles: [
        { time: 7200, open: 110, high: 115, low: 105, close: 112 },
        { time: 10800, open: 112, high: 118, low: 110, close: 116 },
      ],
    }))

    await waitFor(() => expect(chartHarness.instances[0]?.series.data.map((bar) => bar.time)).toEqual([7200, 10800]))
    expect(chartHarness.setVisibleLogicalRange).not.toHaveBeenCalled()
    expect(chartHarness.fitContent).toHaveBeenCalledTimes(1)
  })

  it('preserves zoom and position around multiple partial candles when history fills earlier bars', async () => {
    const now = Date.now()
    const nowSeconds = Math.floor(now / 1000)
    const currentBucket = Math.floor(nowSeconds / 900) * 900
    const firstPartialBucket = currentBucket - 900
    const historyTime = currentBucket - 3600
    const responses = [
      { status: 'UNAVAILABLE', candles: [], source: 'temporary network failure' },
      {
        status: 'AVAILABLE', to: nowSeconds - 10, receivedAt: now,
        candles: [
          { time: historyTime, open: 80, high: 85, low: 75, close: 82 },
          { time: historyTime + 900, open: 82, high: 88, low: 80, close: 86 },
          { time: historyTime + 1800, open: 86, high: 90, low: 84, close: 88 },
          { time: firstPartialBucket, open: 88, high: 95, low: 87, close: 92 },
        ],
      },
    ]
    vi.spyOn(liveMarketService, 'loadHistoricalCandles').mockImplementation(async () => responses.shift())
    const pair = { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB', precision: 2 }
    const recentTrades = [
      { id: 'partial-1', timestamp: (firstPartialBucket + 10) * 1000, price: 92, amount: 0.01, side: 'BUY' },
      { id: 'partial-2', timestamp: now, price: 96, amount: 0.02, side: 'SELL' },
    ]
    render(<TradingChart pair={pair} providerSymbol="BTC_THB" recentTrades={recentTrades} />)
    expect(await screen.findByRole('button', { name: 'ลองโหลด history ใหม่' })).toBeDefined()
    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(2))
    const userLogicalRange = { from: -1, to: 1 }
    chartHarness.visibleLogicalRange = userLogicalRange
    chartHarness.fitContent.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'ลองโหลด history ใหม่' }))

    await waitFor(() => expect(chartHarness.instances[0]?.series.data).toHaveLength(5))
    expect(chartHarness.instances[0].series.data.map((bar) => bar.time)).toEqual([
      historyTime, historyTime + 900, historyTime + 1800, firstPartialBucket, currentBucket,
    ])
    expect(chartHarness.visibleLogicalRange).toEqual({ from: 2, to: 4 })
    expect(chartHarness.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 2, to: 4 })
    expect(chartHarness.fitContent).not.toHaveBeenCalled()
  })

  it('rejects damaged account rows, preserves the raw source, and keeps Dashboard renderable', async () => {
    const user = authService.register('Damaged Account', 'damaged@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const raw = JSON.stringify({ ...makeAccountSnapshot(123, 'safe-row'), transactions: [null] })
    localStorage.setItem(key, raw)

    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/ข้อมูลเสีย/)
    fireEvent.click(screen.getByRole('button', { name: 'ภาพรวมการเงิน' }))

    expect(await screen.findByText('ภาพรวมการเงินส่วนบุคคล')).toBeDefined()
    expect(localStorage.getItem(key)).toBe(raw)
    expect(authService.loadUserData(user.id)).toMatchObject({ ok: false, status: 'corrupt' })
  })

  it('keeps account A and B data isolated through switch and logout using the real App', async () => {
    const first = authService.register('Account Alpha', 'alpha@example.test', 'demo-pass')
    const second = authService.register('Account Beta', 'beta@example.test', 'demo-pass')
    const firstKey = `finntech_user_${first.id}_data`
    const secondKey = `finntech_user_${second.id}_data`
    const firstSnapshot = makeAccountSnapshot(111, 'alpha-only')
    const secondSnapshot = makeAccountSnapshot(222, 'beta-only')
    localStorage.setItem(firstKey, JSON.stringify(firstSnapshot))
    localStorage.setItem(secondKey, JSON.stringify(secondSnapshot))
    localStorage.setItem('finntech_current_user_id', first.id)
    const writesToSecond = []
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === secondKey) writesToSecond.push(JSON.parse(value))
      return originalSetItem(key, value)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Account Alpha/ }))
    fireEvent.click(screen.getByRole('button', { name: /ออกจากระบบ/ }))

    const loginIdentifier = await screen.findByPlaceholderText('กรอกชื่อผู้ใช้งาน หรือ อีเมลที่สมัครไว้')
    fireEvent.change(loginIdentifier, { target: { value: 'beta@example.test' } })
    fireEvent.change(screen.getByPlaceholderText('กรอกรหัสผ่านที่คุณตั้งไว้'), { target: { value: 'demo-pass' } })
    fireEvent.click(screen.getByRole('button', { name: /เข้าสู่ระบบด้วยรหัสเดิม/ }))
    await screen.findByRole('button', { name: /Account Beta/ })
    await waitFor(() => expect(writesToSecond.some((snapshot) => snapshot.transactions?.[0]?.note === 'beta-only')).toBe(true))

    expect(authService.getUserData(first.id).transactions[0].note).toBe('alpha-only')
    expect(authService.getUserData(second.id).transactions[0].note).toBe('beta-only')
    expect(writesToSecond.every((snapshot) => snapshot.transactions?.[0]?.note !== 'alpha-only')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Account Beta/ }))
    fireEvent.click(screen.getByRole('button', { name: /ออกจากระบบ/ }))
    await waitFor(() => expect(localStorage.getItem('finntech_current_user_id')).toBeNull())
    await waitFor(() => {
      const guestState = authService.loadUserData(null)
      expect(guestState.ok).toBe(true)
      expect(guestState.data.openOrders).toEqual([])
      expect(guestState.data.tradeHistory).toEqual([])
      expect(guestState.data.spotBalances.THB).toBe(0)
    })
    expect(authService.getUserData(first.id).transactions[0].note).toBe('alpha-only')
    expect(authService.getUserData(second.id).transactions[0].note).toBe('beta-only')
  })

  it('shows a persistence warning in App when account-data writes fail', async () => {
    const user = authService.register('Write Failure', 'write-failure@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((requestedKey, value) => {
      if (requestedKey === key) throw new Error('quota exceeded')
      return originalSetItem(requestedKey, value)
    })

    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/บันทึกข้อมูลในเบราว์เซอร์ไม่ได้/)
  })

  it('keeps the profile open and lets the user retry when logout storage removal fails', async () => {
    const user = authService.register('Logout Failure', 'logout-failure@example.test', 'demo-pass')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const originalRemoveItem = localStorage.removeItem.bind(localStorage)
    const removeSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation((key) => {
      if (key === 'finntech_current_user_id') throw new Error('storage is blocked')
      return originalRemoveItem(key)
    })

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Logout Failure/ }))
    fireEvent.click(screen.getByRole('button', { name: /ออกจากระบบ/ }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/ออกจากระบบไม่สำเร็จ/)
    expect(localStorage.getItem('finntech_current_user_id')).toBe(user.id)
    expect(screen.getByRole('button', { name: /ออกจากระบบ/ })).toBeDefined()

    removeSpy.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: /ออกจากระบบ/ }))
    await waitFor(() => expect(localStorage.getItem('finntech_current_user_id')).toBeNull())
  })

  it('exports only a selected category through the real App profile flow', async () => {
    const user = authService.register('Export Account', 'export-account@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const source = {
      ...makeAccountSnapshot(123, 'selected-note'),
      email: 'private-profile@example.test',
      passcodeHash: 'private-demo-hash',
      accessToken: 'private-token',
      portfolio: [{ id: 'asset-1', name: 'BTC', symbol: 'BTC', currency: 'THB', type: 'crypto', shares: 1, avgBuyPrice: 10, currentPrice: 11 }],
      transactions: [{ ...makeAccountSnapshot(123, 'selected-note').transactions[0], password: 'row-password' }],
    }
    const originalSource = JSON.stringify(source)
    localStorage.setItem(key, originalSource)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let exportedBlob
    const priorCreateObjectURL = URL.createObjectURL
    const priorRevokeObjectURL = URL.revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob) => { exportedBlob = blob; return 'blob:test-export' }) })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: /Export Account/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'รายการรายรับ-รายจ่าย' }))
      fireEvent.click(screen.getByRole('button', { name: /ดาวน์โหลดไฟล์ JSON/ }))
      expect((await screen.findByText(/สร้างไฟล์ส่งออกแล้ว:/)).textContent).toMatch(/สร้างไฟล์ส่งออกแล้ว/)

      const exported = JSON.parse(await exportedBlob.text())
      expect(exported.selectedSections).toEqual(['transactions'])
      expect(Object.keys(exported.data)).toEqual(['transactions'])
      expect(JSON.stringify(exported)).not.toContain('private-profile@example.test')
      expect(JSON.stringify(exported)).not.toContain('private-demo-hash')
      expect(JSON.stringify(exported)).not.toContain('private-token')
      expect(JSON.stringify(exported)).not.toContain('row-password')
      expect(localStorage.getItem(key)).toBe(originalSource)
    } finally {
      if (priorCreateObjectURL === undefined) delete URL.createObjectURL
      else Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: priorCreateObjectURL })
      if (priorRevokeObjectURL === undefined) delete URL.revokeObjectURL
      else Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: priorRevokeObjectURL })
    }
  })

  it('renders and exports version 560fb4f portfolio assets without assigning a guessed currency', async () => {
    const user = authService.register('Legacy Portfolio User', 'legacy-portfolio-ui@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const legacySnapshot = {
      ...makeAccountSnapshot(0, 'legacy-fixture'),
      transactions: [],
      portfolio: legacyPortfolio560fb4f,
      spotBalances: { ...ZERO_SPOT_BALANCES, THB: 0 },
      balance: 0,
    }
    localStorage.setItem(key, JSON.stringify(legacySnapshot))

    let exportedBlob
    const priorCreateObjectURL = URL.createObjectURL
    const priorRevokeObjectURL = URL.revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob) => { exportedBlob = blob; return 'blob:legacy-portfolio' }) })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: 'พอร์ตการลงทุน' }))
      await screen.findAllByText('Bitcoin')
      const bitcoinRow = [...document.querySelectorAll('tbody tr')]
        .find((row) => row.textContent.includes('Bitcoin'))
      expect(bitcoinRow).toBeDefined()
      expect(bitcoinRow.textContent).toContain('ไม่ระบุสกุลเงิน')
      expect(bitcoinRow.textContent).toContain('N/A')
      expect(authService.loadUserData(user.id).data.portfolio).toEqual(legacyPortfolio560fb4f)

      fireEvent.click(screen.getByRole('button', { name: /Legacy Portfolio User/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'สินทรัพย์ในพอร์ต' }))
      fireEvent.click(screen.getByRole('button', { name: /ดาวน์โหลดไฟล์ JSON/ }))
      await screen.findByText(/สร้างไฟล์ส่งออกแล้ว:/)

      const exported = JSON.parse(await exportedBlob.text())
      expect(exported.selectedSections).toEqual(['portfolio'])
      expect(exported.data.portfolio).toEqual(legacyPortfolio560fb4f)
      expect(exported.data.portfolio.every((asset) => !Object.hasOwn(asset, 'currency'))).toBe(true)
      expect(JSON.parse(localStorage.getItem(key)).portfolio).toEqual(legacyPortfolio560fb4f)
    } finally {
      if (priorCreateObjectURL === undefined) delete URL.createObjectURL
      else Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: priorCreateObjectURL })
      if (priorRevokeObjectURL === undefined) delete URL.revokeObjectURL
      else Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: priorRevokeObjectURL })
    }
  })

  it('lets a user explicitly assign legacy asset currency without changing saved amounts', async () => {
    const user = authService.register('Currency Choice', 'currency-choice@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    localStorage.setItem(key, JSON.stringify({
      ...makeAccountSnapshot(0, 'currency-choice'),
      transactions: [],
      portfolio: [legacyPortfolio560fb4f[0]],
      spotBalances: { ...ZERO_SPOT_BALANCES, THB: 0 },
      balance: 0,
    }))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'พอร์ตการลงทุน' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ระบุสกุลเงินให้ SET50 Index Fund (SSF/RMF)' }))
    fireEvent.change(screen.getByLabelText('สกุลเงินที่ต้องการระบุ'), { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันสกุลเงิน' }))

    await waitFor(() => {
      const asset = authService.loadUserData(user.id).data.portfolio[0]
      expect(asset.currency).toBe('USD')
      expect(asset.shares).toBe(legacyPortfolio560fb4f[0].shares)
      expect(asset.avgBuyPrice).toBe(legacyPortfolio560fb4f[0].avgBuyPrice)
      expect(asset.currentPrice).toBe(legacyPortfolio560fb4f[0].currentPrice)
    })
  })

  it('rejects invalid portfolio form values before state changes and persists a valid retry across App reload', async () => {
    const user = authService.register('Portfolio Form', 'portfolio-form@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const appRender = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'พอร์ตการลงทุน' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'เพิ่มสินทรัพย์' })[0])

    const nameInput = screen.getByPlaceholderText('เช่น Apple Inc., SET50, ทองคำแท่ง')
    const sharesInput = screen.getByPlaceholderText('10')
    const averagePriceInput = screen.getByPlaceholderText('100')
    const currentPriceInput = screen.getByPlaceholderText('120')
    const submitButton = screen.getByRole('button', { name: /บันทึกสินทรัพย์/ })

    fireEvent.change(nameInput, { target: { value: 'Valid Asset' } })
    fireEvent.change(sharesInput, { target: { value: '0' } })
    fireEvent.change(averagePriceInput, { target: { value: '100' } })
    fireEvent.change(currentPriceInput, { target: { value: '120' } })
    fireEvent.click(submitButton)
    expect((await screen.findByRole('alert')).textContent).toMatch(/จำนวนหน่วยต้อง/)
    expect(screen.getByPlaceholderText('10').value).toBe('0')
    expect(authService.loadUserData(user.id).data.portfolio).toEqual([])

    fireEvent.change(sharesInput, { target: { value: '-1' } })
    fireEvent.click(submitButton)
    expect((await screen.findByRole('alert')).textContent).toMatch(/จำนวนหน่วยต้อง/)
    expect(authService.loadUserData(user.id).data.portfolio).toEqual([])

    fireEvent.change(sharesInput, { target: { value: '1' } })
    fireEvent.change(averagePriceInput, { target: { value: '-1' } })
    fireEvent.click(submitButton)
    expect((await screen.findByRole('alert')).textContent).toMatch(/ต้นทุนเฉลี่ยต้อง/)
    expect(authService.loadUserData(user.id).data.portfolio).toEqual([])

    fireEvent.change(averagePriceInput, { target: { value: '100' } })
    fireEvent.change(currentPriceInput, { target: { value: '-1' } })
    fireEvent.click(submitButton)
    expect((await screen.findByRole('alert')).textContent).toMatch(/ราคาปัจจุบันต้อง/)
    expect(authService.loadUserData(user.id).data.portfolio).toEqual([])

    fireEvent.change(nameInput, { target: { value: '   ' } })
    fireEvent.change(sharesInput, { target: { value: '1' } })
    fireEvent.click(submitButton)
    expect((await screen.findByRole('alert')).textContent).toMatch(/ชื่อสินทรัพย์/)
    expect(screen.getByRole('alert').textContent).not.toMatch(/ข้อมูลเสีย/)
    expect(authService.loadUserData(user.id).data.portfolio).toEqual([])

    fireEvent.change(nameInput, { target: { value: '  Saved Asset  ' } })
    fireEvent.change(sharesInput, { target: { value: '0.25' } })
    fireEvent.change(currentPriceInput, { target: { value: '120' } })
    fireEvent.click(submitButton)
    await waitFor(() => {
      expect(authService.loadUserData(user.id).data.portfolio).toHaveLength(1)
    })
    const savedAsset = authService.loadUserData(user.id).data.portfolio[0]
    expect(savedAsset).toMatchObject({ name: 'Saved Asset', shares: 0.25, currency: 'THB' })

    appRender.unmount()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'พอร์ตการลงทุน' }))
    await screen.findAllByText('Saved Asset')
    const savedAssetRow = [...document.querySelectorAll('tbody tr')]
      .find((row) => row.textContent.includes('Saved Asset'))
    expect(savedAssetRow.textContent).toContain('THB')
    expect(JSON.parse(localStorage.getItem(key)).portfolio[0]).toMatchObject({
      name: 'Saved Asset', shares: 0.25, avgBuyPrice: 100, currentPrice: 120, currency: 'THB',
    })
  })

  it('Dashboard contains malformed transaction props without throwing or counting them', () => {
    render(<DashboardView transactions={[null]} portfolio={[]} spotBalances={{ THB: 0 }} openOrders={[]} />)
    expect(screen.getByRole('alert').textContent).toMatch(/งดคำนวณกระแสเงินสด/)
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
  })

  it('DashboardView renders without error', () => {
    expect(() => {
      render(
        <DashboardView
          transactions={[]}
          portfolio={[]}
          tradingBalance={500000}
          tradingPositions={[]}
          onOpenQuickAdd={vi.fn()}
        />
      )
    }).not.toThrow()
  })

  it('TradingTerminal renders without error', () => {
    expect(() => {
      render(
        <TradingTerminal
          positions={[]}
          tradingBalance={500000}
          onAddPosition={vi.fn()}
          onClosePosition={vi.fn()}
          onCloseAllPositions={vi.fn()}
          onTopUpBalance={vi.fn()}
        />
      )
    }).not.toThrow()
  })

  it('TradingChart renders without ReferenceError', () => {
    expect(() => {
      render(
        <TradingChart
          pair={{ symbol: 'BTC/USDT', name: 'Bitcoin', price: 76320, category: 'crypto' }}
          currentPrice={76320}
          positions={[]}
          limitOrders={[]}
        />
      )
    }).not.toThrow()
  })

  it('TransactionManager renders without error', () => {
    expect(() => {
      render(
        <TransactionManager
          transactions={[]}
          onAddTransaction={vi.fn()}
          onDeleteTransaction={vi.fn()}
          onClearAllTransactions={vi.fn()}
          onOpenQuickAdd={vi.fn()}
        />
      )
    }).not.toThrow()
  })

  it('CalculatorsView renders without error', () => {
    expect(() => {
      render(<CalculatorsView />)
    }).not.toThrow()
  })

  it('PortfolioView renders without error', () => {
    expect(() => {
      render(
        <PortfolioView
          portfolio={[]}
          onAddAsset={vi.fn()}
          onDeleteAsset={vi.fn()}
          onClearAllPortfolio={vi.fn()}
          tradingPositions={[]}
          tradingBalance={500000}
          onCloseTradingPosition={vi.fn()}
        />
      )
    }).not.toThrow()
  })

  it('ForexNewsView renders without error', () => {
    vi.spyOn(forexFactoryService, 'getCalendarEvents').mockResolvedValue([])
    expect(() => {
      render(<ForexNewsView onSelectTradePair={vi.fn()} />)
    }).not.toThrow()
    vi.restoreAllMocks()
  })

  it('TradingViewSignalModal renders without error', () => {
    expect(() => {
      render(<TradingViewSignalModal isOpen={true} onClose={vi.fn()} onFireSignal={vi.fn()} />)
    }).not.toThrow()
  })

  it('PriceAlertModal renders without error', () => {
    expect(() => {
      render(<PriceAlertModal isOpen={true} onClose={vi.fn()} onAddAlert={vi.fn()} />)
    }).not.toThrow()
  })

  it('SpotDepositModal renders without error', () => {
    expect(() => {
      render(<SpotDepositModal isOpen={true} onClose={vi.fn()} onDeposit={vi.fn()} />)
    }).not.toThrow()
  })

  it('SpotWithdrawModal renders without error', () => {
    expect(() => {
      render(<SpotWithdrawModal isOpen={true} onClose={vi.fn()} onWithdraw={vi.fn()} availableTHB={500000} />)
    }).not.toThrow()
  })

  it('ErrorBoundary gracefully catches child errors and displays fallback UI', () => {
    const ProblemChild = () => {
      throw new Error('Test intentional crash')
    }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { getByText } = render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    )

    expect(getByText(/เกิดข้อผิดพลาดที่ไม่คาดคิด/i)).toBeDefined()
    expect(getByText(/รีโหลดหน้าเว็บ/i)).toBeDefined()
    consoleSpy.mockRestore()
  })
})
