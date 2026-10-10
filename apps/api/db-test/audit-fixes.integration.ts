// Regressions for audit findings F1, F2, F3 (starter), F4, F5, F6 and F10 on an attested synthetic
// real-rehearsal PostgreSQL in email-password mode (the production authentication mode).
import assert from 'node:assert/strict'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import request from 'supertest'
import sharp from 'sharp'
import { BACKUP_MAX_ROWS, STARTER_CATEGORIES } from '@finntech/contracts'
import { replayCryptoTrades } from '@finntech/finance'
import { readAuthConfiguration } from '../src/auth/config.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { AUTH_BUDGET } from '../src/auth/real.js'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { cryptoForApi } from '../src/persistence/decimal.js'
import { createApp } from '../src/app.js'
import { createPortfolio, createTrade, correctTrade, WRITE_BUDGET } from '../src/tracker/service.js'
import { stageImage } from '../src/media/store.js'

const config = readAuthConfiguration({ ...process.env, TRACKER_REAL_AUTH_MODE: 'email-password', TRACKER_RECOVERY_MODE: 'off' })!
assert.equal(config.real?.boundary, 'real-rehearsal', 'only attested synthetic PostgreSQL')
const db = createTrackerDatabase(config.databaseUrl), blocker = createTrackerDatabase(config.databaseUrl)
const app = createApp({ database: db, auth: createAuthRuntime(db, config) })
const evidence: Record<string, unknown> = {}
after(async () => {
  if (process.env.FINNTECH_FIX_EVIDENCE_FILE) await writeFile(process.env.FINNTECH_FIX_EVIDENCE_FILE, JSON.stringify(evidence, null, 2))
  await db.$disconnect(); await blocker.$disconnect()
})
const password = randomBytes(24).toString('hex')
const post = (route: string, body: object, cookie = '', key = randomUUID()) => request(app).post(`/api/${route}`).set('Origin', config.origin).set('Cookie', cookie).set('Idempotency-Key', key).send(body)
const get = (route: string, cookie = '') => request(app).get(`/api/${route}`).set('Cookie', cookie)
const sessionCookie = (response: request.Response) => (response.headers['set-cookie'] as unknown as string[] | undefined)?.find(x => x.startsWith('finntech.session_token='))?.split(';')[0] ?? ''
const bucketOf = (email: string) => Number.parseInt(createHmac('sha256', config.secret).update(email).digest('hex').slice(0, 4), 16) % 256
async function account(prefix: string) {
  const email = `${prefix}-${randomUUID()}@example.test`
  const created = await post('auth/sign-up/email', { name: `Synthetic ${prefix}`, email, password })
  assert.equal(created.status, 200, `sign-up ${prefix}`)
  const cookie = sessionCookie(created)
  const me = await get('me', cookie)
  return { email, cookie, ownerId: me.body.ownerId as string, userId: created.body.user.id as string }
}

test('F1 distinct people can sign in together; repeated failures are limited per email, not site-wide', async () => {
  const people = await Promise.all([0, 1, 2, 3, 4].map(i => account(`f1-${i}`)))
  const started = Date.now()
  const statuses = await Promise.all(people.map(p => post('auth/sign-in/email', { email: p.email, password }).then(r => r.status)))
  assert.ok(Date.now() - started < 10000)
  assert.deepEqual(statuses, [200, 200, 200, 200, 200])
  const target = `f1-target-${randomUUID()}@example.test`
  const failures: number[] = []
  for (let i = 0; i <= AUTH_BUDGET.perEmailBucket; i++) failures.push((await post('auth/sign-in/email', { email: target, password: 'wrong-password-123' })).status)
  assert.equal(failures.at(-1), 429, 'one email is throttled after its budget')
  const other = people.find(p => bucketOf(p.email) !== bucketOf(target))!
  assert.equal((await post('auth/sign-in/email', { email: other.email, password })).status, 200, 'other people are unaffected')
  const out = await post('auth/sign-out', {}, other.cookie)
  assert.equal(out.status, 200, 'sign-out is never budgeted')
  evidence.F1 = { simultaneousSignIns: statuses, failuresForOneEmail: failures }
})

test('F2 write budget is per owner; one busy owner does not block another', async () => {
  const [a, b] = [await account('f2-a'), await account('f2-b')]
  const statuses: Record<number, number> = {}
  for (let i = 0; i <= WRITE_BUDGET.owner; i++) {
    const r = await post('finance/categories', { name: `A ${i}`, type: 'expense' }, a.cookie)
    statuses[r.status] = (statuses[r.status] ?? 0) + 1
    if (r.status === 429) assert.equal(r.body.error.code, 'WRITE_RATE_LIMITED')
  }
  assert.deepEqual(statuses, { 200: WRITE_BUDGET.owner, 429: 1 })
  const other = await post('finance/categories', { name: 'B first', type: 'income' }, b.cookie)
  assert.equal(other.status, 200)
  evidence.F2 = { ownerA: statuses, ownerBFirstWrite: other.status }
})

