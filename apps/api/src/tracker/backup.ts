import { createHash, randomUUID } from 'node:crypto'
import { BACKUP_MAX_BYTES, BACKUP_MAX_ROWS, backupDocumentSchema, backupRestoreSchema, type BackupDocument, type BackupSummary } from '@finntech/contracts'
import { parseThbDecimal, parseCryptoDecimal, serializeThb, serializeCrypto,replayCryptoTrades } from '@finntech/finance'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { thbForApi, cryptoForApi } from '../persistence/decimal.js'
import { ownedMutation, thaiDay, TrackerError } from './service.js'
import { replayStockScope } from './stock-ledger.js'

type Tx = Prisma.TransactionClient
export function prepareBackup(input: unknown) {
  const backup = backupDocumentSchema.parse(input)
  if (Buffer.byteLength(JSON.stringify(backup)) > BACKUP_MAX_BYTES) throw new TrackerError('BACKUP_TOO_LARGE', 413)
  const months = new Map<string, { income: ReturnType<typeof parseThbDecimal>; expense: ReturnType<typeof parseThbDecimal> }>()
  for (const row of backup.transactions) {
    if (row.voidedAt) continue
    const month = row.date.slice(0, 7), totals = months.get(month) ?? { income: parseThbDecimal('0'), expense: parseThbDecimal('0') }
    totals[row.type] = totals[row.type].plus(row.amount); months.set(month, totals)
  }
  const scopes = new Map<string, BackupDocument['trades']>()
  for (const row of backup.trades) {
    const key = `${row.portfolioId}|${row.asset}`
    if (!scopes.has(key)) scopes.set(key, [])
    if (!row.voidedAt) scopes.get(key)!.push(row)
  }
  const results = [...scopes].sort(([a], [b]) => a.localeCompare(b)).map(([scope, rows]) => {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    const result = replayCryptoTrades(rows)
    const inputs = new Map(rows.map(row => [row.id, row]))
    for (const trade of result.trades) {
      const accounting = inputs.get(trade.id)!.accounting
      for (const field of ['gross', 'costRemoved', 'realizedPnl'] as const) {
        if (accounting[field] === null || !parseCryptoDecimal(accounting[field]).eq(trade[field])) throw new TrackerError('BACKUP_INCONSISTENT', 409)
      }
    }
    const [portfolioId, asset] = scope.split('|') as [string, string]
    return { portfolioId, asset, result, rows }
  })
  const stockScopes=new Map<string,Extract<BackupDocument,{version:3}>['stockTrades']>()
  for(const row of (backup.version===3||backup.version===4)?backup.stockTrades:[]){const scope=`${row.portfolioId}|${row.symbol}`;if(!stockScopes.has(scope))stockScopes.set(scope,[]);if(!row.voidedAt)stockScopes.get(scope)!.push(row)}
  const stockResults=[...stockScopes].sort(([a],[b])=>a.localeCompare(b)).map(([scope,rows])=>{
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));const result=replayCryptoTrades(rows)
    for(const row of result.trades){const input=rows.find(t=>t.id===row.id)!;for(const field of ['gross','costRemoved','realizedPnl'] as const)if(!parseCryptoDecimal(input.accounting[field]).eq(row[field]))throw new TrackerError('BACKUP_INCONSISTENT',409)}
    const [portfolioId,symbol]=scope.split('|') as [string,string];return {portfolioId,symbol,result}
  })
  const summary: BackupSummary = {
    counts: { categories: backup.categories.length, transactions: backup.transactions.length, cancelledTransactions: backup.transactions.filter(row => row.voidedAt).length,
      budgets: backup.budgets.length, portfolios: backup.portfolios.length, trades: backup.trades.length, cancelledTrades: backup.trades.filter(row => row.voidedAt).length },
    months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, totals]) => ({ month, income: serializeThb(totals.income), expense: serializeThb(totals.expense), balance: serializeThb(totals.income.minus(totals.expense)) })),
    holdings: results.map(({ portfolioId, asset, result }) => ({ portfolioId, asset, quantity: result.quantity, totalCost: result.totalCost, realizedPnl: result.realizedPnl })),
    cash: (backup.version !== 1 ? backup.cashAccounts : []).map(({ name, balance, currency, asOf }) => ({ name, balance: serializeThb(parseThbDecimal(balance)), currency, asOf })).sort((a, b) => a.name.localeCompare(b.name)),
    stockCounts:{portfolios:(backup.version===3||backup.version===4)?backup.stockPortfolios.length:0,trades:(backup.version===3||backup.version===4)?backup.stockTrades.length:0,cancelledTrades:(backup.version===3||backup.version===4)?backup.stockTrades.filter(row=>row.voidedAt).length:0,manualAssets:(backup.version===3||backup.version===4)?backup.manualAssets.length:0},
    stockHoldings:stockResults.map(({portfolioId,symbol,result})=>({portfolioId,symbol,quantity:result.quantity,totalCost:result.totalCost,realizedPnl:result.realizedPnl})),
    references:(backup.version===4?backup.valuationReferences:[]).map(({id:_id,...r})=>({...r,value:serializeCrypto(parseCryptoDecimal(r.value))})).sort((a,b)=>a.symbol.localeCompare(b.symbol)),
    manual:((backup.version===3||backup.version===4)?backup.manualAssets:[]).map(({asset})=>({...asset,value:serializeCrypto(parseCryptoDecimal(asset.value)),cost:asset.cost===null?null:serializeCrypto(parseCryptoDecimal(asset.cost)),quantity:asset.quantity===null?null:serializeCrypto(parseCryptoDecimal(asset.quantity))})).sort((a,b)=>a.name.localeCompare(b.name)),
  }
  const digest = createHash('sha256').update(JSON.stringify(backup)).digest('hex')
  return { backup, summary, digest, results,stockResults }
}

