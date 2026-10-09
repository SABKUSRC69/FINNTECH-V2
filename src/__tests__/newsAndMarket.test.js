import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import ForexNewsView from '../components/news/ForexNewsView'
import forexFactoryService, { EconomicNewsService } from '../services/forexFactoryService'
import { BitkubMarketDataService, mapBitkubSymbols, mergeHistoricalCandlesWithTrades, normalizeBitkubHistoricalCandles, normalizeBitkubRestTrades, normalizeBitkubTicker } from '../services/liveMarketService'
import { floorSpotAmount, withSpotProviderRules } from '../services/spotTradingService'
import { TRADING_PAIRS } from '../data/tradingData'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('market data integrity', () => {
  const samplePairs = [
    { symbol: 'BTC/THB', baseAsset: 'BTC', quoteAsset: 'THB' },
    { symbol: 'ETH/THB', baseAsset: 'ETH', quoteAsset: 'THB' },
  ]
  const symbols = [
    // Bitkub's official REST v3 BTC_THB /symbols example. Its quantity fields
    // conflict with fractional public trade sizes, so do not infer order rules.
    { symbol: 'BTC_THB', base_asset: 'BTC', base_asset_scale: 8, quote_asset: 'THB', quote_asset_scale: 2, pairing_id: 1, price_scale: 2, price_step: '0.01', quantity_scale: 0, quantity_step: '1', min_quote_size: 10, status: 'active', market_segment: 'SPOT' },
    { symbol: 'ETH_THB', base_asset: 'ETH', quote_asset: 'THB', pairing_id: 91, status: 'active', market_segment: 'SPOT' },
  ]

  it('maps app pairs to actual /symbols fields and official ticker stream naming', () => {
    const mapping = mapBitkubSymbols(samplePairs, symbols)
    expect(mapping['BTC/THB']).toMatchObject({
      providerSymbol: 'BTC_THB', pairingId: 1, tickerStream: 'market.ticker.thb_btc',
      baseAssetScale: 8, providerPriceScale: 2, priceStep: 0.01, providerQuantityScale: 0,
      providerQuantityStep: 1, providerQuantityStepRaw: '1', quantityStep: null,
      minQuoteSize: 10, orderRulesVerified: false, orderRulesStatus: 'UNAVAILABLE',
    })
    expect(mapping['ETH/THB'].pairingId).toBe(91)
    expect(mapBitkubSymbols(samplePairs, [{ ...symbols[0], status: 'inactive' }])).toEqual({})
    expect(mapBitkubSymbols(samplePairs, [{ ...symbols[0], pairing_id: null }])).toEqual({})
  })

  it('preserves fractional BTC input without interpreting quantity_scale=0 / quantity_step=1 as an order rule', () => {
    const btcRules = mapBitkubSymbols(samplePairs, symbols)['BTC/THB']
    const btcPair = withSpotProviderRules(TRADING_PAIRS.find((pair) => pair.symbol === 'BTC/THB'), btcRules)
    expect(btcPair.amountPrecision).toBe(8)
    expect(floorSpotAmount(btcPair, 0.128170279)).toBe(0.12817027)
    expect(btcRules.orderRulesVerified).toBe(false)
    expect(btcRules.orderRulesReason).toMatch(/ไม่ได้อธิบาย/)
    const documentedTrade = normalizeBitkubRestTrades({ error: 0, result: [[1734661894000, 3367353.98, 0.00148484, 'BUY']] }, { receivedAt: 1_800_000_000_000 })
    expect(documentedTrade[0].amount).toBe(0.00148484)
  })

  it('rejects malformed tickers and accepts a finite positive Bitkub quote', () => {
    expect(normalizeBitkubTicker({ last: 'NaN' })).toBeNull()
    expect(normalizeBitkubTicker({ last: 0 })).toBeNull()
    expect(normalizeBitkubTicker({ last: 100, high24hr: 'bad' })).toBeNull()
    expect(normalizeBitkubTicker({ last: 100, high24hr: 110, low24hr: 90 }, { receivedAt: 10_000 })).toMatchObject({ last: 100, high24h: 110, low24h: 90, status: 'LIVE' })
    expect(normalizeBitkubTicker({ last: 100, percent_change: null }, { receivedAt: 10_000 }).change24h).toBeNull()
  })

  it('normalizes documented Bitkub OHLCV history and refuses incomplete or malformed bars', () => {
    const now = 1_800_000_000_000
    const time = Math.floor(now / 1000 / 900) * 900 - 900
    const payload = { s: 'ok', t: [time, time + 900], o: [100, 110], h: [120, 125], l: [90, 105], c: [110, 115], v: [1.25, 0.75] }
    expect(normalizeBitkubHistoricalCandles(payload, { from: time, to: time + 900, now })).toEqual([
      { time, open: 100, high: 120, low: 90, close: 110 },
      { time: time + 900, open: 110, high: 125, low: 105, close: 115 },
    ])
    expect(normalizeBitkubHistoricalCandles({ s: 'no_data' }, { now })).toEqual([])
    expect(normalizeBitkubHistoricalCandles({ ...payload, v: [1.25] }, { now })).toBeNull()
    expect(normalizeBitkubHistoricalCandles({ ...payload, h: [99, 125] }, { now })).toBeNull()
    expect(normalizeBitkubHistoricalCandles({ ...payload, c: [true, 115] }, { now })).toBeNull()
  })

  it('loads historical bars using the provider symbol from /symbols, not a guessed pair name', async () => {
    const now = 1_800_000_000_000
    const barTime = Math.floor(now / 1000 / 900) * 900 - 900
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({
      s: 'ok', t: [barTime], o: [100], h: [110], l: [95], c: [105], v: [2],
    }) }))
    const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: null, now: () => now })
    service.symbolMappings = mapBitkubSymbols(samplePairs, symbols)

    const result = await service.loadHistoricalCandles('BTC/THB', '15m', { limit: 20 })
    const requestedUrl = new URL(fetchImpl.mock.calls[0][0])
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.bitkub.com/tradingview/history')
    expect(requestedUrl.searchParams.get('symbol')).toBe('BTC_THB')
    expect(requestedUrl.searchParams.get('resolution')).toBe('15')
    expect(result).toMatchObject({ status: 'AVAILABLE', source: 'Bitkub public REST /tradingview/history' })
    expect(result.candles).toEqual([{ time: barTime, open: 100, high: 110, low: 95, close: 105 }])
    service.destroy()
  })

  it('returns an empty unavailable history result on feed failure instead of inventing candles', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (CORS)'))
    const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: null })
    service.symbolMappings = mapBitkubSymbols(samplePairs, symbols)
    const result = await service.loadHistoricalCandles('BTC/THB', '15m')
    expect(result.status).toBe('UNAVAILABLE')
    expect(result.candles).toEqual([])
    expect(result.source).toMatch(/Failed to fetch|CORS/)
    service.destroy()
  })

  it('does not let an old trade alter a closed historical candle', () => {
    const historical = [
      { time: 3600, open: 100, high: 110, low: 95, close: 105 },
      { time: 7200, open: 105, high: 115, low: 100, close: 110 },
    ]
    const oldTrade = { timestamp: 3610_000, price: 120, amount: 0.1, side: 'BUY' }
    const merged = mergeHistoricalCandlesWithTrades(historical, [oldTrade], '1h', { historyTo: 8000, now: 19_000_000, limit: 20 })
    expect(merged).toEqual(historical)
  })

  it('updates the current historical candle only with a trade newer than the history snapshot', () => {
    const historical = [
      { time: 7200, open: 105, high: 115, low: 100, close: 110 },
    ]
    const oldTradeInCurrentBucket = { timestamp: 7900_000, price: 120, amount: 0.1, side: 'BUY' }
    const newTrade = { timestamp: 8100_000, price: 118, amount: 0.1, side: 'SELL' }
    const merged = mergeHistoricalCandlesWithTrades(
      historical,
      [oldTradeInCurrentBucket, newTrade],
      '1h',
      { historyTo: 8000, now: 8500_000 },
    )
    expect(merged).toEqual([{ time: 7200, open: 105, high: 118, low: 100, close: 118 }])
  })

  it('adds observed post-history trade buckets without filling gaps or editing closed bars', () => {
    const historical = [
      { time: 3600, open: 100, high: 110, low: 95, close: 105 },
      { time: 7200, open: 105, high: 115, low: 100, close: 110 },
    ]
    const trades = [
      { timestamp: 3610_000, price: 120, amount: 0.1, side: 'BUY' },
      { timestamp: 10_810_000, price: 125, amount: 0.1, side: 'SELL' },
      { timestamp: 18_010_000, price: 128, amount: 0.1, side: 'BUY' },
    ]
    const merged = mergeHistoricalCandlesWithTrades(historical, trades, '1h', { historyTo: 8000, now: 19_000_000, limit: 20 })
    expect(merged.map((candle) => candle.time)).toEqual([3600, 7200, 10800, 18000])
    expect(merged.slice(0, 2)).toEqual(historical)
    expect(merged.some((candle) => candle.time === 14400)).toBe(false)

    const longHistory = Array.from({ length: 240 }, (_, index) => ({
      time: index * 900 + 900, open: 100, high: 100, low: 100, close: 100,
    }))
    expect(mergeHistoricalCandlesWithTrades(longHistory, [], '15m', { limit: 300 })).toHaveLength(240)
  })

  it('keeps a real uncovered trade bucket after the last history candle even when it is before historyTo', () => {
    const historical = [{ time: 3600, open: 100, high: 110, low: 95, close: 105 }]
    const trade = { timestamp: 7_210_000, price: 120, amount: 0.1, side: 'BUY' }

    const merged = mergeHistoricalCandlesWithTrades(historical, [trade], '1h', {
      historyTo: 8000,
      now: 16_000_000,
    })

    expect(merged).toEqual([
      historical[0],
      { time: 7200, open: 120, high: 120, low: 120, close: 120 },
    ])
    expect(merged.map((candle) => candle.time)).not.toContain(10800)
  })

  it('uses REST for initial snapshot, then accepts public WebSocket tick and marks it stale by age', async () => {
    let now = 1_800_000_000_000
    class MockSocket {
      static instances = []
      constructor(url) { this.url = url; this.closed = false; MockSocket.instances.push(this) }
      close() { this.closed = true }
    }
    const rows = {
      symbols: { error: 0, result: symbols },
      ticker: { error: 0, result: [{ symbol: 'BTC_THB', last: '101', percent_change: '1.5', high_24_hr: '110', low_24_hr: '90' }] },
      depth: { error: 0, result: { asks: [[103, 2]], bids: [[99, 3]] } },
      trades: { error: 0, result: [[now, 101, 0.1, 'BUY']] },
    }
    const fetchImpl = vi.fn(async (url) => {
      const key = new URL(url).pathname.split('/').at(-1)
      return { ok: true, json: async () => rows[key] }
    })
    const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: MockSocket, now: () => now, staleAfterMs: 1000 })
    await service.init()
    await waitFor(() => expect(service.getBookStatus('BTC/THB').source).toContain('Bitkub REST v3 depth snapshot'))
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url).pathname.split('/').at(-1))).toEqual(expect.arrayContaining(['symbols', 'ticker', 'depth', 'trades']))
    expect(service.getSymbolStatus('BTC/THB').status).toBe('STALE')
    expect(service.getSnapshot().orderBooks['BTC/THB'].asks[0].price).toBe(103)
    expect(MockSocket.instances[0].url).toContain('market.ticker.thb_btc')
    expect(MockSocket.instances[1].url).toContain('/orderbook/1')

    const accepted = service.handleTickerMessage(JSON.stringify({ stream: 'market.ticker.thb_btc', id: 1, last: 102, percentChange: 2, high24hr: 110, low24hr: 90 }))
    expect(accepted).toBe(true)
    expect(service.getSymbolStatus('BTC/THB').status).toBe('LIVE')
    expect(service.getTicker('BTC/THB').last).toBe(102)
    now += 1001
    service.refreshStaleStatuses()
    expect(service.getSymbolStatus('BTC/THB').status).toBe('STALE')
    service.destroy()
  })

  it('reconnects public ticker WebSocket with exponential backoff after disconnects', () => {
    vi.useFakeTimers()
    class MockSocket {
      static instances = []
      constructor(url) { this.url = url; MockSocket.instances.push(this) }
      close() {}
    }
    const service = new BitkubMarketDataService({ WebSocketImpl: MockSocket })
    service.symbolMappings = mapBitkubSymbols(samplePairs, symbols)
    service.isInitialized = true
    service.connectTickerSocket()

    MockSocket.instances[0].onclose()
    vi.advanceTimersByTime(999)
    expect(MockSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(MockSocket.instances).toHaveLength(2)
    MockSocket.instances[1].onclose()
    vi.advanceTimersByTime(1999)
    expect(MockSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(MockSocket.instances).toHaveLength(3)
    expect(service.tickerReconnectAttempt).toBe(2)
    service.destroy()
  })

  it('switches pair orderbook subscription using the mapped ID and closes the old socket', () => {
    class MockSocket {
      static instances = []
      constructor(url) { this.url = url; this.closed = false; MockSocket.instances.push(this) }
      close() { this.closed = true }
    }
    const service = new BitkubMarketDataService({ fetchImpl: vi.fn(), WebSocketImpl: MockSocket })
    service.symbolMappings = mapBitkubSymbols(samplePairs, symbols)
    service.isInitialized = true
    service.connectActiveOrderBook()
    const btcSocket = MockSocket.instances[0]
    service.setActiveSymbol('ETH/THB')
    expect(btcSocket.closed).toBe(true)
    expect(MockSocket.instances[1].url).toContain('/orderbook/91')
    service.destroy()
  })

  it('deduplicates trade ticks and ignores malformed or wrong-pair messages', () => {
    const service = new BitkubMarketDataService({ WebSocketImpl: null })
    service.symbolMappings = mapBitkubSymbols(samplePairs, symbols)
    const tick = JSON.stringify({ event: 'tradeschanged', pairing_id: 1, data: [[[Math.floor(Date.now() / 1000) - 1, 100, 0.2, 'BUY', 0, 0, true]]] })
    expect(service.handleOrderBookMessage('BTC/THB', tick)).toBe(true)
    expect(service.handleOrderBookMessage('BTC/THB', tick)).toBe(false)
    expect(service.getRecentTrades('BTC/THB')).toHaveLength(1)
    expect(service.handleOrderBookMessage('BTC/THB', '{bad json')).toBe(false)
    expect(service.handleOrderBookMessage('BTC/THB', JSON.stringify({ event: 'tradeschanged', pairing_id: 91, data: [[[Math.floor(Date.now() / 1000) - 1, 100, 0.2, 'BUY']]] }))).toBe(false)
    service.destroy()
  })

  it('does not let a REST snapshot started before newer WebSocket updates overwrite order book or trades', async () => {
    const now = 1_800_000_000_000
    let resolveDepth
    let resolveTrades
    const fetchImpl = vi.fn((url) => new Promise((resolve) => {
      if (url.includes('/depth?')) resolveDepth = resolve
      else if (url.includes('/trades?')) resolveTrades = resolve
    }))
    const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: null, now: () => now })
    service.symbolMappings = mapBitkubSymbols(samplePairs, symbols)

    const snapshot = service.loadActivePairSnapshot()
    await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(service.handleOrderBookMessage('BTC/THB', JSON.stringify({
      event: 'depthchanged', pairing_id: 1, data: { asks: [[201, 2]], bids: [[199, 3]] },
    }))).toBe(true)
    expect(service.handleOrderBookMessage('BTC/THB', JSON.stringify({
      event: 'tradeschanged', pairing_id: 1, data: [[[Math.floor(now / 1000), 200, 0.12817027, 'BUY']] ],
    }))).toBe(true)

    resolveDepth({ ok: true, json: async () => ({ error: 0, result: { asks: [[101, 1]], bids: [[99, 1]] } }) })
    resolveTrades({ ok: true, json: async () => ({ error: 0, result: [[Math.floor(now / 1000) - 1, 100, 0.5, 'SELL']] }) })
    await snapshot

    expect(service.getOrderBook('BTC/THB').asks[0]).toMatchObject({ price: 201, size: 2 })
    expect(service.getRecentTrades('BTC/THB')).toHaveLength(1)
    expect(service.getRecentTrades('BTC/THB')[0]).toMatchObject({ price: 200, amount: 0.12817027, side: 'BUY' })
    expect(service.getBookStatus('BTC/THB')).toMatchObject({ status: 'LIVE', source: expect.stringContaining('WebSocket') })
    expect(service.getTradeStatus('BTC/THB')).toMatchObject({ status: 'LIVE', source: expect.stringContaining('WebSocket') })
    service.destroy()
  })

  it('marks failed, 429, and CORS feed requests UNAVAILABLE without any fallback quote', async () => {
    for (const fetchImpl of [
      vi.fn().mockRejectedValue(new Error('HTTP 429')),
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch (CORS)')),
    ]) {
      const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: null, symbolRetryMaxAttempts: 1 })
      await service.init()
      expect(service.getSymbolStatus('BTC/THB').status).toBe('UNAVAILABLE')
      expect(service.getSnapshot().prices).toEqual({})
      expect(service.getSymbolStatus('BTC/THB').source).toMatch(/429|CORS|fetch/i)
      service.destroy()
    }
  })

  it('retries /symbols after a temporary 429 using cancellable exponential backoff', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: 0, result: [symbols[0]] }) })
    const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: null, symbolRetryBaseDelayMs: 500 })
    const loading = service.loadSymbols()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(loading).resolves.toHaveProperty('BTC/THB')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    service.destroy()
  })

  it('starts another /symbols retry round automatically after the first round is exhausted', async () => {
    vi.useFakeTimers()
    let symbolCalls = 0
    const fetchImpl = vi.fn(async (url) => {
      const endpoint = new URL(url).pathname.split('/').at(-1)
      if (endpoint === 'symbols') {
        symbolCalls += 1
        if (symbolCalls <= 2) return { ok: false, status: 429 }
        return { ok: true, json: async () => ({ error: 0, result: [symbols[0]] }) }
      }
      if (endpoint === 'ticker') return { ok: true, json: async () => ({ error: 0, result: [] }) }
      if (endpoint === 'depth') return { ok: true, json: async () => ({ error: 0, result: { asks: [[101, 1]], bids: [[99, 1]] } }) }
      return { ok: true, json: async () => ({ error: 0, result: [[Math.floor(Date.now() / 1000), 100, 0.1, 'BUY']] }) }
    })
    const service = new BitkubMarketDataService({
      fetchImpl,
      WebSocketImpl: null,
      symbolRetryMaxAttempts: 2,
      symbolRetryBaseDelayMs: 5,
      symbolRecoveryBaseDelayMs: 100,
      symbolRecoveryMaxDelayMs: 1000,
    })

    const initialBootstrap = service.init()
    await vi.advanceTimersByTimeAsync(0)
    expect(symbolCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(5)
    await expect(initialBootstrap).resolves.toBe(false)
    expect(symbolCalls).toBe(2)

    await vi.advanceTimersByTimeAsync(99)
    expect(symbolCalls).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(symbolCalls).toBe(3)
    expect(service.getPairRules('BTC/THB')).toMatchObject({ providerSymbol: 'BTC_THB', orderRulesVerified: false })
    service.destroy()
  })

  it('retries a transient /symbols timeout and cancels pending retries on destroy', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('Bitkub public market request timed out'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: 0, result: [symbols[0]] }) })
    const service = new BitkubMarketDataService({ fetchImpl, WebSocketImpl: null, symbolRetryBaseDelayMs: 250 })
    const loading = service.loadSymbols()
    await vi.advanceTimersByTimeAsync(250)
    await expect(loading).resolves.toHaveProperty('BTC/THB')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    service.destroy()

    const cancelledFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    const cancelledService = new BitkubMarketDataService({ fetchImpl: cancelledFetch, WebSocketImpl: null, symbolRetryBaseDelayMs: 500 })
    const cancelledLoading = cancelledService.loadSymbols()
    await vi.advanceTimersByTimeAsync(0)
    expect(cancelledFetch).toHaveBeenCalledTimes(1)
    cancelledService.destroy()
    await expect(cancelledLoading).rejects.toThrow(/ยกเลิก/)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(cancelledFetch).toHaveBeenCalledTimes(1)
  })

  it('covers fetch and JSON body reads with timeout and retries our timeout AbortError', async () => {
    vi.useFakeTimers()
    const rejectOnAbort = (signal) => new Promise((_, reject) => {
      const onAbort = () => {
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })

    for (const stalledPart of ['fetch', 'json']) {
      const fetchImpl = vi.fn((url, options) => {
        if (fetchImpl.mock.calls.length > 1) {
          return Promise.resolve({ ok: true, json: async () => ({ error: 0, result: [symbols[0]] }) })
        }
        if (stalledPart === 'fetch') return rejectOnAbort(options.signal)
        return Promise.resolve({ ok: true, json: () => rejectOnAbort(options.signal) })
      })
      const service = new BitkubMarketDataService({
        fetchImpl,
        WebSocketImpl: null,
        symbolRetryMaxAttempts: 2,
        symbolRetryBaseDelayMs: 10,
      })
      const loading = service.loadSymbols()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(8000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(10)
      await expect(loading).resolves.toHaveProperty('BTC/THB')
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      service.destroy()
    }
  })
})

