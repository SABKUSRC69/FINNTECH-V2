import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import request from 'supertest'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { stockMarketSnapshotSchema } from '@finntech/contracts'
import { StockMarketRelay, readStockConfiguration, type StockConfiguration } from '../src/tracker/stocks.js'
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

describe('owner-bound HTTP and WebSocket transport (synthetic Auth fixture)', () => {
  function setup() {
    const { relay } = fixture()
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
    return { relay, auth, db, app: createApp({ auth, database: db, stocks: relay }) }
  }
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
