import { z } from 'zod'
import { STOCK_INSTRUMENTS, resourceIdSchema, type DailyCloseQuote, type DailyCloseSnapshot } from '@finntech/contracts'
import { assessDailyClose, latestSessionAt, newYorkClock, parseCryptoDecimal, serializeCrypto, CLOSE_CORRECTIONS_MINUTES, CLOSE_PUBLISHED_MINUTES } from '@finntech/finance'
import type { PrismaClient } from '../generated/prisma/client.js'
import { cryptoForApi } from '../persistence/decimal.js'
import { parseProviderJson } from './provider-json.js'

/**
 * Shared end-of-day closes for US stocks/ETFs. One server-side cache serves every permitted account:
 * provider requests depend on the symbol catalog and trading calendar, never on the number of users.
 * The provider key stays in server memory (Authorization header only, never a URL, log or response).
 */
export type DailyCloseProblem = NonNullable<DailyCloseQuote['problem']>
export class DailyCloseProviderError extends Error {
  constructor(readonly problem: DailyCloseProblem, readonly retryAfterMs: number | null = null) { super(problem) }
}
export interface ProviderClose { tradingDate: string; close: string }
export interface DailyCloseProvider {
  readonly source: string
  readonly attribution: { label: string; url: string }
  /** Latest unadjusted close at or after `since` (YYYY-MM-DD). */
  latestClose(symbol: string, since: string): Promise<ProviderClose>
}
export interface DailyCloseRecord { source: string; symbol: string; tradingDate: string; close: string; currency: 'USD'; fetchedAt: string }
export interface DailyCloseStore {
  latest(source: string, symbols: readonly string[]): Promise<DailyCloseRecord[]>
  save(record: DailyCloseRecord): Promise<void>
}

export type DailyCloseLicense = 'REDISTRIBUTION' | 'PERSONAL'
export interface DailyCloseConfiguration {
  provider: 'tiingo'; token: string; license: DailyCloseLicense; ownerId: string | null
  symbols: readonly string[]; maxRequestsPerHour: number; maxRequestsPerDay: number
}
const LICENSES: Record<string, DailyCloseLicense> = { 'redistribution-confirmed': 'REDISTRIBUTION', 'personal-owner-only': 'PERSONAL' }
export const DAILY_CLOSE_ENV = ['DAILY_CLOSE_PROVIDER', 'TIINGO_API_TOKEN', 'DAILY_CLOSE_LICENSE', 'DAILY_CLOSE_OWNER_ID', 'DAILY_CLOSE_MAX_REQUESTS_PER_HOUR', 'DAILY_CLOSE_MAX_REQUESTS_PER_DAY'] as const
/**
 * The operator states which licence the key carries. A free/personal ("internal use") plan may only
 * serve its own holder (PERSONAL + owner id); every account needs a plan with display/redistribution
 * rights (REDISTRIBUTION). Absent variables disable the feed; partial or invalid ones throw.
 */
export function readDailyCloseConfiguration(env: NodeJS.ProcessEnv): DailyCloseConfiguration | null {
  if (DAILY_CLOSE_ENV.every(name => !env[name])) return null
  const fail = () => { throw new Error('Daily close requires DAILY_CLOSE_PROVIDER=tiingo, a server-only TIINGO_API_TOKEN and a declared DAILY_CLOSE_LICENSE; values withheld') }
  const token = env.TIINGO_API_TOKEN ?? ''
  const license = LICENSES[env.DAILY_CLOSE_LICENSE ?? '']
  if (env.DAILY_CLOSE_PROVIDER !== 'tiingo' || !/^[A-Za-z0-9]{20,128}$/.test(token) || !license) fail()
  const ownerId = license === 'PERSONAL' ? resourceIdSchema.safeParse(env.DAILY_CLOSE_OWNER_ID) : null
  if (ownerId && !ownerId.success) fail()
  if (license === 'REDISTRIBUTION' && env.DAILY_CLOSE_OWNER_ID) fail()
  const bound = (value: string | undefined, fallback: number) => {
    if (value === undefined || value === '') return fallback
    const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 100000) fail(); return n
  }
  // Defaults stay under Tiingo's published free limits (50/hour, 1,000/day); paid plans may raise them.
  return { provider: 'tiingo', token, license: license!, ownerId: ownerId?.success ? ownerId.data : null,
    symbols: STOCK_INSTRUMENTS.map(row => row.symbol), maxRequestsPerHour: bound(env.DAILY_CLOSE_MAX_REQUESTS_PER_HOUR, 40), maxRequestsPerDay: bound(env.DAILY_CLOSE_MAX_REQUESTS_PER_DAY, 500) }
}