describe('economic data adapter and widget states', () => {
  const now = Date.parse('2026-09-26T10:00:00.000Z')

  it('does not fetch or invent events when no licensed proxy is configured', async () => {
    const fetchImpl = vi.fn()
    const service = new EconomicNewsService({ fetchImpl, now: () => now })
    expect(await service.getCalendarEvents()).toEqual([])
    expect(await service.getHeadlines()).toEqual([])
    expect(service.getStatus('calendar').status).toBe('UNAVAILABLE')
    expect(service.getStatus('news').status).toBe('UNAVAILABLE')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('shows the candidate news provider as unconfigured and keeps both feed tabs unavailable', async () => {
    vi.spyOn(forexFactoryService, 'getCalendarEvents').mockResolvedValue([])
    vi.spyOn(forexFactoryService, 'getHeadlines').mockResolvedValue([])
    vi.spyOn(forexFactoryService, 'getStatus').mockReturnValue({
      status: 'UNAVAILABLE', source: 'ยังไม่ได้ตั้งค่า proxy ที่ได้รับสิทธิ์', lastUpdated: null,
    })
    render(React.createElement(ForexNewsView))
    expect(await screen.findByText(/Trading Economics เป็น provider ที่ประเมินไว้แต่ยังไม่เชื่อมต่อ/)).toBeTruthy()
    expect(await screen.findByText('ยังไม่มีข้อมูลปฏิทินจาก provider')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ข่าวบทความ/ }))
    expect(await screen.findByText('ยังไม่มีพาดหัวข่าวจาก provider')).toBeTruthy()
    expect(screen.getAllByText('UNAVAILABLE').length).toBeGreaterThan(0)
  })

  it('accepts provider events and headlines only with source and fresh timestamp', async () => {
    const payload = {
      status: 'LIVE', source: 'Licensed Provider', updatedAt: new Date(now).toISOString(),
      items: [{ id: 'event-1', title: 'Rate decision', date: new Date(now + 60_000).toISOString(), currency: 'USD', forecast: '4%', previous: '3.9%', actual: null }],
    }
    const newsPayload = {
      ...payload,
      items: [{ title: 'Headline', source: 'Publisher', publishedAt: new Date(now).toISOString(), url: 'https://news.example.test/story', summary: 'Summary' }],
    }
    const fetchImpl = vi.fn(async (url) => ({ ok: true, json: async () => String(url).endsWith('/calendar') ? payload : newsPayload }))
    const service = new EconomicNewsService({ baseUrl: 'https://proxy.example.test', fetchImpl, now: () => now })
    expect((await service.getCalendarEvents())[0]).toMatchObject({ title: 'Rate decision', currency: 'USD', actual: '' })
    expect(service.getStatus('calendar')).toMatchObject({ status: 'LIVE', source: 'Licensed Provider', lastUpdated: now })
    expect((await service.getHeadlines())[0]).toMatchObject({ title: 'Headline', source: 'Publisher', url: 'https://news.example.test/story' })
    expect(service.getStatus('news').status).toBe('LIVE')
  })

  it('marks old or malformed provider output stale/unavailable rather than LIVE', async () => {
    const stalePayload = { status: 'LIVE', source: 'Provider', updatedAt: new Date(now - 11 * 60_000).toISOString(), items: [{ title: 'Old event', date: new Date(now).toISOString() }] }
    const malformedPayload = { status: 'LIVE', items: [{ title: 'No source or timestamp', date: new Date(now).toISOString() }] }
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => stalePayload }))
    const service = new EconomicNewsService({ baseUrl: 'https://proxy.example.test', fetchImpl, now: () => now })
    expect(await service.getCalendarEvents()).toHaveLength(1)
    expect(service.getStatus().status).toBe('STALE')
    fetchImpl.mockResolvedValue({ ok: true, json: async () => malformedPayload })
    expect(await service.getCalendarEvents(true)).toEqual([])
    expect(service.getStatus().status).toBe('UNAVAILABLE')
  })

  it('shows the external widget loading and unavailable state without calling it an app live API', async () => {
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options)
      if (String(tagName).toLowerCase() === 'script') Object.defineProperty(element, 'src', { configurable: true, get: () => '', set: () => {} })
      return element
    })
    render(React.createElement(ForexNewsView))
    fireEvent.click(screen.getByRole('button', { name: /TradingView widget/ }))
    expect((await screen.findAllByText('กำลังโหลด widget')).length).toBeGreaterThan(0)
    expect(screen.queryByText('LIVE FEED')).toBeNull()
    fireEvent.error(document.querySelector('.tradingview-widget-container script'))
    expect(await screen.findByText('widget ไม่พร้อมใช้งานในขณะนี้')).toBeTruthy()
  })
})