test('F3 starter categories add only missing labels, idempotently and without records', async () => {
  const user = await account('f3')
  assert.equal((await post('finance/categories', { name: 'อื่น ๆ', type: 'expense' }, user.cookie)).status, 200)
  const key = randomUUID()
  const [first, concurrent] = await Promise.all([post('finance/categories/starter', {}, user.cookie, key), post('finance/categories/starter', {}, user.cookie)])
  assert.equal(first.status, 200); assert.equal(concurrent.status, 200)
  const retry = await post('finance/categories/starter', {}, user.cookie, key)
  assert.deepEqual(retry.body, first.body)
  const overview = await get('finance?month=2026-10', user.cookie)
  const names = (type: string) => overview.body.categories.filter((c: { type: string }) => c.type === type).map((c: { name: string }) => c.name).sort()
  assert.deepEqual(names('expense'), [...STARTER_CATEGORIES.expense].sort())
  assert.deepEqual(names('income'), [...STARTER_CATEGORIES.income].sort())
  assert.equal(await db.financeTransaction.count({ where: { ownerId: user.ownerId } }), 0)
  assert.equal(await db.budget.count({ where: { ownerId: user.ownerId } }), 0)
  assert.equal((await post('finance/categories/starter', { amount: '1' }, user.cookie)).status, 422)
  evidence.F3 = { created: [first.body.created, concurrent.body.created], categories: overview.body.categories.length }
})

test('F10 deletion state is revealed only after a correct password, and no session survives', async () => {
  const user = await account('f10')
  const requested = await request(app).post('/api/account/deletion/request').set('Origin', config.origin).set('Cookie', user.cookie)
    .send({ consent: 'DELETE_MY_ACCOUNT', password, requestKey: randomUUID() })
  assert.equal(requested.status, 200)
  const wrong = await post('auth/sign-in/email', { email: user.email, password: 'wrong-password-123' })
  assert.equal(wrong.status, 401)
  assert.ok(!JSON.stringify(wrong.body).includes('DELETION'), 'wrong password does not disclose deletion state')
  const right = await post('auth/sign-in/email', { email: user.email, password })
  assert.equal(right.status, 403); assert.equal(right.body.error.code, 'ACCOUNT_DELETION_PENDING')
  assert.equal(right.headers['set-cookie'], undefined, 'no session cookie is issued')
  assert.equal(await db.authSession.count({ where: { userId: user.userId } }), 0)
  evidence.F10 = { wrongPassword: wrong.status, correctPassword: [right.status, right.body.error.code] }
})

