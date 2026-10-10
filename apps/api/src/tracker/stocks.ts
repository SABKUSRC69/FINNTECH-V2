import { WebSocket } from 'ws'
import { resourceIdSchema, stockSymbolSchema, type StockMarketSnapshot } from '@finntech/contracts'
import { isTradingDay, newYorkClock, parseCryptoDecimal, serializeCrypto, MARKET_CLOSE_MINUTES } from '@finntech/finance'
import { parseProviderJson } from './provider-json.js'

// Explicit IEX endpoints: the free Basic plan is IEX-only, so SIP is never requested by accident.
const streamUrl = 'wss://stream.data.alpaca.markets/v2/iex'
const latestUrl = 'https://data.alpaca.markets/v2/stocks/trades/latest'
/** Alpaca Basic: up to 30 subscribed stock symbols on the real-time IEX stream. */
export const ALPACA_BASIC_SYMBOL_LIMIT = 30
const LIVE_MAX_AGE_MS = 30_000
const CLOCK_SKEW_MS = 2_000
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
  if (symbols.length < 1 || symbols.length > ALPACA_BASIC_SYMBOL_LIMIT) throw new Error('Alpaca IEX watchlist requires 1 to 30 symbols')
  return { keyId: values[0]!, secret: values[1]!, ownerId, symbols }
}

/**
 * US regular session (09:30–16:00 America/New_York on NYSE trading days, so weekends and rule-based
 * exchange holidays report CLOSED). Early-close days (13:00) are not modelled: quotes then read STALE.
 */
export function usRegularSession(now: number): boolean {
  const { date, minutes } = newYorkClock(now)
  return isTradingDay(date) && minutes >= 9 * 60 + 30 && minutes < MARKET_CLOSE_MINUTES
}

type Connection = StockMarketSnapshot['connection']
type Quote = { price: string; observedAt: string; received: number; observed: number; subMs: number; tradeId: string | null }
type SocketFactory = () => WebSocket
export type HeldSymbols = () => Promise<readonly string[]>
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?Z$/
/** Provider errors mapped to a sanitized state and a bounded retry delay (never a tight loop). */
const providerErrors: Record<string, { connection: Connection; retryMs: number; reason: string }> = {
  '402': { connection: 'AUTH_FAILED', retryMs: 10 * 60_000, reason: 'authentication failed' },
  '406': { connection: 'CONNECTION_LIMIT', retryMs: 30_000, reason: 'connection limit exceeded (another session uses this account)' },
  '409': { connection: 'NOT_ENTITLED', retryMs: 30 * 60_000, reason: 'insufficient market data subscription' },
  '410': { connection: 'NOT_ENTITLED', retryMs: 30 * 60_000, reason: 'invalid subscribe action for this feed' },
  '405': { connection: 'UNAVAILABLE', retryMs: 5 * 60_000, reason: 'symbol limit exceeded' },
}

/** One IEX connection per configured account and owner. No trading API, orders, or browser credentials. */
export class StockMarketRelay {
  private socket: WebSocket | null = null
  private quotes = new Map<string, Quote>()
  private connection: Connection = 'NOT_CONFIGURED'
  private problem: Connection | null = null
  private authenticated = false
  private subscribed = new Set<string>()
  private held: readonly string[] = []
  private heldPending: Promise<void> | null = null
  /** Set when the ledger changed after the pending lookup began, so its result is not trusted for 60 s. */
  private heldChanged = false
  private nextHeld = 0
  private nextAttempt = 0
  private failures = 0
  private lastAccess = 0
  private seedPending: Promise<void> | null = null
  private nextSeed = 0
  private deadline: ReturnType<typeof setTimeout> | undefined
  private idle: ReturnType<typeof setInterval>
  private stopped = false
  private listeners = new Set<() => void>()
  private lastDiagnostic = new Map<string, number>()
  private observedSymbols = new Set<string>()
  readonly ownerId: string | null