async function emptyDataset(tx: Tx, ownerId: string): Promise<boolean> {
  const counts = await Promise.all([tx.financeCategory.count({ where: { ownerId } }), tx.financeTransaction.count({ where: { ownerId } }),
    tx.budget.count({ where: { ownerId } }), tx.cryptoPortfolio.count({ where: { ownerId } }), tx.cryptoTrade.count({ where: { ownerId } }), tx.portfolioHolding.count({ where: { ownerId } }), tx.cashAccount.count({ where: { ownerId } }),tx.stockPortfolio.count({where:{ownerId}}),tx.stockTrade.count({where:{ownerId}}),tx.stockHolding.count({where:{ownerId}}),tx.manualAsset.count({where:{ownerId}}),tx.valuationReference.count({where:{ownerId}})])
  return counts.every(count => count === 0)
}

async function readDocument(tx: Tx, ownerId: string): Promise<BackupDocument> {
  const orderBy = { id: 'asc' as const }, take = BACKUP_MAX_ROWS + 1
  const [categories, transactions, budgets, portfolios, trades, cashAccounts,stockPortfolios,stockTrades,manualAssets,valuationReferences] = await Promise.all([
    tx.financeCategory.findMany({ where: { ownerId }, orderBy, take }), tx.financeTransaction.findMany({ where: { ownerId, provenance: 'USER_ENTERED' }, orderBy, take }),
    tx.budget.findMany({ where: { ownerId }, orderBy, take }), tx.cryptoPortfolio.findMany({ where: { ownerId }, orderBy, take }),
    tx.cryptoTrade.findMany({ where: { ownerId, provenance: 'USER_ENTERED' }, include: { asset: true }, orderBy, take }),
    tx.cashAccount.findMany({ where: { ownerId }, orderBy, take }),
    tx.stockPortfolio.findMany({where:{ownerId},orderBy,take}),tx.stockTrade.findMany({where:{ownerId},orderBy,take}),tx.manualAsset.findMany({where:{ownerId},orderBy,take}),tx.valuationReference.findMany({where:{ownerId},orderBy,take}),
  ])
  if ([categories, transactions, budgets, portfolios, trades, cashAccounts,stockPortfolios,stockTrades,manualAssets,valuationReferences].reduce((sum, rows) => sum + rows.length, 0) > BACKUP_MAX_ROWS) throw new TrackerError('BACKUP_TOO_LARGE', 413)
  return backupDocumentSchema.parse({
    format: 'FINNTECH_TRACKER_BACKUP', version: 4, provenance: 'USER_ENTERED', exportedAt: new Date().toISOString(),
    valuationReferences:valuationReferences.map(r=>({id:r.id,symbol:r.symbol,currency:r.currency,source:r.source,value:cryptoForApi(r.value),asOf:r.asOf.toISOString(),updatedAt:r.updatedAt.toISOString(),enabled:r.enabled})),
    stockPortfolios:stockPortfolios.map(row=>({id:row.id,name:row.name,quoteCurrency:'USD'})),
    stockTrades:stockTrades.map(row=>({id:row.id,portfolioId:row.portfolioId,symbol:row.symbol,side:row.side==='BUY'?'buy':'sell',quantity:cryptoForApi(row.quantity),price:cryptoForApi(row.price),fee:cryptoForApi(row.fee),quoteCurrency:'USD',date:thaiDay(row.occurredAt),createdAt:row.createdAt.toISOString(),note:row.note,voidedAt:row.voidedAt?.toISOString()??null,voidReason:row.voidReason,accounting:{gross:cryptoForApi(row.gross),costRemoved:cryptoForApi(row.costRemoved),realizedPnl:cryptoForApi(row.realizedPnl)}})),
    manualAssets:manualAssets.map(row=>({id:row.id,asset:{name:row.name,type:row.type,currency:row.currency,quantity:row.quantity===null?null:cryptoForApi(row.quantity),unit:row.unit,cost:row.cost===null?null:cryptoForApi(row.cost),value:cryptoForApi(row.value),date:row.date,note:row.note}})),
    cashAccounts: cashAccounts.map(row => ({ id: row.id, name: row.name, balance: thbForApi(row.balance), currency: 'THB', asOf: row.asOf })),
    categories: categories.map(row => ({ id: row.id, name: row.name, type: row.type === 'INCOME' ? 'income' : 'expense' })),
    transactions: transactions.map(row => ({ id: row.id, categoryId: row.categoryId, type: row.type === 'INCOME' ? 'income' : 'expense', amount: thbForApi(row.amount), currency: 'THB', date: thaiDay(row.occurredAt), note: row.note ?? '', createdAt: row.createdAt.toISOString(), voidedAt: row.voidedAt?.toISOString() ?? null, voidReason: row.voidReason })),
    budgets: budgets.map(row => ({ id: row.id, categoryId: row.categoryId, month: row.month.toISOString().slice(0, 7), amount: thbForApi(row.amount), currency: 'THB' })),
    portfolios: portfolios.map(row => ({ id: row.id, name: row.name, quoteCurrency: 'USDT' })),
    trades: trades.map(row => ({ id: row.id, portfolioId: row.portfolioId, asset: row.asset.symbol, side: row.side === 'BUY' ? 'buy' : 'sell', quantity: cryptoForApi(row.quantity), price: cryptoForApi(row.price), fee: cryptoForApi(row.fee), quoteCurrency: 'USDT', date: thaiDay(row.occurredAt), createdAt: row.createdAt.toISOString(), voidedAt: row.voidedAt?.toISOString() ?? null, voidReason: row.voidReason,
      accounting: { gross: row.gross ? cryptoForApi(row.gross) : null, costRemoved: row.costRemoved ? cryptoForApi(row.costRemoved) : null, realizedPnl: row.realizedPnl ? cryptoForApi(row.realizedPnl) : null } })),
  })
}

