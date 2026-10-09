import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import request from 'supertest'
import { readAuthConfiguration } from '../src/auth/config.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { authSubjectAllowed } from '../src/auth/authorization.js'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createApp } from '../src/app.js'
import { assertRealBoundary } from '../src/auth/real.js'

const config = readAuthConfiguration({ ...process.env, TRACKER_REAL_AUTH_MODE: 'email-password', TRACKER_RECOVERY_MODE: 'off' })!
assert.equal(config.real?.boundary, 'real-rehearsal', 'only attested synthetic PostgreSQL')
const db = createTrackerDatabase(config.databaseUrl), auth = createAuthRuntime(db, config), app = createApp({ database: db, auth })
const password = randomBytes(24).toString('hex'), emailA = `${randomUUID()}@example.test`, emailB = `${randomUUID()}@example.test`
let cookieA = '', cookieB = '', ownerA = '', userA = '', categoryA = '', entryA = ''
const post = (route: string, body: object, cookie = '', application = app, key = randomUUID()) => request(application).post(`/api/${route}`).set('Origin', config.origin).set('Cookie', cookie).set('Idempotency-Key', key).send(body)
const get = (route: string, cookie = '', application = app) => request(application).get(`/api/${route}`).set('Cookie', cookie)
function cookie(response: request.Response) {
  const cookies = response.headers['set-cookie'] as unknown as string[]
  assert.ok(cookies?.some(x => /HttpOnly/i.test(x) && /SameSite=Lax/i.test(x)))
  const row = cookies.find(x => x.startsWith('finntech.session_token=')); assert.ok(row); return row.split(';')[0]!
}
after(async () => { await db.$disconnect() })

