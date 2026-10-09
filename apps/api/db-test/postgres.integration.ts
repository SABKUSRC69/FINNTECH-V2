import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { requireSyntheticDatabase } from '../../../scripts/tracker-db-target.mjs'
import { createTrackerDatabase, checkDatabaseConnection, inOwnedPortfolioTransaction } from '../src/persistence/database.js'
import { cryptoForApi, prepareCryptoMoney, prepareFinanceMoney, thbForApi } from '../src/persistence/decimal.js'
import { Prisma } from '../src/generated/prisma/client.js'

// Deliberately not named *.test.ts: ordinary Vitest never runs live database suites.
const target = requireSyntheticDatabase(process.env)
const database = createTrackerDatabase(target.href)
const secondDatabase = createTrackerDatabase(target.href)
const ownerA = randomUUID()
const ownerB = randomUUID()
const expenseA = randomUUID()
const expenseB = randomUUID()
const portfolioA = randomUUID()
const portfolioA2 = randomUUID()
const portfolioB = randomUUID()
const btc = randomUUID()
const occurredAt = new Date('2026-01-01T00:00:00Z')
const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)

function postgresCause(error: Prisma.PrismaClientKnownRequestError): Record<string, unknown> | undefined {
  const adapterError = error.meta?.driverAdapterError
  if (!adapterError || typeof adapterError !== 'object' || !('cause' in adapterError)) return undefined
  const cause = adapterError.cause
  return cause !== null && typeof cause === 'object' ? cause as Record<string, unknown> : undefined
}

async function expectDatabaseRejection(operation: () => Promise<unknown>, allowed = ['P2002', 'P2003', 'P2004', 'P2010', 'P2039']) {
  assert.equal(await checkDatabaseConnection(database), 'ok')
  await assert.rejects(operation, (error: unknown) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !allowed.includes(error.code)) return false
    if (error.code === 'P2039' || error.code === 'P2010') {
      const cause = postgresCause(error)
      return cause?.kind === 'postgres' && cause.originalCode === '23514'
    }
    return true
  })
  assert.equal(await checkDatabaseConnection(database), 'ok')
}

before(async () => {
  assert.equal(await checkDatabaseConnection(database), 'ok')
  await database.trackerUser.createMany({ data: [
    { id: ownerA, identityState: 'FIXTURE' }, { id: ownerB, identityState: 'FIXTURE' },
  ] })
  await database.financeCategory.createMany({ data: [
    { id: expenseA, ownerId: ownerA, type: 'EXPENSE', name: 'synthetic-A' },
    { id: expenseB, ownerId: ownerB, type: 'EXPENSE', name: 'synthetic-B' },
  ] })
  await database.cryptoPortfolio.createMany({ data: [
    { id: portfolioA, ownerId: ownerA, name: 'synthetic-A1' },
    { id: portfolioA2, ownerId: ownerA, name: 'synthetic-A2' },
    { id: portfolioB, ownerId: ownerB, name: 'synthetic-B' },
  ] })
  await database.cryptoAsset.create({ data: { id: btc, symbol: 'BTC' } })
})

after(async () => {
  await Promise.all([database.$disconnect(), secondDatabase.$disconnect()])
  // Leave only synthetic evidence; runner refuses this nonempty DB on subsequent runs.
})

test('migration creates PostgreSQL NUMERIC types and fixture users remain unverified', async () => {
  const columns = await database.$queryRaw<{ table_name: string; numeric_precision: number; numeric_scale: number }[]>`
    SELECT table_name, numeric_precision, numeric_scale FROM information_schema.columns
    WHERE table_schema = 'public' AND (table_name, column_name) IN
      (('finance_transactions', 'amount'), ('crypto_trades', 'quantity'))
    ORDER BY table_name
  `
  assert.deepEqual(columns, [
    { table_name: 'crypto_trades', numeric_precision: 38, numeric_scale: 18 },
    { table_name: 'finance_transactions', numeric_precision: 20, numeric_scale: 2 },
  ])
  assert.equal((await database.trackerUser.findUniqueOrThrow({ where: { id: ownerA } })).identityState, 'FIXTURE')
  assert.equal(await database.authIdentity.count(), 0)
})

