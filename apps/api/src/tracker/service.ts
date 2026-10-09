import {linkReceipt,copyReceipt,mediaLock} from '../media/store.js'
import { createHash } from 'node:crypto'
import {
  budgetInputSchema, calendarMonthSchema, categoryInputSchema, categoryRenameSchema,
  financeEntrySchema, portfolioInputSchema, tradeEntrySchema, resourceIdSchema, idempotencyKeySchema,
  financeCorrectionSchema, tradeCorrectionSchema,
  type FinanceOverview,
} from '@finntech/contracts'
import { parseThbDecimal, serializeThb, replayCryptoTrades } from '@finntech/finance'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { thbForApi, cryptoForApi } from '../persistence/decimal.js'
import { realDatabaseFor, realStorageAvailable, consumeRealBudget } from '../auth/real.js'

export class TrackerError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code) }
}
type Receipt = Prisma.InputJsonObject
export function thaiDay(value: Date): string {
  return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
export function monthWindow(value: unknown): { month: string; start: Date; end: Date } {
  const month = calendarMonthSchema.parse(value)
  const start = new Date(`${month}-01T00:00:00+07:00`)
  // A Thai first-of-month is the previous UTC day; construct the next month explicitly.
  const anchor = new Date(`${month}-01T00:00:00Z`)
  anchor.setUTCMonth(anchor.getUTCMonth() + 1)
  return { month, start, end: new Date(anchor.getTime() - 7 * 60 * 60 * 1000) }
}

/** Transaction advisory lock serializes identical request keys, independently of sessions. */
export async function ownedMutation(
  database: PrismaClient, ownerId: string, endpoint: string, key: unknown, payload: unknown,
  operation: (tx: Prisma.TransactionClient) => Promise<Receipt>,
  datasetMode: 'shared' | 'exclusive' = 'shared',
): Promise<Receipt> {
  const requestKey = idempotencyKeySchema.parse(key)
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const lockIdentity = JSON.stringify([ownerId, endpoint, requestKey])
  return database.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '3000ms'`
    // Restore needs exclusive access; normal mutations keep independent portfolios concurrent.
    const datasetIdentity = `tracker-dataset:${ownerId}`
    if (datasetMode === 'exclusive') await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${datasetIdentity}, 0))::text AS locked`
    else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${datasetIdentity}, 0))::text AS locked`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockIdentity}, 0))::text AS locked`
    if (!await tx.trackerUser.findUnique({ where: { id: ownerId } })) throw new TrackerError('OWNER_NOT_FOUND', 403)
    // Recheck after taking the dataset lock: a request authenticated before deletion
    // must not write after the deletion consent transaction has committed.
    if (realDatabaseFor(database)) {
      const identity = await tx.authIdentity.findFirst({where:{ownerId,provider:'better-auth'}})
      const enrollment = identity?.authUserId ? await tx.authRecoveryEnrollment.findUnique({where:{userId:identity.authUserId}}) : null
      if (!enrollment || enrollment.blocked) throw new TrackerError('ACCOUNT_NOT_READY',403)
    }
    const prior = await tx.idempotencyKey.findUnique({ where: { ownerId_endpoint_key: { ownerId, endpoint, key: requestKey } } })
    if (prior) {
      if (prior.requestSha256 !== hash) throw new TrackerError('IDEMPOTENCY_CONFLICT', 409)
      return prior.receipt as Receipt
    }
    const real = realDatabaseFor(database)
    if (real) {
      if (!await realStorageAvailable(tx, real)) throw new TrackerError('STORAGE_PAUSED', 503)
      if (!await consumeRealBudget(tx, 'writes:global', 120, 60)) throw new TrackerError('WRITE_RATE_LIMITED', 429)
    }
    const receipt = await operation(tx)
    const record = await tx.idempotencyKey.create({ data: { ownerId, endpoint, key: requestKey, requestSha256: hash, receipt } })
    const identity = await tx.authIdentity.findFirst({ where: { ownerId, provider: 'better-auth' }, select: { id: true } })
    await tx.auditEvent.create({ data: {
      ownerId, actorIdentityId: identity?.id ?? null, idempotencyId: record.id, requestId: requestKey,
      eventType: 'USER_MUTATION', entityType: endpoint, entityId: typeof receipt.id === 'string' ? receipt.id : null,
    } })
    return receipt
  }, { maxWait: 5000, timeout: 15000 })
}

