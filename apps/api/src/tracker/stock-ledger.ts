import {linkReceipt,copyReceipt,mediaLock} from '../media/store.js'
import { stockPortfolioInputSchema,stockTradeEntrySchema,stockCorrectionSchema,resourceIdSchema,STOCK_INSTRUMENTS } from '@finntech/contracts'
import { replayCryptoTrades } from '@finntech/finance'
import { Prisma,type PrismaClient } from '../generated/prisma/client.js'
import { cryptoForApi } from '../persistence/decimal.js'
import { ownedMutation,TrackerError,thaiDay } from './service.js'
type Tx=Prisma.TransactionClient
async function lock(tx:Tx,owner:string,portfolioId:string){
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM stock_portfolios WHERE owner_id=${owner}::uuid AND id=${portfolioId}::uuid FOR UPDATE`
 if(rows.length!==1)throw new TrackerError('PORTFOLIO_NOT_FOUND',404)
}
export async function replayStockScope(tx:Tx,owner:string,portfolioId:string,symbol:string){
 const rows=await tx.stockTrade.findMany({where:{ownerId:owner,portfolioId,symbol,voidedAt:null},orderBy:[{occurredAt:'asc'},{createdAt:'asc'},{id:'asc'}]})
 // Same Decimal weighted-average kernel; USD scopes never mix with crypto USDT scopes.
 const result=replayCryptoTrades(rows.map(t=>({id:t.id,side:t.side==='BUY'?'buy':'sell',quantity:cryptoForApi(t.quantity),price:cryptoForApi(t.price),fee:cryptoForApi(t.fee)})))
 for(const row of result.trades)await tx.stockTrade.update({where:{id:row.id},data:{gross:row.gross,costRemoved:row.costRemoved,realizedPnl:row.realizedPnl}})
 const scope={ownerId:owner,portfolioId,symbol},data={quantity:result.quantity,totalCost:result.totalCost,realizedPnl:result.realizedPnl}
 await tx.stockHolding.upsert({where:{ownerId_portfolioId_symbol:scope},create:{...scope,...data,quoteCurrency:'USD'},update:data})
}
export async function createStockPortfolio(db:PrismaClient,owner:string,key:unknown,body:unknown){
 const value=stockPortfolioInputSchema.parse(body)
 return ownedMutation(db,owner,'stocks.portfolios.create',key,value,async tx=>({id:(await tx.stockPortfolio.create({data:{ownerId:owner,...value}})).id}))
}
export async function createStockTrade(db:PrismaClient,owner:string,key:unknown,body:unknown){
 const value=stockTradeEntrySchema.parse(body)
 return ownedMutation(db,owner,'stocks.trades.create',key,value,async tx=>{
  await mediaLock(tx);await lock(tx,owner,value.portfolioId)
  const identity=await tx.stockInstrument.findUnique({where:{symbol:value.symbol}})
  if(!identity||identity.currency!=='USD'||!STOCK_INSTRUMENTS.some(row=>row.symbol===identity.symbol))throw new TrackerError('INSTRUMENT_UNAVAILABLE',422)
  const prior=await tx.stockTrade.findFirst({where:{ownerId:owner,portfolioId:value.portfolioId},orderBy:{createdAt:'desc'}})
  const {date,attachmentId,...entry}=value
  const inserted=await tx.stockTrade.create({data:{ownerId:owner,...entry,side:value.side==='buy'?'BUY':'SELL',gross:'0',costRemoved:'0',realizedPnl:'0',occurredAt:new Date(`${date}T00:00:00+07:00`),createdAt:new Date(Math.max(Date.now(),(prior?.createdAt.getTime()??0)+1))}})
  await linkReceipt(tx,owner,'stock',inserted.id,attachmentId);await replayStockScope(tx,owner,value.portfolioId,value.symbol);return {id:inserted.id}
 })
}
export async function correctStockTrade(db:PrismaClient,owner:string,id:unknown,key:unknown,body:unknown){
 const tradeId=resourceIdSchema.parse(id),value=stockCorrectionSchema.parse(body)
 return ownedMutation(db,owner,'stocks.trades.correct',key,{tradeId,...value},async tx=>{
  const row=await tx.stockTrade.findFirst({where:{ownerId:owner,id:tradeId}});if(!row)throw new TrackerError('TRADE_NOT_FOUND',404)
  await lock(tx,owner,row.portfolioId)
  const original=await tx.stockTrade.findUniqueOrThrow({where:{id:tradeId}})
  if(original.voidedAt)throw new TrackerError('RECORD_ALREADY_CORRECTED',409)
  await tx.stockTrade.update({where:{id:tradeId},data:{voidedAt:new Date(),voidReason:value.reason}})
  let replacementId:string|null=null
  if(value.action==='replace'){
   const {date,attachmentId,...entry}=value.entry
   replacementId=(await tx.stockTrade.create({data:{ownerId:owner,portfolioId:original.portfolioId,symbol:original.symbol,...entry,side:entry.side==='buy'?'BUY':'SELL',gross:'0',costRemoved:'0',realizedPnl:'0',occurredAt:new Date(`${date}T00:00:00+07:00`),createdAt:original.createdAt}})).id
   if(attachmentId)await linkReceipt(tx,owner,'stock',replacementId,attachmentId);else await copyReceipt(tx,owner,'stock',tradeId,replacementId)
  }
  await replayStockScope(tx,owner,original.portfolioId,original.symbol);return {id:tradeId,replacementId,action:value.action}
 })
}
export async function stockOverview(db:PrismaClient,owner:string){
 return db.$transaction(async tx=>{
  const [portfolios,holdings,trades]=await Promise.all([tx.stockPortfolio.findMany({where:{ownerId:owner},orderBy:{name:'asc'}}),tx.stockHolding.findMany({where:{ownerId:owner}}),tx.stockTrade.findMany({where:{ownerId:owner},orderBy:[{occurredAt:'desc'},{createdAt:'desc'},{id:'desc'}]})])
  return {quoteCurrency:'USD',portfolios:portfolios.map(row=>({id:row.id,name:row.name})),holdings:holdings.map(row=>({portfolioId:row.portfolioId,symbol:row.symbol,quantity:cryptoForApi(row.quantity),totalCost:cryptoForApi(row.totalCost),realizedPnl:cryptoForApi(row.realizedPnl)})),trades:trades.map(row=>({id:row.id,portfolioId:row.portfolioId,symbol:row.symbol,side:row.side==='BUY'?'buy':'sell',quantity:cryptoForApi(row.quantity),price:cryptoForApi(row.price),fee:cryptoForApi(row.fee),quoteCurrency:'USD',note:row.note,date:thaiDay(row.occurredAt),realizedPnl:cryptoForApi(row.realizedPnl),voidedAt:row.voidedAt?.toISOString()??null,voidReason:row.voidReason}))}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