export async function exportBackup(db: PrismaClient, owner: string): Promise<BackupDocument> {
  return db.$transaction(async tx => {
    const plan = prepareBackup(await readDocument(tx, owner))
    const stored = await tx.portfolioHolding.findMany({ where: { ownerId: owner }, include: { asset: true } })
    for (const holding of plan.summary.holdings) {
      const row = stored.find(h => h.portfolioId === holding.portfolioId && h.asset.symbol === holding.asset)
      if (!row || row.state !== 'READY' || !row.totalCost || !row.realizedPnl
        || cryptoForApi(row.quantity) !== holding.quantity || cryptoForApi(row.totalCost) !== holding.totalCost || cryptoForApi(row.realizedPnl) !== holding.realizedPnl) throw new TrackerError('BACKUP_INCONSISTENT', 409)
    }
    if (stored.length !== plan.summary.holdings.length) throw new TrackerError('BACKUP_INCONSISTENT', 409)
    const stockStored=await tx.stockHolding.findMany({where:{ownerId:owner}})
    if(stockStored.length!==plan.summary.stockHoldings.length)throw new TrackerError('BACKUP_INCONSISTENT',409)
    for(const holding of plan.summary.stockHoldings){const row=stockStored.find(h=>h.portfolioId===holding.portfolioId&&h.symbol===holding.symbol);if(!row||cryptoForApi(row.quantity)!==holding.quantity||cryptoForApi(row.totalCost)!==holding.totalCost||cryptoForApi(row.realizedPnl)!==holding.realizedPnl)throw new TrackerError('BACKUP_INCONSISTENT',409)}
    return plan.backup
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 })
}

