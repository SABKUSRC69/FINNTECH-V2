import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { WebSocket } from 'ws'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { authSubjectAllowed } from '../src/auth/authorization.js'
import { createApp } from '../src/app.js'
import { MarketRelay } from '../src/tracker/market.js'
import { StockMarketRelay } from '../src/tracker/stocks.js'
import { attachMarketStream } from '../src/tracker/stream.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'

const target = new URL(process.env.DATABASE_URL ?? 'http://invalid')
if (target.hostname !== '127.0.0.1' || target.port !== '5443' || target.pathname !== '/finntech_demo_test_20261008' || target.username !== 'demo_fixture') throw new Error('Unexpected synthetic test target')
const db = createTrackerDatabase(target.href), origin = 'https://synthetic.onrender.com'
const code = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex')
const demo = { enabled: true, code, epoch: randomUUID(), expiresIn: 3600, accountLimit: 5000 }
const configuration = { databaseUrl: target.href, origin, secret, secureCookies: true, beta: { access: 'public' as const, registrationsOpen: false, invitedEmails: new Set<string>() }, demo }
const auth = createAuthRuntime(db, configuration), app = createApp({ auth, database: db })
let nonceA = '', nonceB = '', cookieA = '', cookieB = '', ownerA = '', ownerB = '', userA = '', initialCount = 0
const post = (route: string, body: object, cookie = '', application = app) => request(application).post(route).set('Origin', origin).set('Cookie', cookie).send(body)
const get = (route: string, cookie = '', application = app) => request(application).get(route).set('Cookie', cookie)
function cookie(response: request.Response, name: string): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined
  const found = cookies?.find(value => value.startsWith(name + '='))
  assert.ok(found && /HttpOnly/.test(found) && /Secure/.test(found), 'protected cookie present (value withheld)')
  return found!.split(';')[0]!
}
async function prepare(application = app): Promise<string> {
  const result = await post('/api/auth/demo/prepare', {}, '', application); assert.equal(result.status, 200)
  return cookie(result, '__Host-finntech.demo_request')
}
before(async () => {
  const identity = await db.$queryRaw<{ name: string; role: string }[]>`SELECT current_database() AS name, current_user AS role`
  assert.ok(identity[0]?.name === 'finntech_demo_test_20261008' && identity[0].role === 'demo_fixture')
  initialCount = await db.demoWorkspace.count(); nonceA = await prepare(); nonceB = await prepare()
})
after(async () => { await db.$disconnect() })

test('server gate rejects incorrect/missing code, forged Origin, missing prepare, public signup and anonymous direct APIs', async () => {
  const before = await db.authUser.count()
  assert.equal((await post('/api/auth/demo/enter', { code: randomBytes(24).toString('hex') }, nonceA)).status, 403)
  assert.equal((await post('/api/auth/demo/enter', {}, nonceA)).status, 403)
  assert.equal((await post('/api/auth/demo/enter', { code })).status, 403)
  assert.equal((await post('/api/auth/demo/enter', { code }, nonceA).set('Origin', 'https://forged.invalid')).status, 403)
  assert.equal((await post('/api/auth/sign-up/email', { name: 'Synthetic', email: `${randomUUID()}@example.invalid`, password: randomBytes(24).toString('hex') })).status, 403)
  assert.equal((await post('/api/auth/sign-in/anonymous', {})).status, 404)
  assert.equal((await get('/api/finance?month=2026-10')).status, 401)
  assert.equal((await post('/api/auth/request-password-reset', {})).status, 404)
  assert.equal(await db.authUser.count(), before)
})

