import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {after,before,test} from 'node:test'
import {WebSocket} from 'ws'
import {portfolioTestTarget} from '../../../scripts/portfolio-db-target.mjs'
import {createTrackerDatabase} from '../src/persistence/database.js'
import {createAuthRuntime} from '../src/auth/runtime.js'
import {createApp} from '../src/app.js'
import {MarketRelay} from '../src/tracker/market.js'
import {attachMarketStream} from '../src/tracker/stream.js'
import {prepareBackup,restoreBackup} from '../src/tracker/backup.js'
import {DailyUsdRelay} from '../src/tracker/usd-fx.js'
const target=portfolioTestTarget(process.env),db=createTrackerDatabase(target.href),origin='http://127.0.0.1:4311'
const auth=createAuthRuntime(db,{databaseUrl:target.href,secret:randomUUID()+randomUUID(),origin,secureCookies:false})
const market=new MarketRelay(async()=>{throw Error('integration uses deterministic provider tests separately')})
const usdFx=new DailyUsdRelay(async()=>{throw Error('isolated provider failure; manual fallback remains usable')})
const server=createApp({auth,database:db,market,usdFx}).listen(4311,'127.0.0.1'),stop=attachMarketStream(server,auth,market)
const listening=once(server,'listening')
const jars=['',''],owners:[string,string]=['',''],accounts=[0,1].map(i=>({email:`portfolio-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),name:`Synthetic portfolio ${i}`}))
async function api(path:string,body?:unknown,index=0,key=randomUUID(),method='POST',requestOrigin=origin){
 const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:requestOrigin,Cookie:jars[index]!,'Content-Type':'application/json','Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)})
 const cookie=r.headers.getSetCookie().find(s=>s.startsWith('finntech.session_token='));if(cookie)jars[index]=cookie.split(';')[0]!
 return {status:r.status,body:await r.json() as any}
}
let portfolio='',buy='',sell='',exported:any
const entry={symbol:'AAPL',side:'buy',quantity:'0.5',price:'100',fee:'1',date:'2026-10-08',note:'Synthetic history only',quoteCurrency:'USD'}
before(async()=>{await listening;for(let i=0;i<2;i++){assert.equal((await api('auth/sign-up/email',accounts[i],i)).status,200);const me=await api('me',undefined,i);assert.equal(me.status,200);owners[i]=me.body.ownerId}assert.notEqual(owners[0],owners[1])})
after(async()=>{stop();market.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.$disconnect()})
test('genuine isolated auth and USD fractional ledger: double submission creates one audited receipt',async()=>{
 assert.equal((await api('cash',{name:'Synthetic existing cash',balance:'1000',currency:'THB',asOf:'2026-10-08'})).status,200)
 const p=await api('stocks/portfolios',{name:'US notebook',quoteCurrency:'USD'});assert.equal(p.status,200);portfolio=p.body.id
 const key=randomUUID(),body={...entry,portfolioId:portfolio}
 const [a,b]=await Promise.all([api('stocks/trades',body,0,key),api('stocks/trades',body,0,key)]);assert.equal(a.status,200);assert.deepEqual(a,b);buy=a.body.id
 const snapshot=await api('stocks');assert.equal(snapshot.body.trades.length,1);assert.equal(snapshot.body.holdings[0].quantity,'0.5');assert.equal(snapshot.body.holdings[0].totalCost,'51')
 assert.equal(await db.auditEvent.count({where:{ownerId:owners[0],requestId:key}}),1)
 assert.equal((await api('stocks/trades',{...body,price:'101'},0,key)).status,409)
})
test('two-owner read/write isolation, exact origin and oversized body remain guarded',async()=>{
 assert.equal((await api('stocks',undefined,1)).body.trades.length,0)
 assert.equal((await api('stocks/trades',{...entry,portfolioId:portfolio},1)).status,404)
 assert.equal((await api(`stocks/trades/${buy}/corrections`,{action:'void',reason:'foreign'},1)).status,404)
 assert.equal((await api('stocks/trades',{...entry,portfolioId:portfolio},0,randomUUID(),'POST','https://evil.invalid')).status,403)
 assert.equal((await api('stocks/trades',{...entry,portfolioId:portfolio,note:'x'.repeat(70000)})).status,413)
})
test('sell fee/weighted-average realized P&L, oversell and backdating roll back atomically',async()=>{
 const result=await api('stocks/trades',{...entry,portfolioId:portfolio,side:'sell',quantity:'0.25',price:'120',fee:'0.5'});assert.equal(result.status,200);sell=result.body.id
 const snapshot=await api('stocks');assert.equal(snapshot.body.holdings[0].quantity,'0.25');assert.equal(snapshot.body.holdings[0].totalCost,'25.5');assert.equal(snapshot.body.holdings[0].realizedPnl,'4')
 const before=await db.stockTrade.count(),receipts=await db.idempotencyKey.count()
 assert.equal((await api('stocks/trades',{...entry,portfolioId:portfolio,side:'sell',quantity:'0.26'})).status,422)
 assert.equal((await api('stocks/trades',{...entry,portfolioId:portfolio,side:'sell',quantity:'0.1',date:'2026-10-07'})).status,422)
 assert.equal(await db.stockTrade.count(),before);assert.equal(await db.idempotencyKey.count(),receipts)
})
test('correction preserves order/audit; invalid void keeps original; successful void keeps history',async()=>{
 assert.equal((await api(`stocks/trades/${buy}/corrections`,{action:'void',reason:'would oversell'})).status,422)
 assert.equal((await db.stockTrade.findUniqueOrThrow({where:{id:buy}})).voidedAt,null)
 const {symbol:_symbol,...replacement}=entry
 const corrected=await api(`stocks/trades/${buy}/corrections`,{action:'replace',reason:'correct cost',entry:{...replacement,price:'110'}});assert.equal(corrected.status,200)
 assert.ok((await db.stockTrade.findUniqueOrThrow({where:{id:buy}})).voidedAt)
 const s=await api('stocks');assert.equal(s.body.holdings[0].realizedPnl,'1.5')
 assert.equal((await api(`stocks/trades/${sell}/corrections`,{action:'void',reason:'cancel synthetic sale'})).status,200)
 assert.equal((await api('stocks')).body.holdings[0].quantity,'0.5')
})
test('manual assets persist, precision/unit validation, optimistic version and ownership',async()=>{
 const asset={name:'Synthetic gold',type:'GOLD',currency:'THB',quantity:'10',unit:'กรัม',cost:'10000',value:'12000.10',date:'2026-10-08',note:'Manual dated estimate'}
 const r=await api('assets/manual',asset);assert.equal(r.status,200)
 assert.equal((await api('assets/manual',undefined,1)).body.assets.length,0)
 assert.equal((await api(`assets/manual/${r.body.id}`,{asset,expectedVersion:1},1,randomUUID(),'PATCH')).status,409)
 assert.equal((await api('assets/manual',{...asset,name:'bad precision',value:'1.001'})).status,422)
 assert.equal((await api('assets/manual',{...asset,name:'missing unit',unit:''})).status,422)
 assert.equal((await api(`assets/manual/${r.body.id}`,{asset:{...asset,value:'12500'},expectedVersion:1},0,randomUUID(),'PATCH')).status,200)
 assert.equal((await api(`assets/manual/${r.body.id}`,{asset,expectedVersion:1},0,randomUUID(),'PATCH')).status,409)
 assert.equal((await api('cash')).body.accounts[0].balance,'1000')
})
test('owner references persist, lost response/double submission keeps one receipt, overrides are reversible and origins guarded',async()=>{
 const ref={symbol:'AAPL',currency:'USD',value:'123.456',asOf:new Date(Date.now()-60000).toISOString(),enabled:true,expectedVersion:null},key=randomUUID()
 const [a,b]=await Promise.all([api('valuation/references',ref,0,key),api('valuation/references',ref,0,key)])
 assert.equal(a.status,200);assert.deepEqual(a,b);assert.deepEqual(await api('valuation/references',ref,0,key),a)
 assert.equal(await db.valuationReference.count({where:{ownerId:owners[0],symbol:'AAPL'}}),1)
 assert.equal(await db.auditEvent.count({where:{ownerId:owners[0],requestId:key}}),1)
 assert.equal((await api('valuation/references',undefined,1)).body.references.length,0)
 assert.equal((await api('valuation/references',{...ref,expectedVersion:1},1)).status,409)
 assert.equal((await api('valuation/references',{...ref,currency:'THB',expectedVersion:1})).status,422)
 assert.equal((await api('valuation/references',{...ref,asOf:new Date(Date.now()+60000).toISOString(),expectedVersion:1})).status,422)
 assert.equal((await api('valuation/references',{...ref,value:'124'},0,key)).status,409)
 assert.equal((await api('valuation/references',{...ref,expectedVersion:1},0,randomUUID(),'POST','https://evil.invalid')).status,403)
 assert.equal((await api('valuation/references',{...ref,expectedVersion:1,enabled:false})).status,200)
 assert.equal((await api('valuation/references',{...ref,expectedVersion:1})).status,409)
 assert.equal((await api('valuation/references',{symbol:'USDTHB',currency:'THB',value:'35.125',asOf:ref.asOf,enabled:true,expectedVersion:null})).status,200)
 const data=(await api('valuation/references')).body
 assert.equal(data.references.length,2);assert.equal(data.references[0].enabled,false);assert.equal(data.references[0].asOf,ref.asOf)
 const row=await db.valuationReference.findUniqueOrThrow({where:{id:a.body.id}})
 await assert.rejects(db.valuationReference.update({where:{id:row.id},data:{ownerId:owners[1]}}))
 await assert.rejects(db.valuationReference.delete({where:{id:row.id}}))
 assert.equal(data.usdThb.source,'ECB')
})
test('v4 backup roundtrip remaps owner, includes canceled stocks/manual/references and forbids credential fields',async()=>{
 exported=(await api('backup')).body;assert.equal(exported.version,4);assert.equal(exported.stockTrades.length,3);assert.equal(exported.manualAssets.length,1);assert.equal(exported.valuationReferences.length,2)
 assert.throws(()=>prepareBackup({...exported,password:'forbidden'}))
 assert.throws(()=>prepareBackup({...exported,stockTrades:exported.stockTrades.map((t:any)=>({...t,accounting:{...t.accounting,gross:'999'}}))}))
 const preview=await api('backup/preview',exported,1);assert.equal(preview.body.canRestore,true)
 const key=randomUUID(),body={backup:exported,consent:true,previewDigest:preview.body.digest},restored=await api('backup/restore',body,1,key)
 assert.equal(restored.status,200);assert.deepEqual((await api('backup/restore',body,1,key)).body,restored.body)
 const other=await api('stocks',undefined,1);assert.equal(other.body.holdings[0].quantity,'0.5');assert.equal(other.body.holdings[0].totalCost,'56')
 assert.notEqual(other.body.portfolios[0].id,portfolio);assert.equal((await api('backup/preview',exported,1)).body.canRestore,false)
 const restoredRefs=(await api('valuation/references',undefined,1)).body.references
 assert.equal(restoredRefs.length,2);assert.notEqual(restoredRefs[0].id,exported.valuationReferences[0].id)
 for(const r of restoredRefs){const original=exported.valuationReferences.find((x:any)=>x.symbol===r.symbol);assert.equal(r.asOf,original.asOf);assert.equal(r.updatedAt,original.updatedAt);assert.equal(r.value,original.value);assert.equal(r.enabled,original.enabled)}
})
test('v2 remains readable, new dataset emptiness blocks older restores, receipt mismatch refuses write',async()=>{
 const {stockPortfolios:_p,stockTrades:_t,manualAssets:_m,valuationReferences:_r,...old}=exported,backup={...old,version:2}
 const {valuationReferences:_refs,...v3}=exported;assert.equal(prepareBackup({...v3,version:3}).summary.stockHoldings.length,1)
 assert.equal(prepareBackup(backup).summary.stockHoldings.length,0)
 assert.equal((await api('backup/preview',backup)).body.canRestore,false)
 const preview=await api('backup/preview',backup,1)
 assert.equal((await api('backup/restore',{backup,consent:true,previewDigest:preview.body.digest},1)).status,409)
 assert.equal((await api('backup/restore',{backup:exported,consent:true,previewDigest:'a'.repeat(64)},1)).status,409)
})
test('SQL owner immutability/composite FKs and original stock history remain guarded',async()=>{
 await assert.rejects(db.stockPortfolio.update({where:{id:portfolio},data:{ownerId:owners[1]}}))
 await assert.rejects(db.stockTrade.update({where:{id:buy},data:{price:'1'}}))
 await assert.rejects(db.stockTrade.delete({where:{id:buy}}))
 await assert.rejects(db.stockTrade.create({data:{ownerId:owners[1]!,portfolioId:portfolio,symbol:'AAPL',side:'BUY',quantity:'1',price:'1',fee:'0',gross:'1',costRemoved:'0',realizedPnl:'0',occurredAt:new Date()}}))
 const original=await api('stocks');assert.equal(original.body.portfolios[0].id,portfolio)
})
test('a fault after manual/stock inserts rolls back the entire restore and receipt; identical-key retry succeeds',async()=>{
 const account={name:'Synthetic restore rollback',email:`rollback-${randomUUID()}@example.test`,password:randomUUID()+randomUUID()}
 jars.push('');assert.equal((await api('auth/sign-up/email',account,2)).status,200)
 const owner=(await api('me',undefined,2)).body.ownerId,plan=prepareBackup(exported),key=randomUUID(),input={backup:exported,consent:true,previewDigest:plan.digest}
 const fault=new Proxy(db,{get(target,property){if(property==='$transaction')return (run:any,options:any)=>target.$transaction(tx=>run(new Proxy(tx,{get(scope,p){if(p==='stockTrade')return new Proxy(scope.stockTrade,{get(model,m){if(m==='createMany')return async()=>{throw Error('synthetic mid-import fault')};return Reflect.get(model,m)}});return Reflect.get(scope,p)}})),options);return Reflect.get(target,property)}})
 await assert.rejects(restoreBackup(fault,owner,key,input),/synthetic mid-import fault/)
 for(const model of [db.cashAccount,db.manualAsset,db.stockPortfolio,db.stockTrade,db.stockHolding,db.idempotencyKey,db.auditEvent] as any[])assert.equal(await model.count({where:{ownerId:owner}}),0)
 assert.equal((await api('backup/restore',input,2,key)).status,200)
 assert.equal((await api('stocks',undefined,2)).body.holdings[0].totalCost,'56')
})
test('approved privacy replay purges only its synthetic owner including new assets; rejected boundaries and rollback preserve everyone',async()=>{
 const identity=await db.authIdentity.findFirstOrThrow({where:{ownerId:owners[1]}}),owner=owners[1]!,user=identity.authUserId!
 const counts=await Promise.all([db.stockTrade.count(),db.manualAsset.count(),db.authUser.count()])
 // Transaction rolls back even the approved synthetic purge: no retained dataset is deleted.
 await assert.rejects(db.$transaction(async tx=>{
  await tx.runtimeBoundary.create({data:{id:'singleton',mode:'real-rehearsal',databaseName:'synthetic_prior_archive',databaseRole:'synthetic_application_role',origin}})
  await assert.rejects(tx.$queryRaw`SELECT tracker_purge_owner_case(${randomUUID()}::uuid)`)
  throw Error('rejected operator rollback')
 }),/rejected operator rollback/)
 await assert.rejects(db.$transaction(async tx=>{
  await tx.runtimeBoundary.create({data:{id:'singleton',mode:'real-rehearsal',databaseName:'synthetic_prior_archive',databaseRole:'synthetic_application_role',origin}})
  await tx.privacyOperator.create({data:{roleName:target.username}})
  await tx.authRecoveryEnrollment.upsert({where:{userId:user},create:{userId:user,blocked:false},update:{blocked:false}})
  const result=await tx.$queryRaw<{tracker_replay_deletion:string}[]>`SELECT tracker_replay_deletion(${randomUUID()}::uuid,${owner}::uuid,${user}::uuid,${new Date()}::timestamptz,'synthetic_archive_20261009',${'a'.repeat(64)})`
  assert.equal(result[0]?.tracker_replay_deletion,'PURGED')
  for(const model of [tx.stockPortfolio,tx.stockTrade,tx.stockHolding,tx.manualAsset,tx.valuationReference] as any[])assert.equal(await model.count({where:{ownerId:owner}}),0)
  assert.ok(await tx.stockTrade.count({where:{ownerId:owners[0]}})>0)
  assert.equal(await tx.authUser.count({where:{id:user}}),0)
  throw Error('approved synthetic purge rollback')
 },{timeout:15000}),/approved synthetic purge rollback/)
 assert.deepEqual(await Promise.all([db.stockTrade.count(),db.manualAsset.count(),db.authUser.count()]),counts)
 assert.equal((await api('stocks',undefined,1)).status,200)
})
test('anonymous HTTP/WS blocked, authenticated WS accepted, logout revokes HTTP and active transport',async()=>{
 const denied=await fetch(origin+'/api/stocks');assert.equal(denied.status,401)
 const rejected=new WebSocket('ws://127.0.0.1:4311/ws/market',{origin});await new Promise<void>(resolve=>{rejected.on('unexpected-response',(_r,res)=>{assert.equal(res.statusCode,401);res.destroy();rejected.terminate();resolve()});rejected.on('error',()=>{})})
 const socket=new WebSocket('ws://127.0.0.1:4311/ws/market',{origin,headers:{Cookie:jars[0]!}});await once(socket,'open')
 const closed=once(socket,'close');assert.equal((await api('auth/sign-out',{})).status,200);assert.equal((await api('stocks')).status,401)
 await Promise.race([closed,new Promise((_,reject)=>{const timer=setTimeout(()=>{socket.terminate();reject(Error('revocation deadline'))},8000);timer.unref()})])
 assert.equal((await api('auth/sign-in/email',accounts[0])).status,200);assert.equal((await api('stocks')).body.portfolios[0].id,portfolio)
})