export async function previewBackup(db: PrismaClient, owner: string, input: unknown) {
  const plan = prepareBackup(input)
  const canRestore = await db.$transaction(tx => emptyDataset(tx, owner), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  return { digest: plan.digest, canRestore, summary: plan.summary }
}

/** Remapped UUIDs preserve lexical order, including trades tied by original timestamp. */
function idMap(rows: { id: string }[]): Map<string, string> {
  const prefix = randomUUID().slice(0, 24)
  return new Map(rows.map(row => row.id).sort().map((id, index) => [id, `${prefix}${index.toString(16).padStart(12, '0')}`]))
}

export async function restoreBackup(db: PrismaClient, owner: string, key: unknown, input: unknown) {
  const value = backupRestoreSchema.parse(input), plan = prepareBackup(value.backup)
  if (value.previewDigest !== plan.digest) throw new TrackerError('BACKUP_PREVIEW_CHANGED', 409)
  return ownedMutation(db, owner, 'backup.restore', key, { digest: plan.digest, consent: true }, async tx => {
    if (!await emptyDataset(tx, owner)) throw new TrackerError('BACKUP_TARGET_NOT_EMPTY', 409)
    const backup = plan.backup, categories = idMap(backup.categories), entries = idMap(backup.transactions), budgets = idMap(backup.budgets), portfolios = idMap(backup.portfolios), trades = idMap(backup.trades)
    if (backup.version !== 1 && backup.cashAccounts.length) await tx.cashAccount.createMany({ data: backup.cashAccounts.map(({ id: _sourceId, ...row }) => ({ id: randomUUID(), ownerId: owner, ...row })) })
    const stockPortfolios=idMap((backup.version===3||backup.version===4)?backup.stockPortfolios:[]),stockTrades=idMap((backup.version===3||backup.version===4)?backup.stockTrades:[])
    if((backup.version===3||backup.version===4)){
      if(backup.manualAssets.length)await tx.manualAsset.createMany({data:backup.manualAssets.map(row=>({id:randomUUID(),ownerId:owner,...row.asset}))})
      if(backup.stockPortfolios.length)await tx.stockPortfolio.createMany({data:backup.stockPortfolios.map(row=>({id:stockPortfolios.get(row.id)!,ownerId:owner,name:row.name,quoteCurrency:'USD'}))})
      if(backup.stockTrades.length)await tx.stockTrade.createMany({data:backup.stockTrades.map(row=>({id:stockTrades.get(row.id)!,ownerId:owner,portfolioId:stockPortfolios.get(row.portfolioId)!,symbol:row.symbol,quoteCurrency:'USD',side:row.side==='buy'?'BUY':'SELL',quantity:row.quantity,price:row.price,fee:row.fee,note:row.note,...row.accounting,occurredAt:new Date(`${row.date}T00:00:00+07:00`),createdAt:new Date(row.createdAt),voidedAt:row.voidedAt?new Date(row.voidedAt):null,voidReason:row.voidReason}))})
      for(const scope of plan.stockResults)await replayStockScope(tx,owner,stockPortfolios.get(scope.portfolioId)!,scope.symbol)
    }
    if(backup.version===4&&backup.valuationReferences.length)await tx.valuationReference.createMany({data:backup.valuationReferences.map(({id:_id,asOf,updatedAt,...r})=>({id:randomUUID(),ownerId:owner,...r,asOf:new Date(asOf),updatedAt:new Date(updatedAt)}))})
    if (backup.categories.length) await tx.financeCategory.createMany({ data: backup.categories.map(row => ({ id: categories.get(row.id)!, ownerId: owner, name: row.name, type: row.type === 'income' ? 'INCOME' : 'EXPENSE' })) })
    if (backup.transactions.length) await tx.financeTransaction.createMany({ data: backup.transactions.map(row => ({ id: entries.get(row.id)!, ownerId: owner, categoryId: categories.get(row.categoryId)!, type: row.type === 'income' ? 'INCOME' : 'EXPENSE', amount: row.amount, currency: 'THB', note: row.note, occurredAt: new Date(`${row.date}T00:00:00+07:00`), createdAt: new Date(row.createdAt), voidedAt: row.voidedAt ? new Date(row.voidedAt) : null, voidReason: row.voidReason })) })
    if (backup.budgets.length) await tx.budget.createMany({ data: backup.budgets.map(row => ({ id: budgets.get(row.id)!, ownerId: owner, categoryId: categories.get(row.categoryId)!, month: new Date(`${row.month}-01T00:00:00Z`), amount: row.amount, currency: 'THB' })) })
    if (backup.portfolios.length) await tx.cryptoPortfolio.createMany({ data: backup.portfolios.map(row => ({ id: portfolios.get(row.id)!, ownerId: owner, name: row.name, quoteCurrency: 'USDT' })) })
    const assets = new Map<string, string>()
    for (const symbol of [...new Set(backup.trades.map(row => row.asset))].sort()) {
      const asset = await tx.cryptoAsset.upsert({ where: { symbol }, create: { symbol }, update: {} }); assets.set(symbol, asset.id)
    }
    if (backup.trades.length) await tx.cryptoTrade.createMany({ data: backup.trades.map(row => ({ id: trades.get(row.id)!, ownerId: owner, portfolioId: portfolios.get(row.portfolioId)!, assetId: assets.get(row.asset)!, quoteCurrency: 'USDT', side: row.side === 'buy' ? 'BUY' : 'SELL', quantity: row.quantity, price: row.price, fee: row.fee, ...row.accounting, occurredAt: new Date(`${row.date}T00:00:00+07:00`), createdAt: new Date(row.createdAt), voidedAt: row.voidedAt ? new Date(row.voidedAt) : null, voidReason: row.voidReason })) })
    for (const scope of plan.results) {
      for (const trade of scope.result.trades) await tx.cryptoTrade.update({ where: { id: trades.get(trade.id)! }, data: { gross: trade.gross, costRemoved: trade.costRemoved, realizedPnl: trade.realizedPnl } })
      await tx.portfolioHolding.create({ data: { ownerId: owner, portfolioId: portfolios.get(scope.portfolioId)!, assetId: assets.get(scope.asset)!, quoteCurrency: 'USDT', quantity: scope.result.quantity, totalCost: scope.result.totalCost, realizedPnl: scope.result.realizedPnl, state: 'READY', version: 1, lastTradeId: scope.rows.length ? trades.get(scope.rows.at(-1)!.id)! : null } })
    }
    const verified = prepareBackup(await readDocument(tx, owner)).summary
    const inversePortfolios = new Map([...portfolios].map(([source, target]) => [target, source]))
    verified.holdings = verified.holdings.map(row => ({ ...row, portfolioId: inversePortfolios.get(row.portfolioId)! })).sort((a, b) => `${a.portfolioId}|${a.asset}`.localeCompare(`${b.portfolioId}|${b.asset}`))
    const inverseStock=new Map([...stockPortfolios].map(([source,target])=>[target,source]))
    verified.stockHoldings=verified.stockHoldings.map(row=>({...row,portfolioId:inverseStock.get(row.portfolioId)!})).sort((a,b)=>`${a.portfolioId}|${a.symbol}`.localeCompare(`${b.portfolioId}|${b.symbol}`))
    if (JSON.stringify(verified) !== JSON.stringify(plan.summary)) throw new TrackerError('BACKUP_VERIFY_FAILED', 409)
    return { digest: plan.digest, summary: plan.summary }
  }, 'exclusive')
}