test('F6 correction with a new receipt and a concurrent trade in the same portfolio no longer deadlock', async () => {
  const user = await account('f6')
  const portfolio = (await createPortfolio(db, user.ownerId, randomUUID(), { name: 'Lock order', quoteCurrency: 'USDT' })).id as string
  const trade = (quantity: string, extra: object = {}) => ({ portfolioId: portfolio, asset: 'BTC', side: 'buy', quantity, price: '100', fee: '0', quoteCurrency: 'USDT', date: '2026-10-01', ...extra })
  const original = (await createTrade(db, user.ownerId, randomUUID(), trade('1'))).id as string
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#abcdef' } }).png().toBuffer()
  const media = (await stageImage(db, user.ownerId, randomUUID(), png, 'image/png', 'RECEIPT')).id as string
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const holder = blocker.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM crypto_trades WHERE id = ${original}::uuid FOR UPDATE`; await held }, { timeout: 20000 })
  await delay(300)
  const t1 = correctTrade(db, user.ownerId, original, randomUUID(), { action: 'replace', reason: 'fix price', entry: { side: 'buy', quantity: '1', price: '101', fee: '0', quoteCurrency: 'USDT', date: '2026-10-01', attachmentId: media } })
  await delay(500)
  const t2 = createTrade(db, user.ownerId, randomUUID(), trade('0.1'))
  await delay(500)
  release(); await holder
  const results = await Promise.allSettled([t1, t2])
  evidence.F6 = results.map(r => r.status)
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'fulfilled'])
})

test('F5 appending a trade rewrites one row; a mid-history insert keeps every stored accounting value exact', async () => {
  const user = await account('f5')
  const portfolio = (await createPortfolio(db, user.ownerId, randomUUID(), { name: 'DCA', quoteCurrency: 'USDT' })).id as string
  const asset = await db.cryptoAsset.upsert({ where: { symbol: 'ETH' }, create: { symbol: 'ETH' }, update: {} })
  const base = Date.UTC(2023, 0, 1)
  await db.cryptoTrade.createMany({ data: Array.from({ length: 1990 }, (_, i) => ({ ownerId: user.ownerId, portfolioId: portfolio, assetId: asset.id, quoteCurrency: 'USDT',
    side: (i % 10 === 9 ? 'SELL' : 'BUY') as 'BUY' | 'SELL', quantity: '0.001', price: String(100 + (i % 7)), fee: '0.01', occurredAt: new Date(base + i * 12 * 3600000), createdAt: new Date(base + i * 12 * 3600000) })) })
  const entry = (date: string, side = 'buy') => ({ portfolioId: portfolio, asset: 'ETH', side, quantity: '0.001', price: '150', fee: '0', quoteCurrency: 'USDT', date })
  await createTrade(db, user.ownerId, randomUUID(), entry('2026-10-01')) // settles the seeded scope
  const started = performance.now()
  const appended = (await createTrade(db, user.ownerId, randomUUID(), entry('2026-10-02'))).id as string
  const appendMs = Math.round(performance.now() - started)
  const { xmin } = (await db.$queryRaw<{ xmin: string }[]>`SELECT xmin::text AS xmin FROM crypto_trades WHERE id = ${appended}::uuid`)[0]!
  const { count } = (await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM crypto_trades WHERE portfolio_id = ${portfolio}::uuid AND xmin::text = ${xmin}`)[0]!
  assert.equal(Number(count), 1, 'only the appended row was written')
  const midStarted = performance.now()
  await createTrade(db, user.ownerId, randomUUID(), entry('2023-06-01', 'sell'))
  const midMs = Math.round(performance.now() - midStarted)
  const rows = await db.cryptoTrade.findMany({ where: { ownerId: user.ownerId, portfolioId: portfolio, voidedAt: null }, orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] })
  const replay = replayCryptoTrades(rows.map(t => ({ id: t.id, side: t.side === 'BUY' ? 'buy' : 'sell', quantity: cryptoForApi(t.quantity), price: cryptoForApi(t.price), fee: cryptoForApi(t.fee) })))
  const byId = new Map(rows.map(r => [r.id, r]))
  for (const t of replay.trades) {
    const stored = byId.get(t.id)!
    assert.deepEqual([cryptoForApi(stored.gross!), cryptoForApi(stored.costRemoved!), cryptoForApi(stored.realizedPnl!)], [t.gross, t.costRemoved, t.realizedPnl])
  }
  const holding = await db.portfolioHolding.findFirstOrThrow({ where: { ownerId: user.ownerId, portfolioId: portfolio, assetId: asset.id } })
  assert.deepEqual([cryptoForApi(holding.quantity), cryptoForApi(holding.totalCost!), cryptoForApi(holding.realizedPnl!)], [replay.quantity, replay.totalCost, replay.realizedPnl])
  evidence.F5 = { tradesInScope: rows.length, appendMs, midHistoryInsertMs: midMs }
})

test('F4 a multi-year backup round-trips exactly; above the documented limit it is refused before loading', async () => {
  const [source, target] = [await account('f4-src'), await account('f4-dst')]
  const category = await post('finance/categories', { name: 'Daily', type: 'expense' }, source.cookie)
  await db.financeTransaction.createMany({ data: Array.from({ length: 2500 }, (_, i) => ({ ownerId: source.ownerId, categoryId: category.body.id, type: 'EXPENSE' as const,
    amount: `${(i % 500) + 1}.25`, currency: 'THB', occurredAt: new Date(Date.UTC(2024, 0, 1) + i * 8 * 3600000), note: i % 3 ? '' : 'synthetic note' })) })
  const exported = await get('backup', source.cookie)
  assert.equal(exported.status, 200)
  const preview = await post('backup/preview', exported.body, target.cookie)
  assert.equal(preview.status, 200); assert.equal(preview.body.canRestore, true)
  const restored = await post('backup/restore', { backup: exported.body, previewDigest: preview.body.digest, consent: true }, target.cookie)
  assert.equal(restored.status, 200)
  assert.deepEqual(restored.body.summary, preview.body.summary)
  const [a, b] = [await get('finance?month=2025-03', source.cookie), await get('finance?month=2025-03', target.cookie)]
  assert.equal(a.body.expense, b.body.expense); assert.equal(a.body.transactions.length, b.body.transactions.length)
  const huge = await account('f4-huge')
  const hugeCategory = await post('finance/categories', { name: 'Huge', type: 'expense' }, huge.cookie)
  await db.financeTransaction.createMany({ data: Array.from({ length: BACKUP_MAX_ROWS }, (_, i) => ({ ownerId: huge.ownerId, categoryId: hugeCategory.body.id, type: 'EXPENSE' as const,
    amount: '1.00', currency: 'THB', occurredAt: new Date(Date.UTC(2020, 0, 1) + i * 3600000), note: '' })) })
  const refused = await get('backup', huge.cookie)
  assert.equal(refused.status, 413); assert.equal(refused.body.error.code, 'BACKUP_TOO_LARGE')
  evidence.F4 = { rows: 2501, bytes: Buffer.byteLength(JSON.stringify(exported.body)), refusedAbove: refused.status }
})
