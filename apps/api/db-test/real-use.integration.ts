import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { once } from 'node:events'
import { writeFile, readdir } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import request from 'supertest'
import { WebSocket } from 'ws'
import { readAuthConfiguration } from '../src/auth/config.js'
import { RecoveryService } from '../src/auth/recovery.js'
import { assertRealBoundary, consumeRealBudget, registerRealDatabase } from '../src/auth/real.js'
import { BrevoDeliverySink } from '../src/auth/mail.js'
import { drainRealDelivery, openEnvelope } from '../src/auth/delivery.js'
import { authSubjectAllowed } from '../src/auth/authorization.js'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createApp } from '../src/app.js'
import { MarketRelay } from '../src/tracker/market.js'
import { StockMarketRelay } from '../src/tracker/stocks.js'
import { attachMarketStream } from '../src/tracker/stream.js'

const config = readAuthConfiguration(process.env)!
assert.equal(config.real?.boundary, 'real-rehearsal', 'isolated rehearsal configuration required')
assert.equal(config.recovery?.mode, 'real-email')
const db = createTrackerDatabase(config.databaseUrl), origin = config.origin
let fault = ''
const service = new RecoveryService(db, config, stage => { if (stage === fault) throw new Error('synthetic_fault') })
const app = createApp({ database: db, auth: service.auth, recovery: service })
const password = randomBytes(24).toString('hex'), newPassword = randomBytes(24).toString('hex')
const emailA = `${randomUUID()}@example.test`, emailB = `${randomUUID()}@example.test`
let userA = '', cookieA = '', cookieA2 = '', cookieB = '', ownerA = '', ownerB = '', categoryA = '', entryA = '', resetToken = ''
let baseAccounts = 0, baseOwners = 0, baseTransactions = 0, basePortfolios = 0
const mails = new Map<string, { email: string; kind: string; link?: string }>(), calls: string[] = []
const recordingTransport: typeof fetch = async (url, options) => {
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
  const body = JSON.parse(options!.body as string) as { headers: { 'Idempotency-Key': string }; to: { email: string }[]; textContent: string }
  const id = body.headers['Idempotency-Key']; calls.push(id)
  const job = await db.authDeliveryJob.findUniqueOrThrow({ where: { id } })
  mails.set(id, openEnvelope(job.envelope, config.recovery!.key))
  return new Response('{}', { status: 201 })
}
const sink = new BrevoDeliverySink(config.recovery!.mode === 'real-email' ? config.recovery!.mail : (() => { throw new Error('wrong sink') })(), config.recovery!.key, origin, recordingTransport)
const evidence: Record<string, unknown> = { syntheticOnly: true, externalMail: 'NOT TESTED', cases: [], websocketRevocationMs: {} }
function post(route: string, body: object, cookie?: string, application = app) {
  const call = request(application).post(`/api/auth/${route}`).set('Origin', origin).set('X-Forwarded-Host', 'attacker.invalid').set('X-Forwarded-For', '203.0.113.99')
  if (cookie) call.set('Cookie', cookie)
  return call.send(body)
}
function get(path: string, cookie?: string, application = app) { const call = request(application).get(`/api/${path}`); return cookie ? call.set('Cookie', cookie) : call }
function sessionCookie(response: request.Response): string {
  const row = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find(value => value.startsWith('finntech.session_token='))
  assert.ok(row, 'genuine Better Auth session cookie exists; value withheld'); return row.split(';')[0]!
}
async function deliver(email: string, kind: string): Promise<string> {
  for (let i = 0; i < 30; i++) if (await drainRealDelivery(db, sink, config.real!) === 'IDLE') break
  const job = await db.authDeliveryJob.findFirstOrThrow({ where: { user: { email }, kind }, orderBy: { expiresAt: 'desc' } })
  const message = mails.get(job.id); assert.equal(message?.email, email); assert.ok(message?.link)
  const link = new URL(message.link); assert.equal(link.origin, origin); assert.equal(link.search, '')
  return new URLSearchParams(link.hash.slice(1)).get('token')!
}
async function mutation(path: string, body: object, cookie: string, key: string = randomUUID()) {
  return request(app).post(`/api/${path}`).set('Origin', origin).set('Cookie', cookie).set('Idempotency-Key', key).send(body)
}
async function ownedDigest(): Promise<string> {
  const values = await Promise.all([db.financeTransaction.findMany({ orderBy: { id: 'asc' } }), db.cryptoTrade.findMany({ orderBy: { id: 'asc' } }), db.auditEvent.findMany({ orderBy: { id: 'asc' } }), db.idempotencyKey.findMany({ orderBy: { id: 'asc' } })])
  return createHash('sha256').update(JSON.stringify(values)).digest('hex')
}
before(async () => {
  await assertRealBoundary(db, config.real!, origin)
  // Re-runs add a new synthetic pair; never delete an earlier pair or reuse credentials.
  // This is allowed only in the exact attested rehearsal database.
  const existing = await db.authUser.findMany({ select: { email: true, name: true } })
  assert.ok(existing.every(row => row.email.endsWith('@example.test') && row.name === 'Synthetic real-use rehearsal'), 'refuse an unexpected account without deleting it')
  baseAccounts = existing.length; baseOwners = await db.trackerUser.count(); baseTransactions = await db.financeTransaction.count(); basePortfolios = await db.cryptoPortfolio.count()
  assert.equal(await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`.then(rows => Number(rows[0]?.count)), (await readdir('apps/api/prisma/migrations',{withFileTypes:true})).filter(item=>item.isDirectory()).length)
})
after(async () => { await writeFile(process.env.FINNTECH_REAL_TEST_EVIDENCE_FILE ?? '.real-use-20261008.local/integration-summary.json', JSON.stringify(evidence, null, 2)); await db.$disconnect() })

test('real boundary refuses mismatched marker/role and anonymous HTTP/WS APIs', async () => {
  await assert.rejects(assertRealBoundary(db, { ...config.real!, databaseRole: 'beta_app' }, origin))
  for (const path of ['me', 'finance?month=2026-10', 'crypto', 'backup']) assert.equal((await get(path)).status, 401)
  assert.equal((await post('demo/enter', { code: 'test-only' })).status, 404)
  assert.equal((await request(app).get('/api/auth/verify-email?token=test-only')).status, 404)
})
test('registration stays closed unless explicitly enabled; code gate cannot create a real account', async () => {
  const closedService = new RecoveryService(db, { ...config, real: { ...config.real!, registrationsOpen: false } })
  const closed = createApp({ database: db, auth: closedService.auth, recovery: closedService })
  assert.equal((await post('sign-up/email', { name: 'Fixture', email: emailA, password }, undefined, closed)).status, 403)
  assert.equal(await db.authUser.count(), baseAccounts)
  const health = await get('health', undefined, closed); assert.equal(health.body.real.registrationsOpen, false); assert.ok(!health.body.beta && !health.body.demo)
})
test('two individual accounts require genuine verification and start empty; no synthetic auto-enrollment or cookies on signup', async () => {
  for (const email of [emailA, emailB]) {
    const response = await post('sign-up/email', { email, name: 'Synthetic real-use rehearsal', password, emailVerified: true })
    assert.equal(response.status, 200); assert.equal(response.body.awaitingVerification, true)
    assert.ok(!response.headers['set-cookie'] && !('token' in response.body))
    const user = await db.authUser.findUniqueOrThrow({ where: { email }, include: { recovery: true } })
    assert.equal(user.emailVerified, false); assert.ok(user.recovery); if (email === emailA) userA = user.id
    assert.equal((await post('sign-in/email', { email, password })).status, 403)
  }
  assert.equal(await db.trackerUser.count(), baseOwners); assert.equal(await db.financeTransaction.count(), baseTransactions); assert.equal(await db.cryptoPortfolio.count(), basePortfolios)
  assert.equal(await db.demoWorkspace.count(), 0)
})
test('scanner GET never verifies; tampered/expired/replayed challenges reject without a session', async () => {
  const token = await deliver(emailA, 'verify')
  assert.equal((await request(app).get('/account/verify')).status, 404)
  assert.equal((await db.authUser.findUniqueOrThrow({ where: { id: userA } })).emailVerified, false)
  assert.equal((await post('confirm-email', { token: token + 'tampered' })).status, 400)
  assert.equal((await post('confirm-email', { token })).status, 200)
  assert.equal((await post('confirm-email', { token })).status, 400)
  assert.equal(await db.authSession.count({ where: { user: { email: { in: [emailA, emailB] } } } }), 0)
  const tokenB = await deliver(emailB, 'verify')
  await db.authVerification.updateMany({ where: { value: (await db.authUser.findUniqueOrThrow({ where: { email: emailB } })).id }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await post('confirm-email', { token: tokenB })).status, 400)
  // Re-issue through the authenticated credential check, not a verification flag override.
  assert.equal((await post('begin-verification', { email: emailB, password })).status, 200)
  await delay(1100)
  assert.equal((await post('begin-verification', { email: emailB, password })).status, 200)
  assert.equal((await post('confirm-email', { token: await deliver(emailB, 'verify') })).status, 200)
})
test('genuine sessions isolate owners; Decimal ledger write retries keep the same receipt and payload', async () => {
  await delay(11000) // Honour Better Auth's three sign-ins per ten seconds; never weaken it for tests.
  const loginA = await post('sign-in/email', { email: emailA, password }), loginB = await post('sign-in/email', { email: emailB, password })
  assert.equal(loginA.status, 200); assert.equal(loginB.status, 200); cookieA = sessionCookie(loginA); cookieB = sessionCookie(loginB)
  const issuedCookies = loginA.headers['set-cookie'] as unknown as string[]
  assert.ok(issuedCookies?.[0]); assert.match(issuedCookies[0], /HttpOnly/i); assert.match(issuedCookies[0], /SameSite=Lax/i)
  ownerA = (await get('me', cookieA)).body.ownerId; ownerB = (await get('me', cookieB)).body.ownerId; assert.notEqual(ownerA, ownerB)
  const emptyA = await get('finance?month=2026-10', cookieA); assert.deepEqual(emptyA.body.transactions, []); assert.deepEqual((await get('crypto', cookieA)).body.portfolios, [])
  const category = await mutation('finance/categories', { name: 'Fixture THB expense', type: 'expense' }, cookieA); assert.equal(category.status, 200); categoryA = category.body.id
  const key = randomUUID(), payload = { type: 'expense', categoryId: categoryA, amount: '0.10', currency: 'THB', date: '2026-10-08', note: 'synthetic-only' }
  const [first, second] = await Promise.all([mutation('finance/transactions', payload, cookieA, key), mutation('finance/transactions', payload, cookieA, key)])
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(first.body.id, second.body.id); entryA = first.body.id
  assert.equal((await get('finance?month=2026-10', cookieA)).body.expense, '0.1')
  assert.deepEqual((await get('finance?month=2026-10', cookieB)).body.transactions, [])
  assert.equal((await mutation('finance/transactions', payload, cookieB)).status, 404)
  assert.equal((await mutation(`finance/transactions/${entryA}/corrections`, { action: 'void', reason: 'cross-owner' }, cookieB)).status, 404)
  assert.equal((await mutation('finance/transactions', { ...payload, amount: '0.20' }, cookieA, key)).status, 409)
})
test('THB/USDT remain separate and crypto cost uses exact Decimal strings', async () => {
  const portfolio = await mutation('crypto/portfolios', { name: 'Synthetic portfolio', quoteCurrency: 'USDT' }, cookieA); assert.equal(portfolio.status, 200)
  const payload = { portfolioId: portfolio.body.id, side: 'buy', asset: 'BTC', quantity: '0.00000001', price: '999999.123456789012345678', fee: '0.000000000000000001', quoteCurrency: 'USDT', date: '2026-10-08' }
  assert.equal((await mutation('crypto/trades', payload, cookieA)).status, 200)
  assert.equal((await mutation('crypto/trades', { ...payload, quoteCurrency: 'THB' }, cookieA)).status, 422)
  const exportFile = (await get('backup', cookieA)).body; assert.equal(exportFile.trades[0].price, payload.price); assert.equal(exportFile.trades[0].quantity, payload.quantity)
})
test('JSON attachment is credential-free; preview/consent/idempotent restore remaps only into empty owner', async () => {
  const response = await get('backup', cookieA); assert.equal(response.status, 200); assert.ok(response.headers['content-disposition']); assert.match(response.headers['content-disposition'], /attachment/)
  const file = JSON.parse(JSON.stringify(response.body)); assert.ok(!/password|session_token|auth_users|api.key/i.test(JSON.stringify(file)))
  const preview = await mutation('backup/preview', file, cookieB); assert.equal(preview.status, 200); assert.equal(preview.body.canRestore, true)
  assert.equal(await db.financeTransaction.count({ where: { ownerId: ownerB } }), 0)
  const body = { backup: file, previewDigest: preview.body.digest, consent: true }, key = randomUUID()
  assert.equal((await mutation('backup/restore', { ...body, consent: false }, cookieB)).status, 422)
  const [a, b] = await Promise.all([mutation('backup/restore', body, cookieB, key), mutation('backup/restore', body, cookieB, key)])
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.deepEqual(a.body, b.body)
  assert.equal((await get('finance?month=2026-10', cookieB)).body.expense, '0.1')
  assert.ok(!(await get('backup', cookieB)).body.transactions.some((row: { id: string }) => row.id === entryA))
  assert.equal((await mutation('backup/restore', body, cookieB)).status, 409)
})
test('logout, browser change and restarted database client retain records and owner mapping', async () => {
  await delay(11000)
  const before = await ownedDigest()
  assert.equal((await post('sign-out', {}, cookieA)).status, 200); assert.equal((await get('me', cookieA)).status, 401)
  const newDb = createTrackerDatabase(config.databaseUrl)
  try {
    const restarted = new RecoveryService(newDb, config), application = createApp({ database: newDb, auth: restarted.auth, recovery: restarted })
    const response = await post('sign-in/email', { email: emailA, password }, undefined, application); assert.equal(response.status, 200); cookieA = sessionCookie(response)
    assert.equal((await get('me', cookieA, application)).body.ownerId, ownerA)
    assert.equal((await get('finance?month=2026-10', cookieA, application)).body.expense, '0.1')
  } finally { await newDb.$disconnect() }
  assert.equal(await ownedDigest(), before)
  await delay(11000)
  cookieA2 = sessionCookie(await post('sign-in/email', { email: emailA, password }))
})
test('recovery responses resist enumeration; links and tokens never returned to caller', async () => {
  const known = await post('request-password-reset', { email: emailA }), unknown = await post('request-password-reset', { email: `${randomUUID()}@example.test` })
  assert.equal(known.status, unknown.status); assert.deepEqual(known.body, unknown.body); assert.ok(!JSON.stringify(known.body).includes('token'))
  resetToken = await deliver(emailA, 'reset')
})
test('atomic failure after password update preserves token, hash, sessions and ledger', async () => {
  const before = await ownedDigest(), account = await db.authAccount.findFirstOrThrow({ where: { userId: userA, providerId: 'credential' } })
  const sessions = await db.authSession.count({ where: { userId: userA } })
  fault = 'after-password-update'
  assert.equal((await post('reset-password', { token: resetToken, newPassword, confirmation: newPassword })).status, 503); fault = ''
  assert.equal((await db.authAccount.findUniqueOrThrow({ where: { id: account.id } })).password, account.password)
  assert.equal(await db.authSession.count({ where: { userId: userA } }), sessions)
  assert.ok(await (await service.auth.$context).internalAdapter.findVerificationValue(`reset-password:${resetToken}`))
  assert.equal(await ownedDigest(), before)
})
test('concurrent reset consumes once, immediately rejects HTTP/new WS, revokes existing market/stocks WS and preserves data', async () => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const wsPort=(server.address() as {port:number}).port
  const market = new MarketRelay(async () => { throw new Error('fixture-no-market') }), stocks = new StockMarketRelay(null)
  const stop = attachMarketStream(server, service.auth, market, stocks, async id => (await db.authIdentity.findUnique({ where: { authUserId: id } }))?.ownerId ?? null, id => authSubjectAllowed(service.auth, db, id))
  const sockets: WebSocket[] = [], before = await ownedDigest()
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    for (const route of ['market', 'stocks']) {
      const socket = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/${route}`, { origin, headers: { Cookie: cookieA } }); await once(socket, 'open'); sockets.push(socket)
    }
    const start = performance.now(), closed = sockets.map(socket => once(socket, 'close').then(() => Math.round(performance.now() - start)))
    const responses = await Promise.all([post('reset-password', { token: resetToken, newPassword, confirmation: newPassword }), post('reset-password', { token: resetToken, newPassword, confirmation: newPassword })])
    assert.equal(responses.filter(row => row.status === 200).length, 1)
    assert.equal((await get('me', cookieA)).status, 401); assert.equal((await get('me', cookieA2)).status, 401)
    assert.equal(await db.authSession.count({ where: { userId: userA } }), 0)
    const rejected = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/market`, { origin, headers: { Cookie: cookieA } })
    rejected.on('error', () => {})
    const [, response] = await once(rejected, 'unexpected-response'); assert.equal(response.statusCode, 401); rejected.terminate()
    const latency = await Promise.race([Promise.all(closed), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('WS deadline exceeded')), 12000) })])
    evidence.websocketRevocationMs = { market: latency[0], stocks: latency[1] }
    assert.equal((await post('reset-password', { token: resetToken, newPassword: password, confirmation: password })).status, 400)
    assert.equal(await ownedDigest(), before)
    assert.equal((await post('sign-in/email', { email: emailA, password })).status, 401)
    cookieA = sessionCookie(await post('sign-in/email', { email: emailA, password: newPassword }))
    assert.equal((await get('me', cookieA)).body.ownerId, ownerA)
  } finally { clearTimeout(deadline); sockets.forEach(socket => socket.terminate()); stop(); stocks.stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('expiration rejects sessions without deleting personal records', async () => {
  const before = await ownedDigest()
  await db.authSession.updateMany({ where: { userId: userA }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await get('me', cookieA)).status, 401); assert.equal(await ownedDigest(), before)
})
test('provider failure/restart retry retains original encrypted envelope/id and first attempt; does not extend challenge life', async () => {
  await deliver(emailA, 'reset') // drain the reset notice first
  await post('request-password-reset', { email: emailB })
  const job = await db.authDeliveryJob.findFirstOrThrow({ where: { user: { email: emailB }, kind: 'reset', status: 'PENDING' } })
  assert.equal(await drainRealDelivery(db, { deliver: async () => { throw new Error('synthetic provider down') } }, config.real!), 'RETRY')
  const failed = await db.authDeliveryJob.findUniqueOrThrow({ where: { id: job.id } }); assert.ok(failed.firstAttemptAt); assert.equal(failed.envelope, job.envelope); assert.equal(failed.expiresAt.getTime(), job.expiresAt.getTime())
  const restartedDb = createTrackerDatabase(config.databaseUrl)
  try { assert.equal(await drainRealDelivery(restartedDb, sink, config.real!, new Date(failed.nextAt.getTime() + 1)), 'SENT') } finally { await restartedDb.$disconnect() }
  assert.ok(calls.includes(job.id)); assert.equal((await db.authDeliveryJob.findUniqueOrThrow({ where: { id: job.id } })).envelope, '')
})
test('late/lost provider responses cannot trigger duplicate send beyond provider deduplication lifetime', async () => {
  await post('request-password-reset', { email: emailB })
  const job = await db.authDeliveryJob.findFirstOrThrow({ where: { user: { email: emailB }, kind: 'reset', status: 'PENDING' } })
  const now = new Date(); await db.authDeliveryJob.update({ where: { id: job.id }, data: { firstAttemptAt: new Date(now.getTime() - 840001), attempts: 1 } })
  let sends = 0
  assert.equal(await drainRealDelivery(db, { deliver: async () => { sends++ } }, config.real!, now), 'FAILED')
  assert.equal(sends, 0); assert.equal((await db.authDeliveryJob.findUniqueOrThrow({ where: { id: job.id } })).envelope, '')
})
test('origin/body limits and account creation ceiling fail closed; rates persist across workers in bounded buckets', async () => {
  assert.equal((await request(app).post('/api/auth/sign-in/email').set('Origin', 'https://attacker.invalid').send({ email: emailA, password })).status, 403)
  assert.equal((await post('sign-in/email', { email: 'x'.repeat(17000), password })).status, 400)
  const cappedService = new RecoveryService(db, { ...config, real: { ...config.real!, accountLimit: baseAccounts + 2 } }), capped = createApp({ database: db, auth: cappedService.auth, recovery: cappedService })
  assert.equal((await post('sign-up/email', { email: `${randomUUID()}@example.test`, password, name: 'Over limit' }, undefined, capped)).status, 403)
  assert.equal(await db.authUser.count(), baseAccounts + 2)
  const budgetKey = `fixture:${randomUUID()}`
  for (let i = 0; i < 3; i++) assert.equal(await db.$transaction(tx => consumeRealBudget(tx, budgetKey, 2, 86400)), i < 2)
  assert.ok(await db.realRuntimeCounter.count({ where: { NOT: { key: { startsWith: 'fixture:' } } } }) <= 261)
  evidence.cases = ['isolated boundary', 'verified empty accounts', 'scanner/expiry/replay', 'Decimal ownership/retry', 'JSON restore', 'logout/restart persistence', 'enumeration', 'rollback', 'HTTP/WS revocation', 'session expiry', 'durable provider retry', 'lost-response deduplication', 'bounded limits']
})

test('storage pause preserves existing receipt reconciliation, rejects new writes, and changes no financial rows', async () => {
  await delay(11000)
  const login = await post('sign-in/email', { email: emailA, password: newPassword }); assert.equal(login.status, 200)
  cookieA = sessionCookie(login)
  const receipt = await db.idempotencyKey.findFirstOrThrow({ where: { ownerId: ownerA, endpoint: 'finance.categories.create' } })
  const category = await db.financeCategory.findUniqueOrThrow({ where: { id: categoryA } }), before = await ownedDigest()
  const quotaService = new RecoveryService(db, { ...config, real: { ...config.real!, databaseLimitBytes: 1 } })
  const quotaApp = createApp({ database: db, auth: quotaService.auth, recovery: quotaService })
  try {
    assert.equal((await get('ready', undefined, quotaApp)).status, 503)
    const repeat = await mutation('finance/categories', { name: category.name, type: 'expense' }, cookieA, receipt.key)
    assert.equal(repeat.status, 200); assert.equal(repeat.body.id, categoryA)
    assert.equal((await mutation('finance/categories', { name: 'New entry during quota pause', type: 'expense' }, cookieA)).status, 503)
    assert.equal(await ownedDigest(), before)
  } finally { registerRealDatabase(db, config.real!) }
})

if(process.env.TRACKER_REAL_REHEARSAL_ID==='finish-20261008') {
  test('private staging enrollment blocks nonmembers and removes HTTP/recovery access without touching their data',async()=>{
    const stageConfig={...config,real:{...config.real!,registrationsOpen:false,stagingEmails:new Set([emailA])}}
    const stagedService=new RecoveryService(db,stageConfig),staged=createApp({database:db,auth:stagedService.auth,recovery:stagedService})
    try{
      const before=await ownedDigest()
      assert.equal((await post('sign-up/email',{email:`${randomUUID()}@example.test`,name:'Synthetic real-use rehearsal',password},undefined,staged)).status,403)
      assert.equal((await get('me',cookieB,staged)).status,403)
      assert.equal((await post('sign-in/email',{email:emailB,password},undefined,staged)).status,403)
      const jobs=await db.authDeliveryJob.count({where:{user:{email:emailB}}})
      await post('request-password-reset',{email:emailB},undefined,staged)
      assert.equal(await db.authDeliveryJob.count({where:{user:{email:emailB}}}),jobs)
      const health=(await get('health',undefined,staged)).body
      assert.equal(health.real.registrationsOpen,false);assert.equal(health.real.stagingEnrollment,true)
      assert.ok(!JSON.stringify(health).includes(emailA));assert.equal(await ownedDigest(),before)
    }finally{registerRealDatabase(db,config.real!)}
  })
  test('owner deletion reauth/consent, scoped purge, rollback and restored-old-backup suppression preserve other owners',async()=>{
    const {provisionPrivacyRole}=await import('../../../scripts/real-privacy-provision.mjs')
    const {snapshotAndRestore,syntheticProvisionRestoreRole}=await import('../../../scripts/finish-real-test-harness.mjs')
    const {publishAndPurge,replayOffDeviceDeletions,sealRegistry}=await import('../../../scripts/real-privacy-core.mjs')
    const sha256=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
    const role='finish_privacy',operatorPassword=process.env.FINISH_PRIVACY_PASSWORD!
    if(!await db.privacyOperator.findUnique({where:{roleName:role}}))await provisionPrivacyRole(db,role,operatorPassword)
    const operatorUrl=new URL(config.databaseUrl);operatorUrl.username=role;operatorUrl.password=operatorPassword
    const operator=createTrackerDatabase(operatorUrl.href);let target:ReturnType<typeof createTrackerDatabase>|undefined
    const initialCases=await db.accountDeletionCase.count()
    let restoreOperator:ReturnType<typeof createTrackerDatabase>|undefined
    const foreignDigest=async(client=db)=>createHash('sha256').update(JSON.stringify(await Promise.all([
      client.financeTransaction.findMany({where:{ownerId:ownerB},orderBy:{id:'asc'}}),client.cryptoTrade.findMany({where:{ownerId:ownerB},orderBy:{id:'asc'}}),client.auditEvent.findMany({where:{ownerId:ownerB},orderBy:{id:'asc'}}),client.idempotencyKey.findMany({where:{ownerId:ownerB},orderBy:{id:'asc'}})
    ]))).digest('hex')
    const beforeForeign=await foreignDigest()
    const deletion=(body:object,cookie=cookieA)=>request(app).post('/api/account/deletion/request').set('Origin',origin).set('Cookie',cookie).send(body)
    const requestKey=randomUUID(),body={password:newPassword,consent:'DELETE_MY_ACCOUNT',requestKey}
    const wsServer=app.listen(0,'127.0.0.1');await once(wsServer,'listening')
    const market=new MarketRelay(async()=>{throw Error('fixture market offline')}),stocks=new StockMarketRelay(null)
    const stopStreams=attachMarketStream(wsServer,service.auth,market,stocks,async id=>(await db.authIdentity.findUnique({where:{authUserId:id}}))?.ownerId??null,id=>authSubjectAllowed(service.auth,db,id))
    const socket=new WebSocket(`ws://127.0.0.1:${(wsServer.address() as {port:number}).port}/ws/market`,{origin,headers:{Cookie:cookieA}})
    await once(socket,'open');const socketClosed=once(socket,'close')
    let wsDeadline:ReturnType<typeof setTimeout>|undefined
    try{
      assert.equal((await deletion({...body,ownerId:ownerB})).status,400)
      assert.equal((await deletion({...body,password:'incorrect-password'})).status,401)
      assert.equal((await deletion({...body,consent:'no'})).status,400)
      assert.equal(await db.accountDeletionCase.count(),initialCases)
      const restored=await snapshotAndRestore();assert.equal(restored.status,'PASS');evidence.fullRestore=restored;target=createTrackerDatabase(process.env.FINISH_RESTORE_DATABASE_URL!)
      // A pending shared dataset lock must finish before consent can block and revoke the account.
      let release!:()=>void,acquired!:()=>void
      const locked=new Promise<void>(resolve=>{acquired=resolve}),held=new Promise<void>(resolve=>{release=resolve})
      const writer=db.$transaction(async tx=>{const lock=`tracker-dataset:${ownerA}`;await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lock},0))::text`;acquired();await held},{timeout:10000})
      await locked
      let settled=false
      const sending=deletion(body).then(result=>{settled=true;return result})
      await delay(150);assert.equal(settled,false);release();await writer
      const accepted=await sending;assert.equal(accepted.status,200);assert.equal(accepted.body.status,'REQUESTED')
      const caseId=accepted.body.caseId
      assert.equal((await get('me',cookieA)).status,401)
      assert.equal(await db.authSession.count({where:{userId:userA}}),0)
      await Promise.race([socketClosed,new Promise<never>((_,reject)=>{wsDeadline=setTimeout(()=>reject(Error('deletion WS revocation timeout')),12000)})]);clearTimeout(wsDeadline)
      assert.equal(await db.authVerification.count({where:{value:userA}}),0)
      assert.equal(await db.authDeliveryJob.count({where:{userId:userA,envelope:{not:''}}}),0)
      assert.equal((await deletion(body)).status,401)
      const receipt=await request(app).post('/api/account/deletion/status').set('Origin',origin).send({requestKey})
      assert.equal(receipt.body.caseId,caseId);assert.equal(await db.accountDeletionCase.count(),initialCases+1)
      await assert.rejects(db.$queryRaw`SELECT tracker_purge_owner_case(${caseId}::uuid)`)
      await assert.rejects(operator.$executeRaw`DELETE FROM audit_events WHERE owner_id=${ownerB}::uuid`)
      await assert.rejects(db.$executeRaw`DELETE FROM audit_events WHERE owner_id=${ownerB}::uuid`)
      await assert.rejects(operator.$queryRaw`SELECT tracker_purge_owner_case(${caseId}::uuid)`)
      const marker=await db.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}}),key=randomBytes(32),folder='synthetic_private_folder',anchor='synthetic_registry_1'
      const artifacts=new Map<string,{metadata:any;bytes:Buffer}>()
      const anchorBytes=sealRegistry({datasetId:marker.datasetId,entries:[]},key)
      const meta=(id:string,name:string,format:string,bytes:Buffer)=>({id,name,mimeType:'application/octet-stream',parents:[folder],ownedByMe:true,shared:false,trashed:false,appProperties:{datasetId:marker.datasetId,finntechFormat:format,encryptedSha256:sha256(bytes)}})
      artifacts.set(anchor,{metadata:meta(anchor,`${marker.datasetId}.fnr`,'FINNTECH-REGISTRY-1',anchorBytes),bytes:anchorBytes})
      const drive={reserveId:async()=>`synthetic_case_${randomUUID().replaceAll('-','')}`,artifactMetadata:async(id:string)=>({...artifacts.get(id),etag:'fixture-etag'}),replaceRegistry:async(id:string,_etag:string,bytes:Buffer)=>{const current=artifacts.get(id)!;artifacts.set(id,{...current,bytes})},download:async(id:string)=>{const item=artifacts.get(id);if(!item)throw Error('missing');return item.bytes},listPrivateArtifacts:async()=>[...artifacts.values()].map(row=>row.metadata).filter(row=>row.appProperties.finntechFormat==='FINNTECH-DELETION-1'),uploadPrivateArtifact:async(_folder:string,id:string,name:string,bytes:Buffer,format:string)=>{artifacts.set(id,{metadata:meta(id,name,format,bytes),bytes});return {id,encryptedSha256:sha256(bytes)}}}
      // Upload failure cannot purge or invent a replacement envelope/ID.
      await assert.rejects(publishAndPurge(operator,{...drive,uploadPrivateArtifact:async()=>{throw Error('synthetic offline')}},folder,key,caseId,anchor))
      const reserved=await db.accountDeletionCase.findUniqueOrThrow({where:{id:caseId}})
      assert.equal(reserved.status,'REQUESTED');assert.ok(await db.authUser.findUnique({where:{id:userA}}))
      // Execute full purge inside a deliberately rolled-back transaction before the final run.
      const archived=Buffer.from(reserved.archiveEnvelope!,'base64')
      await operator.$executeRaw`SELECT tracker_case_archive(${caseId}::uuid,${reserved.archiveId}::text,${sha256(archived)}::text,NULL::text)`
      await assert.rejects(operator.$transaction(async tx=>{await tx.$queryRaw`SELECT tracker_purge_owner_case(${caseId}::uuid)`;throw Error('rollback fixture')}),/rollback fixture/)
      assert.ok(await db.authUser.findUnique({where:{id:userA}}));assert.equal(await foreignDigest(),beforeForeign)
      assert.equal((await publishAndPurge(operator,drive,folder,key,caseId,anchor)).status,'PURGED')
      assert.equal((await publishAndPurge(operator,drive,folder,key,caseId,anchor)).status,'PURGED')
      assert.equal(await db.authUser.findUnique({where:{id:userA}}),null)
      assert.equal(await db.trackerUser.findUnique({where:{id:ownerA}}),null)
      assert.equal(await foreignDigest(),beforeForeign)
      await syntheticProvisionRestoreRole(role,operatorPassword)
      const restoredUrl=new URL(process.env.FINISH_RESTORE_DATABASE_URL!);restoredUrl.username=role;restoredUrl.password=operatorPassword
      restoreOperator=createTrackerDatabase(restoredUrl.href)
      assert.ok(await target.authUser.findUnique({where:{id:userA}}))
      await assert.rejects(replayOffDeviceDeletions(restoreOperator,{...drive,listPrivateArtifacts:async()=>[]},folder,key,anchor),/INCOMPLETE_DELETION_INVENTORY/)
      assert.ok(await target.authUser.findUnique({where:{id:userA}}))
      assert.equal((await replayOffDeviceDeletions(restoreOperator,drive,folder,key,anchor)).cases,1)
      assert.equal(await target.authUser.findUnique({where:{id:userA}}),null)
      assert.equal(await foreignDigest(target),beforeForeign)
      assert.equal((await replayOffDeviceDeletions(restoreOperator,drive,folder,key,anchor)).cases,1)
      await assert.rejects(assertRealBoundary(target,config.real!,origin))
      const {rebindRestoredDatabase}=await import('../../../scripts/real-restore-core.mjs')
      const replay=await replayOffDeviceDeletions(restoreOperator,drive,folder,key,anchor)
      const restoredConfig={...config,real:{...config.real!,databaseName:new URL(process.env.FINISH_RESTORE_DATABASE_URL!).pathname.slice(1),registrationsOpen:false,stagingEmails:new Set([emailB])}}
      await assert.rejects(rebindRestoredDatabase(target,restoredConfig,marker.datasetId,'0'.repeat(64)))
      await rebindRestoredDatabase(target,restoredConfig,marker.datasetId,replay.ledgerSha256)
      assert.equal(await target.authSession.count(),0);assert.equal(await target.authVerification.count(),0)
      assert.equal(await target.authDeliveryJob.count({where:{envelope:{not:''}}}),0)
      assert.equal(await foreignDigest(target),beforeForeign)
      await assertRealBoundary(target,restoredConfig.real,origin)
      await assert.rejects(rebindRestoredDatabase(target,restoredConfig,marker.datasetId,replay.ledgerSha256))
      evidence.deletion={status:'PASS',ownerReauth:true,pendingWriteLock:true,scopeRollback:true,otherOwnerUnchanged:true,oldBackupReplay:true,actualDrive:'NOT_TESTED'}
    }finally{clearTimeout(wsDeadline);socket.terminate();stopStreams();stocks.stop();await new Promise<void>(resolve=>wsServer.close(()=>resolve()));await operator.$disconnect();await restoreOperator?.$disconnect();await target?.$disconnect()}
  })
}
