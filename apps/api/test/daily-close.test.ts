// SYNTHETIC: every provider response in this file is fabricated test data, not market evidence.
import { describe, it, expect, vi } from 'vitest'
import { dailyCloseSnapshotSchema } from '@finntech/contracts'
import { DailyCloseRelay, DailyCloseProviderError, MemoryDailyCloseStore, TiingoDailyProvider, readDailyCloseConfiguration,
  type DailyCloseConfiguration, type DailyCloseProvider, type ProviderClose } from '../src/tracker/daily-close.js'

const TOKEN = 'SyntheticToken0123456789abcdef'
const OWNER = '00000000-0000-4000-8000-00000000000a', OTHER = '00000000-0000-4000-8000-00000000000b'
const at = (iso: string) => Date.parse(iso)
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const config = (over: Partial<DailyCloseConfiguration> = {}): DailyCloseConfiguration =>
  ({ provider: 'tiingo', token: TOKEN, license: 'REDISTRIBUTION', ownerId: null, symbols: ['AAPL', 'SPY'], maxRequestsPerHour: 40, maxRequestsPerDay: 500, ...over })
/** Scripted provider: answers per symbol from a mutable table; throws when the entry is an error. */
function scripted(table: Record<string, ProviderClose | DailyCloseProviderError>) {
  const calls: string[] = []
  const provider: DailyCloseProvider = { source: 'Synthetic EOD', attribution: { label: 'Synthetic', url: 'https://example.test' },
    async latestClose(symbol) { calls.push(symbol); const r = table[symbol]; if (!r) throw new DailyCloseProviderError('NOT_FOUND'); if (r instanceof Error) throw r; return r } }
  return { provider, calls, table }
}
function relayAt(start: string, table: Record<string, ProviderClose | DailyCloseProviderError>, over: Partial<DailyCloseConfiguration> = {}, store = new MemoryDailyCloseStore()) {
  const clock = { now: at(start) }, logs: string[] = [], s = scripted(table)
  const relay = new DailyCloseRelay(config(over), s.provider, store, () => clock.now, line => logs.push(line))
  return { relay, clock, logs, store, ...s }
}
const quote = async (relay: DailyCloseRelay, symbol: string, owner = OWNER) => {
  const snap = dailyCloseSnapshotSchema.parse(await relay.snapshotFor(owner)); await relay.refresh()
  return dailyCloseSnapshotSchema.parse(await relay.snapshotFor(owner)).quotes.find(q => q.symbol === symbol)!
}

