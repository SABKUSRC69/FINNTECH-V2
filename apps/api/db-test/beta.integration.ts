import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { writeFile, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { WebSocket } from 'ws'
import { backupDocumentSchema } from '@finntech/contracts'
import { requireBetaRehearsalTarget } from '../../../scripts/beta-rehearsal-target.mjs'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { authSubjectAllowed } from '../src/auth/authorization.js'
import { createApp } from '../src/app.js'
import { MarketRelay } from '../src/tracker/market.js'
import { StockMarketRelay } from '../src/tracker/stocks.js'
import { attachMarketStream } from '../src/tracker/stream.js'

const target = requireBetaRehearsalTarget(process.env), database = createTrackerDatabase(target.href)
const origin = 'https://synthetic.onrender.com', password = randomBytes(32).toString('hex')
const emailA = `${randomUUID()}@example.invalid`, emailB = `${randomUUID()}@example.invalid`
const configuration = { databaseUrl: target.href, secret: process.env.BETTER_AUTH_SECRET!, origin, secureCookies: true,
  beta: { access: 'public' as const, registrationsOpen: true, invitedEmails: new Set<string>() } }
const auth = createAuthRuntime(database, configuration), app = createApp({ auth, database })
let cookieA = '', cookieB = '', ownerA = '', ownerB = '', userA = '', category = ''
const summary: Record<string, unknown> = { target: 'new synthetic PostgreSQL:5442', actualPublicHTTPS: 'NOT TESTED' }
const post = (route: string, body: object, cookie?: string, key = randomUUID(), application = app) => {
  const call = request(application).post(route).set('Origin', origin).set('Idempotency-Key', key)
  if (cookie) call.set('Cookie', cookie)
  return call.send(body)
}
const get = (route: string, cookie?: string, application = app) => {
  const call = request(application).get(route); if (cookie) call.set('Cookie', cookie); return call
}
function takeCookie(response: request.Response): string {
  const headers = response.headers['set-cookie'] as unknown as string[] | undefined
  const value = headers?.find(item => item.startsWith('__Secure-finntech.session_token='))
  assert.ok(!!value && /Secure/i.test(value) && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value), 'security cookie attributes present; values withheld')
  assert.ok(!('token' in response.body), 'no session token in JSON')
  return value!.split(';')[0]!
}
before(async () => {
  const identity = await database.$queryRaw<{ name: string; role: string }[]>`SELECT current_database() AS name, current_user AS role`
  assert.ok(identity[0]?.name === 'finntech_beta_rehearsal_20261007' && identity[0].role === 'beta_fixture', 'exact test target')
  for (const email of [emailA, emailB]) {
    const response = await post('/api/auth/sign-up/email', { email, password, name: 'Synthetic Beta' })
    assert.equal(response.status, 200)
    if (email === emailA) { cookieA = takeCookie(response); userA = response.body.user.id as string } else cookieB = takeCookie(response)
  }
  ownerA = (await get('/api/me', cookieA)).body.ownerId; ownerB = (await get('/api/me', cookieB)).body.ownerId
  assert.ok(!!ownerA && !!ownerB && ownerA !== ownerB, 'separate owner mappings')
})
after(async () => { await writeFile('.beta-20261007.local/pg-summary.json', JSON.stringify(summary, null, 2)); await database.$disconnect() })

