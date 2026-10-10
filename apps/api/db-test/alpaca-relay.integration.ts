// Alpaca IEX relay with genuine Auth, PostgreSQL ownership and a local fake IEX upstream (never the
// real provider). Runs on the attested synthetic real-rehearsal database in email-password mode.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import request from 'supertest'
import { WebSocket, WebSocketServer } from 'ws'
import { readAuthConfiguration } from '../src/auth/config.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createApp } from '../src/app.js'
import { MarketRelay } from '../src/tracker/market.js'
import { StockMarketRelay } from '../src/tracker/stocks.js'
import { attachMarketStream } from '../src/tracker/stream.js'

const config = readAuthConfiguration({ ...process.env, TRACKER_REAL_AUTH_MODE: 'email-password', TRACKER_RECOVERY_MODE: 'off' })!
assert.equal(config.real?.boundary, 'real-rehearsal', 'only attested synthetic PostgreSQL')
const db = createTrackerDatabase(config.databaseUrl), auth = createAuthRuntime(db, config)
const keyId = `synthetic-key-${randomUUID()}`, secret = `synthetic-secret-${randomUUID()}`, password = randomBytes(24).toString('hex')
const evidence: Record<string, unknown> = {}
const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 })
const upstreamMessages: Record<string, unknown>[] = []
let upstreamClient: WebSocket | null = null
upstream.on('connection', client => {
  upstreamClient = client
  client.on('message', data => {
    const value = JSON.parse(String(data)); upstreamMessages.push(value)
    if (value.action === 'auth') client.send(value.key === keyId && value.secret === secret ? '[{"T":"success","msg":"authenticated"}]' : '[{"T":"error","code":402,"msg":"auth failed"}]')
    else if (value.action === 'subscribe') client.send(JSON.stringify([{ T: 'subscription', trades: [...new Set(upstreamMessages.filter(m => m.action === 'subscribe').flatMap(m => m.trades as string[]))] }]))
  })
})
await once(upstream, 'listening')
const upstreamPort = (upstream.address() as { port: number }).port
after(async () => {
  if (process.env.FINNTECH_ALPACA_EVIDENCE_FILE) await writeFile(process.env.FINNTECH_ALPACA_EVIDENCE_FILE, JSON.stringify(evidence, null, 2))
  for (const client of upstream.clients) client.terminate()
  await new Promise<void>(resolve => upstream.close(() => resolve())); await db.$disconnect()
})

const post = (app: Parameters<typeof request>[0], route: string, body: object, cookie: string, key = randomUUID()) =>
  request(app).post(`/api/${route}`).set('Origin', config.origin).set('Cookie', cookie).set('Idempotency-Key', key).send(body)