export async function financeOverview(database: PrismaClient, ownerId: string, selectedMonth: unknown): Promise<FinanceOverview> {
  const { month, start, end } = monthWindow(selectedMonth)
  return database.$transaction(async tx => {
    const categories = await tx.financeCategory.findMany({ where: { ownerId }, orderBy: { name: 'asc' } })
    const entries = await tx.financeTransaction.findMany({
      where: { ownerId, provenance: 'USER_ENTERED', occurredAt: { gte: start, lt: end } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    })
    const budgets = await tx.budget.findMany({ where: { ownerId, month: new Date(`${month}-01T00:00:00Z`) } })
    let income = parseThbDecimal('0'), expense = parseThbDecimal('0')
    const spending = new Map<string, ReturnType<typeof parseThbDecimal>>()
    for (const row of entries) {
      if (row.voidedAt) continue
      const amount = parseThbDecimal(thbForApi(row.amount))
      if (row.type === 'INCOME') income = income.plus(amount)
      else {
        expense = expense.plus(amount)
        if (row.categoryId) spending.set(row.categoryId, (spending.get(row.categoryId) ?? parseThbDecimal('0')).plus(amount))
      }
    }
    return {
      month, currency: 'THB', income: serializeThb(income), expense: serializeThb(expense), balance: serializeThb(income.minus(expense)),
      categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type === 'INCOME' ? 'income' as const : 'expense' as const })),
      transactions: entries.map(row => ({ id: row.id, categoryId: row.categoryId!, type: row.type === 'INCOME' ? 'income' as const : 'expense' as const,
        amount: thbForApi(row.amount), date: thaiDay(row.occurredAt), note: row.note ?? '',
        voidedAt: row.voidedAt?.toISOString() ?? null, voidReason: row.voidReason })),
      budgets: budgets.map(b => {
        const spent = spending.get(b.categoryId) ?? parseThbDecimal('0')
        return { id: b.id, categoryId: b.categoryId, amount: thbForApi(b.amount), spent: serializeThb(spent), remaining: serializeThb(parseThbDecimal(thbForApi(b.amount)).minus(spent)) }
      }),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}

export async function createCategory(db: PrismaClient, owner: string, key: unknown, body: unknown): Promise<Receipt> {
  const value = categoryInputSchema.parse(body)
  return ownedMutation(db, owner, 'finance.categories.create', key, value, async tx => {
    const category = await tx.financeCategory.create({ data: { ownerId: owner, name: value.name, type: value.type === 'income' ? 'INCOME' : 'EXPENSE' } })
    return { id: category.id }
  })
}
export async function renameCategory(db: PrismaClient, owner: string, id: unknown, key: unknown, body: unknown): Promise<Receipt> {
  const categoryId = resourceIdSchema.parse(id), value = categoryRenameSchema.parse(body)
  return ownedMutation(db, owner, 'finance.categories.rename', key, { categoryId, ...value }, async tx => {
    const result = await tx.financeCategory.updateMany({ where: { ownerId: owner, id: categoryId }, data: { name: value.name } })
    if (result.count !== 1) throw new TrackerError('CATEGORY_NOT_FOUND', 404)
    return { id: categoryId }
  })
}
export async function createEntry(db: PrismaClient, owner: string, key: unknown, body: unknown): Promise<Receipt> {
  const value = financeEntrySchema.parse(body)
  return ownedMutation(db, owner, 'finance.transactions.create', key, value, async tx => {
    const type = value.type === 'income' ? 'INCOME' : 'EXPENSE'
    if (!await tx.financeCategory.findFirst({ where: { ownerId: owner, id: value.categoryId, type } })) throw new TrackerError('CATEGORY_NOT_FOUND', 404)
    const entry = await tx.financeTransaction.create({ data: {
      ownerId: owner, categoryId: value.categoryId, type, amount: serializeThb(parseThbDecimal(value.amount)), currency: 'THB',
      occurredAt: new Date(`${value.date}T00:00:00+07:00`), note: value.note,
    } })
    await linkReceipt(tx,owner,'finance',entry.id,value.attachmentId)
    return { id: entry.id }
  })
}
export async function setBudget(db: PrismaClient, owner: string, key: unknown, body: unknown): Promise<Receipt> {
  const value = budgetInputSchema.parse(body)
  return ownedMutation(db, owner, 'finance.budgets.set', key, value, async tx => {
    if (!await tx.financeCategory.findFirst({ where: { ownerId: owner, id: value.categoryId, type: 'EXPENSE' } })) throw new TrackerError('CATEGORY_NOT_FOUND', 404)
    const month = new Date(`${value.month}-01T00:00:00Z`), amount = serializeThb(parseThbDecimal(value.amount))
    const record = await tx.budget.upsert({ where: { ownerId_categoryId_month: { ownerId: owner, categoryId: value.categoryId, month } },
      create: { ownerId: owner, categoryId: value.categoryId, month, amount }, update: { amount } })
    return { id: record.id }
  })
}

export async function correctEntry(db: PrismaClient, owner: string, id: unknown, key: unknown, body: unknown): Promise<Receipt> {
  const entryId = resourceIdSchema.parse(id), value = financeCorrectionSchema.parse(body)
  return ownedMutation(db, owner, 'finance.transactions.correct', key, { entryId, ...value }, async tx => {
    await mediaLock(tx)
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM finance_transactions WHERE owner_id = ${owner}::uuid AND id = ${entryId}::uuid FOR UPDATE`
    if (locked.length !== 1) throw new TrackerError('ENTRY_NOT_FOUND', 404)
    const original = await tx.financeTransaction.findUniqueOrThrow({ where: { id: entryId } })
    if (original.voidedAt) throw new TrackerError('RECORD_ALREADY_CORRECTED', 409)
    if (original.provenance !== 'USER_ENTERED') throw new TrackerError('ENTRY_NOT_FOUND', 404)
    let replacementId: string | null = null
    if (value.action === 'replace') {
      const entry = value.entry, type = entry.type === 'income' ? 'INCOME' : 'EXPENSE'
      if (!await tx.financeCategory.findFirst({ where: { ownerId: owner, id: entry.categoryId, type } })) throw new TrackerError('CATEGORY_NOT_FOUND', 404)
      const replacement = await tx.financeTransaction.create({ data: {
        ownerId: owner, categoryId: entry.categoryId, type, amount: serializeThb(parseThbDecimal(entry.amount)), currency: 'THB',
        occurredAt: new Date(`${entry.date}T00:00:00+07:00`), note: entry.note,
      } })
      replacementId = replacement.id
      if(entry.attachmentId)await linkReceipt(tx,owner,'finance',replacement.id,entry.attachmentId);else await copyReceipt(tx,owner,'finance',entryId,replacement.id)
    }
    await tx.financeTransaction.update({ where: { id: entryId }, data: { voidedAt: new Date(), voidReason: value.reason } })
    return { id: entryId, replacementId, action: value.action }
  })
}

/** Caller holds the owned portfolio lock. Only active, user-entered records affect accounting. */
async function replayScope(tx: Prisma.TransactionClient, owner: string, portfolioId: string, assetId: string): Promise<void> {
  const trades = await tx.cryptoTrade.findMany({ where: { ownerId: owner, portfolioId, assetId, quoteCurrency: 'USDT', provenance: 'USER_ENTERED', voidedAt: null },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] })
  const result = replayCryptoTrades(trades.map(t => ({ id: t.id, side: t.side === 'BUY' ? 'buy' : 'sell', quantity: cryptoForApi(t.quantity), price: cryptoForApi(t.price), fee: cryptoForApi(t.fee) })))
  for (const trade of result.trades) await tx.cryptoTrade.update({ where: { id: trade.id }, data: { gross: trade.gross, costRemoved: trade.costRemoved, realizedPnl: trade.realizedPnl } })
  const scope = { ownerId: owner, portfolioId, assetId, quoteCurrency: 'USDT' }
  const projection = { quantity: result.quantity, totalCost: result.totalCost, realizedPnl: result.realizedPnl, state: 'READY' as const, lastTradeId: trades.at(-1)?.id ?? null }
  await tx.portfolioHolding.upsert({ where: { ownerId_portfolioId_assetId_quoteCurrency: scope }, create: { ...scope, ...projection, version: 1 }, update: { ...projection, version: { increment: 1 } } })
}

export async function createPortfolio(db: PrismaClient, owner: string, key: unknown, body: unknown): Promise<Receipt> {
  const value = portfolioInputSchema.parse(body)
  return ownedMutation(db, owner, 'crypto.portfolios.create', key, value, async tx => {
    const record = await tx.cryptoPortfolio.create({ data: { ownerId: owner, ...value } })
    return { id: record.id }
  })
}
export async function createTrade(db: PrismaClient, owner: string, key: unknown, body: unknown): Promise<Receipt> {
  const value = tradeEntrySchema.parse(body)
  return ownedMutation(db, owner, 'crypto.trades.create', key, value, async tx => {
    await mediaLock(tx)
    const portfolios = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM crypto_portfolios WHERE owner_id = ${owner}::uuid AND id = ${value.portfolioId}::uuid FOR UPDATE`
    if (portfolios.length !== 1) throw new TrackerError('PORTFOLIO_NOT_FOUND', 404)
    const asset = await tx.cryptoAsset.findUnique({ where: { symbol: value.asset } })
      ?? await tx.cryptoAsset.upsert({ where: { symbol: value.asset }, create: { symbol: value.asset }, update: {} })
    const previous = await tx.cryptoTrade.findFirst({ where: { ownerId: owner, portfolioId: value.portfolioId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    const createdAt = new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1))
    const inserted = await tx.cryptoTrade.create({ data: {
      ownerId: owner, portfolioId: value.portfolioId, assetId: asset.id, quoteCurrency: 'USDT', side: value.side === 'buy' ? 'BUY' : 'SELL',
      quantity: value.quantity, price: value.price, fee: value.fee, occurredAt: new Date(`${value.date}T00:00:00+07:00`), createdAt,
    } })
    await linkReceipt(tx,owner,'crypto',inserted.id,value.attachmentId)
    await replayScope(tx, owner, value.portfolioId, asset.id)
    return { id: inserted.id }
  })
}
export async function correctTrade(db: PrismaClient, owner: string, id: unknown, key: unknown, body: unknown): Promise<Receipt> {
  const tradeId = resourceIdSchema.parse(id), value = tradeCorrectionSchema.parse(body)
  return ownedMutation(db, owner, 'crypto.trades.correct', key, { tradeId, ...value }, async tx => {
    const record = await tx.cryptoTrade.findFirst({ where: { ownerId: owner, id: tradeId, provenance: 'USER_ENTERED' } })
    if (!record) throw new TrackerError('TRADE_NOT_FOUND', 404)
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM crypto_portfolios WHERE owner_id = ${owner}::uuid AND id = ${record.portfolioId}::uuid FOR UPDATE`
    if (locked.length !== 1) throw new TrackerError('PORTFOLIO_NOT_FOUND', 404)
    const original = await tx.cryptoTrade.findUniqueOrThrow({ where: { id: tradeId } })
    if (original.voidedAt) throw new TrackerError('RECORD_ALREADY_CORRECTED', 409)
    await tx.cryptoTrade.update({ where: { id: tradeId }, data: { voidedAt: new Date(), voidReason: value.reason } })
    let replacementId: string | null = null
    if (value.action === 'replace') {
      const entry = value.entry
      const replacement = await tx.cryptoTrade.create({ data: {
        ownerId: owner, portfolioId: original.portfolioId, assetId: original.assetId, quoteCurrency: 'USDT',
        side: entry.side === 'buy' ? 'BUY' : 'SELL', quantity: entry.quantity, price: entry.price, fee: entry.fee,
        occurredAt: new Date(`${entry.date}T00:00:00+07:00`), createdAt: original.createdAt,
      } })
      replacementId = replacement.id
      if(entry.attachmentId)await linkReceipt(tx,owner,'crypto',replacement.id,entry.attachmentId);else await copyReceipt(tx,owner,'crypto',tradeId,replacement.id)
    }
    // Preserve same-day order on replacement; oversell/overflow rolls back original, replacement and receipt together.
    await replayScope(tx, owner, original.portfolioId, original.assetId)
    return { id: tradeId, replacementId, action: value.action }
  })
}
export async function cryptoOverview(db: PrismaClient, owner: string) {
  return db.$transaction(async tx => {
    const portfolios = await tx.cryptoPortfolio.findMany({ where: { ownerId: owner }, orderBy: { name: 'asc' } })
    const holdings = await tx.portfolioHolding.findMany({ where: { ownerId: owner, state: 'READY' }, include: { asset: true } })
    const trades = await tx.cryptoTrade.findMany({ where: { ownerId: owner }, include: { asset: true }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] })
    return {
      quoteCurrency: 'USDT', portfolios: portfolios.map(p => ({ id: p.id, name: p.name })),
      holdings: holdings.map(h => ({ portfolioId: h.portfolioId, asset: h.asset.symbol, quantity: cryptoForApi(h.quantity), totalCost: h.totalCost ? cryptoForApi(h.totalCost) : null,
        realizedPnl: h.realizedPnl ? cryptoForApi(h.realizedPnl) : null })),
      trades: trades.map(t => ({ id: t.id, portfolioId: t.portfolioId, asset: t.asset.symbol, side: t.side === 'BUY' ? 'buy' : 'sell',
        quantity: cryptoForApi(t.quantity), price: cryptoForApi(t.price), fee: cryptoForApi(t.fee), realizedPnl: t.realizedPnl ? cryptoForApi(t.realizedPnl) : null, date: thaiDay(t.occurredAt),
        voidedAt: t.voidedAt?.toISOString() ?? null, voidReason: t.voidReason })),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
