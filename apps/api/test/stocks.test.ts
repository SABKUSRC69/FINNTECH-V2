import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import request from 'supertest'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { stockMarketSnapshotSchema } from '@finntech/contracts'
import { StockMarketRelay, readStockConfiguration, usRegularSession, type StockConfiguration } from '../src/tracker/stocks.js'
import { parseProviderJson } from '../src/tracker/provider-json.js'
import { createApp } from '../src/app.js'
import { attachMarketStream } from '../src/tracker/stream.js'
import { MarketRelay } from '../src/tracker/market.js'
import type { AuthRuntime } from '../src/auth/runtime.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'

const ownerId = '00000000-0000-4000-8000-000000000001'
const otherOwner = '00000000-0000-4000-8000-000000000002'
const config: StockConfiguration = { keyId: 'synthetic-key', secret: 'synthetic-secret', ownerId, symbols: ['AAPL', 'SPY'] }
const relays: StockMarketRelay[] = []
const now = Date.parse('2026-10-02T14:30:00Z')
const timestamp = '2026-10-02T14:30:00.000000001Z'
class FixtureSocket extends EventEmitter {
  sent: string[] = []
  send(value: string) { this.sent.push(value) }
  terminate() { this.emit('close') }
  event(value: string) { this.emit('message', Buffer.from(value)) }
}
function fixture() {
  let time = now
  const socket = new FixtureSocket()
  let requests = 0
  const relay = new StockMarketRelay(config, (async () => {
    requests++
    return new Response('{"trades":{"AAPL":{"p":123.123456789012345678,"t":"2026-10-02T14:30:00.000000001Z"}}}')
  }) as typeof fetch, () => time, () => socket as unknown as WebSocket)
  relays.push(relay)
  return { relay, socket, advance: (ms: number) => { time += ms }, requests: () => requests }
}
function authenticated(socket: FixtureSocket) {
  socket.emit('open')
  socket.event('[{"T":"success","msg":"authenticated"}]')
  socket.event('[{"T":"subscription","trades":["AAPL","SPY"]}]')
}
afterEach(() => { for (const relay of relays.splice(0)) relay.stop() })