test('concurrent entry and response-loss replay create ONE authenticated workspace, no credential account/password', async () => {
  const replies = await Promise.all([post('/api/auth/demo/enter', { code }, nonceA), post('/api/auth/demo/enter', { code }, nonceA)])
  for (const result of replies) { assert.equal(result.status, 200); assert.deepEqual(result.body, { demo: true }) }
  cookieA = cookie(replies[0]!, '__Secure-finntech.session_token')
  assert.ok(cookieA === cookie(replies[1]!, '__Secure-finntech.session_token'), 'same protected session, values withheld')
  assert.equal(await db.demoWorkspace.count(), initialCount + 1)
  const replayAuth = createAuthRuntime(db, configuration), replayApp = createApp({ auth: replayAuth, database: db })
  const lost = await post('/api/auth/demo/enter', { code }, nonceA, replayApp) // original response/session cookie was lost
  assert.equal(lost.status, 200); assert.ok(cookie(lost, '__Secure-finntech.session_token') === cookieA, 'durable same session across runtime recreation')
  const session = await get('/api/auth/get-session', cookieA); userA = session.body.user.id
  assert.ok(userA); assert.ok(!('token' in session.body.session)); assert.equal(session.body.user.name, 'ผู้ทดลอง DEMO')
  assert.equal(await db.authAccount.count({ where: { userId: userA } }), 0)
  assert.equal(await db.authRecoveryEnrollment.count({ where: { userId: userA } }), 0)
  const owner = await get('/api/me', cookieA); assert.equal(owner.body.demo, true); ownerA = owner.body.ownerId
  assert.equal((await get('/api/auth-capabilities')).body.recovery, false)
})

test('two independent browser cookies have separate owners; direct foreign read/modification cannot cross ownership', async () => {
  const result = await post('/api/auth/demo/enter', { code }, nonceB); assert.equal(result.status, 200); cookieB = cookie(result, '__Secure-finntech.session_token')
  ownerB = (await get('/api/me', cookieB)).body.ownerId; assert.ok(ownerA !== ownerB)
  const month = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)
  const first = await get(`/api/finance?month=${month}`, cookieA)
  assert.equal(first.body.income, '12000'); assert.equal(first.body.currency, 'THB')
  const category = first.body.categories.find((row: { type: string }) => row.type === 'income').id
  const value = { categoryId: category, type: 'income', amount: '0.10', currency: 'THB', date: `${month}-01`, note: 'DEMO test' }
  assert.equal((await post('/api/finance/transactions', value, cookieB).set('Idempotency-Key', randomUUID())).status, 404)
  const key = randomUUID(), written = await post('/api/finance/transactions', value, cookieA).set('Idempotency-Key', key)
  assert.equal(written.status, 200)
  assert.deepEqual((await post('/api/finance/transactions', value, cookieA).set('Idempotency-Key', key)).body, written.body)
  const other = await get(`/api/finance?month=${month}&ownerId=${ownerA}`, cookieB).set('X-Owner-Id', ownerA)
  assert.equal(other.body.income, '12000'); assert.equal(other.body.transactions.length, 1)
  assert.equal((await get('/api/crypto', cookieA)).body.quoteCurrency, 'USDT')
  assert.equal((await get('/api/crypto', cookieA)).body.holdings.length, 0)
})

test('real regular account remains isolated, login works and demo cannot replace its valid authenticated session', async () => {
  const { demo: _demo, ...withoutDemo } = configuration
  const normal = createAuthRuntime(db, { ...withoutDemo, beta: { ...configuration.beta, registrationsOpen: true } })
  const normalApp = createApp({ auth: normal, database: db }), password = randomBytes(24).toString('hex'), email = `${randomUUID()}@example.invalid`
  const signup = await post('/api/auth/sign-up/email', { name: 'Regular synthetic account', email, password }, '', normalApp)
  assert.equal(signup.status, 200); const regularCookie = cookie(signup, '__Secure-finntech.session_token')
  assert.equal((await get('/api/me', regularCookie)).body.demo, undefined)
  assert.equal((await post('/api/auth/demo/enter', { code }, `${regularCookie}; ${nonceA}`)).status, 403)
  assert.equal((await get('/api/me', regularCookie)).body.ownerId === ownerA, false)
  assert.equal((await post('/api/auth/sign-out', {}, regularCookie, normalApp)).status, 200)
  assert.equal((await post('/api/auth/sign-in/email', { email, password }, '', normalApp)).status, 200)
})

test('code rotation stops old code while preserving existing sessions; disabling entry also preserves sessions', async () => {
  const rotated = { ...demo, code: randomBytes(24).toString('hex') }, rotatedAuth = createAuthRuntime(db, { ...configuration, demo: rotated })
  const rotatedApp = createApp({ auth: rotatedAuth, database: db })
  assert.equal((await post('/api/auth/demo/enter', { code }, nonceA, rotatedApp)).status, 403)
  assert.equal((await get('/api/me', cookieA, rotatedApp)).status, 200)
  const disabledAuth = createAuthRuntime(db, { ...configuration, demo: { ...rotated, enabled: false } }), disabled = createApp({ auth: disabledAuth, database: db })
  assert.equal((await post('/api/auth/demo/prepare', {}, '', disabled)).status, 403)
  assert.equal((await post('/api/auth/demo/enter', { code: rotated.code }, nonceA, disabled)).status, 403)
  assert.equal((await get('/api/me', cookieA, disabled)).status, 200)
})