test('public Beta signup has real isolated sessions, denies anonymous/forged Origin and keeps synthetic recovery closed', async () => {
  assert.equal((await get('/api/finance?month=2026-10')).status, 401)
  assert.equal((await post('/api/cash', { name: 'Synthetic cash', balance: '1.00', currency: 'THB', asOf: '2026-10-07' }, cookieA).set('Origin', 'https://forged.invalid')).status, 403)
  assert.equal((await post('/api/auth/request-password-reset', { email: emailA })).status, 404)
  assert.deepEqual((await get('/api/auth-capabilities')).body, { recovery: false, verification: false })
  assert.equal((await get('/api/auth/get-session', cookieA)).body.user.id, userA)
  summary.cookieAttributes = 'Secure/HttpOnly/SameSite=Lax (local HTTP harness, not TLS transport proof)'
})
test('THB/USDT remain separate; concurrent same payload/key creates one receipt, isolation rejects owner spoof', async () => {
  const created = await post('/api/finance/categories', { name: 'Synthetic income', type: 'income' }, cookieA)
  assert.equal(created.status, 200); category = created.body.id
  const body = { categoryId: category, type: 'income', amount: '0.10', currency: 'THB', date: '2026-10-07', note: 'Synthetic only' }, key = randomUUID()
  const replies = await Promise.all([post('/api/finance/transactions', body, cookieA, key), post('/api/finance/transactions', body, cookieA, key)])
  assert.ok(replies.every(row => row.status === 200)); assert.deepEqual(replies[0]!.body, replies[1]!.body)
  const view = await get('/api/finance?month=2026-10', cookieA); assert.equal(view.body.income, '0.1'); assert.equal(view.body.transactions.length, 1)
  assert.equal((await get('/api/finance?month=2026-10', cookieB).set('X-Owner-Id', ownerA)).body.transactions.length, 0)
  assert.equal((await post('/api/finance/transactions', body, cookieB)).status, 404)
  const portfolio = await post('/api/crypto/portfolios', { name: 'Synthetic crypto', quoteCurrency: 'USDT' }, cookieA); assert.equal(portfolio.status, 200)
  const trade = await post('/api/crypto/trades', { portfolioId: portfolio.body.id, asset: 'BTC', side: 'buy', quantity: '0.02', price: '5000', fee: '0.1', quoteCurrency: 'USDT', date: '2026-10-07' }, cookieA)
  assert.equal(trade.status, 200)
  assert.equal((await get('/api/crypto', cookieA)).body.quoteCurrency, 'USDT')
  summary.samePayloadKeyReceipt = true; summary.ownerIsolation = true
})
test('backup saved file parses/schema validates without credentials and restores with same-key receipt to empty second owner', async () => {
  const download = await get('/api/backup', cookieA); assert.equal(download.status, 200)
  assert.ok(download.headers['content-disposition']?.includes('attachment'))
  const file = `.beta-20261007.local/${randomUUID()}.backup.private.local`
  await writeFile(file, download.text, { mode: 0o600 })
  const text = await readFile(file, 'utf8'), parsed: unknown = JSON.parse(text)
  assert.ok(backupDocumentSchema.safeParse(parsed).success, 'saved backup schema valid')
  assert.ok(![password, cookieA, cookieB, process.env.BETTER_AUTH_SECRET!, target.password].some(secret => text.includes(secret)), 'credentials absent from saved JSON')
  const preview = await post('/api/backup/preview', parsed as object, cookieB); assert.equal(preview.status, 200); assert.equal(preview.body.canRestore, true)
  const payload = { backup: parsed, previewDigest: preview.body.digest, consent: true }, key = randomUUID()
  const restored = await post('/api/backup/restore', payload, cookieB, key); assert.equal(restored.status, 200)
  const freshDatabase = createTrackerDatabase(target.href)
  try {
    const freshAuth = createAuthRuntime(freshDatabase, configuration), freshApp = createApp({ auth: freshAuth, database: freshDatabase })
    assert.deepEqual((await post('/api/backup/restore', payload, cookieB, key, freshApp)).body, restored.body)
    assert.equal((await get('/api/finance?month=2026-10', cookieB, freshApp)).body.income, '0.1')
    assert.equal((await get('/api/me', cookieB, freshApp)).body.ownerId, ownerB)
  } finally { await freshDatabase.$disconnect() }
  summary.savedBackupSchemaAndCredentialScan = true; summary.restoreReceiptAfterRuntimeRecreation = true
})
test('invited mode rejects direct Auth/HTTP/WS bypass and closes both active sockets after invitation removal', async () => {
  const emails = new Set([emailA])
  const invitedAuth = createAuthRuntime(database, { ...configuration, beta: { access: 'invited', registrationsOpen: true, invitedEmails: emails } })
  const invitedApp = createApp({ auth: invitedAuth, database })
  assert.equal((await post('/api/auth/sign-up/email', { email: `${randomUUID()}@example.invalid`, password, name: 'Synthetic' }, undefined, randomUUID(), invitedApp)).status, 403)
  assert.equal((await get('/api/me', cookieB, invitedApp).set('X-Owner-Id', ownerA)).status, 403)
  const market = new MarketRelay(async () => { throw new Error('synthetic_provider_disabled') }), stocks = new StockMarketRelay(null)
  const server = invitedApp.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const stop = attachMarketStream(server, invitedAuth, market, stocks, undefined, id => authSubjectAllowed(invitedAuth, database, id))
  const sockets: WebSocket[] = []
  try {
    for (const route of ['market', 'stocks']) {
      const outsider = new WebSocket(`ws://127.0.0.1:${address.port}/ws/${route}`, { origin, headers: { Cookie: cookieB } }); outsider.on('error', () => {})
      const rejected = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => { outsider.terminate(); reject(new Error('upgrade deadline')) }, 6000)
        outsider.once('unexpected-response', (_req, res) => { clearTimeout(timeout); res.resume(); outsider.terminate(); resolve(res.statusCode!) })
        outsider.once('open', () => { clearTimeout(timeout); outsider.terminate(); reject(new Error('unexpected acceptance')) })
      }); assert.equal(rejected, 401)
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/${route}`, { origin, headers: { Cookie: cookieA } })
      await once(socket, 'open'); sockets.push(socket)
    }
    const start = performance.now(), closed = sockets.map(socket => once(socket, 'close').then(() => Math.round(performance.now() - start)))
    emails.delete(emailA)
    const latency = await Promise.race([Promise.all(closed), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('revalidation deadline')), 12000))])
    summary.invitationRevocationWsMs = { market: latency[0], stocks: latency[1] }
  } finally { sockets.forEach(socket => socket.terminate()); stop(); stocks.stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('registration pause keeps authenticated backup/logout available; revoked cookie is denied', async () => {
  const pausedAuth = createAuthRuntime(database, { ...configuration, beta: { ...configuration.beta, registrationsOpen: false } })
  const paused = createApp({ auth: pausedAuth, database })
  assert.equal((await post('/api/auth/sign-up/email', { email: `${randomUUID()}@example.invalid`, password, name: 'Synthetic' }, undefined, randomUUID(), paused)).status, 403)
  assert.equal((await get('/api/backup', cookieA, paused)).status, 200)
  assert.equal((await post('/api/auth/sign-out', {}, cookieA, randomUUID(), paused)).status, 200)
  assert.equal((await get('/api/me', cookieA)).status, 401)
})
test('actual dedicated PostgreSQL stop fails readiness closed and retained-volume restart recovers', async () => {
  const args = ['compose', '--env-file', '.beta-20261007.local/rehearsal.env', '-f', 'compose.beta-rehearsal.yaml']
  try {
    assert.equal(spawnSync('docker', [...args, 'stop', '-t', '1', 'postgres-beta-rehearsal'], { stdio: 'pipe', windowsHide: true }).status, 0)
    assert.equal((await get('/api/ready')).status, 503)
  } finally { assert.equal(spawnSync('docker', [...args, 'up', '-d', '--pull', 'never', '--wait', 'postgres-beta-rehearsal'], { stdio: 'pipe', windowsHide: true }).status, 0) }
  assert.equal((await get('/api/ready')).status, 200)
  assert.equal((await get('/api/finance?month=2026-10', cookieB)).body.income, '0.1')
  summary.actualDatabaseStopRestart = true
})