test('Decimal round-trip preserves THB maximum, crypto maximum and fractional BTC as API strings', async () => {
  const thb = await database.financeTransaction.create({ data: {
    ownerId: ownerA, occurredAt,
    ...prepareFinanceMoney({ type: 'income', amount: '999999999999999999.99', currency: 'THB' }),
  } })
  assert.equal(thbForApi(thb.amount), '999999999999999999.99')
  for (const quantity of ['99999999999999999999.999999999999999999', '0.00000001']) {
    const { assetSymbol: _assetSymbol, ...money } = prepareCryptoMoney({
      side: 'buy', asset: 'BTC', quantity, price: '1', fee: '0', quoteCurrency: 'USDT',
    })
    const trade = await database.cryptoTrade.create({ data: { ownerId: ownerA, portfolioId: portfolioA, assetId: btc, occurredAt, ...money } })
    const dto = { quantity: cryptoForApi(trade.quantity), price: cryptoForApi(trade.price), fee: cryptoForApi(trade.fee) }
    assert.deepEqual(JSON.parse(JSON.stringify(dto)), { quantity, price: '1', fee: '0' })
  }
})

test('constraints reject invalid values, currencies, provenance and cross-owner category/portfolio references', async () => {
  const finance = { ownerId: ownerA, categoryId: expenseA, type: 'EXPENSE' as const, amount: '1', occurredAt }
  for (const overrides of [{ amount: '0' }, { amount: '-1' }, { currency: 'USDT' }, { provenance: 'LEGACY_DEMO' as const }, { categoryId: expenseB }]) {
    await expectDatabaseRejection(() => database.financeTransaction.create({ data: { ...finance, ...overrides } }))
  }
  // Bypass client input validation to exercise PostgreSQL's explicit NaN CHECK.
  await expectDatabaseRejection(() => database.$executeRaw`
    INSERT INTO finance_transactions (id, owner_id, type, amount, occurred_at)
    VALUES (${randomUUID()}::uuid, ${ownerA}::uuid, 'INCOME', 'NaN'::numeric, ${occurredAt})
  `, ['P2010'])
  const trade = { ownerId: ownerA, portfolioId: portfolioA, assetId: btc, side: 'BUY' as const, quantity: '1', price: '1', fee: '0', occurredAt }
  for (const overrides of [{ quantity: '0' }, { price: '0' }, { fee: '-1' }, { quoteCurrency: 'THB' }, { portfolioId: portfolioB }, { provenance: 'LEGACY_DEMO' as const }]) {
    await expectDatabaseRejection(() => database.cryptoTrade.create({ data: { ...trade, ...overrides } }))
  }
})

test('budget uniqueness, expense category and month-start constraints are enforced', async () => {
  const budget = { ownerId: ownerA, categoryId: expenseA, month: occurredAt, amount: '0' }
  await database.budget.create({ data: budget })
  await expectDatabaseRejection(() => database.budget.create({ data: budget }), ['P2002'])
  for (const overrides of [{ categoryId: expenseB }, { month: new Date('2026-02-15') }, { amount: '-1', month: new Date('2026-03-01') }]) {
    await expectDatabaseRejection(() => database.budget.create({ data: { ...budget, ...overrides } }))
  }
})

test('referenced category type cannot cascade into history; renaming remains allowed', async () => {
  const category = await database.financeCategory.create({ data: { ownerId: ownerA, type: 'EXPENSE', name: 'synthetic-history' } })
  const transaction = await database.financeTransaction.create({ data: {
    ownerId: ownerA, categoryId: category.id, type: 'EXPENSE', amount: '3', occurredAt,
  } })
  await expectDatabaseRejection(() => database.financeCategory.update({ where: { id: category.id }, data: { type: 'INCOME' } }), ['P2003'])
  const unchanged = await database.financeTransaction.findUniqueOrThrow({ where: { id: transaction.id } })
  assert.equal(unchanged.type, 'EXPENSE')
  assert.equal(unchanged.categoryId, category.id)
  assert.equal(thbForApi(unchanged.amount), '3')
  assert.equal((await database.financeCategory.findUniqueOrThrow({ where: { id: category.id } })).type, 'EXPENSE')
  const renamed = await database.financeCategory.update({ where: { id: category.id }, data: { name: 'synthetic-renamed' } })
  assert.equal(renamed.name, 'synthetic-renamed')
  assert.equal((await database.financeTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).type, 'EXPENSE')
})