test('fixed expiration rejects session, get-session and same-nonce entry without renewing or creating a workspace', async () => {
  const session = await get('/api/auth/get-session', cookieB), user = session.body.user.id
  await db.demoWorkspace.update({ where: { userId: user }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await get('/api/me', cookieB)).status, 403)
  assert.equal((await get('/api/auth/get-session', cookieB)).body, null)
  const count = await db.demoWorkspace.count(); assert.equal((await post('/api/auth/demo/enter', { code }, nonceB)).status, 410)
  assert.equal(await db.demoWorkspace.count(), count)
})

test('Better Auth session expiration itself also rejects entry replay and authenticated reads', async () => {
  const separateAuth = createAuthRuntime(db, configuration), separateApp = createApp({ auth: separateAuth, database: db })
  const nonce = await prepare(separateApp), response = await post('/api/auth/demo/enter', { code }, nonce, separateApp)
  assert.equal(response.status, 200)
  const sessionCookie = cookie(response, '__Secure-finntech.session_token')
  const session = await get('/api/auth/get-session', sessionCookie, separateApp)
  const workspace = await db.demoWorkspace.findUniqueOrThrow({ where: { userId: session.body.user.id } })
  await db.authSession.update({ where: { id: workspace.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await get('/api/me', sessionCookie, separateApp)).status, 401)
  assert.equal((await post('/api/auth/demo/enter', { code }, nonce, separateApp)).status, 410)
})

test('logout revokes the authentic session; replay cannot resurrect it; fresh workspace leaves both previous datasets intact', async () => {
  assert.equal((await post('/api/auth/demo/reset', {}, cookieA)).status, 403)
  assert.equal((await post('/api/auth/sign-out', {}, cookieA)).status, 200)
  assert.equal((await get('/api/me', cookieA)).status, 401)
  assert.equal((await post('/api/auth/demo/enter', { code }, nonceA)).status, 410)
  const reset = await post('/api/auth/demo/reset', {}, nonceA); assert.equal(reset.status, 200)
  const nonce = cookie(reset, '__Host-finntech.demo_request'), entered = await post('/api/auth/demo/enter', { code }, nonce)
  assert.equal(entered.status, 200)
  const next = (await get('/api/me', cookie(entered, '__Secure-finntech.session_token'))).body.ownerId
  assert.ok(next !== ownerA && next !== ownerB)
  assert.equal(await db.financeTransaction.count({ where: { ownerId: ownerA } }), 2)
  assert.equal(await db.financeTransaction.count({ where: { ownerId: ownerB } }), 1)
})

test('creation limit persists across runtime recreation; concurrent final slot admits exactly one workspace', async () => {
  const currentCount = await db.demoWorkspace.count(), capped = { ...configuration, demo: { ...demo, accountLimit: currentCount + 1 } }
  const cappedAuth = createAuthRuntime(db, capped), cappedApp = createApp({ auth: cappedAuth, database: db })
  const n1 = await prepare(cappedApp), n2 = await prepare(cappedApp)
  const results = await Promise.all([post('/api/auth/demo/enter', { code }, n1, cappedApp), post('/api/auth/demo/enter', { code }, n2, cappedApp)])
  assert.deepEqual(results.map(row => row.status).sort(), [200, 429]); assert.equal(await db.demoWorkspace.count(), currentCount + 1)
  const restartedAuth = createAuthRuntime(db, capped), restarted = createApp({ auth: restartedAuth, database: db })
  const next = await prepare(restarted)
  assert.equal((await post('/api/auth/demo/enter', { code }, next, restarted)).status, 429)
})

test('seeding fault rolls back Better Auth user, session, owner, receipt and finance data together', async () => {
  const counts = async () => Promise.all([db.authUser.count(), db.authSession.count(), db.trackerUser.count(), db.demoWorkspace.count(), db.financeTransaction.count()])
  const before = await counts()
  const faulty = new Proxy(db, { get(clientRoot, property) {
    if (property !== '$transaction') return Reflect.get(clientRoot, property)
    return (operation: (tx: unknown) => Promise<unknown>, options: object) => clientRoot.$transaction(tx => operation(new Proxy(tx, { get(client, key) {
      if (key === 'auditEvent') return { ...client.auditEvent, create: async () => { throw new Error(`synthetic_seed_fault:${code}:${target.href}`) } }
      return Reflect.get(client, key)
    } })), options)
  } }) as PrismaClient
  const faultyAuth = createAuthRuntime(faulty, configuration), faultyApp = createApp({ auth: faultyAuth, database: faulty })
  const nonce = await prepare(faultyApp)
  const logs: string[] = [], originalError = console.error
  console.error = (...values: unknown[]) => { logs.push(values.map(String).join(' ')) }
  try {
    const response = await post('/api/auth/demo/enter', { code }, nonce, faultyApp)
    assert.equal(response.status, 503)
    assert.ok(![code, secret, target.href, target.password].some(value => response.text.includes(value) || logs.some(line => line.includes(value))), 'fault response/logs withhold secrets')
  } finally { console.error = originalError }
  assert.deepEqual(await counts(), before)
})

test('bounded bodies and global rate limit reject abuse without creating accounts', async () => {
  const before = await db.demoWorkspace.count()
  assert.equal((await post('/api/auth/demo/enter', { code: 'x'.repeat(2048) }, nonceA)).status, 413)
  const limitAuth = createAuthRuntime(db, configuration), limited = createApp({ auth: limitAuth, database: db })
  let status = 0
  for (let i = 0; i < 31; i++) status = (await post('/api/auth/demo/enter', { code: randomBytes(24).toString('hex') }, nonceA, limited)).status
  assert.equal(status, 429); assert.equal(await db.demoWorkspace.count(), before)
})

test('epoch revocation closes HTTP and both existing WS connections using the normal session revalidation', async () => {
  const wsDemo = { ...demo }, wsAuth = createAuthRuntime(db, { ...configuration, demo: wsDemo }), wsApp = createApp({ auth: wsAuth, database: db })
  const nonce = await prepare(wsApp), entered = await post('/api/auth/demo/enter', { code }, nonce, wsApp)
  assert.equal(entered.status, 200); const sessionCookie = cookie(entered, '__Secure-finntech.session_token')
  const market = new MarketRelay(async () => { throw new Error('synthetic_provider_disabled') }), stocks = new StockMarketRelay(null)
  const server = wsApp.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const stop = attachMarketStream(server, wsAuth, market, stocks, undefined, id => authSubjectAllowed(wsAuth, db, id))
  const sockets: WebSocket[] = []
  try {
    for (const route of ['market', 'stocks']) {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/${route}`, { origin, headers: { Cookie: sessionCookie } })
      await once(socket, 'open'); sockets.push(socket)
    }
    const closed = sockets.map(socket => once(socket, 'close'))
    wsDemo.epoch = randomUUID()
    assert.equal((await get('/api/me', sessionCookie, wsApp)).status, 403)
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([Promise.all(closed), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('session revalidation deadline')), 12000) })]) }
    finally { clearTimeout(timer) }
  } finally { sockets.forEach(socket => socket.terminate()); stop(); stocks.stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('Better Auth logout closes an already-open demo WS connection without deleting its dataset', async () => {
  const separateAuth = createAuthRuntime(db, configuration), separateApp = createApp({ auth: separateAuth, database: db })
  const nonce = await prepare(separateApp), result = await post('/api/auth/demo/enter', { code }, nonce, separateApp)
  assert.equal(result.status, 200); const sessionCookie = cookie(result, '__Secure-finntech.session_token')
  const owner = (await get('/api/me', sessionCookie, separateApp)).body.ownerId
  const market = new MarketRelay(async () => { throw new Error('synthetic_provider_disabled') })
  const server = separateApp.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const stop = attachMarketStream(server, separateAuth, market, undefined, undefined, id => authSubjectAllowed(separateAuth, db, id))
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/market`, { origin, headers: { Cookie: sessionCookie } })
  try {
    await once(socket, 'open'); const closed = once(socket, 'close')
    assert.equal((await post('/api/auth/sign-out', {}, sessionCookie, separateApp)).status, 200)
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('logout revalidation deadline')), 12000) })]) }
    finally { clearTimeout(timer) }
    assert.equal(await db.financeTransaction.count({ where: { ownerId: owner } }), 1)
  } finally { socket.terminate(); stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
