import { WebSocket } from 'ws'
import { resourceIdSchema, stockSymbolSchema, type StockMarketSnapshot } from '@finntech/contracts'
import { parseCryptoDecimal, serializeCrypto } from '@finntech/finance'
import { parseProviderJson } from './provider-json.js'

const streamUrl = 'wss://stream.data.alpaca.markets/v2/iex'
const latestUrl = 'https://data.alpaca.markets/v2/stocks/trades/latest'
const defaultSymbols = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'INTC',
  'QCOM', 'ORCL', 'CRM', 'ADBE', 'NFLX', 'JPM', 'BAC', 'V', 'MA', 'WMT',
  'COST', 'KO', 'PEP', 'XOM', 'CVX', 'JNJ', 'PG', 'UNH', 'SPY', 'QQQ',
]
export interface StockConfiguration { keyId: string; secret: string; ownerId: string; symbols: readonly string[] }

export function readStockConfiguration(env: NodeJS.ProcessEnv): StockConfiguration | null {
  const values = [env.ALPACA_API_KEY_ID, env.ALPACA_API_SECRET_KEY, env.ALPACA_OWNER_ID]
  if (values.every(value => !value)) return null
  if (values.some(value => !value || /[<>\s]/.test(value)) || env.ALPACA_PERSONAL_USE !== 'confirmed') {
    throw new Error('Alpaca requires server-only keys, owner ID and confirmed personal use; values withheld')
  }
  const ownerId = resourceIdSchema.parse(env.ALPACA_OWNER_ID)
  const symbols = [...new Set((env.ALPACA_SYMBOLS?.split(',') ?? defaultSymbols).map(value => stockSymbolSchema.parse(value)))]
  if (symbols.length < 1 || symbols.length > 30) throw new Error('Alpaca IEX watchlist requires 1 to 30 symbols')
  return { keyId: values[0]!, secret: values[1]!, ownerId, symbols }
}

type Quote = { price: string; observedAt: string; received: number; observed: number }
type SocketFactory = () => WebSocket
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** One IEX connection for one configured owner. No trading API, orders, or browser credentials. */
export class StockMarketRelay {
  private socket: WebSocket | null = null
  private quotes = new Map<string, Quote>()
  private connection: StockMarketSnapshot['connection'] = 'NOT_CONFIGURED'
  private authenticated = false
  private nextAttempt = 0
  private failures = 0
  private lastAccess = 0
  private seedPending: Promise<void> | null = null
  private nextSeed = 0
  private deadline: ReturnType<typeof setTimeout> | undefined
  private idle: ReturnType<typeof setInterval>
  private stopped = false
  readonly ownerId: string | null

  constructor(private readonly config: StockConfiguration | null,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly socketFactory: SocketFactory = () => new WebSocket(streamUrl, {
      handshakeTimeout: 5000, maxPayload: 1_048_576, perMessageDeflate: false, followRedirects: false,
    })) {
    this.ownerId = config?.ownerId ?? null
    if (config) this.connection = 'UNAVAILABLE'
    this.idle = setInterval(() => {
      if (this.socket && this.now() - this.lastAccess > 60_000) this.disconnect(false)
    }, 10_000)
    this.idle.unref()
  }

  allowsOwner(ownerId: string): boolean { return this.ownerId === null || this.ownerId === ownerId }

