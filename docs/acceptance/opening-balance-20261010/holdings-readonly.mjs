// READ-ONLY check of recorded holdings on the production database (no writes, no secrets printed).
// mode "owners": counts per owner. mode "detail <ownerId>": that owner's cash, holdings and ledger replay check.
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const root='C:/Users/Admin/Downloads/FINNTECH',release=path.join(root,'.student-real-20261008.local/release-source')
process.loadEnvFile(path.join(root,'.student-real-20261008.local/cloud.env'))
const {readAuthConfiguration}=await import(pathToFileURL(path.join(release,'apps/api/dist/auth/config.js')).href)
const {createTrackerDatabase}=await import(pathToFileURL(path.join(release,'apps/api/dist/persistence/database.js')).href)
const {assertRealBoundary}=await import(pathToFileURL(path.join(release,'apps/api/dist/auth/real.js')).href)
const {cryptoForApi}=await import(pathToFileURL(path.join(release,'apps/api/dist/persistence/decimal.js')).href)
const {replayCryptoTrades}=await import(pathToFileURL(path.join(release,'packages/finance/dist/index.js')).href)
const config=readAuthConfiguration(process.env)
if(config?.origin!=='https://finntech-personal.onrender.com'||config.real?.boundary!=='real')throw new Error('TARGET_REFUSED')
const db=createTrackerDatabase(config.databaseUrl)
try{
 await assertRealBoundary(db,config.real,config.origin)
 const dec=v=>v===null?null:cryptoForApi(v)
 if(process.argv[2]==='owners'){
  const owners=await db.trackerUser.findMany({select:{id:true}})
  const rows=[]
  for(const {id} of owners){
   const c={cash:await db.cashAccount.count({where:{ownerId:id}}),stockTrades:await db.stockTrade.count({where:{ownerId:id}}),cryptoTrades:await db.cryptoTrade.count({where:{ownerId:id}}),finance:await db.financeTransaction.count({where:{ownerId:id}}),manual:await db.manualAsset.count({where:{ownerId:id}}),key:!!await db.ownerMarketKey.findFirst({where:{ownerId:id,status:'ACTIVE'}})}
   if(Object.values(c).some(v=>v))rows.push({ownerId:id,...c})
  }
  console.log(JSON.stringify(rows,null,1))
 }else if(process.argv[2]==='detail'){
  const owner=process.argv[3]
  const cash=(await db.cashAccount.findMany({where:{ownerId:owner},orderBy:{name:'asc'}})).map(r=>({id:r.id,name:r.name,balance:dec(r.balance),asOf:r.asOf}))
  const linked=async(model,accountId)=>model.findMany({where:{ownerId:owner,cashAccountId:accountId,voidedAt:null}})
  for(const a of cash){
   const f=await linked(db.financeTransaction,a.id),c=await linked(db.cryptoTrade,a.id),s=await linked(db.stockTrade,a.id)
   const sum=f.reduce((n,r)=>n+(r.type==='INCOME'?1:-1)*Number(r.amount),0)+[...c,...s].reduce((n,r)=>n+(r.side==='SELL'?1:-1)*Number(r.cashAmountThb),0)
   a.linkedRecords=f.length+c.length+s.length;a.linkedNetThb=sum.toFixed(2);a.impliedOpeningThb=(Number(a.balance)-sum).toFixed(2)
  }
  const stockHold=await db.stockHolding.findMany({where:{ownerId:owner}}),stockPf=await db.stockPortfolio.findMany({where:{ownerId:owner}})
  const stocks=[]
  for(const h of stockHold){
   const trades=await db.stockTrade.findMany({where:{ownerId:owner,portfolioId:h.portfolioId,symbol:h.symbol,voidedAt:null},orderBy:[{occurredAt:'asc'},{createdAt:'asc'},{id:'asc'}]})
   const replay=replayCryptoTrades(trades.map(t=>({id:t.id,side:t.side==='BUY'?'buy':'sell',quantity:dec(t.quantity),price:dec(t.price),fee:dec(t.fee)})))
   stocks.push({portfolio:stockPf.find(p=>p.id===h.portfolioId)?.name,symbol:h.symbol,quantity:dec(h.quantity),totalCostUsd:dec(h.totalCost),replayQuantity:replay.quantity,replayCost:replay.totalCost,matches:replay.quantity===Number(h.quantity).toString()||Number(replay.quantity)===Number(h.quantity)})
  }
  const cryptoHold=await db.portfolioHolding.findMany({where:{ownerId:owner},include:{asset:true}}),cryptoPf=await db.cryptoPortfolio.findMany({where:{ownerId:owner}})
  const crypto=[]
  for(const h of cryptoHold){
   const trades=await db.cryptoTrade.findMany({where:{ownerId:owner,portfolioId:h.portfolioId,assetId:h.assetId,provenance:'USER_ENTERED',voidedAt:null},orderBy:[{occurredAt:'asc'},{createdAt:'asc'},{id:'asc'}]})
   const replay=replayCryptoTrades(trades.map(t=>({id:t.id,side:t.side==='BUY'?'buy':'sell',quantity:dec(t.quantity),price:dec(t.price),fee:dec(t.fee)})))
   crypto.push({portfolio:cryptoPf.find(p=>p.id===h.portfolioId)?.name,asset:h.asset.symbol,quantity:dec(h.quantity),totalCostUsdt:dec(h.totalCost),replayQuantity:replay.quantity,matches:Number(replay.quantity)===Number(h.quantity)})
  }
  const manual=(await db.manualAsset.findMany({where:{ownerId:owner}})).map(r=>({name:r.name,type:r.type,currency:r.currency,value:dec(r.value),date:r.date,archived:r.archived}))
  const refs=(await db.valuationReference.findMany({where:{ownerId:owner}})).map(r=>({symbol:r.symbol,value:dec(r.value),asOf:r.asOf.toISOString(),enabled:r.enabled}))
  console.log(JSON.stringify({cash,stocks,crypto,manual,manualPriceOverrides:refs},null,1))
 }else throw new Error('MODE_REQUIRED')
}finally{await db.$disconnect()}
