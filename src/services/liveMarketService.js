import { TRADING_PAIRS } from '../data/tradingData.js'

export const BITKUB_REST_BASE = 'https://api.bitkub.com/api/v3/market'
export const BITKUB_WS_BASE = 'wss://api.bitkub.com/websocket-api'
export const BITKUB_HISTORY_URL = 'https://api.bitkub.com/tradingview/history'
export const MARKET_DATA_STALE_AFTER_MS = 30_000
export const MAX_RECENT_TRADES = 100
export const HISTORICAL_CANDLE_LIMIT = 300
const HISTORICAL_RESOLUTIONS = Object.freeze({
  '1m': { resolution: '1', seconds: 60 },
  '5m': { resolution: '5', seconds: 5 * 60 },
  '15m': { resolution: '15', seconds: 15 * 60 },
  '1h': { resolution: '60', seconds: 60 * 60 },
  '4h': { resolution: '240', seconds: 4 * 60 * 60 },
  '1D': { resolution: '1D', seconds: 24 * 60 * 60 },
})
export const SYMBOL_RETRY_MAX_ATTEMPTS = 3
export const SYMBOL_RETRY_BASE_DELAY_MS = 500
export const SYMBOL_RETRY_MAX_DELAY_MS = 8_000
export const SYMBOL_RECOVERY_BASE_DELAY_MS = 15_000
export const SYMBOL_RECOVERY_MAX_DELAY_MS = 300_000

export const BITKUB_ORDER_RULES_UNVERIFIED_REASON = 'Bitkub REST v3 /symbols ไม่ได้อธิบายความหมายของ base_asset_scale, quantity_scale และ quantity_step จึงปิดคำสั่ง Spot แบบจำลองไว้เพื่อไม่เดากฎจำนวน'

const isFinitePositive = (value) => Number.isFinite(value) && value > 0
const normalizeScale = (value) => {
  if (value === undefined || value === null || value === '') return null
  const scale = Number(value)
  return Number.isInteger(scale) && scale >= 0 && scale <= 12 ? scale : null
}
const normalizeStep = (value) => {
  if (value === undefined || value === null || value === '') return null
  const step = Number(value)
  return isFinitePositive(step) ? step : null
}
const toFiniteNumber = (value) => {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const toProviderNumber = (value) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '')) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function unwrapResult(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.error !== undefined && Number(payload.error) !== 0) {
    throw new Error(`Bitkub market API error ${payload.error}`)
  }
  return payload?.result ?? payload?.data ?? payload
}

function asArray(payload) {
  const result = unwrapResult(payload)
  return Array.isArray(result) ? result : []
}

function normalizeTimestamp(value, now = Date.now()) {
  const timestamp = toFiniteNumber(value)
  if (timestamp === null || timestamp <= 0) return null
  const timestampMs = timestamp > 1e12 ? timestamp : timestamp * 1000
  if (!Number.isFinite(timestampMs) || timestampMs > now + 5 * 60_000) return null
  return timestampMs
}

function normalizeLevel(level) {
  const price = Array.isArray(level) ? toFiniteNumber(level[0]) : toFiniteNumber(level?.price)
  const size = Array.isArray(level) ? toFiniteNumber(level[1]) : toFiniteNumber(level?.base_volume ?? level?.size)
  if (!isFinitePositive(price) || !isFinitePositive(size)) return null
  return { price, size }
}

function withCumulative(levels, side) {
  const sorted = [...levels].sort((left, right) => side === 'asks' ? left.price - right.price : right.price - left.price)
  let total = 0
  return sorted.map((level) => {
    total += level.size
    return { ...level, total }
  })
}

export function normalizeBitkubDepth(payload) {
  let result
  try {
    result = unwrapResult(payload)
  } catch {
    return null
  }
  if (!result || typeof result !== 'object') return null
  const asks = Array.isArray(result.asks) ? result.asks.map(normalizeLevel).filter(Boolean) : []
  const bids = Array.isArray(result.bids) ? result.bids.map(normalizeLevel).filter(Boolean) : []
  if (asks.length === 0 && bids.length === 0) return null
  return { asks: withCumulative(asks, 'asks'), bids: withCumulative(bids, 'bids') }
}

export function mapBitkubSymbols(appPairs = TRADING_PAIRS, providerSymbols = []) {
  const activeSymbols = Array.isArray(providerSymbols) ? providerSymbols : []
  return appPairs.reduce((mapping, pair) => {
    const row = activeSymbols.find((candidate) => (
      String(candidate?.base_asset || '').toUpperCase() === pair.baseAsset &&
      String(candidate?.quote_asset || '').toUpperCase() === pair.quoteAsset &&
      String(candidate?.status || '').toLowerCase() === 'active' &&
      (!candidate?.market_segment || String(candidate.market_segment).toUpperCase() === 'SPOT')
    ))
    if (!row || !row.symbol || !Number.isInteger(Number(row.pairing_id)) || Number(row.pairing_id) <= 0) return mapping

    const baseAsset = String(row.base_asset).toUpperCase()
    const quoteAsset = String(row.quote_asset).toUpperCase()
    mapping[pair.symbol] = {
      symbol: pair.symbol,
      baseAsset,
      quoteAsset,
      providerSymbol: String(row.symbol).toUpperCase(),
      pairingId: Number(row.pairing_id),
      // The official ticker-stream examples use quote_base order. Both parts
      // come from the live /symbols response; the REST symbol is never guessed.
      tickerStream: `market.ticker.${quoteAsset.toLowerCase()}_${baseAsset.toLowerCase()}`,
      providerPriceScale: normalizeScale(row.price_scale),
      priceStep: normalizeStep(row.price_step),
      // Keep these fields as provider metadata only. REST v3 currently labels
      // /symbols field descriptions as N/A, and its BTC_THB example has
      // quantity_scale=0 / quantity_step=1 while public trade sizes are
      // fractional BTC. Do not apply them as order amount precision or step.
      baseAssetScale: normalizeScale(row.base_asset_scale),
      providerQuantityScale: normalizeScale(row.quantity_scale),
      providerQuantityStep: normalizeStep(row.quantity_step),
      providerQuantityStepRaw: row.quantity_step ?? null,
      quantityStep: null,
      minQuoteSize: normalizeStep(row.min_quote_size),
      orderRulesVerified: false,
      orderRulesStatus: 'UNAVAILABLE',
      orderRulesReason: BITKUB_ORDER_RULES_UNVERIFIED_REASON,
    }
    return mapping
  }, {})
}

