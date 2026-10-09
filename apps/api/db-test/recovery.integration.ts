import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { spawn, spawnSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { WebSocket } from 'ws'
import { requireRecoveryTarget } from '../../../scripts/recovery-3a-target.mjs'
import { readAuthConfiguration } from '../src/auth/config.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { RecoveryService } from '../src/auth/recovery.js'
import { LocalSyntheticSink, drainDelivery, openEnvelope } from '../src/auth/delivery.js'
import { authSubjectAllowed } from '../src/auth/authorization.js'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createApp } from '../src/app.js'
import { MarketRelay } from '../src/tracker/market.js'
import { StockMarketRelay } from '../src/tracker/stocks.js'
import { attachMarketStream } from '../src/tracker/stream.js'

const target = requireRecoveryTarget(process.env), database = createTrackerDatabase(target.href)
const config = readAuthConfiguration(process.env)!, origin = config.origin
assert.ok(config.recovery?.mode === 'synthetic-3a', 'explicit synthetic recovery configuration required')
const recoverySettings = config.recovery
const sink = new LocalSyntheticSink(recoverySettings.sinkDirectory)
let fault = '', faultHits: string[] = []
const faultInjector = (stage: string) => { if (stage === fault) { faultHits.push(stage); throw new Error('synthetic_fault') } }
let service = new RecoveryService(database, config, faultInjector)
const app = createApp({ auth: service.auth, database, recovery: service })
const normalConfig = { databaseUrl: target.href, secret: config.secret, origin, secureCookies: false }
const normalAuth = createAuthRuntime(database, normalConfig)
const normal = createApp({ auth: normalAuth, database })
const password = randomBytes(24).toString('hex'), newPassword = randomBytes(24).toString('hex')
const emailA = `${randomUUID()}@example.invalid`, emailB = `${randomUUID()}@example.invalid`, legacyEmail = `${randomUUID()}@example.invalid`
let userA = '', userB = '', ownerA = '', ownerLegacy = '', cookieA = '', cookieA2 = '', legacyCookie = ''
let resetToken = '', secondaryToken = '', ledgerBefore = '', limitedEmail = ''
const summary: Record<string, unknown> = { target: 'dedicated synthetic PostgreSQL:5441', timingsMs: {}, websocketRevocationMs: {}, invariants: {}, faultHits }