  private accept(symbol: string, price: unknown, timestamp: unknown): void {
    if (!this.config?.symbols.includes(symbol) || typeof price !== 'string' || typeof timestamp !== 'string') return
    // Provider time, not receipt time, determines freshness (including weekends/closed markets).
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp)) return
    const observed = Date.parse(timestamp)
    if (!Number.isFinite(observed) || observed > this.now()) return
    const amount = parseCryptoDecimal(price)
    if (!amount.greaterThan('0')) throw new Error('invalid_provider_price')
    const previous = this.quotes.get(symbol)
    if (previous && previous.observedAt > timestamp && previous.observed >= observed) return
    this.quotes.set(symbol, { price: serializeCrypto(amount), observedAt: timestamp, observed, received: this.now() })
  }

  private async seed(): Promise<void> {
    if (!this.config) return
    try {
      const response = await this.request(`${latestUrl}?feed=iex&symbols=${encodeURIComponent(this.config.symbols.join(','))}`, {
        headers: { 'APCA-API-KEY-ID': this.config.keyId, 'APCA-API-SECRET-KEY': this.config.secret },
        signal: AbortSignal.timeout(5000), redirect: 'error',
      })
      if (!response.ok) return
      const body = parseProviderJson(await response.text())
      if (!record(body) || !record(body.trades)) return
      for (const [symbol, trade] of Object.entries(body.trades)) {
        if (record(trade)) { try { this.accept(symbol, trade.p, trade.t) } catch { /* Reject just the invalid observation. */ } }
      }
    } catch { /* Never expose upstream responses, headers, or credentials. */ }
    finally { this.nextSeed = this.now() + 60_000 }
  }

  private disconnect(failed: boolean): void {
    if (this.deadline) clearTimeout(this.deadline)
    const socket = this.socket
    this.socket = null
    this.authenticated = false
    this.connection = this.config ? 'UNAVAILABLE' : 'NOT_CONFIGURED'
    if (failed) {
      this.failures = Math.min(this.failures + 1, 6)
      this.nextAttempt = this.now() + Math.min(1000 * 2 ** this.failures, 60_000)
    }
    socket?.terminate()
  }

  private connect(): void {
    if (!this.config || this.stopped) return
    this.connection = 'CONNECTING'
    let socket: WebSocket
    try { socket = this.socketFactory() } catch { this.disconnect(true); return }
    this.socket = socket
    this.deadline = setTimeout(() => { if (this.socket === socket && this.connection !== 'STREAMING') this.disconnect(true) }, 10_000)
    this.deadline.unref()
    socket.on('open', () => {
      if (this.socket === socket) socket.send(JSON.stringify({ action: 'auth', key: this.config!.keyId, secret: this.config!.secret }))
    })
    socket.on('message', data => {
      if (this.socket !== socket) return
      try {
        const events = parseProviderJson(data.toString())
        if (!Array.isArray(events)) throw new Error('invalid_provider_message')
        for (const event of events) {
          if (!record(event)) continue
          if (event.T === 'error') { this.disconnect(true); return }
          if (event.T === 'success' && event.msg === 'authenticated') {
            this.authenticated = true
            socket.send(JSON.stringify({ action: 'subscribe', trades: this.config!.symbols }))
          } else if (this.authenticated && event.T === 'subscription' && Array.isArray(event.trades)
            && this.config!.symbols.every(symbol => (event.trades as unknown[]).includes(symbol))) {
            this.connection = 'STREAMING'; this.failures = 0
            if (this.deadline) clearTimeout(this.deadline)
          } else if (this.connection === 'STREAMING' && event.T === 't' && typeof event.S === 'string') {
            this.accept(event.S, event.p, event.t)
          } else if ((event.T === 'c' || event.T === 'x') && typeof event.S === 'string') {
            // A correction/cancel invalidates the last observation; the REST seed can reconcile it.
            this.quotes.delete(event.S); this.nextSeed = 0
          }
        }
      } catch { this.disconnect(true) }
    })
    socket.on('error', () => { if (this.socket === socket) this.disconnect(true) })
    socket.on('close', () => { if (this.socket === socket) this.disconnect(true) })
  }

  async snapshot(): Promise<StockMarketSnapshot> {
    this.lastAccess = this.now()
    if (!this.socket && this.now() >= this.nextAttempt) this.connect()
    if (!this.stopped && this.authenticated && !this.seedPending && this.now() >= this.nextSeed) {
      this.seedPending = this.seed().finally(() => { this.seedPending = null })
    }
    return { source: 'Alpaca IEX', currency: 'USD', connection: this.connection,
      quotes: (this.config?.symbols ?? defaultSymbols).map(symbol => {
        const quote = this.quotes.get(symbol)
        return { symbol, price: quote?.price ?? null, observedAt: quote?.observedAt ?? null,
          receivedAt: quote ? new Date(quote.received).toISOString() : null,
          status: !quote ? 'UNAVAILABLE' : this.connection !== 'STREAMING' || this.now() - quote.observed > 30_000 ? 'STALE' : 'LIVE' }
      }) }
  }

  stop(): void { this.stopped = true; clearInterval(this.idle); this.disconnect(false) }
}