test('Contracts canonical symbols resolve one PostgreSQL asset and lowercase direct writes are rejected', async () => {
  for (const asset of ['btc', 'BtC', 'BTC']) {
    const { assetSymbol, ...money } = prepareCryptoMoney({ side: 'buy', asset, quoteCurrency: 'USDT', quantity: '0.00000001', price: '1', fee: '0' })
    assert.equal(assetSymbol, 'BTC')
    const storedAsset = await database.cryptoAsset.findUniqueOrThrow({ where: { symbol: assetSymbol } })
    assert.equal(storedAsset.id, btc)
    const trade = await database.cryptoTrade.create({ data: { ownerId: ownerA, portfolioId: portfolioA, assetId: storedAsset.id, occurredAt, ...money } })
    assert.equal(trade.assetId, btc)
  }
  await expectDatabaseRejection(() => database.cryptoAsset.create({ data: { symbol: 'btc' } }))
  assert.equal(await database.cryptoAsset.count({ where: { symbol: 'BTC' } }), 1)
})

test('holdings and costs are isolated by owner/portfolio/asset/quote with cross-owner references rejected', async () => {
  for (const [portfolioId, totalCost] of [[portfolioA, '100'], [portfolioA2, '200']] as const) {
    await database.portfolioHolding.create({ data: { ownerId: ownerA, portfolioId, assetId: btc, quantity: '1', totalCost, state: 'READY' } })
  }
  const holdings = await database.portfolioHolding.findMany({ where: { ownerId: ownerA }, orderBy: { totalCost: 'asc' } })
  assert.deepEqual(holdings.map((holding) => cryptoForApi(holding.totalCost!)), ['100', '200'])
  for (const overrides of [{ quantity: '-1' }, { totalCost: '-1' }, { version: -1 }, { state: 'READY' as const, totalCost: null }]) {
    await expectDatabaseRejection(() => database.portfolioHolding.update({
      where: { ownerId_portfolioId_assetId_quoteCurrency: { ownerId: ownerA, portfolioId: portfolioA, assetId: btc, quoteCurrency: 'USDT' } },
      data: overrides,
    }))
  }
  await expectDatabaseRejection(() => database.portfolioHolding.create({ data: {
    ownerId: ownerA, portfolioId: portfolioB, assetId: btc, quantity: '1', totalCost: '1',
  } }), ['P2003'])
})

test('transaction commit/rollback covers financial rows and audit together', async () => {
  const committed = randomUUID()
  await database.$transaction(async (transaction) => {
    await transaction.financeTransaction.create({ data: { id: committed, ownerId: ownerA, occurredAt, type: 'INCOME', amount: '2' } })
    await transaction.auditEvent.create({ data: { ownerId: ownerA, requestId: committed, eventType: 'synthetic', entityType: 'finance_transaction', entityId: committed } })
  })
  assert.equal(await database.auditEvent.count({ where: { requestId: committed } }), 1)
  const rolledBack = randomUUID()
  await assert.rejects(database.$transaction(async (transaction) => {
    await transaction.financeTransaction.create({ data: { id: rolledBack, ownerId: ownerA, occurredAt, type: 'INCOME', amount: '2' } })
    await transaction.auditEvent.create({ data: { ownerId: ownerA, requestId: rolledBack, eventType: 'synthetic', entityType: 'finance_transaction' } })
    throw new Error('synthetic rollback')
  }), /synthetic rollback/)
  assert.equal(await database.financeTransaction.count({ where: { id: rolledBack } }), 0)
  assert.equal(await database.auditEvent.count({ where: { requestId: rolledBack } }), 0)
})