describe('Tiingo end-of-day adapter (fake HTTP)', () => {
  const tiingo = (body: unknown, init: ResponseInit = {}) => {
    const fetcher = vi.fn(async (_url: unknown, _o: RequestInit) => new Response(typeof body === 'string' ? body : JSON.stringify(body), init))
    return { fetcher, provider: new TiingoDailyProvider(TOKEN, fetcher as typeof fetch) }
  }
  it('uses the raw close (not adjClose) of the latest row, key only in the Authorization header', async () => {
    // Numbers stay lexemes until Decimal parsing: 227.520000000000010 must not pass through a float.
    const { fetcher, provider } = tiingo('[{"date":"2026-10-08T00:00:00.000Z","close":225.1,"adjClose":224.9},{"date":"2026-10-09T00:00:00.000Z","close":227.520000000000010,"adjClose":226.0,"volume":1}]')
    expect(await provider.latestClose('SPY', '2026-09-25')).toEqual({ tradingDate: '2026-10-09', close: '227.52000000000001' })
    const [url, options] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://api.tiingo.com/tiingo/daily/spy/prices?startDate=2026-09-25')
    expect(String(url)).not.toContain(TOKEN)
    expect(options.redirect).toBe('error'); expect(options.signal).toBeTruthy()
    expect((options.headers as Record<string, string>).Authorization).toBe(`Token ${TOKEN}`)
  })
  it('maps provider failures to explicit problems and never invents a price', async () => {
    const problem = async (body: unknown, init?: ResponseInit) => tiingo(body, init).provider.latestClose('AAPL', '2026-09-25').then(() => 'resolved', (e: DailyCloseProviderError) => e.problem)
    expect(await problem({ detail: 'Invalid token' }, { status: 401 })).toBe('AUTH_FAILED')
    expect(await problem({}, { status: 429 })).toBe('RATE_LIMITED')
    expect(await problem({}, { status: 404 })).toBe('NOT_FOUND')
    expect(await problem({}, { status: 503 })).toBe('UNAVAILABLE')
    expect(await problem({ detail: 'Error: Ticker AAPLX not found' })).toBe('NOT_FOUND')
    expect(await problem([])).toBe('NOT_YET_PUBLISHED')
    expect(await problem([{ date: '2026-10-09', close: 0 }])).toBe('INVALID_DATA')
    expect(await problem([{ date: '2026-10-09', close: 'abc' }])).toBe('INVALID_DATA')
    expect(await problem([{ date: '09/10/2026', close: 1 }])).toBe('INVALID_DATA')
    expect(await problem('[' + '{"date":"2026-10-09","close":1},'.repeat(3000) + '{"date":"2026-10-09","close":1}]')).toBe('INVALID_DATA')
    const offline = new TiingoDailyProvider(TOKEN, (async () => { throw Error('offline') }) as typeof fetch)
    await expect(offline.latestClose('AAPL', '2026-09-25')).rejects.toMatchObject({ problem: 'UNAVAILABLE' })
  })
})

describe('daily close configuration', () => {
  it('stays off without variables and refuses partial or undeclared licences without echoing secrets', () => {
    expect(readDailyCloseConfiguration({})).toBeNull()
    for (const env of [{ TIINGO_API_TOKEN: TOKEN }, { DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN },
      { DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN, DAILY_CLOSE_LICENSE: 'free' },
      { DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN, DAILY_CLOSE_LICENSE: 'personal-owner-only' },
      { DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN, DAILY_CLOSE_LICENSE: 'redistribution-confirmed', DAILY_CLOSE_OWNER_ID: OWNER },
      { DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: 'short', DAILY_CLOSE_LICENSE: 'redistribution-confirmed' },
      { DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN, DAILY_CLOSE_LICENSE: 'redistribution-confirmed', DAILY_CLOSE_MAX_REQUESTS_PER_HOUR: '0' }]) {
      let message = ''; try { readDailyCloseConfiguration(env) } catch (e) { message = (e as Error).message }
      expect(message).toMatch(/values withheld/); expect(message).not.toContain(TOKEN)
    }
  })
  it('personal plans serve exactly one owner; redistribution plans serve every account; budgets default under free limits', () => {
    expect(readDailyCloseConfiguration({ DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN, DAILY_CLOSE_LICENSE: 'personal-owner-only', DAILY_CLOSE_OWNER_ID: OWNER }))
      .toMatchObject({ license: 'PERSONAL', ownerId: OWNER, maxRequestsPerHour: 40, maxRequestsPerDay: 500, symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'SPY', 'QQQ'] })
    expect(readDailyCloseConfiguration({ DAILY_CLOSE_PROVIDER: 'tiingo', TIINGO_API_TOKEN: TOKEN, DAILY_CLOSE_LICENSE: 'redistribution-confirmed', DAILY_CLOSE_MAX_REQUESTS_PER_DAY: '5000' }))
      .toMatchObject({ license: 'REDISTRIBUTION', ownerId: null, maxRequestsPerDay: 5000 })
  })
})