export function normalizeBitkubTicker(payload, { receivedAt = Date.now(), source = 'Bitkub public market data' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const last = toFiniteNumber(payload.last ?? payload.close)
  if (!isFinitePositive(last)) return null

  const rawHigh24h = payload.high_24_hr ?? payload.high24hr
  const rawLow24h = payload.low_24_hr ?? payload.low24hr
  const high24h = toFiniteNumber(rawHigh24h)
  const low24h = toFiniteNumber(rawLow24h)
  if ((rawHigh24h !== undefined && high24h === null) || (rawLow24h !== undefined && low24h === null)) return null
  if ((high24h !== null && !isFinitePositive(high24h)) || (low24h !== null && !isFinitePositive(low24h))) return null
  if (high24h !== null && low24h !== null && high24h < low24h) return null

  const sourceTimestamp = normalizeTimestamp(payload.ts ?? payload.timestamp, receivedAt)
  if ((payload.ts !== undefined || payload.timestamp !== undefined) && sourceTimestamp === null) return null
  const providerReceivedAt = sourceTimestamp ?? receivedAt
  const sourceAge = receivedAt - providerReceivedAt

  return {
    last,
    highestBid: toFiniteNumber(payload.highest_bid ?? payload.highestBid),
    lowestAsk: toFiniteNumber(payload.lowest_ask ?? payload.lowestAsk),
    change24h: toFiniteNumber(payload.percent_change ?? payload.percentChange),
    high24h,
    low24h,
    baseVolume24h: toFiniteNumber(payload.base_volume ?? payload.baseVolume),
    quoteVolume24h: toFiniteNumber(payload.quote_volume ?? payload.quoteVolume),
    receivedAt,
    timestamp: sourceTimestamp ?? receivedAt,
    timestampType: sourceTimestamp === null ? 'received' : 'provider',
    source,
    status: sourceAge > MARKET_DATA_STALE_AFTER_MS ? 'STALE' : 'LIVE',
  }
}

function normalizeTrade(raw, receivedAt, source) {
  const row = Array.isArray(raw)
    ? { timestamp: raw[0], price: raw[1], amount: raw[2], side: raw[3] }
    : raw
  if (!row || typeof row !== 'object') return null
  const timestamp = normalizeTimestamp(row.timestamp ?? row.ts ?? row.time, receivedAt)
  const price = toFiniteNumber(row.price ?? row.rate ?? row.rat)
  const amount = toFiniteNumber(row.amount ?? row.size ?? row.amt)
  const side = String(row.side ?? row.type ?? '').toUpperCase()
  if (timestamp === null || !isFinitePositive(price) || !isFinitePositive(amount) || !['BUY', 'SELL'].includes(side)) return null
  const id = String(row.id ?? row.txn ?? `${timestamp}:${price}:${amount}:${side}`)
  return { id, timestamp, price, amount, side, receivedAt, source }
}

export function normalizeBitkubRestTrades(payload, { receivedAt = Date.now() } = {}) {
  let rows
  try {
    rows = asArray(payload)
  } catch {
    return null
  }
  const trades = rows.map((row) => normalizeTrade(row, receivedAt, 'Bitkub REST v3 trades snapshot')).filter(Boolean)
  return trades.length > 0 ? trades : null
}

export function normalizeBitkubHistoricalCandles(payload, { from, to, now = Date.now() } = {}) {
  let result
  try {
    result = unwrapResult(payload)
  } catch {
    return null
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  if (String(result.s || '').toLowerCase() === 'no_data') return []
  if (String(result.s || '').toLowerCase() !== 'ok') return null

  const fields = ['t', 'o', 'h', 'l', 'c', 'v']
  if (fields.some((field) => !Array.isArray(result[field]))) return null
  const length = result.t.length
  if (fields.some((field) => result[field].length !== length)) return null
  if (length === 0) return []

  const lowerBound = Number.isFinite(Number(from)) ? Number(from) : -Infinity
  const upperBound = Number.isFinite(Number(to)) ? Number(to) : Math.floor(now / 1000) + 300
  const nowSeconds = Math.floor(now / 1000)
  const candles = []
  let previousTime = 0

  for (let index = 0; index < length; index += 1) {
    const time = toProviderNumber(result.t[index])
    const open = toProviderNumber(result.o[index])
    const high = toProviderNumber(result.h[index])
    const low = toProviderNumber(result.l[index])
    const close = toProviderNumber(result.c[index])
    const volume = toProviderNumber(result.v[index])
    if (!Number.isInteger(time) || time <= previousTime || time < lowerBound || time > upperBound || time > nowSeconds + 300) return null
    if (!isFinitePositive(open) || !isFinitePositive(high) || !isFinitePositive(low) || !isFinitePositive(close) ||
      volume === null || volume < 0 || high < Math.max(open, close) || low > Math.min(open, close) || low > high) return null
    candles.push({ time, open, high, low, close })
    previousTime = time
  }
  return candles
}

export function normalizeBitkubWsTrades(payload, { receivedAt = Date.now() } = {}) {
  const rows = Array.isArray(payload?.data) ? payload.data[0] : null
  if (!Array.isArray(rows)) return null
  const trades = rows.map((row) => normalizeTrade(row, receivedAt, 'Bitkub public orderbook stream trades')).filter(Boolean)
  return trades.length > 0 ? trades : null
}

export function buildCandlesFromTrades(trades = [], timeframe = '15m', limit = 120) {
  const stepSeconds = ({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1D': 86400 })[timeframe] || 900
  const buckets = new Map()
  ;(Array.isArray(trades) ? trades : []).slice().sort((left, right) => Number(left?.timestamp) - Number(right?.timestamp)).forEach((trade) => {
    const timestamp = Number(trade?.timestamp)
    const price = Number(trade?.price)
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !isFinitePositive(price)) return
    const time = Math.floor((timestamp / 1000) / stepSeconds) * stepSeconds
    const current = buckets.get(time)
    if (!current) {
      buckets.set(time, { time, open: price, high: price, low: price, close: price })
    } else {
      current.high = Math.max(current.high, price)
      current.low = Math.min(current.low, price)
      current.close = price
    }
  })
  return [...buckets.values()].sort((left, right) => left.time - right.time).slice(-limit)
}

export function mergeHistoricalCandlesWithTrades(
  historicalCandles = [],
  trades = [],
  timeframe = '15m',
  { historyTo = null, now = Date.now(), limit = HISTORICAL_CANDLE_LIMIT } = {},
) {
  const historical = Array.isArray(historicalCandles) ? historicalCandles.filter((candle) => (
    Number.isInteger(Number(candle?.time)) && isFinitePositive(Number(candle?.open)) &&
    isFinitePositive(Number(candle?.high)) && isFinitePositive(Number(candle?.low)) &&
    isFinitePositive(Number(candle?.close))
  )) : []
  const safeLimit = Math.min(1000, Math.max(1, Math.floor(Number(limit) || HISTORICAL_CANDLE_LIMIT)))
  if (historical.length === 0) return buildCandlesFromTrades(trades, timeframe, MAX_RECENT_TRADES).slice(-safeLimit)

  const merged = new Map(historical.map((candle) => [Number(candle.time), { ...candle, time: Number(candle.time) }]))
  const latestHistoricalTime = Math.max(...merged.keys())
  const historySnapshotSeconds = typeof historyTo === 'number' && Number.isFinite(historyTo) ? historyTo : null
  if (historySnapshotSeconds === null) return [...merged.values()].sort((left, right) => left.time - right.time).slice(-safeLimit)

  const stepSeconds = ({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1D': 86400 })[timeframe] || 900
  const currentBucket = Math.floor((now / 1000) / stepSeconds) * stepSeconds
  const tradesForUncoveredBuckets = trades.filter((trade) => {
    const timestamp = Number(trade?.timestamp)
    if (!Number.isFinite(timestamp)) return false
    const tradeBucket = Math.floor((timestamp / 1000) / stepSeconds) * stepSeconds
    return tradeBucket > latestHistoricalTime || timestamp > historySnapshotSeconds * 1000
  })
  const tradeCandles = buildCandlesFromTrades(tradesForUncoveredBuckets, timeframe, MAX_RECENT_TRADES)
  tradeCandles.forEach((tradeCandle) => {
    const existing = merged.get(tradeCandle.time)
    if (existing && tradeCandle.time === currentBucket) {
      merged.set(tradeCandle.time, {
        ...existing,
        high: Math.max(existing.high, tradeCandle.high),
        low: Math.min(existing.low, tradeCandle.low),
        close: tradeCandle.close,
      })
    } else if (tradeCandle.time > latestHistoricalTime) {
      // Trade-derived bars are accepted only after the historical snapshot's
      // last bucket. Missing intervals stay gaps; no prices are synthesized.
      merged.set(tradeCandle.time, tradeCandle)
    }
  })
  return [...merged.values()].sort((left, right) => left.time - right.time).slice(-safeLimit)
}

function copyRecord(record) {
  return record && typeof record === 'object' ? { ...record } : record
}

function copyLevels(book) {
  return book ? { asks: book.asks.map((level) => ({ ...level })), bids: book.bids.map((level) => ({ ...level })) } : { asks: [], bids: [] }
}

export class BitkubMarketDataService {
  constructor({
    fetchImpl = (...args) => globalThis.fetch(...args),
    WebSocketImpl,
    now = () => Date.now(),
    staleAfterMs = MARKET_DATA_STALE_AFTER_MS,
    symbolRetryMaxAttempts = SYMBOL_RETRY_MAX_ATTEMPTS,
    symbolRetryBaseDelayMs = SYMBOL_RETRY_BASE_DELAY_MS,
    symbolRetryMaxDelayMs = SYMBOL_RETRY_MAX_DELAY_MS,
    symbolRecoveryBaseDelayMs = SYMBOL_RECOVERY_BASE_DELAY_MS,
    symbolRecoveryMaxDelayMs = SYMBOL_RECOVERY_MAX_DELAY_MS,
  } = {}) {
    this.fetchImpl = fetchImpl
    this.getWebSocket = WebSocketImpl === undefined ? () => globalThis.WebSocket : () => WebSocketImpl
    this.now = now
    this.staleAfterMs = staleAfterMs
    this.symbolRetryMaxAttempts = Math.max(1, Math.floor(Number(symbolRetryMaxAttempts) || 1))
    this.symbolRetryBaseDelayMs = Math.max(0, Number(symbolRetryBaseDelayMs) || 0)
    this.symbolRetryMaxDelayMs = Math.max(this.symbolRetryBaseDelayMs, Number(symbolRetryMaxDelayMs) || SYMBOL_RETRY_MAX_DELAY_MS)
    this.symbolRecoveryBaseDelayMs = Math.max(0, Number(symbolRecoveryBaseDelayMs) || 0)
    this.symbolRecoveryMaxDelayMs = Math.max(this.symbolRecoveryBaseDelayMs, Number(symbolRecoveryMaxDelayMs) || SYMBOL_RECOVERY_MAX_DELAY_MS)
    this.subscribers = new Set()
    this.statusSubscribers = new Set()
    this.pairs = Object.fromEntries(TRADING_PAIRS.map((pair) => [pair.symbol, pair]))
    this.providerSymbols = []
    this.symbolMappings = {}
    this.prices = {}
    this.tickers = {}
    this.orderBooks = {}
    this.bookStatuses = {}
    this.recentTrades = {}
    this.tradeStatuses = {}
    this.symbolStatuses = Object.fromEntries(TRADING_PAIRS.map((pair) => [pair.symbol, {
      status: 'UNAVAILABLE', source: 'รอข้อมูลจาก Bitkub public market API', lastUpdated: null, receivedAt: null,
    }]))
    this.activeSymbol = 'BTC/THB'
    this.tickerSocket = null
    this.orderBookSocket = null
    this.tickerReconnectTimer = null
    this.orderBookReconnectTimer = null
    this.staleTimer = null
    this.tickerReconnectAttempt = 0
    this.orderBookReconnectAttempt = 0
    this.activePairRequestId = 0
    this.orderBookRevisions = {}
    this.tradeRevisions = {}
    this.symbolRetryWaiters = new Set()
    this.symbolRecoveryTimer = null
    this.symbolRecoveryAttempt = 0
    this.isInitialized = false
    this.initPromise = null
    this.isTickerConnected = false
    this.isOrderBookConnected = false
    this.destroyed = false
    this.pendingControllers = new Set()
    this.seenTradeIds = new Map()
  }

  getSnapshot() {
    return {
      prices: { ...this.prices },
      tickers: Object.fromEntries(Object.entries(this.tickers).map(([key, value]) => [key, copyRecord(value)])),
      symbolStatuses: Object.fromEntries(Object.entries(this.symbolStatuses).map(([key, value]) => [key, copyRecord(value)])),
      orderBooks: Object.fromEntries(Object.entries(this.orderBooks).map(([key, value]) => [key, copyLevels(value)])),
      bookStatuses: Object.fromEntries(Object.entries(this.bookStatuses).map(([key, value]) => [key, copyRecord(value)])),
      recentTrades: Object.fromEntries(Object.entries(this.recentTrades).map(([key, value]) => [key, value.map((trade) => ({ ...trade }))])),
      tradeStatuses: Object.fromEntries(Object.entries(this.tradeStatuses).map(([key, value]) => [key, copyRecord(value)])),
      symbolMappings: Object.fromEntries(Object.entries(this.symbolMappings).map(([key, value]) => [key, copyRecord(value)])),
      activeSymbol: this.activeSymbol,
    }
  }

  getMarketStatus() {
    return {
      isConnected: this.isTickerConnected || this.isOrderBookConnected,
      latency: null,
      isDemoTicksEnabled: false,
      activeSymbol: this.activeSymbol,
      activeSymbolStatus: this.getSymbolStatus(this.activeSymbol),
      symbolStatuses: this.getSnapshot().symbolStatuses,
      bookStatuses: this.getSnapshot().bookStatuses,
      tradeStatuses: this.getSnapshot().tradeStatuses,
    }
  }

  getSymbolStatus(symbol) {
    return copyRecord(this.symbolStatuses[symbol]) || {
      status: 'UNAVAILABLE', source: 'ไม่มีคู่ Spot นี้ใน Bitkub /symbols', lastUpdated: null, receivedAt: null,
    }
  }

  getBookStatus(symbol) {
    return copyRecord(this.bookStatuses[symbol]) || { status: 'UNAVAILABLE', source: 'ยังไม่มี order book snapshot', lastUpdated: null, receivedAt: null }
  }

  getTradeStatus(symbol) {
    return copyRecord(this.tradeStatuses[symbol]) || { status: 'UNAVAILABLE', source: 'ยังไม่มี trades snapshot', lastUpdated: null, receivedAt: null }
  }

  getPairRules(symbol) {
    return copyRecord(this.symbolMappings[symbol]) || null
  }

  getTicker(symbol) {
    return copyRecord(this.tickers[symbol]) || null
  }

  getOrderBook(symbol) {
    return copyLevels(this.orderBooks[symbol])
  }

  getRecentTrades(symbol) {
    return (this.recentTrades[symbol] || []).map((trade) => ({ ...trade }))
  }

  subscribe(callback) {
    this.subscribers.add(callback)
    callback({ ...this.prices }, { symbol: null, kind: 'snapshot', direction: 'none' }, this.getSnapshot())
    return () => this.subscribers.delete(callback)
  }

  subscribeStatus(callback) {
    this.statusSubscribers.add(callback)
    callback(this.getMarketStatus())
    return () => this.statusSubscribers.delete(callback)
  }

  notifyPrices(symbol = null, { kind = 'snapshot', direction = 'none' } = {}) {
    const snapshot = this.getSnapshot()
    this.subscribers.forEach((callback) => {
      try {
        callback({ ...this.prices }, { symbol, kind, direction, status: symbol ? this.getSymbolStatus(symbol).status : null }, snapshot)
      } catch (error) {
        console.error('Bitkub market subscriber error', error)
      }
    })
    this.notifyStatus()
  }

  notifyStatus() {
    const status = this.getMarketStatus()
    this.statusSubscribers.forEach((callback) => {
      try {
        callback(status)
      } catch (error) {
        console.error('Bitkub market status subscriber error', error)
      }
    })
  }

  async requestJSON(url) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Fetch is unavailable in this browser')
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    if (controller) this.pendingControllers.add(controller)
    let timeoutId
    let timeoutTriggered = false
    const makeTimeoutError = () => {
      const error = new Error('Bitkub public market request timed out')
      error.name = 'AbortError'
      error.code = 'BITKUB_REQUEST_TIMEOUT'
      return error
    }
    try {
      // Keep fetch and response.json() within the same timeout. A response can
      // arrive before its body stalls, so timing only the fetch promise is not
      // sufficient for bootstrap recovery.
      const request = (async () => {
        const response = await this.fetchImpl(url, {
          headers: { Accept: 'application/json' },
          ...(controller ? { signal: controller.signal } : {}),
        })
        if (!response?.ok) {
          const error = new Error(`Bitkub public market API returned HTTP ${response?.status || 'error'}`)
          error.status = Number(response?.status) || null
          throw error
        }
        return await response.json()
      })().catch((error) => {
        // AbortController may reject fetch/body consumption before the timeout
        // promise wins the race. Tag only our own timeout abort as retryable.
        if (timeoutTriggered && error?.name === 'AbortError') throw makeTimeoutError()
        throw error
      })
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timeoutTriggered = true
          controller?.abort()
          reject(makeTimeoutError())
        }, 8000)
      })
      return await Promise.race([request, timeout])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (controller) this.pendingControllers.delete(controller)
    }
  }

  isRetryableSymbolError(error) {
    if (error?.name === 'AbortError') return error?.code === 'BITKUB_REQUEST_TIMEOUT'
    const status = Number(error?.status)
    if (status === 408 || status === 425 || status === 429 || status >= 500) return true
    return error?.name === 'TypeError' || /timed out|timeout|network|failed to fetch|cors/i.test(String(error?.message || ''))
  }

  clearSymbolRecoveryTimer() {
    if (this.symbolRecoveryTimer) clearTimeout(this.symbolRecoveryTimer)
    this.symbolRecoveryTimer = null
  }

  scheduleSymbolRecovery() {
    if (this.destroyed || !this.isInitialized || this.symbolRecoveryTimer) return
    const delay = Math.min(this.symbolRecoveryMaxDelayMs, this.symbolRecoveryBaseDelayMs * (2 ** this.symbolRecoveryAttempt))
    this.symbolRecoveryAttempt += 1
    this.symbolRecoveryTimer = setTimeout(async () => {
      this.symbolRecoveryTimer = null
      if (this.destroyed || !this.isInitialized) return
      try {
        await this.loadSymbols()
      } catch (error) {
        if (this.destroyed) return
        this.markAllUnavailable(error.message)
        if (this.isRetryableSymbolError(error)) this.scheduleSymbolRecovery()
        return
      }
      if (this.destroyed || !this.isInitialized) return
      await this.fetchInitialPrices()
      if (this.destroyed || !this.isInitialized) return
      this.connectTickerSocket()
      this.connectActiveOrderBook()
    }, delay)
  }

  waitForSymbolRetry(delayMs) {
    if (this.destroyed) return Promise.resolve(false)
    return new Promise((resolve) => {
      const waiter = {
        timer: setTimeout(() => {
          this.symbolRetryWaiters.delete(waiter)
          resolve(!this.destroyed)
        }, delayMs),
        resolve,
      }
      this.symbolRetryWaiters.add(waiter)
    })
  }

  async loadSymbols() {
    let lastError
    for (let attempt = 0; attempt < this.symbolRetryMaxAttempts; attempt += 1) {
      if (this.destroyed) throw new Error('Bitkub /symbols bootstrap ถูกยกเลิก')
      try {
        const payload = await this.requestJSON(`${BITKUB_REST_BASE}/symbols`)
        if (this.destroyed) throw new Error('Bitkub /symbols bootstrap ถูกยกเลิก')
        const rows = asArray(payload)
        if (rows.length === 0) throw new Error('Bitkub /symbols returned no symbols')
        this.providerSymbols = rows
        this.symbolMappings = mapBitkubSymbols(Object.values(this.pairs), rows)
        for (const pair of Object.values(this.pairs)) {
          if (!this.symbolMappings[pair.symbol]) {
            this.symbolStatuses[pair.symbol] = {
              status: 'UNAVAILABLE',
              source: 'ไม่มีคู่ Spot ที่ active ใน Bitkub /symbols',
              lastUpdated: null,
              receivedAt: null,
            }
          }
        }
        this.symbolRecoveryAttempt = 0
        this.clearSymbolRecoveryTimer()
        this.notifyStatus()
        return this.symbolMappings
      } catch (error) {
        lastError = error
        if (this.destroyed || !this.isRetryableSymbolError(error) || attempt + 1 >= this.symbolRetryMaxAttempts) throw error
        const delay = Math.min(this.symbolRetryMaxDelayMs, this.symbolRetryBaseDelayMs * (2 ** attempt))
        if (!await this.waitForSymbolRetry(delay)) throw new Error('Bitkub /symbols bootstrap ถูกยกเลิก')
      }
    }
    throw lastError || new Error('Bitkub /symbols ไม่พร้อมใช้งาน')
  }

  async fetchInitialPrices() {
    if (Object.keys(this.symbolMappings).length === 0) {
      try {
        await this.loadSymbols()
      } catch (error) {
        if (this.destroyed) return false
        this.markAllUnavailable(error.message)
        if (this.isRetryableSymbolError(error)) this.scheduleSymbolRecovery()
        return false
      }
    }

    try {
      const payload = await this.requestJSON(`${BITKUB_REST_BASE}/ticker`)
      const rows = asArray(payload)
      const byProviderSymbol = new Map(Object.entries(this.symbolMappings).map(([symbol, mapping]) => [mapping.providerSymbol, symbol]))
      let accepted = 0
      const receivedAt = this.now()
      rows.forEach((row) => {
        const symbol = byProviderSymbol.get(String(row?.symbol || '').toUpperCase())
        if (!symbol) return
        if (this.setTicker(symbol, row, {
          source: 'Bitkub REST v3 ticker snapshot',
          status: 'STALE',
          receivedAt,
          notify: false,
        })) accepted += 1
      })
      this.notifyPrices(null, { kind: 'snapshot' })
      return accepted > 0
    } catch (error) {
      this.markMissingTickersUnavailable(error.message)
      return false
    }
  }

  async loadHistoricalCandles(symbol, timeframe, { limit = HISTORICAL_CANDLE_LIMIT } = {}) {
    const mapping = this.symbolMappings[symbol]
    const interval = HISTORICAL_RESOLUTIONS[timeframe]
    const safeLimit = Math.min(1000, Math.max(1, Math.floor(Number(limit) || HISTORICAL_CANDLE_LIMIT)))
    const receivedAt = this.now()
    if (!mapping?.providerSymbol || !interval) {
      return {
        status: 'UNAVAILABLE', candles: [], source: 'Bitkub historical OHLC needs a verified /symbols mapping and supported timeframe',
        receivedAt: null, from: null, to: null,
      }
    }

    const to = Math.floor(receivedAt / 1000)
    const lastBucket = Math.floor(to / interval.seconds) * interval.seconds
    const from = lastBucket - (interval.seconds * (safeLimit - 1))
    const query = new URLSearchParams({
      symbol: mapping.providerSymbol,
      resolution: interval.resolution,
      from: String(from),
      to: String(to),
    })

    try {
      const payload = await this.requestJSON(`${BITKUB_HISTORY_URL}?${query}`)
      const candles = normalizeBitkubHistoricalCandles(payload, { from, to, now: this.now() })
      if (candles === null) {
        return { status: 'UNAVAILABLE', candles: [], source: 'Bitkub historical OHLC response failed validation', receivedAt: this.now(), from, to }
      }
      return {
        status: candles.length ? 'AVAILABLE' : 'NO_DATA',
        candles,
        source: 'Bitkub public REST /tradingview/history',
        receivedAt: this.now(),
        from,
        to,
      }
    } catch (error) {
      return {
        status: 'UNAVAILABLE', candles: [],
        source: `Bitkub historical OHLC unavailable: ${error?.message || 'request failed'}`,
        receivedAt: null, from, to,
      }
    }
  }

  async init() {
    if (this.initPromise) return this.initPromise
    if (this.isInitialized) return true
    this.destroyed = false
    this.isInitialized = true
    this.startStaleMonitor()
    this.notifyStatus()
    const initialization = (async () => {
      try {
        await this.loadSymbols()
      } catch (error) {
        if (this.destroyed) return false
        this.markAllUnavailable(error.message)
        if (this.isRetryableSymbolError(error)) this.scheduleSymbolRecovery()
        return false
      }
      if (this.destroyed) return false
      await this.fetchInitialPrices()
      if (this.destroyed) return false
      this.connectTickerSocket()
      this.connectActiveOrderBook()
      return true
    })()
    this.initPromise = initialization
    try {
      return await initialization
    } finally {
      if (this.initPromise === initialization) this.initPromise = null
    }
  }

  setActiveSymbol(symbol) {
    if (!this.pairs[symbol] || this.activeSymbol === symbol) return
    this.activeSymbol = symbol
    this.activePairRequestId += 1
    this.clearOrderBookReconnect()
    this.closeSocket('orderBookSocket')
    this.isOrderBookConnected = false
    this.orderBooks[symbol] = { asks: [], bids: [] }
    this.bookStatuses[symbol] = { status: 'UNAVAILABLE', source: 'กำลังรอ Bitkub order book snapshot', lastUpdated: null, receivedAt: null }
    this.tradeStatuses[symbol] = { status: 'UNAVAILABLE', source: 'กำลังรอ Bitkub trades snapshot', lastUpdated: null, receivedAt: null }
    this.notifyPrices(symbol, { kind: 'pair-change' })
    if (this.isInitialized) {
      this.connectActiveOrderBook()
    }
  }

  async loadActivePairSnapshot(symbol = this.activeSymbol, requestId = this.activePairRequestId) {
    const mapping = this.symbolMappings[symbol]
    if (!mapping || this.destroyed) return false
    const bookRevisionAtRequest = this.orderBookRevisions[symbol] || 0
    const tradeRevisionAtRequest = this.tradeRevisions[symbol] || 0
    const query = new URLSearchParams({ sym: mapping.providerSymbol.toLowerCase(), lmt: '100' })
    const [depthResult, tradesResult] = await Promise.allSettled([
      this.requestJSON(`${BITKUB_REST_BASE}/depth?${query}`),
      this.requestJSON(`${BITKUB_REST_BASE}/trades?${query}`),
    ])
    if (requestId !== this.activePairRequestId || symbol !== this.activeSymbol || this.destroyed) return false
    const receivedAt = this.now()

    if ((this.orderBookRevisions[symbol] || 0) === bookRevisionAtRequest && depthResult.status === 'fulfilled') {
      const depth = normalizeBitkubDepth(depthResult.value)
      if (depth) {
        this.orderBooks[symbol] = depth
        this.bookStatuses[symbol] = { status: 'STALE', source: 'Bitkub REST v3 depth snapshot', lastUpdated: receivedAt, receivedAt, timestampType: 'received' }
      } else {
        this.bookStatuses[symbol] = { status: 'UNAVAILABLE', source: 'Bitkub depth response ไม่ผ่าน validation', lastUpdated: null, receivedAt: null }
      }
    } else if ((this.orderBookRevisions[symbol] || 0) === bookRevisionAtRequest) {
      this.bookStatuses[symbol] = { status: 'UNAVAILABLE', source: depthResult.reason?.message || 'Bitkub depth unavailable', lastUpdated: null, receivedAt: null }
    }

    if ((this.tradeRevisions[symbol] || 0) === tradeRevisionAtRequest && tradesResult.status === 'fulfilled') {
      const trades = normalizeBitkubRestTrades(tradesResult.value, { receivedAt })
      if (trades) {
        this.mergeTrades(symbol, trades, { status: 'STALE', source: 'Bitkub REST v3 trades snapshot', receivedAt })
      } else {
        this.tradeStatuses[symbol] = { status: 'UNAVAILABLE', source: 'Bitkub trades response ไม่ผ่าน validation', lastUpdated: null, receivedAt: null }
      }
    } else if ((this.tradeRevisions[symbol] || 0) === tradeRevisionAtRequest) {
      this.tradeStatuses[symbol] = { status: 'UNAVAILABLE', source: tradesResult.reason?.message || 'Bitkub trades unavailable', lastUpdated: null, receivedAt: null }
    }
    this.notifyPrices(symbol, { kind: 'snapshot' })
    return true
  }

  connectTickerSocket() {
    if (this.destroyed || !this.isInitialized || this.tickerSocket) return
    const WebSocketImpl = this.getWebSocket()
    const streams = Object.values(this.symbolMappings).map((mapping) => mapping.tickerStream)
    if (typeof WebSocketImpl !== 'function' || streams.length === 0) {
      this.markTickerSocketsUnavailable('WebSocket ใช้งานไม่ได้หรือยังไม่มี symbol mapping')
      return
    }
    let socket
    try {
      socket = new WebSocketImpl(`${BITKUB_WS_BASE}/${streams.join(',')}`)
    } catch (error) {
      this.scheduleTickerReconnect(error.message)
      return
    }
    this.tickerSocket = socket
    socket.onopen = () => {
      if (this.tickerSocket !== socket) return
      this.isTickerConnected = true
      this.notifyStatus()
    }
    socket.onmessage = (event) => {
      if (this.tickerSocket !== socket) return
      this.handleTickerMessage(event?.data)
    }
    socket.onerror = () => {
      if (this.tickerSocket === socket) this.isTickerConnected = false
      this.notifyStatus()
    }
    socket.onclose = () => {
      if (this.tickerSocket !== socket) return
      this.tickerSocket = null
      this.isTickerConnected = false
      this.notifyStatus()
      this.scheduleTickerReconnect()
    }
  }

  handleTickerMessage(rawMessage) {
    let payload
    try {
      payload = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : JSON.parse(String(rawMessage))
    } catch {
      return false
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
    const mappingEntry = Object.entries(this.symbolMappings).find(([symbol, mapping]) => (
      Number(payload.id) === mapping.pairingId ||
      String(payload.symbol || '').toUpperCase() === mapping.providerSymbol ||
      String(payload.stream || '').toLowerCase() === mapping.tickerStream
    ))
    if (!mappingEntry) return false
    const [symbol] = mappingEntry
    const accepted = this.setTicker(symbol, payload, {
      source: 'Bitkub public WebSocket ticker',
      status: 'LIVE',
      receivedAt: this.now(),
    })
    if (accepted) this.tickerReconnectAttempt = 0
    return accepted
  }

  setTicker(symbol, payload, { source, status, receivedAt = this.now(), notify = true } = {}) {
    const normalized = normalizeBitkubTicker(payload, { receivedAt, source })
    if (!normalized) return false
    const previousPrice = this.prices[symbol]
    const nextStatus = normalized.status === 'STALE' ? 'STALE' : (status || normalized.status)
    normalized.status = nextStatus
    this.prices[symbol] = normalized.last
    this.tickers[symbol] = normalized
    this.symbolStatuses[symbol] = {
      status: nextStatus,
      source,
      lastUpdated: normalized.timestamp,
      receivedAt,
      timestampType: normalized.timestampType,
    }
    if (notify) {
      const direction = previousPrice === undefined || normalized.last === previousPrice ? 'none' : normalized.last > previousPrice ? 'up' : 'down'
      this.notifyPrices(symbol, { kind: 'ticker', direction })
    }
    return true
  }

  connectActiveOrderBook() {
    if (this.destroyed || !this.isInitialized || this.orderBookSocket) return
    const mapping = this.symbolMappings[this.activeSymbol]
    if (!mapping) {
      this.bookStatuses[this.activeSymbol] = { status: 'UNAVAILABLE', source: 'ไม่มี pairing_id ใน Bitkub /symbols', lastUpdated: null, receivedAt: null }
      this.notifyStatus()
      return
    }
    this.loadActivePairSnapshot(this.activeSymbol, this.activePairRequestId)
    const WebSocketImpl = this.getWebSocket()
    if (typeof WebSocketImpl !== 'function') {
      this.bookStatuses[this.activeSymbol] = { status: 'UNAVAILABLE', source: 'เบราว์เซอร์ไม่รองรับ WebSocket', lastUpdated: null, receivedAt: null }
      this.notifyStatus()
      return
    }
    let socket
    try {
      socket = new WebSocketImpl(`${BITKUB_WS_BASE}/orderbook/${mapping.pairingId}`)
    } catch (error) {
      this.scheduleOrderBookReconnect(error.message)
      return
    }
    this.orderBookSocket = socket
    const symbol = this.activeSymbol
    socket.onopen = () => {
      if (this.orderBookSocket !== socket) return
      this.isOrderBookConnected = true
      this.notifyStatus()
    }
    socket.onmessage = (event) => {
      if (this.orderBookSocket !== socket || symbol !== this.activeSymbol) return
      this.handleOrderBookMessage(symbol, event?.data)
    }
    socket.onerror = () => {
      if (this.orderBookSocket === socket) this.isOrderBookConnected = false
      this.notifyStatus()
    }
    socket.onclose = () => {
      if (this.orderBookSocket !== socket) return
      this.orderBookSocket = null
      this.isOrderBookConnected = false
      this.notifyStatus()
      this.scheduleOrderBookReconnect()
    }
  }

  handleOrderBookMessage(symbol, rawMessage) {
    let payload
    try {
      payload = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : JSON.parse(String(rawMessage))
    } catch {
      return false
    }
    const mapping = this.symbolMappings[symbol]
    if (!payload || !mapping || Number(payload.pairing_id) !== mapping.pairingId) return false
    const receivedAt = this.now()

    if (payload.event === 'depthchanged') {
      const depth = normalizeBitkubDepth(payload.data)
      if (!depth) return false
      this.orderBookRevisions[symbol] = (this.orderBookRevisions[symbol] || 0) + 1
      this.orderBooks[symbol] = depth
      this.bookStatuses[symbol] = { status: 'LIVE', source: 'Bitkub public orderbook WebSocket depthchanged', lastUpdated: receivedAt, receivedAt, timestampType: 'received' }
      this.orderBookReconnectAttempt = 0
      this.notifyPrices(symbol, { kind: 'orderbook' })
      return true
    }

    if (payload.event === 'tradeschanged') {
      const trades = normalizeBitkubWsTrades(payload, { receivedAt })
      if (!trades) return false
      this.tradeRevisions[symbol] = (this.tradeRevisions[symbol] || 0) + 1
      const added = this.mergeTrades(symbol, trades, { status: 'LIVE', source: 'Bitkub public orderbook WebSocket tradeschanged', receivedAt })
      this.orderBookReconnectAttempt = 0
      this.notifyPrices(symbol, { kind: 'trades' })
      return added
    }

    if (payload.event === 'global.ticker' && payload.data) {
      const tickerMapping = Object.entries(this.symbolMappings).find(([, entry]) => entry.pairingId === Number(payload.data.id))
      if (!tickerMapping) return false
      return this.setTicker(tickerMapping[0], payload.data, {
        source: 'Bitkub public orderbook WebSocket global.ticker',
        status: 'LIVE',
        receivedAt,
      })
    }
    return false
  }

  mergeTrades(symbol, trades, { status, source, receivedAt = this.now() } = {}) {
    if (!Array.isArray(trades) || trades.length === 0) return false
    const existing = this.recentTrades[symbol] || []
    const ids = new Set(existing.map((trade) => trade.id))
    let added = false
    trades.forEach((trade) => {
      if (!trade || ids.has(trade.id)) return
      ids.add(trade.id)
      existing.push({ ...trade, receivedAt, source })
      added = true
    })
    existing.sort((left, right) => right.timestamp - left.timestamp)
    this.recentTrades[symbol] = existing.slice(0, MAX_RECENT_TRADES)
    const latestTimestamp = Math.max(...trades.map((trade) => trade.timestamp))
    this.tradeStatuses[symbol] = {
      status: latestTimestamp < receivedAt - this.staleAfterMs ? 'STALE' : status,
      source,
      lastUpdated: latestTimestamp,
      receivedAt,
      timestampType: 'provider',
    }
    return added
  }

  startStaleMonitor() {
    if (this.staleTimer) clearInterval(this.staleTimer)
    this.staleTimer = setInterval(() => this.refreshStaleStatuses(), 5000)
  }

  refreshStaleStatuses() {
    const now = this.now()
    let changed = false
    Object.entries(this.symbolStatuses).forEach(([symbol, status]) => {
      if (status.status === 'LIVE' && Number.isFinite(status.receivedAt) && now - status.receivedAt > this.staleAfterMs) {
        this.symbolStatuses[symbol] = { ...status, status: 'STALE' }
        if (this.tickers[symbol]) this.tickers[symbol] = { ...this.tickers[symbol], status: 'STALE' }
        changed = true
      }
    })
    Object.entries(this.bookStatuses).forEach(([symbol, status]) => {
      if (status.status === 'LIVE' && Number.isFinite(status.receivedAt) && now - status.receivedAt > this.staleAfterMs) {
        this.bookStatuses[symbol] = { ...status, status: 'STALE' }
        changed = true
      }
    })
    Object.entries(this.tradeStatuses).forEach(([symbol, status]) => {
      if (status.status === 'LIVE' && Number.isFinite(status.receivedAt) && now - status.receivedAt > this.staleAfterMs) {
        this.tradeStatuses[symbol] = { ...status, status: 'STALE' }
        changed = true
      }
    })
    if (changed) this.notifyPrices(null, { kind: 'status' })
  }

  scheduleTickerReconnect(reason = null) {
    if (this.destroyed || !this.isInitialized || this.tickerReconnectTimer) return
    if (reason) this.lastTickerError = reason
    const delay = Math.min(30_000, 1000 * (2 ** this.tickerReconnectAttempt))
    this.tickerReconnectAttempt += 1
    this.tickerReconnectTimer = setTimeout(() => {
      this.tickerReconnectTimer = null
      this.connectTickerSocket()
    }, delay)
  }

  scheduleOrderBookReconnect(reason = null) {
    if (this.destroyed || !this.isInitialized || this.orderBookReconnectTimer) return
    if (reason) this.lastOrderBookError = reason
    const delay = Math.min(30_000, 1000 * (2 ** this.orderBookReconnectAttempt))
    this.orderBookReconnectAttempt += 1
    this.orderBookReconnectTimer = setTimeout(() => {
      this.orderBookReconnectTimer = null
      this.connectActiveOrderBook()
    }, delay)
  }

  clearOrderBookReconnect() {
    if (this.orderBookReconnectTimer) clearTimeout(this.orderBookReconnectTimer)
    this.orderBookReconnectTimer = null
    this.orderBookReconnectAttempt = 0
  }

  closeSocket(key) {
    const socket = this[key]
    this[key] = null
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      try { socket.close() } catch {}
    }
  }

  markMissingTickersUnavailable(message) {
    Object.keys(this.symbolMappings).forEach((symbol) => {
      if (!this.tickers[symbol]) {
        this.symbolStatuses[symbol] = { status: 'UNAVAILABLE', source: message || 'Bitkub ticker ยังไม่พร้อมใช้งาน', lastUpdated: null, receivedAt: null }
      }
    })
    this.notifyStatus()
  }

  markAllUnavailable(message) {
    Object.keys(this.symbolStatuses).forEach((symbol) => {
      if (!this.tickers[symbol]) {
        this.symbolStatuses[symbol] = { status: 'UNAVAILABLE', source: message || 'Bitkub market feed ไม่พร้อมใช้งาน', lastUpdated: null, receivedAt: null }
      }
    })
    this.notifyPrices(null, { kind: 'status' })
  }

  markTickerSocketsUnavailable(message) {
    Object.keys(this.symbolMappings).forEach((symbol) => {
      const status = this.symbolStatuses[symbol]
      if (status.status === 'UNAVAILABLE' || !status.receivedAt) {
        this.symbolStatuses[symbol] = { ...status, status: 'UNAVAILABLE', source: message, lastUpdated: null, receivedAt: null }
      }
    })
    this.notifyStatus()
  }

  destroy() {
    this.destroyed = true
    this.isInitialized = false
    this.initPromise = null
    if (this.staleTimer) clearInterval(this.staleTimer)
    if (this.tickerReconnectTimer) clearTimeout(this.tickerReconnectTimer)
    if (this.orderBookReconnectTimer) clearTimeout(this.orderBookReconnectTimer)
    this.clearSymbolRecoveryTimer()
    this.staleTimer = null
    this.tickerReconnectTimer = null
    this.orderBookReconnectTimer = null
    this.symbolRecoveryAttempt = 0
    this.pendingControllers.forEach((controller) => controller.abort())
    this.pendingControllers.clear()
    this.symbolRetryWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.resolve(false)
    })
    this.symbolRetryWaiters.clear()
    this.closeSocket('tickerSocket')
    this.closeSocket('orderBookSocket')
    this.isTickerConnected = false
    this.isOrderBookConnected = false
    this.tickerReconnectAttempt = 0
    this.orderBookReconnectAttempt = 0
    this.subscribers.clear()
    this.statusSubscribers.clear()
  }
}

export const SYMBOL_MAPPINGS = Object.fromEntries(TRADING_PAIRS.map((pair) => [pair.symbol, {
  tradingView: pair.tradingViewSymbol,
  name: pair.name,
  type: 'crypto',
}]))

export const liveMarketService = new BitkubMarketDataService()
export default liveMarketService