test('request uniqueness uses owner/endpoint/key and preserves the original request hash', async () => {
  const request = { ownerId: ownerA, endpoint: '/internal/test', key: 'same-key', requestSha256: hashA, receipt: { synthetic: true } }
  const stored = await database.idempotencyKey.create({ data: request })
  await expectDatabaseRejection(() => database.idempotencyKey.create({ data: request }), ['P2002'])
  await expectDatabaseRejection(() => database.idempotencyKey.create({ data: { ...request, requestSha256: hashB } }), ['P2002'])
  await expectDatabaseRejection(() => database.idempotencyKey.update({ where: { id: stored.id }, data: { requestSha256: hashB } }))
  await database.idempotencyKey.create({ data: { ...request, ownerId: ownerB } })
  await database.idempotencyKey.create({ data: { ...request, endpoint: '/internal/other' } })
  assert.deepEqual((await database.idempotencyKey.findUniqueOrThrow({ where: { id: stored.id } })).receipt, request.receipt)
})

test('legacy identities retain identical no-ID rows, separate namespaces and immutable payloads', async () => {
  const namespaceA = await database.sourceDatasetNamespace.create({ data: { ownerId: ownerA, displayName: 'dataset-A' } })
  const namespaceB = await database.sourceDatasetNamespace.create({ data: { ownerId: ownerA, displayName: 'dataset-B' } })
  const batchData = { ownerId: ownerA, fileSha256: hashA, consentedAt: occurredAt, selectedSections: ['TRANSACTIONS' as const], receipt: { synthetic: true } }
  const batchA = await database.legacyImport.create({ data: { ...batchData, namespaceId: namespaceA.id } })
  const batchA2 = await database.legacyImport.create({ data: { ...batchData, namespaceId: namespaceA.id, fileSha256: hashB } })
  const batchB = await database.legacyImport.create({ data: { ...batchData, namespaceId: namespaceB.id } })
  const row = { ownerId: ownerA, namespaceId: namespaceA.id, importId: batchA.id, fileSha256: hashA, section: 'TRANSACTIONS' as const, payloadSha256: hashA, sourcePayload: { amount: '1' }, currencyOverride: 'THB' }
  await database.legacyImportRow.createMany({ data: [{ ...row, ordinal: 0 }, { ...row, ordinal: 1 }] })
  assert.equal(await database.legacyImportRow.count({ where: { importId: batchA.id, sourceRowId: null } }), 2)
  await database.legacyImportRow.create({ data: { ...row, importId: batchA2.id, fileSha256: hashB, ordinal: 0 } })
  const known = await database.legacyImportRow.create({ data: { ...row, sourceRowId: 'shared-id', ordinal: 2 } })
  await expectDatabaseRejection(() => database.legacyImportRow.create({ data: { ...row, importId: batchA2.id, fileSha256: hashB, sourceRowId: 'shared-id', ordinal: 99 } }), ['P2002'])
  await database.legacyImportRow.create({ data: { ...row, namespaceId: namespaceB.id, importId: batchB.id, sourceRowId: 'shared-id', ordinal: 2 } })
  await expectDatabaseRejection(() => database.legacyImportRow.update({ where: { id: known.id }, data: { sourcePayload: { amount: '2' } } }))
  await database.sourceDatasetNamespace.update({ where: { id: namespaceA.id }, data: { displayName: 'renamed-A' } })
  await expectDatabaseRejection(() => database.sourceDatasetNamespace.update({ where: { id: namespaceA.id }, data: { id: randomUUID() } }))
  assert.equal((await database.legacyImportRow.findUniqueOrThrow({ where: { id: known.id } })).provenance, 'LEGACY_DEMO')
  assert.equal((await database.legacyImportRow.findUniqueOrThrow({ where: { id: known.id } })).costBasis, null)
})