function post(route: string, body: object, cookie?: string, application = app) {
  const call = request(application).post(`/api/auth/${route}`).set('Origin', origin).set('Host', new URL(origin).host)
  if (cookie) call.set('Cookie', cookie)
  return call.send(body)
}
function get(route: string, cookie: string, application = app) { return request(application).get(route).set('Cookie', cookie) }
function cookie(response: request.Response): string {
  const row = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find(value => value.startsWith('finntech.session_token='))
  assert.ok(!!row, 'session cookie exists; value withheld')
  return row!.split(';')[0]!
}
async function mailbox(email: string, kind: string): Promise<string> {
  for (let i = 0; i < 100; i++) if (await drainDelivery(database, sink) === 'IDLE') break
  const job = await database.authDeliveryJob.findFirstOrThrow({ where: { user: { email }, kind }, orderBy: { expiresAt: 'desc' } })
  const message = openEnvelope(await readFile(path.join(recoverySettings.sinkDirectory, `${job.id}.mail`), 'utf8'), config.recovery!.key)
  assert.ok(message.email === email && !!message.link, 'restricted mailbox subject/link verified; values withheld')
  assert.ok(new URL(message.link!).origin === origin, 'delivery origin is server configured')
  return new URL(message.link!).searchParams.get('token')!
}
async function ledgerDigest(): Promise<string> {
  const rows = await Promise.all([database.financeCategory.findMany({ orderBy: { id: 'asc' } }), database.financeTransaction.findMany({ orderBy: { id: 'asc' } }),
    database.cashAccount.findMany({ orderBy: { id: 'asc' } }), database.authIdentity.findMany({ orderBy: { id: 'asc' } }), database.cryptoTrade.findMany({ orderBy: { id: 'asc' } }),
    database.auditEvent.findMany({ orderBy: { id: 'asc' } }), database.idempotencyKey.findMany({ orderBy: { id: 'asc' } })])
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}
before(async () => {
  const current = await database.$queryRaw<{ name: string; role: string }[]>`SELECT current_database() AS name, current_user AS role`
  assert.ok(current[0]?.name === 'finntech_recovery_3a_20261007' && current[0].role === 'recovery_fixture', 'exact target guard')
  const migrations = await database.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`
  assert.equal(Number(migrations[0]?.count), 7)
})
after(async () => { await writeFile('.phase3a-20261007.local/integration-summary.json', JSON.stringify(summary, null, 2)); await database.$disconnect() })

test('A12 default-off retains existing signup/access; recovery routes and capabilities remain closed', async () => {
  const result = await post('sign-up/email', { email: legacyEmail, password, name: 'Synthetic legacy' }, undefined, normal)
  assert.equal(result.status, 200); legacyCookie = cookie(result)
  const me = await get('/api/me', legacyCookie, normal); assert.equal(me.status, 200); ownerLegacy = me.body.ownerId
  assert.equal((await post('request-password-reset', { email: legacyEmail }, undefined, normal)).status, 404)
  assert.deepEqual((await request(normal).get('/api/auth-capabilities')).body, { recovery: false, verification: false })
  const user = await database.authUser.findUniqueOrThrow({ where: { email: legacyEmail }, include: { recovery: true } })
  assert.equal(user.emailVerified, false); assert.equal(user.recovery, null)
})
test('signup waits for verification, rejects real recipient and never accepts client emailVerified', async () => {
  assert.equal((await post('sign-up/email', { email: 'real-recipient@example.com', password, name: 'Synthetic' })).status, 400)
  for (const email of [emailA, emailB]) {
    const result = await post('sign-up/email', { email, password, name: 'Synthetic new account', emailVerified: true })
    assert.equal(result.status, 200); assert.equal(result.body.awaitingVerification, true)
    assert.ok(!result.headers['set-cookie'] && !('token' in result.body), 'no session/token on signup')
    const user = await database.authUser.findUniqueOrThrow({ where: { email } })
    assert.equal(user.emailVerified, false)
    if (email === emailA) userA = user.id; else userB = user.id
    assert.equal((await post('sign-in/email', { email, password })).status, 403)
  }
})
test('A02 verification invalid/expired/replayed/wrong-session-subject are rejected; no automatic session', async () => {
  const a = await mailbox(emailA, 'verify'), b = await mailbox(emailB, 'verify')
  assert.equal((await post('confirm-email', { token: `${a}tampered` })).status, 400)
  assert.equal((await post('confirm-email', { token: a }, legacyCookie)).status, 400)
  assert.equal((await post('confirm-email', { token: a })).status, 200)
  assert.equal(await database.authSession.count({ where: { userId: userA } }), 0)
  assert.equal((await post('confirm-email', { token: a })).status, 400)
  await database.authVerification.updateMany({ where: { value: userB }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await post('confirm-email', { token: b })).status, 400)
  // Explicit current-password proof is required before an existing unverified account enrolls.
  assert.equal((await post('begin-verification', { email: legacyEmail, password: 'synthetic-wrong' })).status, 200)
  const legacy = await database.authUser.findUniqueOrThrow({ where: { email: legacyEmail }, include: { recovery: true } })
  assert.equal(legacy.recovery, null)
  assert.equal((await post('begin-verification', { email: legacyEmail, password })).status, 200)
  const token = await mailbox(legacyEmail, 'verify')
  assert.equal((await post('confirm-email', { token })).status, 200)
  const login = await post('sign-in/email', { email: legacyEmail, password }); assert.equal(login.status, 200)
  assert.ok((await get('/api/me', cookie(login))).body.ownerId === ownerLegacy, 'legacy owner UUID unchanged after explicit verification')
})
test('A01 generic reset responses/timing for unknown/unverified/verified; durable encrypted jobs only for verified', async () => {
  const values = [emailA, emailB, `${randomUUID()}@example.invalid`], responses: request.Response[] = [], timings: Record<string, number[]> = {}
  for (const [index, email] of values.entries()) {
    const bucket = ['verified', 'unverified', 'unknown'][index]!
    timings[bucket] = []
    for (let sample = 0; sample < 5; sample++) {
      const started = performance.now(), response = await post('request-password-reset', { email })
      timings[bucket]!.push(Math.round(performance.now() - started)); responses.push(response)
    }
  }
  assert.ok(responses.every(row => row.status === 200 && JSON.stringify(row.body) === JSON.stringify(responses[0]!.body)), 'identical generic status/body')
  assert.equal(await database.authDeliveryJob.count({ where: { userId: userB, kind: 'reset' } }), 0)
  assert.equal(await database.authDeliveryJob.count({ where: { userId: userA, kind: 'reset' } }), 5)
  const jobs = await database.authDeliveryJob.findMany({ where: { userId: userA, kind: 'reset' } })
  assert.ok(jobs.every(job => !job.envelope.includes(emailA) && !job.envelope.includes('http')), 'database envelopes encrypted')
  summary.timingsMs = timings
  resetToken = await mailbox(emailA, 'reset')
  await post('request-password-reset', { email: emailA }); secondaryToken = await mailbox(emailA, 'reset')
})
test('A04 GET/link scanner does not mutate credentials; password policy and confirmation enforced', async () => {
  const before = await database.authAccount.findFirstOrThrow({ where: { userId: userA, providerId: 'credential' } })
  assert.equal((await request(app).get(`/api/auth/reset-password/${resetToken}`).query({ callbackURL: `${origin}/account/reset` })).status, 404)
  assert.equal((await request(app).get('/api/auth/reset-password')).status, 405)
  const after = await database.authAccount.findUniqueOrThrow({ where: { id: before.id } }); assert.ok(after.password === before.password, 'scanner unchanged password')
  for (const value of ['short', 'x'.repeat(129)]) assert.equal((await post('reset-password', { token: resetToken, newPassword: value, confirmation: value })).status, 400)
  assert.equal((await post('reset-password', { token: resetToken, newPassword, confirmation: 'not-matching' })).status, 400)
  // Respect the installed library's 3 requests / 10s signin bucket; never weaken it for tests.
  await delay(10500)
  const login1 = await post('sign-in/email', { email: emailA, password }), login2 = await post('sign-in/email', { email: emailA, password })
  assert.equal(login1.status, 200); assert.equal(login2.status, 200); cookieA = cookie(login1); cookieA2 = cookie(login2)
  ownerA = (await get('/api/me', cookieA)).body.ownerId
  const category = await database.financeCategory.create({ data: { ownerId: ownerA, type: 'INCOME', name: 'Synthetic invariant' } })
  await database.financeTransaction.create({ data: { ownerId: ownerA, categoryId: category.id, type: 'INCOME', amount: '123456789012345678.99', occurredAt: new Date('2026-10-07T00:00:00Z') } })
  await database.cashAccount.create({ data: { ownerId: ownerA, name: 'Synthetic cash', balance: '99.25', asOf: '2026-10-07' } })
  ledgerBefore = await ledgerDigest()
})
test('A06 real PostgreSQL faults after consume/password update/before revocation rollback all steps, including after restart', async () => {
  const baseline = await database.authAccount.findFirstOrThrow({ where: { userId: userA, providerId: 'credential' } })
  const sessions = await database.authSession.count({ where: { userId: userA } })
  for (const stage of ['after-consume', 'after-hash', 'after-password-update', 'before-session-revoke', 'after-reset-hook', 'after-session-revoke']) {
    fault = stage
    const response = await post('reset-password', { token: resetToken, newPassword, confirmation: newPassword })
    assert.equal(response.status, 503)
    assert.ok(faultHits.includes(stage), 'fault hook actually reached')
    const current = await database.authAccount.findUniqueOrThrow({ where: { id: baseline.id } })
    assert.ok(current.password === baseline.password, 'password update rolled back')
    assert.equal(await database.authSession.count({ where: { userId: userA } }), sessions)
    assert.ok(!!await (await service.auth.$context).internalAdapter.findVerificationValue(`reset-password:${resetToken}`), 'challenge consumption rolled back')
    assert.equal((await get('/api/me', cookieA)).status, 200)
    fault = ''
  }
  service = new RecoveryService(database, config, faultInjector)
  const restarted = createApp({ auth: service.auth, database, recovery: service })
  assert.equal((await get('/api/me', cookieA, restarted)).status, 200)
  assert.ok(await ledgerDigest() === ledgerBefore, 'owner/ledger unaffected by failure/restart')
})
test('A03/A05 concurrent reset succeeds once, old challenges/sessions/password rejected; HTTP and both WS close measured', async () => {
  const market = new MarketRelay(async () => { throw new Error('synthetic_no_provider') }), stocks = new StockMarketRelay(null)
  const server = app.listen(4197, '127.0.0.1'); await once(server, 'listening')
  const stop = attachMarketStream(server, service.auth, market, stocks, async id => (await database.authIdentity.findUnique({ where: { authUserId: id } }))?.ownerId ?? null,
    id => authSubjectAllowed(service.auth, database, id))
  const sockets: WebSocket[] = []
  try {
    for (const route of ['market', 'stocks']) {
      const socket = new WebSocket(`ws://127.0.0.1:4197/ws/${route}`, { origin, headers: { Cookie: cookieA } })
      await once(socket, 'open'); sockets.push(socket)
    }
    const started = performance.now(), closed = sockets.map(socket => once(socket, 'close').then(() => Math.round(performance.now() - started)))
    const replies = await Promise.all([post('reset-password', { token: resetToken, newPassword, confirmation: newPassword }), post('reset-password', { token: resetToken, newPassword, confirmation: newPassword })])
    assert.equal(replies.filter(row => row.status === 200).length, 1)
    assert.ok(replies.every(row => row.status === 200 || row.status === 400 || row.status === 503), 'race loser rejected')
    assert.equal((await post('sign-in/email', { email: emailA, password })).status, 401)
    assert.equal((await get('/api/me', cookieA)).status, 401); assert.equal((await get('/api/me', cookieA2)).status, 401)
    assert.equal(await database.authSession.count({ where: { userId: userA } }), 0)
    assert.equal((await post('reset-password', { token: resetToken, newPassword: password, confirmation: password })).status, 400)
    assert.equal((await post('reset-password', { token: secondaryToken, newPassword: password, confirmation: password })).status, 400)
    const latency = await Promise.race([Promise.all(closed), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('WS close deadline exceeded')), 12000))])
    summary.websocketRevocationMs = { market: latency[0], stocks: latency[1], includesResetAndDatabaseLatency: true }
    assert.ok(await ledgerDigest() === ledgerBefore, 'ledger and ownership byte-equivalent digest after reset')
    await delay(10500)
    const login = await post('sign-in/email', { email: emailA, password: newPassword }); assert.equal(login.status, 200)
    assert.ok((await get('/api/me', cookie(login))).body.ownerId === ownerA, 'same owner UUID after reset')
    cookieA = cookie(login)
  } finally { sockets.forEach(socket => socket.terminate()); stop(); stocks.stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('A03 invalid/expired and wrong authenticated subject reset tokens rejected', async () => {
  assert.equal((await post('reset-password', { token: 'synthetic-invalid', newPassword, confirmation: newPassword })).status, 400)
  await post('request-password-reset', { email: emailA }); const token = await mailbox(emailA, 'reset')
  assert.equal((await post('reset-password', { token, newPassword, confirmation: newPassword }, legacyCookie)).status, 400)
  const challenge = await (await service.auth.$context).internalAdapter.findVerificationValue(`reset-password:${token}`)
  assert.ok(!!challenge)
  await database.authVerification.update({ where: { id: challenge!.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await post('reset-password', { token, newPassword, confirmation: newPassword })).status, 400)
})
test('A02 signed Better Auth verification JWT expiry remains enforced even if database deadline is extended', async () => {
  const shortConfig = { ...config, recovery: { ...config.recovery!, verificationExpiresIn: 1 } }
  const short = new RecoveryService(database, shortConfig), application = createApp({ auth: short.auth, database, recovery: short })
  const email = `${randomUUID()}@example.invalid`
  const signup = await post('sign-up/email', { email, name: 'Synthetic expiry', password }, undefined, application)
  assert.equal(signup.status, 200)
  const token = await mailbox(email, 'verify'), user = await database.authUser.findUniqueOrThrow({ where: { email } })
  await database.authVerification.updateMany({ where: { value: user.id }, data: { expiresAt: new Date(Date.now() + 60000) } })
  await delay(1100)
  assert.equal((await post('confirm-email', { token }, undefined, application)).status, 400)
  assert.equal((await database.authUser.findUniqueOrThrow({ where: { id: user.id } })).emailVerified, false)
  assert.equal(await database.authSession.count({ where: { userId: user.id } }), 0)
})
test('A08 encrypted delivery durable restart/retry/duplicate/expiry/failure; no lifetime extension', async () => {
  await post('request-password-reset', { email: emailA })
  const queued = await database.authDeliveryJob.findFirstOrThrow({ where: { userId: userA, kind: 'reset', status: 'PENDING' } })
  const failing = { deliver: async () => { throw new Error('synthetic_sink_down') } }
  assert.equal(await drainDelivery(database, failing), 'RETRY')
  const pending = await database.authDeliveryJob.findUniqueOrThrow({ where: { id: queued.id } })
  assert.ok(pending.expiresAt.getTime() === queued.expiresAt.getTime(), 'retry cannot extend challenge lifetime')
  const restartedDatabase = createTrackerDatabase(target.href)
  try {
    assert.equal(await drainDelivery(restartedDatabase, sink, new Date(pending.nextAt.getTime() + 1)), 'SENT')
    const saved = await readFile(path.join(recoverySettings.sinkDirectory, `${queued.id}.mail`), 'utf8')
    await sink.deliver(queued.id, saved)
    assert.ok(saved === await readFile(path.join(recoverySettings.sinkDirectory, `${queued.id}.mail`), 'utf8'), 'duplicate preserves exact encrypted message')
  } finally { await restartedDatabase.$disconnect() }
  await post('request-password-reset', { email: emailA })
  const bounded = await database.authDeliveryJob.findFirstOrThrow({ where: { userId: userA, kind: 'reset', status: 'PENDING' } })
  for (let attempt = 1; attempt <= 4; attempt++) {
    const row = await database.authDeliveryJob.findUniqueOrThrow({ where: { id: bounded.id } })
    assert.equal(await drainDelivery(database, failing, new Date(row.nextAt.getTime() + 1)), attempt === 4 ? 'FAILED' : 'RETRY')
    const after = await database.authDeliveryJob.findUniqueOrThrow({ where: { id: bounded.id } })
    assert.equal(after.attempts, attempt)
    assert.ok(after.expiresAt.getTime() === bounded.expiresAt.getTime(), 'bounded retry preserves original absolute expiry')
  }
  const failed = await database.authDeliveryJob.findUniqueOrThrow({ where: { id: bounded.id } })
  assert.equal(failed.status, 'FAILED')
  assert.equal(await drainDelivery(database, sink, new Date(failed.nextAt.getTime() + 1)), 'IDLE')
  summary.boundedDeliveryAttempts = 4
  await post('request-password-reset', { email: emailA })
  const expiry = await database.authDeliveryJob.findFirstOrThrow({ where: { userId: userA, kind: 'reset', status: 'PENDING' } })
  await database.authDeliveryJob.update({ where: { id: expiry.id }, data: { expiresAt: new Date(Date.now() - 1) } })
  assert.equal(await drainDelivery(database, sink), 'EXPIRED')
  fault = 'before-delivery-enqueue'
  const count = await database.authDeliveryJob.count({ where: { userId: userA, kind: 'reset' } })
  assert.equal((await post('request-password-reset', { email: emailA })).status, 200)
  assert.equal(await database.authDeliveryJob.count({ where: { userId: userA, kind: 'reset' } }), count)
  assert.ok(faultHits.includes(fault)); fault = ''
})
test('A07 actual HTTP response loss after commit leaves new password committed; replay rejected and no auto session', async () => {
  assert.equal((await post('request-password-reset', { email: legacyEmail })).status, 200)
  const token = await mailbox(legacyEmail, 'reset'), nextPassword = randomBytes(24).toString('hex')
  const subject = await database.authUser.findUniqueOrThrow({ where: { email: legacyEmail } })
  const credential = await database.authAccount.findFirstOrThrow({ where: { userId: subject.id, providerId: 'credential' } })
  // Test-only HTTP transport delays writing the response after the actual handler commits.
  const server = createServer((req, res) => {
    const end = res.end
    res.end = ((...args: unknown[]) => { setTimeout(() => Reflect.apply(end, res, args), 1000); return res }) as typeof res.end
    app(req, res)
  })
  server.listen(4197, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const controller = new AbortController()
  try {
    const pending = fetch(`${origin}/api/auth/reset-password`, { method: 'POST', signal: controller.signal,
      headers: { Origin: origin, Host: new URL(origin).host, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: nextPassword, confirmation: nextPassword }) })
      .then(async response => { await response.text(); return 'response' }).catch(() => 'aborted')
    let committed = false
    for (let n = 0; n < 100; n++) {
      const row = await database.authAccount.findUniqueOrThrow({ where: { id: credential.id } })
      if (row.password !== credential.password) { committed = true; break }
      await delay(10)
    }
    assert.ok(committed, 'real password transaction committed before HTTP response')
    controller.abort(); assert.equal(await pending, 'aborted')
    assert.equal(await database.authSession.count({ where: { userId: subject.id } }), 0)
    assert.equal((await post('reset-password', { token, newPassword: password, confirmation: password })).status, 400)
    assert.equal((await post('sign-in/email', { email: legacyEmail, password: nextPassword })).status, 200)
    assert.ok(await ledgerDigest() === ledgerBefore, 'unknown response never means rollback or ledger mutation')
    summary.actualResetResponseLossAfterCommit = true
  } finally { controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('A09 missing/wrong Origin, external/path callback, injected Host/forwarded peer rejected; durable rate limit', async () => {
  assert.equal((await request(app).post('/api/auth/request-password-reset').send({ email: emailA })).status, 403)
  assert.equal((await request(app).post('/api/auth/request-password-reset').set('Origin', 'https://external.invalid').send({ email: emailA })).status, 403)
  assert.equal((await post('request-password-reset', { email: emailA, redirectTo: 'https://external.invalid/reset' })).status, 400)
  assert.equal((await post('request-password-reset', { email: emailA, redirectTo: `${origin}/not-allowed` })).status, 400)
  assert.equal((await post('request-password-reset', { email: emailA }).set('Host', 'injected.invalid')).status, 403)
  assert.equal((await post('request-password-reset', { email: emailA }).set('X-Forwarded-For', '198.51.100.1')).status, 403)
  const email = `${randomUUID()}@example.invalid`; limitedEmail = email
  let limited = false
  if (Date.now() % 60000 > 57000) await delay(3100)
  const burst = await Promise.all(Array.from({ length: 21 }, () => post('request-password-reset', { email })))
  limited = burst.some(row => row.status === 429)
  assert.ok(limited, 'durable account/IP rate enforced')
  const restarted = createApp({ auth: service.auth, database, recovery: service })
  assert.equal((await post('request-password-reset', { email }, undefined, restarted)).status, 429)
})
test('A05/A06 actual compiled process restart preserves access; PostgreSQL outage fails HTTP/WS closed with measured latency', async () => {
  for (let n = 0; n < 100; n++) if (await drainDelivery(database, sink) === 'IDLE') break
  await post('request-password-reset', { email: emailA })
  const queued = await database.authDeliveryJob.findFirstOrThrow({ where: { userId: userA, kind: 'reset', status: 'PENDING' } })
  // Local delivery persisted, but acknowledgement failed. Durable job retries the same envelope/id.
  const acknowledgementLost = { deliver: async (id: string, envelope: string) => { await sink.deliver(id, envelope); throw new Error('synthetic_acknowledgement_loss') } }
  assert.equal(await drainDelivery(database, acknowledgementLost), 'RETRY')
  const deliveredBytes = await readFile(path.join(recoverySettings.sinkDirectory, `${queued.id}.mail`), 'utf8')
  const start = async () => {
    const child = spawn(process.execPath, ['--no-strip-types', 'apps/api/dist/server.js'], { env: process.env, stdio: 'pipe', windowsHide: true })
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {}) // Never capture raw runtime errors.
    for (let n = 0; n < 60; n++) {
      if (child.exitCode !== null) throw new Error('Synthetic runtime exited before readiness')
      try { if ((await fetch(`${origin}/api/health`)).ok) return child } catch {}
      await delay(100)
    }
    child.kill(); throw new Error('Synthetic runtime readiness timeout')
  }
  const stop = async (child: ReturnType<typeof spawn>) => { const done = once(child, 'exit'); child.kill(); await done }
  let child = await start()
  try {
    assert.equal((await fetch(`${origin}/api/auth/request-password-reset`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: limitedEmail }) })).status, 429)
    summary.rateLimitSharedAcrossActualProcesses = true
    assert.equal((await fetch(`${origin}/api/me`, { headers: { Cookie: cookieA } })).status, 200)
    await stop(child); child = await start()
    assert.equal((await fetch(`${origin}/api/me`, { headers: { Cookie: cookieA } })).status, 200)
    for (let n = 0; n < 60; n++) {
      if ((await database.authDeliveryJob.findUniqueOrThrow({ where: { id: queued.id } })).status === 'SENT') break
      await delay(100)
    }
    const recovered = await database.authDeliveryJob.findUniqueOrThrow({ where: { id: queued.id } })
    assert.equal(recovered.status, 'SENT')
    assert.ok(recovered.expiresAt.getTime() === queued.expiresAt.getTime(), 'restart/duplicate delivery did not renew expiry')
    assert.ok(deliveredBytes === await readFile(path.join(recoverySettings.sinkDirectory, `${queued.id}.mail`), 'utf8'), 'duplicate delivery preserved the exact encrypted envelope')
    summary.actualDeliveryRestartRecovered = true
    const sockets: WebSocket[] = []
    for (const route of ['market', 'stocks']) { const socket = new WebSocket(`ws://127.0.0.1:4197/ws/${route}`, { origin, headers: { Cookie: cookieA } }); await once(socket, 'open'); sockets.push(socket) }
    const startTime = performance.now(), closed = sockets.map(socket => once(socket, 'close').then(() => Math.round(performance.now() - startTime)))
    const args = ['compose', '--env-file', '.phase3a-20261007.local/runtime.env', '-f', 'compose.recovery-3a.yaml']
    try {
      assert.equal(spawnSync('docker', [...args, 'stop', '-t', '1', 'postgres-recovery-3a'], { stdio: 'pipe', windowsHide: true }).status, 0)
      assert.equal((await fetch(`${origin}/api/me`, { headers: { Cookie: cookieA } })).status, 503)
      const latency = await Promise.race([Promise.all(closed), delay(15000).then(() => { throw new Error('WS database outage close deadline exceeded') })])
      summary.websocketDatabaseFailureMs = { market: latency[0], stocks: latency[1], includesDatabaseStopLatency: true }
    } finally {
      sockets.forEach(socket => socket.terminate())
      assert.equal(spawnSync('docker', [...args, 'up', '-d', '--pull', 'never', '--wait', 'postgres-recovery-3a'], { stdio: 'pipe', windowsHide: true }).status, 0)
    }
    assert.ok(await ledgerDigest() === ledgerBefore, 'ledger invariant persists through actual process/DB restart')
    summary.actualProcessAndDatabaseRestart = true
  } finally { await stop(child) }
})
test('A11 blocked/deletion-pending subject cannot recover, authorize HTTP or WS; no mapping resurrection', async () => {
  await database.authRecoveryEnrollment.update({ where: { userId: userA }, data: { blocked: true } })
  assert.equal((await get('/api/me', cookieA)).status, 403)
  assert.equal((await get('/api/finance?month=2026-10', cookieA)).status, 403)
  assert.equal((await get('/api/auth/get-session', cookieA)).body, null)
  assert.equal(await authSubjectAllowed(service.auth, database, userA), false)
  const count = await database.authDeliveryJob.count({ where: { userId: userA, kind: 'reset' } })
  assert.equal((await post('request-password-reset', { email: emailA })).status, 200)
  assert.equal(await database.authDeliveryJob.count({ where: { userId: userA, kind: 'reset' } }), count)
  assert.ok(await ledgerDigest() === ledgerBefore, 'all financial/owner invariants preserved')
  summary.invariants = { ledgerOwnerDigestUnchanged: true, decimalPrecisionUnchanged: true, ownerMappingUnchanged: true, noAutoSessionAfterVerifyOrReset: true }
})