describe('shared daily close relay', () => {
  it('serves many accounts from one cache: one provider request per symbol, no key in any response', async () => {
    const { relay, calls } = relayAt('2026-10-09T23:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' }, SPY: { tradingDate: '2026-10-09', close: '600.25' } })
    const owners = Array.from({ length: 50 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    await Promise.all(owners.map(o => relay.snapshotFor(o))); await relay.refresh()
    const snaps = await Promise.all(owners.map(o => relay.snapshotFor(o))); await relay.refresh()
    expect(calls.sort()).toEqual(['AAPL', 'SPY'])
    expect(snaps.every(s => s.quotes.find(q => q.symbol === 'AAPL')?.close === '227.5')).toBe(true)
    expect(JSON.stringify(snaps)).not.toContain(TOKEN)
    expect(dailyCloseSnapshotSchema.parse(snaps[0]).quotes[1]).toMatchObject({ symbol: 'SPY', status: 'CURRENT', tradingDate: '2026-10-09', currency: 'USD', priceType: 'CLOSE', problem: null })
  })
  it('before publication uses the previous session; when late it retries every 30 min, then picks up the new close', async () => {
    const { relay, clock, calls, table } = relayAt('2026-10-09T21:00:00Z', { AAPL: { tradingDate: '2026-10-08', close: '225' } }, { symbols: ['AAPL'] })
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'CURRENT', tradingDate: '2026-10-08', problem: null }) // Fri 17:00 EDT
    clock.now = at('2026-10-09T22:30:00Z') // 18:30: Friday's close is now expected but not yet published
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'DELAYED', close: '225', tradingDate: '2026-10-08', problem: 'NOT_YET_PUBLISHED' })
    expect(calls.length).toBe(2)
    clock.now += 10 * 60000; await quote(relay, 'AAPL'); expect(calls.length).toBe(2)
    table.AAPL = { tradingDate: '2026-10-09', close: '227.5' }
    clock.now += 20 * 60000
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'CURRENT', tradingDate: '2026-10-09', close: '227.5', problem: null })
    expect(calls.length).toBe(3)
  })
  it('refetches exactly once after the evening correction window', async () => {
    const { relay, clock, calls, table } = relayAt('2026-10-09T22:30:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' } }, { symbols: ['AAPL'] })
    await quote(relay, 'AAPL'); expect(calls.length).toBe(1)
    table.AAPL = { tradingDate: '2026-10-09', close: '227.55' }
    clock.now = at('2026-10-10T01:00:00Z') // 21:00 EDT
    expect((await quote(relay, 'AAPL')).close).toBe('227.55'); expect(calls.length).toBe(2)
    clock.now = at('2026-10-10T03:00:00Z'); await quote(relay, 'AAPL'); expect(calls.length).toBe(2)
  })
  it('weekends and holidays need no new request and keep the last session current with its date', async () => {
    const { relay, clock, calls } = relayAt('2026-10-10T15:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' } }, { symbols: ['AAPL'] })
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'CURRENT', tradingDate: '2026-10-09' })
    clock.now = at('2026-10-11T23:00:00Z') // Sunday evening
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'CURRENT', tradingDate: '2026-10-09' })
    clock.now = at('2026-10-12T13:00:00Z') // Monday 09:00 EDT, before Monday's close
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'CURRENT', tradingDate: '2026-10-09' }); expect(calls.length).toBe(1)
    const h = relayAt('2026-11-26T03:00:00Z', { AAPL: { tradingDate: '2026-11-25', close: '230' } }, { symbols: ['AAPL'] }) // Wed 22:00 EST
    await quote(h.relay, 'AAPL'); h.clock.now = at('2026-11-27T00:30:00Z') // Thanksgiving evening
    expect(await quote(h.relay, 'AAPL')).toMatchObject({ status: 'CURRENT', tradingDate: '2026-11-25' }); expect(h.calls.length).toBe(1)
  })
  it('provider failure keeps the last known close with its status, backs off, and later marks it STALE', async () => {
    const { relay, clock, calls, table, logs } = relayAt('2026-10-09T23:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' } }, { symbols: ['AAPL'] })
    await quote(relay, 'AAPL')
    table.AAPL = new DailyCloseProviderError('UNAVAILABLE')
    clock.now = at('2026-10-12T23:00:00Z') // Monday evening: Monday close expected, provider down
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'DELAYED', close: '227.5', tradingDate: '2026-10-09', problem: 'UNAVAILABLE' })
    const before = calls.length; clock.now += 30000; await quote(relay, 'AAPL'); expect(calls.length).toBe(before) // 60 s backoff
    clock.now += 31000; await quote(relay, 'AAPL'); expect(calls.length).toBe(before + 1)
    clock.now = at('2026-10-13T23:30:00Z') // Tuesday evening: two sessions behind
    expect(await quote(relay, 'AAPL')).toMatchObject({ status: 'STALE', close: '227.5', problem: 'UNAVAILABLE' })
    expect(logs.join('\n')).not.toContain(TOKEN)
  })
  it('authentication failure pauses every symbol for an hour; rate limits honour Retry-After', async () => {
    const { relay, clock, calls, table, logs } = relayAt('2026-10-09T23:00:00Z', { AAPL: new DailyCloseProviderError('AUTH_FAILED'), SPY: { tradingDate: '2026-10-09', close: '600' } })
    const snap = (await relay.snapshotFor(OWNER), await relay.refresh(), await relay.snapshotFor(OWNER))
    expect(calls).toEqual(['AAPL'])
    expect(snap.quotes.map(q => [q.symbol, q.status, q.problem])).toEqual([['AAPL', 'ERROR', 'AUTH_FAILED'], ['SPY', 'ERROR', 'AUTH_FAILED']])
    expect(logs.some(l => l.includes('AUTH_FAILED'))).toBe(true)
    clock.now += 59 * 60000; await relay.refresh(); expect(calls.length).toBe(1)
    table.AAPL = new DailyCloseProviderError('RATE_LIMITED', 120000); clock.now += 2 * 60000; await relay.refresh()
    expect(calls.length).toBe(2); clock.now += 60000; await relay.refresh(); expect(calls.length).toBe(2)
  })
  it('respects the hourly request budget and reports which symbols were held back', async () => {
    const table = Object.fromEntries(['AAPL', 'MSFT', 'NVDA', 'SPY'].map(s => [s, { tradingDate: '2026-10-09', close: '10' }]))
    const { relay, calls, clock } = relayAt('2026-10-09T23:00:00Z', table, { symbols: ['AAPL', 'MSFT', 'NVDA', 'SPY'], maxRequestsPerHour: 3 })
    await relay.snapshotFor(OWNER); await relay.refresh()
    const snap = await relay.snapshotFor(OWNER); await settle()
    expect(calls.length).toBe(3); expect(relay.usage()).toEqual({ lastHour: 3, lastDay: 3 })
    expect(snap.quotes.find(q => q.symbol === 'SPY')).toMatchObject({ status: 'ERROR', problem: 'BUDGET_EXHAUSTED', close: null })
    clock.now += 61 * 60000; await relay.refresh(); expect(calls.length).toBe(4)
  })
  it('never replaces a newer session with an older answer and rejects non-closing dates', async () => {
    const { relay, clock, table } = relayAt('2026-10-09T23:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' }, SPY: { tradingDate: '2026-10-10', close: '1' } })
    expect(await quote(relay, 'SPY')).toMatchObject({ status: 'ERROR', problem: 'INVALID_DATA', close: null }) // Saturday "session"
    table.AAPL = { tradingDate: '2026-10-07', close: '1' }; clock.now = at('2026-10-12T23:00:00Z')
    expect(await quote(relay, 'AAPL')).toMatchObject({ close: '227.5', tradingDate: '2026-10-09' })
    const early = relayAt('2026-10-09T19:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '5' } }, { symbols: ['AAPL'] }) // 15:00 EDT, still trading
    expect(await quote(early.relay, 'AAPL')).toMatchObject({ problem: 'INVALID_DATA', close: null })
  })
  it('licence scope: a personal key serves only its owner; unconfigured is explicit', async () => {
    const { relay, calls } = relayAt('2026-10-09T23:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '1' }, SPY: { tradingDate: '2026-10-09', close: '1' } }, { license: 'PERSONAL', ownerId: OWNER })
    expect(await relay.snapshotFor(OTHER)).toMatchObject({ provider: 'NOT_LICENSED', quotes: [] }); await settle()
    expect(calls).toEqual([]) // another account never triggers provider traffic under a personal licence
    expect((await relay.snapshotFor(OWNER)).provider).toBe('READY')
    const off = new DailyCloseRelay(null, null, new MemoryDailyCloseStore(), () => at('2026-10-10T15:00:00Z'))
    expect(dailyCloseSnapshotSchema.parse(await off.snapshotFor(OWNER))).toMatchObject({ provider: 'NOT_CONFIGURED', expectedSession: '2026-10-09', quotes: [] })
  })
  it('persists closes with provenance so a restarted server shows them without new requests', async () => {
    const first = relayAt('2026-10-09T23:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' } }, { symbols: ['AAPL'] })
    first.clock.now = at('2026-10-10T01:00:00Z'); await quote(first.relay, 'AAPL')
    expect(first.store.rows).toEqual([{ source: 'Synthetic EOD', symbol: 'AAPL', tradingDate: '2026-10-09', close: '227.5', currency: 'USD', fetchedAt: '2026-10-10T01:00:00.000Z' }])
    const second = relayAt('2026-10-10T15:00:00Z', {}, { symbols: ['AAPL'] }, first.store)
    expect(await quote(second.relay, 'AAPL')).toMatchObject({ status: 'CURRENT', close: '227.5', fetchedAt: '2026-10-10T01:00:00.000Z' })
    expect(second.calls).toEqual([])
  })
  it('a provider pause is reported only while it lasts, not on closes fetched before it', async () => {
    const { relay, clock, table } = relayAt('2026-10-09T23:00:00Z', { AAPL: { tradingDate: '2026-10-09', close: '227.5' }, SPY: { tradingDate: '2026-10-09', close: '600' } })
    await quote(relay, 'AAPL')
    table.SPY = new DailyCloseProviderError('RATE_LIMITED', 120000); clock.now += 21 * 60 * 60000 // after corrections: one refetch each
    table.AAPL = new DailyCloseProviderError('RATE_LIMITED', 120000)
    await relay.refresh()
    expect(await quote(relay, 'SPY')).toMatchObject({ status: 'CURRENT', problem: 'RATE_LIMITED' })
    clock.now += 3 * 60000 // pause over; SPY was never refused itself
    const after = dailyCloseSnapshotSchema.parse(await relay.snapshotFor(OWNER)).quotes
    expect(after.find(q => q.symbol === 'SPY')).toMatchObject({ status: 'CURRENT', close: '600', problem: null })
    await relay.settled()
  })
  it('stop() ends a refresh in flight: no later provider call and nothing stored', async () => {
    let release!: (value: ProviderClose) => void
    const calls: string[] = [], store = new MemoryDailyCloseStore()
    const provider: DailyCloseProvider = { source: 'Synthetic EOD', attribution: { label: 'Synthetic', url: 'https://example.test' },
      latestClose: symbol => { calls.push(symbol); return new Promise(resolve => { release = resolve }) } }
    const relay = new DailyCloseRelay(config(), provider, store, () => at('2026-10-09T23:00:00Z'), () => {})
    const running = relay.refresh(); await settle()
    expect(calls).toEqual(['AAPL'])
    relay.stop(); release({ tradingDate: '2026-10-09', close: '227.5' })
    await running; await relay.settled(); await relay.refresh()
    expect(calls).toEqual(['AAPL']); expect(store.rows).toEqual([])
  })
})