test('reversed legacy batch and receipt cannot restore; normal finance is untouched', async () => {
  const namespace = await database.sourceDatasetNamespace.create({ data: { ownerId: ownerA, displayName: 'reversal-test' } })
  const batch = await database.legacyImport.create({ data: { ownerId: ownerA, namespaceId: namespace.id, fileSha256: hashA, consentedAt: occurredAt, selectedSections: ['TRANSACTIONS'], receipt: { synthetic: true } } })
  const key = await database.idempotencyKey.create({ data: { ownerId: ownerA, endpoint: '/internal/legacy', key: 'reversed-key', requestSha256: hashA, receipt: { status: 'COMMITTED' }, legacyImportId: batch.id } })
  const financeCount = await database.financeTransaction.count({ where: { ownerId: ownerA } })
  await database.$transaction([
    database.legacyImport.update({ where: { id: batch.id }, data: { status: 'REVERSED', reversedAt: occurredAt, reversalReason: 'synthetic test' } }),
    database.idempotencyKey.update({ where: { id: key.id }, data: { status: 'REVERSED', receipt: { status: 'REVERSED' } } }),
  ])
  await expectDatabaseRejection(() => database.legacyImport.update({ where: { id: batch.id }, data: { status: 'COMMITTED', reversedAt: null, reversalReason: null } }))
  await expectDatabaseRejection(() => database.idempotencyKey.update({ where: { id: key.id }, data: { status: 'COMPLETED' } }))
  assert.deepEqual((await database.idempotencyKey.findUniqueOrThrow({ where: { id: key.id } })).receipt, { status: 'REVERSED' })
  assert.equal(await database.financeTransaction.count({ where: { ownerId: ownerA } }), financeCount)
})

test('same portfolio lock produces SQLSTATE 55P03 while another portfolio remains writable', { timeout: 15_000 }, async () => {
  let acquired!: () => void
  let release!: () => void
  const firstAcquired = new Promise<void>((resolve) => { acquired = resolve })
  const firstRelease = new Promise<void>((resolve) => { release = resolve })
  const first = inOwnedPortfolioTransaction(database, ownerA, portfolioA, async () => {
    acquired()
    await firstRelease
  })
  let secondEntered = false
  let acquisitionTimer: ReturnType<typeof setTimeout> | undefined
  try {
    // Include first's rejection in the race: failed acquisition must not hang the suite.
    await Promise.race([
      firstAcquired,
      first.then(() => { throw new Error('First transaction ended before acquiring the lock') }),
      new Promise<never>((_resolve, reject) => {
        acquisitionTimer = setTimeout(() => reject(new Error('First lock acquisition exceeded 2500ms')), 2_500)
      }),
    ])
    if (acquisitionTimer) clearTimeout(acquisitionTimer)
    let otherEntered = false
    await inOwnedPortfolioTransaction(secondDatabase, ownerA, portfolioA2, async (transaction) => {
      otherEntered = true
      await transaction.cryptoPortfolio.update({ where: { id: portfolioA2 }, data: { name: 'synthetic-other-while-locked' } })
    })
    assert.equal(otherEntered, true)
    assert.equal(await checkDatabaseConnection(secondDatabase), 'ok')
    await assert.rejects(inOwnedPortfolioTransaction(secondDatabase, ownerA, portfolioA, async () => { secondEntered = true }), (error: unknown) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2010') return false
      const cause = postgresCause(error)
      // adapter-pg 7.10.0 raw-query errors retain PostgreSQL SQLSTATE in structured metadata.
      return cause?.kind === 'postgres' && cause.originalCode === '55P03' && cause.code === '55P03'
    })
    assert.equal(secondEntered, false)
    assert.equal(await checkDatabaseConnection(secondDatabase), 'ok')
  } finally {
    if (acquisitionTimer) clearTimeout(acquisitionTimer)
    release()
    await first
  }
  await inOwnedPortfolioTransaction(secondDatabase, ownerA, portfolioA, async () => { secondEntered = true })
  assert.equal(secondEntered, true)
  await assert.rejects(inOwnedPortfolioTransaction(database, ownerB, portfolioA, async () => {}), /portfolio_not_found/)
})