async function account(app: Parameters<typeof request>[0], label: string) {
  const r = await post(app, 'auth/sign-up/email', { name: label, email: `${label}-${randomUUID()}@example.test`, password }, '')
  assert.equal(r.status, 200)
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('finntech.session_token='))!.split(';')[0]!
  return { cookie, ownerId: (await request(app).get('/api/me').set('Cookie', cookie)).body.ownerId as string }
}
async function upgrade(port: number, cookie: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/stocks`, { headers: { Cookie: cookie, Origin: config.origin } })
  return new Promise<{ status: number; socket?: WebSocket }>(resolve => {
    socket.on('error', () => {})
    socket.on('unexpected-response', (_req, res) => { res.resume(); socket.terminate(); resolve({ status: res.statusCode! }) })
    socket.on('open', () => resolve({ status: 101, socket }))
  })
}

test('owner-only live IEX prices: held symbols subscribed, stream reaches REST and WS, other owners denied, keys never leak', async () => {
  // Accounts first (the relay is bound to the owner's server-derived ownerId, not an email).
  const bootstrap = createApp({ database: db, auth })
  const owner = await account(bootstrap, 'alpaca-owner'), other = await account(bootstrap, 'alpaca-other')
  const relay = new StockMarketRelay({ keyId, secret, ownerId: owner.ownerId, symbols: ['SPY', 'QQQ'] },
    (async () => new Response('{"trades":{}}')) as typeof fetch, Date.now, () => new WebSocket(`ws://127.0.0.1:${upstreamPort}`),
    async () => (await db.stockHolding.findMany({ where: { ownerId: owner.ownerId, quantity: { gt: 0 } }, select: { symbol: true } })).map(r => r.symbol), () => {})
  const app = createApp({ database: db, auth, stocks: relay })
  const server = createServer(app)
  const stop = attachMarketStream(server, auth, new MarketRelay(async () => { throw new Error('crypto provider not used') }), relay, async authUserId => {
    const identity = await db.authIdentity.findUnique({ where: { authUserId }, include: { owner: true } })
    return identity?.owner.identityState === 'VERIFIED' ? identity.ownerId : null
  }, async () => true)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  try {
    // Fractional buy, sent twice with the same key: exactly one trade.
    const portfolio = await post(app, 'stocks/portfolios', { name: 'Live US', quoteCurrency: 'USD' }, owner.cookie)
    const key = randomUUID(), trade = { portfolioId: portfolio.body.id, symbol: 'AAPL', side: 'buy', quantity: '0.5', price: '150', fee: '0', quoteCurrency: 'USD', date: '2026-10-09', note: '' }
    const [first, retry] = [await post(app, 'stocks/trades', trade, owner.cookie, key), await post(app, 'stocks/trades', trade, owner.cookie, key)]
    assert.equal(first.status, 200); assert.equal(retry.body.id, first.body.id)
    assert.equal(await db.stockTrade.count({ where: { ownerId: owner.ownerId } }), 1)

    // Owner REST starts the single upstream connection; the held symbol is subscribed before the watchlist.
    assert.equal((await request(app).get('/api/stocks/market').set('Cookie', owner.cookie)).status, 200)
    const deadline = Date.now() + 3000
    while (!upstreamMessages.some(m => m.action === 'subscribe') && Date.now() < deadline) { await delay(20); await request(app).get('/api/stocks/market').set('Cookie', owner.cookie) }
    const subscribed = upstreamMessages.filter(m => m.action === 'subscribe').flatMap(m => m.trades as string[])
    assert.equal(subscribed[0], 'AAPL', 'held symbol first')
    assert.ok(subscribed.includes('SPY') && subscribed.includes('QQQ'), 'watchlist preserved')
    assert.equal(upstream.clients.size, 1, 'one shared upstream connection')

    // Owner socket receives the streamed trade; REST shows it LIVE with provider and receipt times.
    const ownerSocket = await upgrade(port, owner.cookie)
    assert.equal(ownerSocket.status, 101)
    const pushed: string[] = []; ownerSocket.socket!.on('message', data => pushed.push(String(data)))
    await delay(200)
    const observed = new Date().toISOString(), sentAt = Date.now()
    upstreamClient!.send(JSON.stringify([{ T: 't', S: 'AAPL', i: 101, p: 200.25, t: observed }]))
    const pushDeadline = Date.now() + 2500
    while (!pushed.some(p => p.includes('"200.25"')) && Date.now() < pushDeadline) await delay(20)
    assert.ok(pushed.some(p => p.includes('"200.25"')), 'stream event pushed to the owner socket')
    const pushMs = Date.now() - sentAt
    const market = await request(app).get('/api/stocks/market').set('Cookie', owner.cookie)
    const aapl = market.body.quotes.find((q: { symbol: string }) => q.symbol === 'AAPL')
    assert.deepEqual([aapl.price, aapl.status, aapl.observedAt], ['200.25', 'LIVE', observed])
    ownerSocket.socket!.terminate()

    // Second owner and anonymous visitors cannot obtain the owner's provider data by REST or WS.
    const denied = await request(app).get('/api/stocks/market').set('Cookie', other.cookie)
    assert.equal(denied.status, 403); assert.equal(denied.body.error.code, 'STOCK_ACCESS_REQUIRED')
    assert.equal((await request(app).get('/api/stocks/market')).status, 401)
    assert.equal((await upgrade(port, other.cookie)).status, 401)
    assert.equal((await upgrade(port, '')).status, 401)
    const otherStocks = await request(app).get('/api/stocks').set('Cookie', other.cookie)
    assert.equal(otherStocks.body.holdings.length, 0)

    // No credential ever appears in any response or pushed frame.
    for (const text of [JSON.stringify(market.body), JSON.stringify(denied.body), JSON.stringify(otherStocks.body), ...pushed]) {
      assert.ok(!text.includes(keyId) && !text.includes(secret))
    }
    evidence.ownerOnly = { subscribed, pushMs, ownerRest: market.status, secondOwnerRest: denied.status, secondOwnerWs: 401, anonymousWs: 401, tradesAfterRetry: 1 }
  } finally { stop(); relay.stop(); server.close() }
})