  constructor(private readonly config: StockConfiguration | null,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly socketFactory: SocketFactory = () => new WebSocket(streamUrl, {
      handshakeTimeout: 5000, maxPayload: 1_048_576, perMessageDeflate: false, followRedirects: false,
    }),
    private readonly heldSymbols: HeldSymbols | null = null,
    private readonly log: (line: string) => void = line => console.info(line)) {
    this.ownerId = config?.ownerId ?? null
    if (config) this.connection = 'UNAVAILABLE'
    this.idle = setInterval(() => {
      if (this.socket && this.now() - this.lastAccess > 60_000) { this.diagnose('idle; disconnecting until next owner request'); this.disconnect(false) }
    }, 10_000)
    this.idle.unref()
  }

  allowsOwner(ownerId: string): boolean { return this.ownerId === null || this.ownerId === ownerId }
  /** Called after the owner's stock ledger changes so newly held symbols are subscribed promptly. */
  holdingsChanged(ownerId: string): void { if (ownerId === this.ownerId) { this.nextHeld = 0; this.heldChanged = true } }
  onUpdate(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private changed(): void { for (const listener of this.listeners) { try { listener() } catch { /* listener faults stay local */ } } }

  /** Sanitized, de-duplicated operator diagnostics: states, codes and counts only — never keys or payloads. */
  private diagnose(message: string): void {
    const at = this.now(), previous = this.lastDiagnostic.get(message)
    if (previous !== undefined && at - previous < 60_000) return
    this.lastDiagnostic.set(message, at)
    this.log(`Alpaca IEX: ${message}`)
  }

  /** Held symbols first (deterministic), then the configured watchlist, within the Basic symbol limit. */
  private plan(): { desired: string[]; excluded: string[] } {
    const ordered = [...new Set([...this.held, ...(this.config?.symbols ?? defaultSymbols)])]
    return { desired: ordered.slice(0, ALPACA_BASIC_SYMBOL_LIMIT), excluded: ordered.slice(ALPACA_BASIC_SYMBOL_LIMIT) }
  }

  private accept(symbol: string, price: unknown, timestamp: unknown, tradeId: unknown): boolean {
    if (!this.plan().desired.includes(symbol) || typeof price !== 'string' || typeof timestamp !== 'string') return false
    // Provider time, not receipt time, determines freshness (including weekends/closed markets).
    const match = timestampPattern.exec(timestamp)
    if (!match) return false
    const observed = Date.parse(timestamp)
    if (!Number.isFinite(observed) || observed > this.now() + CLOCK_SKEW_MS) return false
    let amount
    try { amount = parseCryptoDecimal(price) } catch { return false }
    if (!amount.greaterThan('0')) return false
    const subMs = Number((match[1] ?? '').padEnd(9, '0').slice(3))
    const previous = this.quotes.get(symbol)
    if (previous && (observed < previous.observed || (observed === previous.observed && subMs < previous.subMs))) return false
    this.quotes.set(symbol, { price: serializeCrypto(amount), observedAt: timestamp, observed, subMs, received: this.now(),
      tradeId: typeof tradeId === 'string' ? tradeId : null })
    if (!this.observedSymbols.has(symbol)) {
      this.observedSymbols.add(symbol)
      this.diagnose(`first trade observed for ${symbol} (provider-to-receipt ${Math.max(0, this.now() - observed)} ms)`)
    }
    return true
  }

  /** A correction replaces the held trade's price; a cancel/error removes it and forces a REST reseed. */
  private reconcile(event: Record<string, unknown>): boolean {
    if (typeof event.S !== 'string') return false
    const quote = this.quotes.get(event.S)
    if (!quote) return false
    const target = event.T === 'c' ? event.oi : event.i
    if (quote.tradeId !== null && typeof target === 'string' && target !== quote.tradeId) return false
    if (event.T === 'c' && quote.tradeId !== null && typeof event.cp === 'string') {
      try {
        const corrected = parseCryptoDecimal(event.cp)
        if (corrected.greaterThan('0')) {
          this.quotes.set(event.S, { ...quote, price: serializeCrypto(corrected), tradeId: typeof event.ci === 'string' ? event.ci : null })
          return true
        }
      } catch { /* fall through to removal */ }
    }
    this.quotes.delete(event.S); this.nextSeed = 0
    return true
  }

  private async seed(): Promise<void> {
    if (!this.config) return
    const { desired } = this.plan()
    try {
      const response = await this.request(`${latestUrl}?feed=iex&symbols=${encodeURIComponent(desired.join(','))}`, {
        headers: { 'APCA-API-KEY-ID': this.config.keyId, 'APCA-API-SECRET-KEY': this.config.secret },
        signal: AbortSignal.timeout(5000), redirect: 'error',
      })
      if (!response.ok) { this.diagnose(`REST latest-trade seed HTTP ${response.status}`); return }
      const body = parseProviderJson(await response.text())
      if (!record(body) || !record(body.trades)) return
      let accepted = 0
      for (const [symbol, trade] of Object.entries(body.trades)) {
        if (record(trade) && this.accept(symbol, trade.p, trade.t, trade.i)) accepted++
      }
      if (accepted) this.changed()
    } catch { this.diagnose('REST latest-trade seed unavailable') }
    finally { this.nextSeed = this.now() + 60_000 }
  }

  private refreshHeld(): void {
    if (!this.heldSymbols || this.heldPending || this.now() < this.nextHeld) return
    this.heldChanged = false
    this.heldPending = this.heldSymbols().then(list => {
      const valid = [...new Set(list.flatMap(symbol => { const parsed = stockSymbolSchema.safeParse(symbol); return parsed.success ? [parsed.data] : [] }))].sort()
      if (valid.join(',') !== this.held.join(',')) { this.held = valid; this.resubscribe(); this.changed() }
    }).catch(() => { this.diagnose('held-symbol lookup unavailable; watchlist kept') })
      // A ledger change during the lookup may be missing from its result: look again on the next request.
      .finally(() => { this.heldPending = null; this.nextHeld = this.heldChanged ? 0 : this.now() + 60_000 })
  }

  /** Sends only the subscription difference on the existing authenticated socket. */
  private resubscribe(): void {
    if (!this.socket || !this.authenticated) return
    const { desired } = this.plan()
    const add = desired.filter(symbol => !this.subscribed.has(symbol)), remove = [...this.subscribed].filter(symbol => !desired.includes(symbol))
    if (remove.length) this.socket.send(JSON.stringify({ action: 'unsubscribe', trades: remove }))
    if (add.length) this.socket.send(JSON.stringify({ action: 'subscribe', trades: add }))
  }

  private disconnect(failed: boolean, retryMs?: number): void {
    if (this.deadline) clearTimeout(this.deadline)
    const socket = this.socket
    this.socket = null
    this.authenticated = false
    this.subscribed.clear()
    this.connection = this.config ? 'UNAVAILABLE' : 'NOT_CONFIGURED'
    if (failed) {
      this.failures = Math.min(this.failures + 1, 6)
      const delay = retryMs ?? Math.min(1000 * 2 ** this.failures, 60_000)
      this.nextAttempt = this.now() + delay
      this.diagnose(`${this.problem ?? 'stream unavailable'}; retry in ${Math.round(delay / 1000)} s`)
    }
    socket?.terminate()
    this.changed()
  }

  private connect(): void {
    if (!this.config || this.stopped) return
    this.connection = 'CONNECTING'
    let socket: WebSocket
    try { socket = this.socketFactory() } catch { this.disconnect(true); return }
    this.socket = socket
    this.diagnose('connecting to v2/iex')
    this.deadline = setTimeout(() => { if (this.socket === socket && this.connection !== 'STREAMING') this.disconnect(true) }, 10_000)
    this.deadline.unref()
    socket.on('open', () => {
      if (this.socket === socket) socket.send(JSON.stringify({ action: 'auth', key: this.config!.keyId, secret: this.config!.secret }))
    })
    socket.on('message', data => {
      if (this.socket !== socket) return
      let events: unknown
      try { events = parseProviderJson(data.toString()) } catch { this.disconnect(true); return }
      if (!Array.isArray(events)) { this.disconnect(true); return }
      let updated = false
      for (const event of events) {
        if (!record(event)) continue
        if (event.T === 'error') {
          const known = providerErrors[String(event.code)]
          this.problem = known?.connection ?? 'UNAVAILABLE'
          this.diagnose(`provider error ${String(event.code).replace(/[^0-9]/g, '').slice(0, 3)} (${known?.reason ?? 'stream error'})`)
          this.disconnect(true, known?.retryMs); return
        }
        if (event.T === 'success' && event.msg === 'authenticated') {
          this.authenticated = true; this.problem = null
          this.diagnose('authenticated')
          socket.send(JSON.stringify({ action: 'subscribe', trades: this.plan().desired }))
        } else if (this.authenticated && event.T === 'subscription' && Array.isArray(event.trades)) {
          this.subscribed = new Set(event.trades.filter((s): s is string => typeof s === 'string'))
          // The first connection streams only once every planned symbol is confirmed; otherwise the
          // connect deadline retries. Later partial acks (unsubscribe before subscribe) keep streaming.
          if (this.connection !== 'STREAMING' && !this.plan().desired.every(symbol => this.subscribed.has(symbol))) {
            this.diagnose(`subscription incomplete (${this.subscribed.size} confirmed); waiting for the rest`); continue
          }
          this.connection = 'STREAMING'; this.failures = 0
          if (this.deadline) clearTimeout(this.deadline)
          this.diagnose(`subscribed ${this.subscribed.size} symbols (${this.held.length} held)`)
          this.nextSeed = 0; updated = true
        } else if (this.connection === 'STREAMING' && event.T === 't' && typeof event.S === 'string') {
          updated = this.accept(event.S, event.p, event.t, event.i) || updated
        } else if (event.T === 'c' || event.T === 'x') {
          updated = this.reconcile(event) || updated
        }
      }
      if (updated) this.changed()
    })
    socket.on('error', () => { if (this.socket === socket) this.disconnect(true) })
    socket.on('close', () => { if (this.socket === socket) this.disconnect(true) })
  }

  async snapshot(): Promise<StockMarketSnapshot> {
    const now = this.now()
    this.lastAccess = now
    this.refreshHeld()
    if (!this.socket && now >= this.nextAttempt) this.connect()
    if (!this.stopped && this.authenticated && !this.seedPending && now >= this.nextSeed) {
      this.seedPending = this.seed().finally(() => { this.seedPending = null })
    }
    const regular = usRegularSession(now), { desired, excluded } = this.plan()
    const connection = this.connection === 'STREAMING' || !this.problem ? this.connection : this.problem
    return { source: 'Alpaca IEX', currency: 'USD', connection, session: regular ? 'REGULAR' : 'CLOSED', excluded,
      quotes: desired.map(symbol => {
        const quote = this.quotes.get(symbol)
        const fresh = !!quote && this.connection === 'STREAMING' && now - quote.observed <= LIVE_MAX_AGE_MS && now - quote.received <= LIVE_MAX_AGE_MS
        return { symbol, price: quote?.price ?? null, observedAt: quote?.observedAt ?? null,
          receivedAt: quote ? new Date(quote.received).toISOString() : null,
          status: !quote ? 'UNAVAILABLE' : fresh ? 'LIVE' : regular ? 'STALE' : 'CLOSED' }
      }) }
  }

  stop(): void { this.stopped = true; clearInterval(this.idle); this.disconnect(false) }
}
