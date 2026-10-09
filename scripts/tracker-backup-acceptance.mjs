import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import request from 'supertest'
import { prepareBackup, restoreBackup } from '../apps/api/dist/tracker/backup.js'
import { ownedMutation } from '../apps/api/dist/tracker/service.js'
import { Prisma } from '../apps/api/dist/generated/prisma/client.js'

// Invoked only by the empty-schema, synthetic-target-guarded acceptance runner.
export async function runBackupAcceptance(database, app, origin) {
  async function account() {
    // Better Auth's installed sign-up rule allows three requests per ten seconds.
    // Pace real fixture registration instead of weakening production rate limits.
    await wait(11000)
    const registration = await request(app).post('/api/auth/sign-up/email').set('Origin', origin).send({ name: 'Synthetic backup', email: `${randomUUID()}@example.invalid`, password: randomBytes(32).toString('hex') })
    assert.equal(registration.status, 200, 'synthetic backup account creation')
    const cookie = registration.headers['set-cookie'].find(v => v.startsWith('finntech.session_token='))?.split(';')[0]
    assert.ok(Boolean(cookie), 'cookie issued; value withheld')
    const me = await request(app).get('/api/me').set('Cookie', cookie)
    assert.equal(me.status, 200)
    return { cookie, owner: me.body.ownerId }
  }
  function post(path, body, user, key = randomUUID()) { return request(app).post(`/api/${path}`).set('Origin', origin).set('Cookie', user.cookie).set('Idempotency-Key', key).send(body) }
  async function create(path, body, user) { const response = await post(path, body, user); assert.equal(response.status, 200, `synthetic ${path}`); return response.body.id }
  async function empty(user) {
    const counts = await Promise.all([database.financeCategory.count({ where: { ownerId: user.owner } }), database.financeTransaction.count({ where: { ownerId: user.owner } }), database.budget.count({ where: { ownerId: user.owner } }), database.cryptoPortfolio.count({ where: { ownerId: user.owner } }), database.cryptoTrade.count({ where: { ownerId: user.owner } }), database.portfolioHolding.count({ where: { ownerId: user.owner } })])
    assert.ok(counts.every(count => count === 0), 'failed restore leaves all six business tables empty')
  }
  const source = await account(), target = await account()
  const income = await create('finance/categories', { name: 'Synthetic income', type: 'income' }, source)
  const expense = await create('finance/categories', { name: 'Synthetic expense', type: 'expense' }, source)
  const entry = { type: 'expense', categoryId: expense, amount: '0.1', currency: 'THB', date: '2026-02-01', note: 'identical synthetic entry' }
  await create('finance/transactions', { ...entry, type: 'income', categoryId: income, amount: '999999999999999999.99', date: '2026-01-01' }, source)
  await create('finance/transactions', entry, source); await create('finance/transactions', entry, source)
  const cancelledEntry = await create('finance/transactions', { ...entry, amount: '0.3' }, source)
  await create(`finance/transactions/${cancelledEntry}/corrections`, { action: 'void', reason: 'synthetic cancelled duplicate' }, source)
  await create('finance/budgets', { categoryId: expense, month: '2026-02', amount: '0.5', currency: 'THB' }, source)
  const pA = await create('crypto/portfolios', { name: 'Synthetic A', quoteCurrency: 'USDT' }, source)
  const pB = await create('crypto/portfolios', { name: 'Synthetic B', quoteCurrency: 'USDT' }, source)
  const trade = { portfolioId: pA, side: 'buy', asset: 'BTC', quantity: '3', price: '1', fee: '1', quoteCurrency: 'USDT', date: '2026-02-01' }
  await create('crypto/trades', trade, source)
  await create('crypto/trades', { ...trade, side: 'sell', quantity: '1', price: '2', fee: '0.1' }, source)
  const cancelledTrade = await create('crypto/trades', { ...trade, quantity: '2', price: '2', fee: '0' }, source)
  await create(`crypto/trades/${cancelledTrade}/corrections`, { action: 'void', reason: 'synthetic cancelled purchase' }, source)
  await create('crypto/trades', { ...trade, portfolioId: pB, quantity: '0.00000001', price: '99999999999999999999.999999999999999999', fee: '0.000000000000000001' }, source)

  const response = await request(app).get('/api/backup').set('Cookie', source.cookie)
  assert.equal(response.status, 200); assert.match(response.headers['content-disposition'], /attachment/)
  assert.equal(response.headers['cache-control'], 'no-store')
  const file = response.body
  assert.deepEqual(Object.keys(file).sort(), ['format', 'version', 'provenance', 'exportedAt', 'categories', 'transactions', 'budgets', 'portfolios', 'trades'].sort())
  assert.equal(file.transactions.filter(row => row.amount === '0.1').length, 2)
  assert.equal(file.trades.find(row => row.portfolioId === pB).price, '99999999999999999999.999999999999999999')
  assert.equal((await request(app).get('/api/backup')).status, 401)
  const preview = await post('backup/preview', file, target)
  assert.equal(preview.status, 200); assert.equal(preview.body.canRestore, true)
  assert.equal(preview.body.summary.months.find(row => row.month === '2026-02').expense, '0.2')
  assert.equal(preview.body.summary.holdings.find(row => row.portfolioId === pA).totalCost, '2.666666666666666667')
  assert.equal(preview.body.summary.holdings.find(row => row.portfolioId === pB).totalCost, '1000000000000.000000000000000001')
  await empty(target)
  assert.equal((await post('backup/preview', file, source)).body.canRestore, false)
  const body = { backup: file, previewDigest: preview.body.digest, consent: true }, key = randomUUID()
  const restores = await Promise.all([post('backup/restore', body, target, key), post('backup/restore', body, target, key)])
  assert.ok(restores.every(row => row.status === 200)); assert.deepEqual(restores[0].body, restores[1].body)
  assert.deepEqual(restores[0].body.summary, preview.body.summary)
  assert.equal((await post('backup/restore', body, target)).status, 409)
  assert.equal((await post('backup/restore', body, source)).status, 409)
  assert.deepEqual((await post('backup/restore', body, target, key)).body, restores[0].body)
  const targetFile = (await request(app).get('/api/backup').set('Cookie', target.cookie)).body
  assert.deepEqual(prepareBackup(targetFile).summary.counts, preview.body.summary.counts)
  assert.equal(targetFile.transactions.filter(row => row.amount === '0.1').length, 2)
  assert.equal(targetFile.transactions.find(row => row.amount === '999999999999999999.99').amount, '999999999999999999.99')
  assert.equal(targetFile.transactions.filter(row => row.voidedAt).length, 1)
  assert.deepEqual(targetFile.trades.find(row => row.voidedAt).accounting, file.trades.find(row => row.voidedAt).accounting)
  assert.ok(!targetFile.categories.some(row => file.categories.some(original => original.id === row.id)), 'source IDs remap into owned fresh IDs')
  const budget = (await request(app).get('/api/finance?month=2026-02').set('Cookie', target.cookie)).body.budgets[0]
  assert.equal(budget.spent, '0.2'); assert.equal(budget.remaining, '0.3')
  console.log('PASS backup PostgreSQL round-trip: maximum THB/crypto price, BTC fraction, identical rows, cancelled evidence, budgets and isolated partial cost bases')
  console.log('PASS backup preview writes zero, owner-only export, explicit consent, concurrent duplicate receipt and nonempty target refusal')

  const changedFile = { ...file, exportedAt: '2026-10-05T00:00:00.000Z' }
  const changedDigest = prepareBackup(changedFile).digest
  assert.equal((await post('backup/restore', { backup: changedFile, previewDigest: changedDigest, consent: true }, target, key)).status, 409)
  const rejected = await account()
  for (const badFile of [{ ...file, provenance: 'LEGACY_DEMO' }, { ...file, token: 'synthetic-placeholder' }, { ...file, transactions: [{ ...file.transactions[0], amount: 1 }] }, { ...file, transactions: [{ ...file.transactions[0], categoryId: randomUUID() }] }]) {
    assert.equal((await post('backup/preview', badFile, rejected)).status, 422)
  }
  assert.equal((await post('backup/restore', { ...body, consent: false }, rejected)).status, 422)
  assert.equal((await post('backup/restore', { ...body, previewDigest: '0'.repeat(64) }, rejected)).status, 409)
  assert.equal((await request(app).post('/api/backup/restore').set('Cookie', rejected.cookie).set('Idempotency-Key', randomUUID()).send(body)).status, 403)
  assert.equal((await post('backup/preview', { ...file, transactions: [{ ...file.transactions[0], note: 'x'.repeat(2 * 1024 * 1024) }] }, rejected)).status, 413)
  await empty(rejected)
  console.log('PASS backup credential/legacy/number/reference rejection, Origin, byte limits, changed preview and key-payload conflict')

  const forced = await account(), failureKey = randomUUID()
  await database.$executeRawUnsafe("CREATE FUNCTION backup_acceptance_reject_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic projection failure' USING ERRCODE='23514'; END $$")
  await database.$executeRawUnsafe('CREATE TRIGGER backup_acceptance_reject_projection BEFORE INSERT ON portfolio_holdings FOR EACH ROW EXECUTE FUNCTION backup_acceptance_reject_projection()')
  try {
    assert.equal((await post('backup/restore', body, forced, failureKey)).status, 503)
    await empty(forced)
    assert.equal(await database.idempotencyKey.count({ where: { ownerId: forced.owner, key: failureKey } }), 0)
    assert.equal(await database.auditEvent.count({ where: { ownerId: forced.owner } }), 0)
  } finally {
    await database.$executeRawUnsafe('DROP TRIGGER backup_acceptance_reject_projection ON portfolio_holdings')
    await database.$executeRawUnsafe('DROP FUNCTION backup_acceptance_reject_projection()')
  }
  assert.equal((await post('backup/restore', body, forced, failureKey)).status, 200)
  console.log('PASS real PostgreSQL projection failure rolls back all rows/audit/receipt; same-key retry succeeds after failure removed (no mocks)')

  const racing = await account()
  const race = await Promise.all([post('backup/restore', body, racing), post('backup/restore', body, racing)])
  assert.deepEqual(race.map(row => row.status).sort(), [200, 409])
  assert.equal(await database.financeTransaction.count({ where: { ownerId: racing.owner } }), file.transactions.length)
  const locked = await account(), independent = await account()
  let acquired, release, timer
  const acquisition = new Promise(resolve => { acquired = resolve }), releaseLock = new Promise(resolve => { release = resolve })
  const held = ownedMutation(database, locked.owner, 'synthetic-backup-lock', randomUUID(), {}, async () => { acquired(); await releaseLock; return {} })
  const lockKey = randomUUID()
  try {
    await Promise.race([acquisition, held.then(() => { throw new Error('shared lock ended early') }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('backup acquisition timeout')), 2500) })])
    clearTimeout(timer)
    await create('finance/categories', { name: 'Independent owner', type: 'expense' }, independent)
    let sqlstate = false
    try { await restoreBackup(database, locked.owner, lockKey, body) }
    catch (error) {
      const cause = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.driverAdapterError?.cause : null
      sqlstate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && cause?.kind === 'postgres' && cause.code === '55P03' && cause.originalCode === '55P03'
    }
    assert.ok(sqlstate, 'restore exclusive lock must prove structured SQLSTATE55P03')
    await empty(locked)
  } finally { clearTimeout(timer); release(); await held }
  assert.deepEqual((await restoreBackup(database, locked.owner, lockKey, body)).summary, preview.body.summary)
  console.log('PASS restore exclusive/shared writer lock SQLSTATE55P03, independent owner, callback after release and concurrent different-key restore refusal')
}