async function boundedText(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > limit || !response.body) throw new DailyCloseProviderError('INVALID_DATA')
  const reader = response.body.getReader(), decoder = new TextDecoder(); let size = 0, text = ''
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new DailyCloseProviderError('INVALID_DATA'); text += decoder.decode(part.value, { stream: true }) }
    return text + decoder.decode()
  } finally { await reader.cancel().catch(() => {}) }
}
const tiingoRows = z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?(Z|\+00:00))?$/), close: z.string() }).passthrough()).max(64)
/** Tiingo end-of-day: `close` is the raw (unadjusted) close; adjClose is deliberately ignored. */
export class TiingoDailyProvider implements DailyCloseProvider {
  readonly source = 'Tiingo EOD'
  readonly attribution = { label: 'Tiingo', url: 'https://www.tiingo.com' }
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}
  async latestClose(symbol: string, since: string): Promise<ProviderClose> {
    const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?startDate=${since}`
    let response: Response
    try { response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json', Authorization: `Token ${this.token}` } }) }
    catch { throw new DailyCloseProviderError('UNAVAILABLE') }
    if (response.status === 401 || response.status === 403) throw new DailyCloseProviderError('AUTH_FAILED')
    if (response.status === 429) { const s = Number(response.headers.get('retry-after')); throw new DailyCloseProviderError('RATE_LIMITED', Number.isFinite(s) && s > 0 ? Math.min(s, 86400) * 1000 : null) }
    if (response.status === 404) throw new DailyCloseProviderError('NOT_FOUND')
    if (!response.ok) throw new DailyCloseProviderError('UNAVAILABLE')
    let body: unknown
    try { body = parseProviderJson(await boundedText(response, 65536)) } catch (error) { throw error instanceof DailyCloseProviderError ? error : new DailyCloseProviderError('INVALID_DATA') }
    // Tiingo reports some errors as 200 + {"detail": "..."}.
    if (!Array.isArray(body)) {
      const detail = typeof body === 'object' && body && 'detail' in body ? String((body as { detail: unknown }).detail) : ''
      throw new DailyCloseProviderError(/not found/i.test(detail) ? 'NOT_FOUND' : /token|auth|permission/i.test(detail) ? 'AUTH_FAILED' : 'INVALID_DATA')
    }
    const rows = tiingoRows.safeParse(body)
    if (!rows.success) throw new DailyCloseProviderError('INVALID_DATA')
    if (!rows.data.length) throw new DailyCloseProviderError('NOT_YET_PUBLISHED')
    const last = rows.data.reduce((a, b) => b.date > a.date ? b : a)
    try {
      const close = parseCryptoDecimal(last.close)
      if (!close.gt('0') || !close.lt('1000000000')) throw Error()
      return { tradingDate: last.date.slice(0, 10), close: serializeCrypto(close) }
    } catch { throw new DailyCloseProviderError('INVALID_DATA') }
  }
}

export class MemoryDailyCloseStore implements DailyCloseStore {
  readonly rows: DailyCloseRecord[] = []
  async latest(source: string, symbols: readonly string[]) {
    return symbols.flatMap(symbol => this.rows.filter(r => r.source === source && r.symbol === symbol).sort((a, b) => b.tradingDate.localeCompare(a.tradingDate)).slice(0, 1))
  }
  async save(record: DailyCloseRecord) {
    const i = this.rows.findIndex(r => r.source === record.source && r.symbol === record.symbol && r.tradingDate === record.tradingDate)
    if (i >= 0) this.rows[i] = record; else this.rows.push(record)
  }
}
/** owner=null: shared rows (server licence). owner id: rows fetched with that owner's own key, read back only for them. */
export function prismaDailyCloseStore(db: PrismaClient, owner: string | null = null): DailyCloseStore {
  const scope = owner ?? 'shared'
  return {
    async latest(source, symbols) {
      const rows = await db.dailyClosePrice.findMany({ where: { source, scope, symbol: { in: [...symbols] } }, orderBy: [{ symbol: 'asc' }, { tradingDate: 'desc' }], distinct: ['symbol'] })
      return rows.map(r => ({ source: r.source, symbol: r.symbol, tradingDate: r.tradingDate.toISOString().slice(0, 10), close: cryptoForApi(r.close), currency: 'USD' as const, fetchedAt: r.fetchedAt.toISOString() }))
    },
    async save(r) {
      const tradingDate = new Date(r.tradingDate + 'T00:00:00.000Z'), fetchedAt = new Date(r.fetchedAt)
      await db.dailyClosePrice.upsert({ where: { source_scope_symbol_tradingDate: { source: r.source, scope, symbol: r.symbol, tradingDate } },
        update: { close: r.close, fetchedAt }, create: { source: r.source, scope, ownerId: owner, symbol: r.symbol, tradingDate, close: r.close, currency: r.currency, fetchedAt } })
    },
  }
}

const MINUTE = 60000, HOUR = 60 * MINUTE
/** Not yet published at the expected time: try again in 30 minutes (until the provider catches up). */
export const NOT_PUBLISHED_RETRY_MS = 30 * MINUTE
const daysBefore = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00.000Z') - days * 86400000).toISOString().slice(0, 10)

export class DailyCloseRelay {
  private readonly records = new Map<string, DailyCloseRecord>()
  private readonly problems = new Map<string, DailyCloseProblem | null>()
  private readonly nextAttempt = new Map<string, number>()
  private readonly failures = new Map<string, number>()
  private readonly requests: number[] = []
  private pausedUntil = 0
  /** Provider-wide refusal while paused; read per quote so it clears itself when the pause ends. */
  private pauseProblem: DailyCloseProblem | null = null
  /** Set by stop(): no further provider calls or writes, including from a refresh already running. */
  private halted = false
  private loaded = false
  private loading: Promise<void> | null = null
  private flight: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  constructor(private readonly config: DailyCloseConfiguration | null, private readonly provider: DailyCloseProvider | null,
    private readonly store: DailyCloseStore, private readonly clock: () => number = Date.now, private readonly log: (line: string) => void = line => console.info(line)) {}

  get configured(): boolean { return !!this.config && !!this.provider }
  allowsOwner(ownerId: string): boolean { return !!this.config && (this.config.license === 'REDISTRIBUTION' || this.config.ownerId === ownerId) }
  /** Requests made in the last hour/day (for operators and tests; never includes symbols or keys). */
  usage(): { lastHour: number; lastDay: number } { this.prune(); const now = this.clock(); return { lastHour: this.requests.filter(t => now - t < HOUR).length, lastDay: this.requests.length } }

  async snapshotFor(ownerId: string): Promise<DailyCloseSnapshot> {
    const now = this.clock(), expectedSession = latestSessionAt(now, CLOSE_PUBLISHED_MINUTES)
    if (!this.config || !this.provider) return { provider: 'NOT_CONFIGURED', source: null, license: null, expectedSession, attribution: null, quotes: [] }
    if (!this.allowsOwner(ownerId)) return { provider: 'NOT_LICENSED', source: this.provider.source, license: this.config.license, expectedSession, attribution: null, quotes: [] }
    await this.load()
    void this.refresh()
    return { provider: 'READY', source: this.provider.source, license: this.config.license, expectedSession, attribution: this.provider.attribution,
      quotes: this.config.symbols.map(symbol => this.quote(symbol, now)) }
  }
  private quote(symbol: string, now: number): DailyCloseQuote {
    const record = this.records.get(symbol), problem = this.problems.get(symbol) ?? (now < this.pausedUntil ? this.pauseProblem : null)
    if (!record) return { symbol, currency: 'USD', priceType: 'CLOSE', close: null, tradingDate: null, fetchedAt: null, status: problem && problem !== 'NOT_YET_PUBLISHED' ? 'ERROR' : 'MISSING', problem }
    const state = assessDailyClose(record.tradingDate, now).state
    return { symbol, currency: 'USD', priceType: 'CLOSE', close: record.close, tradingDate: record.tradingDate, fetchedAt: record.fetchedAt, status: state === 'CURRENT' || state === 'DELAYED' ? state : 'STALE', problem }
  }
  private load(): Promise<void> {
    if (this.loaded || !this.provider || !this.config) return Promise.resolve()
    this.loading ??= this.store.latest(this.provider.source, this.config.symbols)
      .then(rows => { for (const row of rows) if (!this.records.has(row.symbol) || this.records.get(row.symbol)!.tradingDate < row.tradingDate) this.records.set(row.symbol, row); this.loaded = true })
      .catch(() => { this.log('Daily close store unavailable; using in-memory closes only (details withheld)') })
      .finally(() => { this.loading = null })
    return this.loading
  }
  /** One shared refresh at a time, however many accounts are reading. */
  refresh(): Promise<void> {
    if (!this.config || !this.provider || this.halted) return Promise.resolve()
    this.flight ??= this.run().finally(() => { this.flight = null })
    return this.flight
  }
  start(intervalMs = 15 * MINUTE): void {
    if (!this.configured || this.timer || this.halted) return
    void this.load().then(() => this.refresh())
    this.timer = setInterval(() => { void this.refresh() }, intervalMs); this.timer.unref?.()
  }
  /** Permanent: a refresh in progress stops before its next provider call and stores nothing more. */
  stop(): void { this.halted = true; if (this.timer) clearInterval(this.timer); this.timer = undefined }
  /** Resolves once any refresh in progress has finished (after stop(), within one provider call). */
  settled(): Promise<void> { return this.flight ? this.flight.catch(() => {}) : Promise.resolve() }

  private due(symbol: string, now: number, expected: string): boolean {
    if (now < (this.nextAttempt.get(symbol) ?? 0)) return false
    const record = this.records.get(symbol)
    if (!record || record.tradingDate < expected) return true
    // Exactly one later refetch picks up exchange corrections published until ~20:00 New York.
    const fetched = newYorkClock(Date.parse(record.fetchedAt)), clock = newYorkClock(now)
    const fetchedBeforeCorrections = fetched.date < record.tradingDate || (fetched.date === record.tradingDate && fetched.minutes < CLOSE_CORRECTIONS_MINUTES)
    const correctionsDone = clock.date > record.tradingDate || clock.minutes >= CLOSE_CORRECTIONS_MINUTES
    return fetchedBeforeCorrections && correctionsDone
  }
  private prune(): void { const now = this.clock(); while (this.requests.length && now - this.requests[0]! >= 24 * HOUR) this.requests.shift() }
  private takeBudget(): boolean {
    this.prune(); const now = this.clock()
    if (this.requests.length >= this.config!.maxRequestsPerDay || this.requests.filter(t => now - t < HOUR).length >= this.config!.maxRequestsPerHour) return false
    this.requests.push(now); return true
  }
  private async run(): Promise<void> {
    await this.load()
    let updated = 0, session = ''
    for (const symbol of this.config!.symbols) {
      const now = this.clock(), expected = latestSessionAt(now, CLOSE_PUBLISHED_MINUTES); session = expected
      if (this.halted || now < this.pausedUntil) break
      if (!this.due(symbol, now, expected)) continue
      if (!this.takeBudget()) { this.problems.set(symbol, 'BUDGET_EXHAUSTED'); this.nextAttempt.set(symbol, now + 15 * MINUTE); continue }
      try {
        const result = await this.provider!.latestClose(symbol, daysBefore(expected, 14))
        // A key removed or replaced while this request was in flight must not leave data behind.
        if (this.halted) break
        const at = this.clock(), assessment = assessDailyClose(result.tradingDate, at)
        if (assessment.state === 'INVALID') throw new DailyCloseProviderError('INVALID_DATA')
        const previous = this.records.get(symbol)
        // Never replace a newer session with an older one; the same session may be corrected.
        if (!previous || result.tradingDate >= previous.tradingDate) {
          const record: DailyCloseRecord = { source: this.provider!.source, symbol, tradingDate: result.tradingDate, close: result.close, currency: 'USD', fetchedAt: new Date(at).toISOString() }
          this.records.set(symbol, record); updated++
          await this.store.save(record).catch(() => { this.log('Daily close could not be persisted; kept in memory (details withheld)') })
        }
        this.failures.set(symbol, 0)
        const latest = this.records.get(symbol)!.tradingDate
        if (latest < expected) { this.problems.set(symbol, 'NOT_YET_PUBLISHED'); this.nextAttempt.set(symbol, at + NOT_PUBLISHED_RETRY_MS) }
        else { this.problems.set(symbol, null); this.nextAttempt.delete(symbol) }
      } catch (error) {
        const at = this.clock(), problem = error instanceof DailyCloseProviderError ? error.problem : 'UNAVAILABLE'
        const n = (this.failures.get(symbol) ?? 0) + 1; this.failures.set(symbol, n); this.problems.set(symbol, problem)
        this.nextAttempt.set(symbol, at + (problem === 'NOT_FOUND' ? 6 * HOUR : problem === 'NOT_YET_PUBLISHED' ? NOT_PUBLISHED_RETRY_MS : Math.min(HOUR, MINUTE * 2 ** Math.min(n - 1, 6))))
        if (problem === 'AUTH_FAILED' || problem === 'RATE_LIMITED') {
          const wait = problem === 'AUTH_FAILED' ? HOUR : (error as DailyCloseProviderError).retryAfterMs ?? 15 * MINUTE
          this.pausedUntil = at + wait; this.pauseProblem = problem
          this.log(`Daily close provider ${problem}; pausing ${Math.round(wait / MINUTE)} min (details withheld)`)
          break
        }
      }
    }
    if (updated) this.log(`Daily close (${this.provider!.source}): stored ${updated} close(s); expected session ${session}`)
  }
}