describe('Alpaca IEX boundary (synthetic provider fixtures, not live-provider acceptance)', () => {
  it('is dormant without credentials and rejects partial/placeholder configuration', () => {
    expect(readStockConfiguration({})).toBeNull()
    expect(() => readStockConfiguration({ ALPACA_API_KEY_ID: 'partial' })).toThrow()
    expect(() => readStockConfiguration({ ALPACA_API_KEY_ID: '<key>', ALPACA_API_SECRET_KEY: '<secret>', ALPACA_OWNER_ID: ownerId, ALPACA_PERSONAL_USE: 'confirmed' })).toThrow()
    const valid = { ALPACA_API_KEY_ID: 'synthetic', ALPACA_API_SECRET_KEY: 'synthetic', ALPACA_OWNER_ID: ownerId, ALPACA_PERSONAL_USE: 'confirmed' }
    expect(readStockConfiguration(valid)?.symbols).toHaveLength(30)
    expect(readStockConfiguration({ ...valid, ALPACA_SYMBOLS: 'aapl,SPY,AAPL' })?.symbols).toEqual(['AAPL', 'SPY'])
    expect(() => readStockConfiguration({ ...valid, ALPACA_SYMBOLS: Array.from({ length: 31 }, (_, i) => `A${i}`).join(',') })).toThrow()
    expect(() => readStockConfiguration({ ...valid, ALPACA_SYMBOLS: 'AAPL,' })).toThrow()
  })
  it('preserves numeric lexemes without converting money to JS numbers', () => {
    expect(parseProviderJson('{"p":123.123456789012345678,"quoted":"p: 1.23","huge":9007199254740993}'))
      .toEqual({ p: '123.123456789012345678', quoted: 'p: 1.23', huge: '9007199254740993' })
    for (const invalid of ['{"p":01}', '{"p":NaN}', '{"p":Infinity}', '{"p":1.}', '{"p":+1}', '{"p":"bad\nstring"}']) {
      expect(() => parseProviderJson(invalid)).toThrow()
    }
    expect(parseProviderJson('[1e3]')).toEqual(['1e3']) // Finance rejects this lexeme later.
  })
  it('does not connect when unconfigured; returns only N/A and never credentials', async () => {
    const relay = new StockMarketRelay(null, () => { throw new Error('must not request') }, () => now, () => { throw new Error('must not connect') })
    relays.push(relay)
    const snapshot = await relay.snapshot()
    expect(snapshot.connection).toBe('NOT_CONFIGURED')
    expect(snapshot.quotes).toHaveLength(30)
    expect(snapshot.quotes.every(q => q.price === null && q.status === 'UNAVAILABLE')).toBe(true)
    expect(stockMarketSnapshotSchema.safeParse(snapshot).success).toBe(true)
  })
  it('authenticates before subscribing, validates financial precision and keeps owner-only access', async () => {
    const { relay, socket } = fixture()
    await relay.snapshot()
    socket.event(`[{"T":"t","S":"AAPL","p":1,"t":"${timestamp}"}]`)
    expect((await relay.snapshot()).quotes[0]?.price).toBeNull()
    authenticated(socket)
    expect(JSON.parse(socket.sent[1]!).trades).toEqual(['AAPL', 'SPY'])
    socket.event(`[{"T":"t","S":"AAPL","p":123.123456789012345678,"t":"${timestamp}"}]`)
    const snapshot = await relay.snapshot()
    expect(snapshot.quotes[0]?.price).toBe('123.123456789012345678')
    expect(snapshot.quotes[0]?.status).toBe('LIVE')
    expect(stockMarketSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(JSON.stringify(snapshot)).not.toMatch(/synthetic-key|synthetic-secret/)
    expect(relay.allowsOwner(ownerId)).toBe(true)
    expect(relay.allowsOwner(otherOwner)).toBe(false)
  })
  it('does not refresh an old trade timestamp into LIVE and rejects unexpected/future symbols', async () => {
    const { relay, socket, advance } = fixture()
    await relay.snapshot(); authenticated(socket)
    socket.event(`[{"T":"t","S":"AAPL","p":123.10,"t":"${timestamp}"}]`)
    socket.event(`[{"T":"t","S":"UNKNOWN","p":9,"t":"${timestamp}"}]`)
    socket.event('[{"T":"t","S":"SPY","p":9,"t":"2027-01-01T00:00:00Z"}]')
    advance(30_001)
    expect((await relay.snapshot()).quotes[0]?.status).toBe('STALE')
    expect((await relay.snapshot()).quotes[1]?.price).toBeNull()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect((await relay.snapshot()).quotes[0]?.status).toBe('STALE')
  })
  it('preserves last known data as stale on provider errors and backs off before reconnecting', async () => {
    const { relay, socket } = fixture()
    await relay.snapshot(); authenticated(socket)
    socket.event(`[{"T":"t","S":"AAPL","p":1,"t":"${timestamp}"}]`)
    socket.event('[{"T":"error","code":401,"msg":"sensitive provider detail withheld"}]')
    const snapshot = await relay.snapshot()
    expect(snapshot.connection).toBe('UNAVAILABLE')
    expect(snapshot.quotes[0]?.status).toBe('STALE')
    expect(JSON.stringify(snapshot)).not.toContain('sensitive')
  })
  it.each(['1e2', '0', '-1', '1.0000000000000000001', '100000000000000000000'])('rejects invalid provider financial lexeme %s', async price => {
    const { relay, socket } = fixture()
    await relay.snapshot(); authenticated(socket)
    socket.event(`[{"T":"t","S":"SPY","p":${price},"t":"${timestamp}"}]`)
    expect((await relay.snapshot()).quotes[1]?.price).toBeNull()
  })
})

describe('Alpaca IEX activation: holdings, provider states, reconciliation (synthetic fixtures)', () => {
  function controlled(options: { held?: string[]; at?: number; symbols?: string[] } = {}) {
    let time = options.at ?? now, held = options.held ?? []
    const sockets: FixtureSocket[] = [], logs: string[] = []
    const relay = new StockMarketRelay({ ...config, symbols: options.symbols ?? config.symbols }, (async () => new Response('{"trades":{}}')) as typeof fetch,
      () => time, () => { const s = new FixtureSocket(); sockets.push(s); return s as unknown as WebSocket }, async () => held, line => logs.push(line))
    relays.push(relay)
    const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
    return { relay, sockets, logs, settle, advance: (ms: number) => { time += ms }, setHeld: (next: string[]) => { held = next } }
  }
  const ready = (socket: FixtureSocket, symbols: string[]) => { socket.emit('open'); socket.event('[{"T":"success","msg":"authenticated"}]'); socket.event(JSON.stringify([{ T: 'subscription', trades: symbols }])) }

  it('subscribes held symbols first, keeps the watchlist, caps at 30 and reports the rest', async () => {
    const watchlist = Array.from({ length: 30 }, (_, i) => `W${i}`)
    const { relay, sockets, settle } = controlled({ held: ['TSLA', 'AAPL'], symbols: watchlist })
    await relay.snapshot(); await settle()
    ready(sockets[0]!, [])
    const subscribe = sockets[0]!.sent.map(s => JSON.parse(s)).find(m => m.action === 'subscribe')
    expect(subscribe.trades.slice(0, 2)).toEqual(['AAPL', 'TSLA'])
    expect(subscribe.trades).toHaveLength(30)
    const snapshot = await relay.snapshot()
    expect(snapshot.quotes.map(q => q.symbol).slice(0, 2)).toEqual(['AAPL', 'TSLA'])
    expect(snapshot.excluded).toEqual(['W28', 'W29'])
    expect(stockMarketSnapshotSchema.safeParse(snapshot).success).toBe(true)
  })
  it('sends only the subscription difference when holdings change', async () => {
    const { relay, sockets, settle, setHeld } = controlled({ held: [] })
    await relay.snapshot(); await settle(); ready(sockets[0]!, ['AAPL', 'SPY'])
    setHeld(['NVDA']); relay.holdingsChanged(ownerId); relay.holdingsChanged(otherOwner)
    await relay.snapshot(); await settle()
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({ action: 'subscribe', trades: ['NVDA'] })
  })
  it.each([['402', 'AUTH_FAILED', 10 * 60_000], ['406', 'CONNECTION_LIMIT', 30_000], ['409', 'NOT_ENTITLED', 30 * 60_000]] as const)('maps provider error %s to %s with a bounded retry', async (code, state, retry) => {
    const { relay, sockets, advance, logs } = controlled()
    await relay.snapshot(); sockets[0]!.emit('open')
    sockets[0]!.event(`[{"T":"error","code":${code},"msg":"provider detail"}]`)
    expect((await relay.snapshot()).connection).toBe(state)
    advance(retry - 1); await relay.snapshot()
    expect(sockets).toHaveLength(1)
    advance(2); await relay.snapshot()
    expect(sockets).toHaveLength(2)
    expect(logs.join('\n')).not.toMatch(/synthetic-key|synthetic-secret|provider detail/)
    expect(sockets[0]!.sent[0]).toContain('synthetic-key') // credentials only ever go to the provider socket
  })
  it('rejects out-of-order trades, accepts later nanoseconds, and applies corrections/cancels by trade id', async () => {
    const { relay, sockets, settle } = controlled()
    await relay.snapshot(); await settle(); ready(sockets[0]!, ['AAPL', 'SPY'])
    const s = sockets[0]!
    s.event('[{"T":"t","S":"AAPL","i":10,"p":100,"t":"2026-10-02T14:29:59.000000500Z"}]')
    s.event('[{"T":"t","S":"AAPL","i":9,"p":90,"t":"2026-10-02T14:29:58.000000000Z"}]')
    expect((await relay.snapshot()).quotes[0]?.price).toBe('100')
    s.event('[{"T":"t","S":"AAPL","i":11,"p":101,"t":"2026-10-02T14:29:59.000000900Z"}]')
    expect((await relay.snapshot()).quotes[0]?.price).toBe('101')
    s.event('[{"T":"c","S":"AAPL","oi":3,"op":1,"ci":4,"cp":5,"t":"2026-10-02T14:29:59Z"}]')
    expect((await relay.snapshot()).quotes[0]?.price).toBe('101')
    s.event('[{"T":"c","S":"AAPL","oi":11,"op":101,"ci":12,"cp":101.5,"t":"2026-10-02T14:29:59Z"}]')
    expect((await relay.snapshot()).quotes[0]?.price).toBe('101.5')
    s.event('[{"T":"x","S":"AAPL","i":12,"p":101.5,"a":"C","t":"2026-10-02T14:29:59Z"}]')
    expect((await relay.snapshot()).quotes[0]?.price).toBeNull()
  })
  it('keeps the last price with its real time as CLOSED outside the regular session, never LIVE', async () => {
    const saturday = Date.parse('2026-10-03T15:00:00Z')
    const { relay, sockets, settle, advance } = controlled({ at: saturday })
    await relay.snapshot(); await settle(); ready(sockets[0]!, ['AAPL', 'SPY'])
    sockets[0]!.event('[{"T":"t","S":"AAPL","i":1,"p":200,"t":"2026-10-02T19:59:59Z"}]')
    advance(1000)
    const snapshot = await relay.snapshot()
    expect(snapshot.session).toBe('CLOSED')
    expect(snapshot.quotes[0]).toMatchObject({ price: '200', status: 'CLOSED', observedAt: '2026-10-02T19:59:59Z' })
  })
  it('notifies listeners on accepted events only', async () => {
    const { relay, sockets, settle } = controlled()
    let calls = 0; const stop = relay.onUpdate(() => { calls++ })
    await relay.snapshot(); await settle(); ready(sockets[0]!, ['AAPL', 'SPY'])
    const base = calls
    sockets[0]!.event('[{"T":"t","S":"AAPL","i":1,"p":100,"t":"2026-10-02T14:29:59Z"}]')
    sockets[0]!.event('[{"T":"t","S":"AAPL","i":0,"p":99,"t":"2026-10-02T14:29:00Z"}]')
    expect(calls).toBe(base + 1)
    stop()
  })
  it('recognises the US regular session in New York time', () => {
    expect(usRegularSession(Date.parse('2026-10-09T13:29:00Z'))).toBe(false)
    expect(usRegularSession(Date.parse('2026-10-09T13:30:00Z'))).toBe(true)
    expect(usRegularSession(Date.parse('2026-10-09T19:59:00Z'))).toBe(true)
    expect(usRegularSession(Date.parse('2026-10-09T20:00:00Z'))).toBe(false)
    expect(usRegularSession(Date.parse('2026-11-09T14:29:00Z'))).toBe(false) // after the DST change
    expect(usRegularSession(Date.parse('2026-11-09T14:30:00Z'))).toBe(true)
    expect(usRegularSession(Date.parse('2026-11-26T15:00:00Z'))).toBe(false) // Thanksgiving: exchange holiday
  })
  it('does not report STREAMING until every planned symbol is confirmed', async () => {
    const { relay, sockets, settle } = controlled()
    await relay.snapshot(); await settle(); ready(sockets[0]!, ['AAPL'])
    expect((await relay.snapshot()).connection).toBe('CONNECTING')
    sockets[0]!.event('[{"T":"subscription","trades":["AAPL","SPY"]}]')
    expect((await relay.snapshot()).connection).toBe('STREAMING')
  })
  it('a ledger change during a holdings lookup is picked up on the next request, not 60 s later', async () => {
    let resolveLookup!: (list: string[]) => void, lookups = 0
    const relay = new StockMarketRelay(config, (async () => new Response('{"trades":{}}')) as typeof fetch, () => now,
      () => new FixtureSocket() as unknown as WebSocket, () => { lookups++; return new Promise(resolve => { resolveLookup = resolve }) }, () => {})
    relays.push(relay)
    await relay.snapshot()
    relay.holdingsChanged(ownerId) // trade committed while the first lookup is still running
    resolveLookup([]); for (let i = 0; i < 20; i++) await Promise.resolve()
    await relay.snapshot()
    expect(lookups).toBe(2)
  })
})

describe('owner-bound HTTP and WebSocket transport (synthetic Auth fixture)', () => {
  function setup() {
    const { relay, socket: upstream } = fixture()
    const auth = { options: { baseURL: 'http://127.0.0.1:4173' }, api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const actor = headers.get('cookie')
        return actor === 'fixture=owner' || actor === 'fixture=other' ? { user: { id: actor } } : null
      },
    } } as unknown as AuthRuntime
    const db = { demoWorkspace: { findUnique: async () => null }, authIdentity: { findUnique: async ({ where }: { where: { authUserId: string } }) => ({
      ownerId: where.authUserId === 'fixture=owner' ? ownerId : otherOwner, provider: 'better-auth',
      subject: where.authUserId, verifiedAt: new Date(), owner: { identityState: 'VERIFIED' },
    }) } } as unknown as PrismaClient
    return { relay, upstream, auth, db, app: createApp({ auth, database: db, stocks: relay }) }
  }
  it('pushes a provider trade to the owner socket within about a second of the event', async () => {
    const { app, auth, relay, upstream } = setup()
    const server = createServer(app)
    const stop = attachMarketStream(server, auth, new MarketRelay(), relay, async actor => actor === 'fixture=owner' ? ownerId : otherOwner)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('fixture_address')
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/stocks`, { headers: { Cookie: 'fixture=owner', Origin: auth.options.baseURL! } })
    const messages: { quotes: { symbol: string; price: string | null }[] }[] = []
    socket.on('message', data => messages.push(JSON.parse(String(data))))
    try {
      await new Promise<void>((resolve, reject) => { const t = setTimeout(() => reject(new Error('open_timeout')), 2000); socket.once('message', () => { clearTimeout(t); resolve() }) })
      authenticated(upstream)
      const sent = Date.now()
      upstream.event(`[{"T":"t","S":"SPY","i":7,"p":512.25,"t":"${timestamp}"}]`)
      const deadline = Date.now() + 2500
      while (!messages.some(m => m.quotes.some(q => q.symbol === 'SPY' && q.price === '512.25')) && Date.now() < deadline) await new Promise(r => setTimeout(r, 20))
      expect(messages.some(m => m.quotes.some(q => q.symbol === 'SPY' && q.price === '512.25'))).toBe(true)
      expect(Date.now() - sent).toBeLessThan(2000)
    } finally { socket.terminate(); stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  it('requires Auth and the configured owner; unknown stock paths stay API 404', async () => {
    const { app } = setup()
    expect((await request(app).get('/api/stocks/market')).status).toBe(401)
    expect((await request(app).get('/api/stocks/market').set('Cookie', 'fixture=other')).status).toBe(403)
    const response = await request(app).get('/api/stocks/market').set('Cookie', 'fixture=owner')
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect((await request(app).get('/api/stocks/missing')).status).toBe(404)
  })
  it('uses a real local upstream socket and never calls a trading endpoint', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (typeof address === 'string' || !address) throw new Error('fixture_address')
    server.on('connection', client => client.on('message', data => {
      const value = JSON.parse(String(data))
      if (value.action === 'auth') client.send('[{"T":"success","msg":"authenticated"}]')
      else if (value.action === 'subscribe') {
        client.send('[{"T":"subscription","trades":["AAPL","SPY"]}]')
        client.send(`[{"T":"t","S":"AAPL","p":0.123456789012345678,"t":"${timestamp}"}]`)
      }
    }))
    const relay = new StockMarketRelay(config, (async url => {
      expect(String(url)).toContain('https://data.alpaca.markets/v2/stocks/trades/latest?feed=iex')
      return new Response('{"trades":{}}')
    }) as typeof fetch, () => now, () => new WebSocket(`ws://127.0.0.1:${address.port}`))
    try {
      await relay.snapshot()
      const deadline = Date.now() + 2000
      let snapshot = await relay.snapshot()
      while (snapshot.quotes[0]?.price === null && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10)); snapshot = await relay.snapshot()
      }
      expect(snapshot.connection).toBe('STREAMING')
      expect(snapshot.quotes[0]?.price).toBe('0.123456789012345678')
    } finally { relay.stop(); for (const client of server.clients) client.terminate(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  it('checks owner and exact origin during real local WebSocket upgrades', async () => {
    const { app, auth, relay } = setup()
    const server = createServer(app)
    const stop = attachMarketStream(server, auth, new MarketRelay(), relay, async actor => actor === 'fixture=owner' ? ownerId : otherOwner)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('fixture_address')
    const url = `ws://127.0.0.1:${address.port}/ws/stocks`
    async function rejected(cookie: string, origin: string) {
      const socket = new WebSocket(url, { headers: { Cookie: cookie, Origin: origin } })
      return new Promise<number>((resolve, reject) => {
        const deadline = setTimeout(() => { socket.terminate(); reject(new Error('upgrade_timeout')) }, 2000)
        socket.on('error', () => {})
        socket.on('unexpected-response', (_request, response) => { clearTimeout(deadline); response.resume(); socket.terminate(); resolve(response.statusCode!) })
        socket.on('open', () => { clearTimeout(deadline); socket.terminate(); reject(new Error('unexpected_acceptance')) })
      })
    }
    try {
      expect(await rejected('fixture=other', auth.options.baseURL!)).toBe(401)
      expect(await rejected('fixture=owner', 'http://foreign.invalid')).toBe(403)
      const socket = new WebSocket(url, { headers: { Cookie: 'fixture=owner', Origin: auth.options.baseURL! } })
      const snapshot = await new Promise<unknown>((resolve, reject) => {
        const deadline = setTimeout(() => { socket.terminate(); reject(new Error('snapshot_timeout')) }, 2000)
        socket.once('message', data => { clearTimeout(deadline); socket.terminate(); resolve(JSON.parse(String(data))) })
        socket.once('error', error => { clearTimeout(deadline); reject(error) })
      })
      expect(stockMarketSnapshotSchema.safeParse(snapshot).success).toBe(true)
    } finally { stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