test('explicit password mode supports signup without provider, retains false verification and rejects duplicate creation', async () => {
  await assertRealBoundary(db, config.real!, config.origin)
  const before = await db.authUser.count()
  assert.equal((await get('auth-capabilities')).body.recovery, false)
  for (const route of ['request-password-reset', 'confirm-email', 'reset-password']) assert.equal((await post(`auth/${route}`, {})).status, 404)
  const body = { name: 'Synthetic real-use rehearsal', email: emailA, password }
  const [a, duplicate] = await Promise.all([post('auth/sign-up/email', body), post('auth/sign-up/email', body)])
  assert.deepEqual([a.status, duplicate.status].sort(), [200, 422])
  const accepted = a.status === 200 ? a : duplicate
  cookieA = cookie(accepted); userA = accepted.body.user.id
  assert.equal(accepted.body.user.emailVerified, false)
  assert.equal(await db.authUser.count(), before + 1)
  assert.equal(await db.authRecoveryEnrollment.count({ where: { userId: userA } }), 1)
  assert.equal(await db.authDeliveryJob.count({ where: { userId: userA } }), 0)
  assert.equal((await post('auth/sign-up/email', { ...body, email: `${randomUUID()}@example.test`, emailVerified: true })).status, 400)
  assert.equal((await request(app).post('/api/auth/sign-up/email').set('Origin', 'https://attacker.invalid').send(body)).status, 403)
  ownerA = (await get('me', cookieA)).body.ownerId; assert.ok(ownerA)
  const b = await post('auth/sign-up/email', { ...body, email: emailB }); assert.equal(b.status, 200); cookieB = cookie(b)
  assert.notEqual((await get('me', cookieB)).body.ownerId, ownerA)
})
test('anonymous and cross-owner APIs cannot read or modify finance; retry preserves Decimal receipt', async () => {
  assert.equal((await get('finance?month=2026-10')).status, 401)
  const category = await post('finance/categories', { name: 'Student synthetic expense', type: 'expense' }, cookieA); assert.equal(category.status, 200); categoryA = category.body.id
  const payload = { type: 'expense', categoryId: categoryA, amount: '0.10', currency: 'THB', date: '2026-10-08', note: 'student-mode-synthetic' }, key = randomUUID()
  const [first, retry] = await Promise.all([post('finance/transactions', payload, cookieA, app, key), post('finance/transactions', payload, cookieA, app, key)])
  assert.equal(first.status, 200); assert.equal(retry.status, 200); assert.equal(first.body.id, retry.body.id); entryA = first.body.id
  assert.equal((await get('finance?month=2026-10', cookieA)).body.expense, '0.1')
  assert.deepEqual((await get('finance?month=2026-10', cookieB)).body.transactions, [])
  assert.equal((await post('finance/transactions', payload, cookieB)).status, 404)
  assert.equal((await post(`finance/transactions/${entryA}/corrections`, { action: 'void', reason: 'cross-owner' }, cookieB)).status, 404)
  assert.equal((await post('finance/transactions', { ...payload, amount: '0.20' }, cookieA, app, key)).status, 409)
})
test('THB/USDT and export/restore retain exact decimals without credentials', async () => {
  const p = await post('crypto/portfolios', { name: 'Student synthetic', quoteCurrency: 'USDT' }, cookieA); assert.equal(p.status, 200)
  const trade = { portfolioId: p.body.id, side: 'buy', asset: 'BTC', quantity: '0.00000001', price: '999999.123456789012345678', fee: '0.000000000000000001', quoteCurrency: 'USDT', date: '2026-10-08' }
  assert.equal((await post('crypto/trades', trade, cookieA)).status, 200)
  assert.equal((await post('crypto/trades', { ...trade, quoteCurrency: 'THB' }, cookieA)).status, 422)
  const exported = await get('backup', cookieA); assert.equal(exported.status, 200); assert.match(exported.headers['content-disposition']!, /attachment/)
  const file = JSON.parse(JSON.stringify(exported.body)); assert.equal(file.trades[0].price, trade.price)
  assert.ok(!/password|session_token|auth_users|api.key/i.test(JSON.stringify(file)))
  const preview = await post('backup/preview', file, cookieB); assert.equal(preview.status, 200); assert.equal(preview.body.canRestore, true)
  assert.equal((await post('backup/restore', { backup: file, previewDigest: preview.body.digest, consent: true }, cookieB)).status, 200)
  assert.ok(!(await get('backup', cookieB)).body.transactions.some((row: { id: string }) => row.id === entryA))
})
test('restart preserves owner mapping and records, logout revokes, unverified and blocked are distinct', async () => {
  const newDb = createTrackerDatabase(config.databaseUrl)
  try {
    const restartedAuth = createAuthRuntime(newDb, config), restarted = createApp({ database: newDb, auth: restartedAuth })
    assert.equal((await get('me', cookieA, restarted)).body.ownerId, ownerA)
    assert.equal((await get('finance?month=2026-10', cookieA, restarted)).body.expense, '0.1')
    assert.equal(await authSubjectAllowed(restartedAuth, newDb, userA), true)
    await newDb.authRecoveryEnrollment.update({ where: { userId: userA }, data: { blocked: true } })
    assert.equal(await authSubjectAllowed(restartedAuth, newDb, userA), false)
    assert.equal((await get('me', cookieA, restarted)).status, 403)
    await newDb.authRecoveryEnrollment.update({ where: { userId: userA }, data: { blocked: false } })
    assert.equal((await post('auth/sign-out', {}, cookieA, restarted)).status, 200)
    assert.equal((await get('me', cookieA, restarted)).status, 401)
    const login = await post('auth/sign-in/email', { email: emailA, password }, '', restarted); assert.equal(login.status, 200)
    assert.equal((await get('me', cookie(login), restarted)).body.ownerId, ownerA)
  } finally { await newDb.$disconnect() }
})
test('concurrent new registrations obey account cap without partial user/account/session rows', async () => {
  await delay(11000) // Honour Better Auth signup limits; never disable them for the test.
  const count = await db.authUser.count()
  const limitedAuth = createAuthRuntime(db, { ...config, real: { ...config.real!, accountLimit: count + 1 } })
  const limited = createApp({ database: db, auth: limitedAuth })
  const results = await Promise.all([1, 2].map(() => post('auth/sign-up/email', { name: 'Synthetic real-use rehearsal', email: `${randomUUID()}@example.test`, password }, '', limited)))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 403]); assert.equal(await db.authUser.count(), count + 1)
  await assertRealBoundary(db, config.real!, config.origin)
})
