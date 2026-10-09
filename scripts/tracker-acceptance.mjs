import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
import { createAuthRuntime } from '../apps/api/dist/auth/runtime.js'
import { createApp } from '../apps/api/dist/app.js'
import request from 'supertest'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { createTrade, correctTrade } from '../apps/api/dist/tracker/service.js'
import { MarketRelay } from '../apps/api/dist/tracker/market.js'
import { attachMarketStream } from '../apps/api/dist/tracker/stream.js'
import { Prisma } from '../apps/api/dist/generated/prisma/client.js'
import { runBackupAcceptance } from './tracker-backup-acceptance.mjs'

const target = new URL(process.env.DATABASE_URL ?? 'invalid:')
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '5437'
  || target.pathname !== '/finntech_tracker_acceptance' || target.username !== 'tracker_acceptance'
  || !target.password || target.search || process.env.TRACKER_ACCEPTANCE_CONFIRM !== 'synthetic-only') {
  throw new Error('Refused unexpected synthetic acceptance target; no changes performed')
}
const database = createTrackerDatabase(target.href)
try {
  const tables = await database.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  if (tables.length) throw new Error('Refused nonempty acceptance database; no reset/migration performed')
  const migration = await new Promise(resolve => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { windowsHide: true, stdio: 'ignore' })
    child.once('error', () => resolve(1)); child.once('exit', resolve)
  })
  assert.equal(migration, 0, 'forward migrations must succeed (driver details withheld)')
  const version = await database.$queryRaw`SELECT version() AS version`
  console.log('PostgreSQL:', version[0].version.split(' on ')[0])
  const migrations = await database.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`
  assert.equal(migrations.length, 5)
  console.log('PASS migrations:', migrations.map(m => m.migration_name).join(', '))
  const origin = 'http://127.0.0.1:4173'
  const auth = createAuthRuntime(database, { databaseUrl: target.href, secret: randomBytes(32).toString('hex'), origin, secureCookies: false })
  const app = createApp({ database, auth })
  async function account() {
    const response = await request(app).post('/api/auth/sign-up/email').set('Origin', origin).send({ name: 'Synthetic acceptance', email: `${randomUUID()}@example.invalid`, password: randomBytes(32).toString('hex') })
    assert.equal(response.status, 200, 'synthetic registration must succeed')
    const cookie = response.headers['set-cookie'].find(v => v.startsWith('finntech.session_token='))?.split(';')[0]
    assert.ok(Boolean(cookie), 'session issued; value withheld')
    return cookie
  }
  const ownerA = await account(), ownerB = await account()
  function post(path, body, cookie = ownerA, key = randomUUID()) {
    return request(app).post(`/api/${path}`).set('Origin', origin).set('Cookie', cookie).set('Idempotency-Key', key).send(body)
  }
  async function create(path, body, cookie = ownerA) {
    const response = await post(path, body, cookie)
    assert.equal(response.status, 200, `synthetic ${path} must succeed`)
    return response.body.id
  }
  const income = await create('finance/categories', { name: 'Income', type: 'income' })
  const expense = await create('finance/categories', { name: 'Expense', type: 'expense' })
  const entry = { type: 'expense', categoryId: expense, amount: '0.1', currency: 'THB', date: '2026-10-04', note: 'synthetic' }
  const key = randomUUID()
  const first = await post('finance/transactions', entry, ownerA, key)
  const retry = await post('finance/transactions', entry, ownerA, key)
  assert.equal(first.status, 200); assert.deepEqual(retry.body, first.body)
  assert.equal((await post('finance/transactions', { ...entry, amount: '0.2' }, ownerA, key)).status, 409)
  console.log('PASS receipt retry after lost response and changed payload conflict')
  await create('finance/transactions', { ...entry, amount: '0.2' })
  await create('finance/transactions', { ...entry, type: 'income', categoryId: income, amount: '100' })
  const overview = await request(app).get('/api/finance?month=2026-10').set('Cookie', ownerA)
  assert.equal(overview.status, 200); assert.equal(overview.body.expense, '0.3'); assert.equal(overview.body.balance, '99.7')
  assert.equal(overview.body.transactions.length, 3)
  await create('finance/budgets', { categoryId: expense, month: '2026-10', amount: '0.25', currency: 'THB' })
  const budget = await request(app).get('/api/finance?month=2026-10').set('Cookie', ownerA)
  assert.equal(budget.body.budgets[0].remaining, '-0.05')
  console.log('PASS Decimal finance totals, budget excess and no financial JSON numbers')
  assert.equal((await post('finance/transactions', entry, ownerB)).status, 404)
  assert.equal((await request(app).get('/api/finance?month=2026-10').set('Cookie', ownerB)).body.transactions.length, 0)
  assert.equal((await post('finance/transactions', { ...entry, amount: 1 })).status, 422)
  assert.equal((await post('finance/transactions', { ...entry, amount: '1.001' })).status, 422)
  assert.equal((await request(app).post('/api/finance/transactions').set('Cookie', ownerA).set('Idempotency-Key', randomUUID()).send(entry)).status, 403)
  assert.equal((await request(app).get('/api/finance?month=2026-10')).status, 401)
  console.log('PASS authorization, foreign category, Origin and input boundaries')
  const portfolioA = await create('crypto/portfolios', { name: 'A', quoteCurrency: 'USDT' })
  const portfolioB = await create('crypto/portfolios', { name: 'B', quoteCurrency: 'USDT' })
  const trade = { portfolioId: portfolioA, side: 'buy', asset: 'btc', quantity: '3', price: '1', fee: '1', quoteCurrency: 'USDT', date: '2026-10-04' }
  await create('crypto/trades', trade)
  await create('crypto/trades', { ...trade, portfolioId: portfolioB, quantity: '1', price: '10', fee: '0' })
  await create('crypto/trades', { ...trade, side: 'sell', quantity: '1', price: '2', fee: '0.1' })
  let crypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  assert.equal(crypto.holdings.find(h => h.portfolioId === portfolioA).totalCost, '2.666666666666666667')
  assert.equal(crypto.holdings.find(h => h.portfolioId === portfolioB).totalCost, '10')
  assert.ok(crypto.holdings.every(h => h.asset === 'BTC'))
  console.log('PASS canonical symbols, isolated portfolio scope and partial cost accounting')
  const count = crypto.trades.length
  assert.equal((await post('crypto/trades', { ...trade, side: 'sell', quantity: '3' })).status, 422)
  assert.equal((await post('crypto/trades', { ...trade, side: 'sell', quantity: '1', date: '2026-10-03' })).status, 422)
  crypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  assert.equal(crypto.trades.length, count)
  assert.equal((await post('crypto/trades', trade, ownerB)).status, 404)
  console.log('PASS oversell/backdated rollback, no phantom rows and foreign portfolio rejection')
  const keys = [randomUUID(), randomUUID()]
  const concurrent = await Promise.all(keys.map(k => post('crypto/trades', { ...trade, side: 'sell', quantity: '2', price: '2', fee: '0' }, ownerA, k)))
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 422])
  crypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  const holding = crypto.holdings.find(h => h.portfolioId === portfolioA)
  assert.equal(holding.quantity, '0'); assert.equal(holding.totalCost, '0'); assert.equal(holding.realizedPnl, '1.9')
  console.log('PASS concurrent selling serialized, full sale zero residue and realized P&L')
  const duplicateKey = randomUUID(), duplicatePayload = { ...trade, portfolioId: portfolioB, quantity: '0.00000001', price: '1', fee: '0' }
  const duplicates = await Promise.all([post('crypto/trades', duplicatePayload, ownerA, duplicateKey), post('crypto/trades', duplicatePayload, ownerA, duplicateKey)])
  assert.ok(duplicates.every(r => r.status === 200)); assert.deepEqual(duplicates[0].body, duplicates[1].body)
  const tradeRows = await database.cryptoTrade.count({ where: { id: duplicates[0].body.id } })
  assert.equal(tradeRows, 1)
  console.log('PASS concurrent duplicate receipt, fractional BTC persistence and compiled Node runtime')
  const renamed = await request(app).patch(`/api/finance/categories/${expense}`).set('Origin', origin).set('Cookie', ownerA).set('Idempotency-Key', randomUUID()).send({ name: 'Renamed expense' })
  assert.equal(renamed.status, 200)
  const renamedOverview = (await request(app).get('/api/finance?month=2026-10').set('Cookie', ownerA)).body
  assert.equal(renamedOverview.categories.find(c => c.id === expense).name, 'Renamed expense')
  assert.equal(renamedOverview.transactions.length, 3)
  console.log('PASS rename preserves existing transaction type and totals')
  const ownerId = (await request(app).get('/api/me').set('Cookie', ownerA)).body.ownerId
  let categoryRestricted = false
  try { await database.financeCategory.update({ where: { id: expense }, data: { type: 'INCOME' } }) }
  catch (error) { categoryRestricted = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003' }
  assert.ok(categoryRestricted, 'category type must be restricted by PostgreSQL FK')
  assert.equal((await database.financeTransaction.findUniqueOrThrow({ where: { id: first.body.id } })).type, 'EXPENSE')
  console.log('PASS PostgreSQL category type restriction leaves historical transaction unchanged')
  let acquired, release
  const acquisition = new Promise(resolve => { acquired = resolve })
  const releaseLock = new Promise(resolve => { release = resolve })
  const held = database.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM crypto_portfolios WHERE id = ${portfolioA}::uuid FOR UPDATE`
    acquired(); await releaseLock
  }, { timeout: 12000 })
  let timer
  const lockKey = randomUUID()
  try {
    await Promise.race([acquisition, held.then(() => { throw new Error('lock ended early') }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('lock acquisition timeout')), 2500) })])
    clearTimeout(timer)
    assert.equal((await post('crypto/trades', { ...trade, portfolioId: portfolioB, quantity: '0.00000001', price: '1', fee: '0' })).status, 200)
    let correctSqlstate = false
    try { await createTrade(database, ownerId, lockKey, { ...trade, quantity: '0.00000001', price: '1', fee: '0' }) }
    catch (error) {
      const cause = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.driverAdapterError?.cause : null
      correctSqlstate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010'
        && cause?.kind === 'postgres' && cause.code === '55P03' && cause.originalCode === '55P03'
    }
    assert.ok(correctSqlstate, 'must prove structured SQLSTATE 55P03, never a connection error')
  } finally { clearTimeout(timer); release(); await held }
  const afterRelease = await createTrade(database, ownerId, lockKey, { ...trade, quantity: '0.00000001', price: '1', fee: '0' })
  assert.ok(typeof afterRelease.id === 'string', 'same portfolio mutation must run after release with the same key')
  console.log('PASS structured SQLSTATE 55P03, other portfolio during lock, and same-key callback after release')
  const relay = new MarketRelay(async () => { throw new Error('synthetic upstream unavailable') })
  const http = createServer(app)
  const stopStream = attachMarketStream(http, auth, relay)
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const socketUrl = `ws://127.0.0.1:${http.address().port}/ws/market`
  try {
    const snapshot = await new Promise((resolve, reject) => {
      const client = new WebSocket(socketUrl, { origin, headers: { Cookie: ownerA }, handshakeTimeout: 5000 })
      client.once('error', () => reject(new Error('synthetic authenticated stream failed')))
      client.once('message', data => { const value = JSON.parse(String(data)); client.close(); resolve(value) })
    })
    assert.ok(snapshot.quotes.every(q => q.status === 'UNAVAILABLE' && q.price === null), 'no invented price while offline')
    const rejection = await new Promise(resolve => {
      const client = new WebSocket(socketUrl, { origin, handshakeTimeout: 5000 })
      client.once('unexpected-response', (_request, response) => { client.terminate(); resolve(response.statusCode) })
      client.on('error', () => {})
    })
    assert.equal(rejection, 401)
    console.log('PASS authenticated same-origin WebSocket and anonymous rejection (synthetic upstream fixture)')
  } finally { stopStream(); await new Promise(resolve => http.close(resolve)) }
  const financeCorrection = { action: 'replace', reason: 'Synthetic typo correction', entry: { ...entry, amount: '0.4' } }
  const correctionKey = randomUUID(), correctionPath = `finance/transactions/${first.body.id}/corrections`
  const corrected = await post(correctionPath, financeCorrection, ownerA, correctionKey)
  assert.equal(corrected.status, 200)
  assert.deepEqual((await post(correctionPath, financeCorrection, ownerA, correctionKey)).body, corrected.body)
  assert.equal((await post(correctionPath, { ...financeCorrection, reason: 'Different' }, ownerA, correctionKey)).status, 409)
  assert.equal((await post(correctionPath, financeCorrection, ownerB)).status, 404)
  assert.equal((await post(correctionPath, financeCorrection)).status, 409)
  let correctedFinance = (await request(app).get('/api/finance?month=2026-10').set('Cookie', ownerA)).body
  assert.equal(correctedFinance.expense, '0.6'); assert.equal(correctedFinance.budgets[0].remaining, '-0.35')
  const originalEntry = await database.financeTransaction.findUniqueOrThrow({ where: { id: first.body.id } })
  assert.equal(originalEntry.amount.toFixed(2), '0.10'); assert.ok(originalEntry.voidedAt)
  assert.equal(correctedFinance.transactions.length, 4)
  const replacementPath = `finance/transactions/${corrected.body.replacementId}/corrections`
  const editRace = await Promise.all(['0.5', '0.6'].map(amount => post(replacementPath, { ...financeCorrection, entry: { ...entry, amount } })))
  assert.deepEqual(editRace.map(r => r.status).sort(), [200, 409])
  const winner = editRace.find(r => r.status === 200).body.replacementId
  const voidKey = randomUUID(), voidBody = { action: 'void', reason: 'Synthetic duplicate' }
  const voided = await post(`finance/transactions/${winner}/corrections`, voidBody, ownerA, voidKey)
  assert.equal(voided.status, 200)
  assert.deepEqual((await post(`finance/transactions/${winner}/corrections`, voidBody, ownerA, voidKey)).body, voided.body)
  correctedFinance = (await request(app).get('/api/finance?month=2026-10').set('Cookie', ownerA)).body
  assert.equal(correctedFinance.expense, '0.2'); assert.equal(correctedFinance.budgets[0].remaining, '0.05')
  assert.deepEqual((await post(correctionPath, financeCorrection, ownerA, correctionKey)).body, corrected.body)
  assert.equal((await database.financeTransaction.findUniqueOrThrow({ where: { id: winner } })).voidedAt !== null, true)
  console.log('PASS finance correction preserves originals, totals/budgets, retry, stale-record conflict and concurrent edits')

  const otherHoldingBeforeCorrections = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body.holdings.find(h => h.portfolioId === portfolioB)
  const portfolioC = await create('crypto/portfolios', { name: 'Corrections', quoteCurrency: 'USDT' })
  const buyC = await create('crypto/trades', { ...trade, portfolioId: portfolioC })
  const sellC = await create('crypto/trades', { ...trade, portfolioId: portfolioC, side: 'sell', quantity: '1', price: '2', fee: '0.1' })
  const buyCorrection = { action: 'replace', reason: 'Synthetic price correction', entry: { side: 'buy', quantity: '3', price: '2', fee: '1', quoteCurrency: 'USDT', date: '2026-10-04' } }
  const buyKey = randomUUID(), buyPath = `crypto/trades/${buyC}/corrections`
  const duplicateCorrections = await Promise.all([post(buyPath, buyCorrection, ownerA, buyKey), post(buyPath, buyCorrection, ownerA, buyKey)])
  assert.ok(duplicateCorrections.every(r => r.status === 200)); assert.deepEqual(duplicateCorrections[0].body, duplicateCorrections[1].body)
  const correctedBuy = duplicateCorrections[0].body.replacementId
  const correctedBuyRow = await database.cryptoTrade.findUniqueOrThrow({ where: { id: correctedBuy } })
  const originalBuyRow = await database.cryptoTrade.findUniqueOrThrow({ where: { id: buyC } })
  assert.equal(originalBuyRow.price.toFixed(18), '1.000000000000000000')
  assert.equal(correctedBuyRow.createdAt.getTime(), originalBuyRow.createdAt.getTime(), 'replacement keeps same-day sequence')
  let correctedCrypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  let correctedHolding = correctedCrypto.holdings.find(h => h.portfolioId === portfolioC)
  assert.equal(correctedHolding.quantity, '2'); assert.equal(correctedHolding.totalCost, '4.666666666666666667')
  assert.equal(correctedHolding.realizedPnl, '-0.433333333333333333')
  const invalidCorrectionKey = randomUUID()
  assert.equal((await post(`crypto/trades/${correctedBuy}/corrections`, { ...buyCorrection, entry: { ...buyCorrection.entry, quantity: '0.5' } }, ownerA, invalidCorrectionKey)).status, 422)
  assert.equal((await post(`crypto/trades/${correctedBuy}/corrections`, voidBody)).status, 422)
  assert.equal((await database.cryptoTrade.findUniqueOrThrow({ where: { id: correctedBuy } })).voidedAt, null)
  assert.equal(await database.idempotencyKey.count({ where: { ownerId, key: invalidCorrectionKey } }), 0)
  assert.equal(await database.cryptoTrade.count({ where: { portfolioId: portfolioC } }), 3, 'failed correction adds no replacement')
  assert.equal((await post(`crypto/trades/${correctedBuy}/corrections`, buyCorrection, ownerB)).status, 404)
  assert.equal((await post(`crypto/trades/${correctedBuy}/corrections`, { ...buyCorrection, entry: { ...buyCorrection.entry, portfolioId: portfolioB } })).status, 422)
  assert.equal((await request(app).post(`/api/crypto/trades/${correctedBuy}/corrections`).set('Cookie', ownerA).set('Idempotency-Key', randomUUID()).send(voidBody)).status, 403)
  console.log('PASS crypto correction same-day order, exact partial rounding, foreign owner/Origin and oversell atomic rollback')

  const sellCorrection = { action: 'replace', reason: 'Synthetic sale price correction', entry: { ...buyCorrection.entry, side: 'sell', quantity: '1', price: '3', fee: '0.1' } }
  const correctedSale = await post(`crypto/trades/${sellC}/corrections`, sellCorrection)
  assert.equal(correctedSale.status, 200)
  correctedCrypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  correctedHolding = correctedCrypto.holdings.find(h => h.portfolioId === portfolioC)
  assert.equal(correctedHolding.realizedPnl, '0.566666666666666667')
  assert.deepEqual(correctedCrypto.holdings.find(h => h.portfolioId === portfolioB), otherHoldingBeforeCorrections)
  assert.equal((await post(`crypto/trades/${correctedSale.body.replacementId}/corrections`, voidBody)).status, 200)
  correctedCrypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  correctedHolding = correctedCrypto.holdings.find(h => h.portfolioId === portfolioC)
  assert.equal(correctedHolding.quantity, '3'); assert.equal(correctedHolding.totalCost, '7'); assert.equal(correctedHolding.realizedPnl, '0')
  const finalVoidKey = randomUUID()
  const finalVoid = await post(`crypto/trades/${correctedBuy}/corrections`, voidBody, ownerA, finalVoidKey)
  assert.equal(finalVoid.status, 200)
  assert.deepEqual((await post(buyPath, buyCorrection, ownerA, buyKey)).body, duplicateCorrections[0].body)
  assert.deepEqual((await post(`crypto/trades/${correctedBuy}/corrections`, voidBody, ownerA, finalVoidKey)).body, finalVoid.body)
  correctedCrypto = (await request(app).get('/api/crypto').set('Cookie', ownerA)).body
  correctedHolding = correctedCrypto.holdings.find(h => h.portfolioId === portfolioC)
  assert.equal(correctedHolding.quantity, '0'); assert.equal(correctedHolding.totalCost, '0'); assert.equal(correctedHolding.realizedPnl, '0')
  const finalProjection = await database.portfolioHolding.findFirstOrThrow({ where: { ownerId, portfolioId: portfolioC } })
  assert.equal(finalProjection.lastTradeId, null)
  assert.equal(correctedCrypto.trades.filter(t => t.portfolioId === portfolioC && !t.voidedAt).length, 0)
  console.log('PASS sale correction/void, empty replay zero residue, isolated portfolio, receipts never resurrect cancelled records')

  const lockTrade = await create('crypto/trades', { ...trade, portfolioId: portfolioC, quantity: '1', price: '1', fee: '0' })
  let correctionAcquired, correctionRelease
  const correctionAcquisition = new Promise(resolve => { correctionAcquired = resolve })
  const correctionReleaseLock = new Promise(resolve => { correctionRelease = resolve })
  const correctionHeld = database.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM crypto_portfolios WHERE id = ${portfolioC}::uuid FOR UPDATE`
    correctionAcquired(); await correctionReleaseLock
  }, { timeout: 12000 })
  let correctionTimer
  const correctionLockKey = randomUUID()
  try {
    await Promise.race([correctionAcquisition, correctionHeld.then(() => { throw new Error('correction lock ended early') }), new Promise((_, reject) => { correctionTimer = setTimeout(() => reject(new Error('correction lock acquisition timeout')), 2500) })])
    clearTimeout(correctionTimer)
    assert.equal((await post('crypto/trades', { ...trade, portfolioId: portfolioB, quantity: '0.00000001', price: '1', fee: '0' })).status, 200)
    let correctionSqlstate = false
    try { await correctTrade(database, ownerId, lockTrade, correctionLockKey, voidBody) }
    catch (error) {
      const cause = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.driverAdapterError?.cause : null
      correctionSqlstate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010'
        && cause?.kind === 'postgres' && cause.code === '55P03' && cause.originalCode === '55P03'
    }
    assert.ok(correctionSqlstate, 'correction must prove structured SQLSTATE 55P03')
  } finally { clearTimeout(correctionTimer); correctionRelease(); await correctionHeld }
  assert.equal((await correctTrade(database, ownerId, lockTrade, correctionLockKey, voidBody)).action, 'void')
  console.log('PASS correction SQLSTATE 55P03, independent portfolio while locked and same-key callback after release')
  await runBackupAcceptance(database, app, origin)
  console.log('PASS acceptance completed with synthetic records; database retained, no reset/delete')
} catch (error) {
  if (error instanceof assert.AssertionError) console.error('FAIL assertion:', error.message, '(payload and driver details withheld)')
  else console.error(error instanceof Error && error.message.startsWith('Refused') ? error.message : 'FAIL acceptance; sensitive driver details withheld')
  process.exitCode = 1
} finally { await database.$disconnect() }
