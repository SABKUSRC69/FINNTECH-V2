// SYNTHETIC: real PostgreSQL + real Better Auth sessions, but the Tiingo upstream is a local fake.
// This proves storage, sharing, licence scoping and isolation — NOT that a real provider answered.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {after,before,test} from 'node:test'
import {summarizeStockHoldings} from '@finntech/finance'
import {createTrackerDatabase} from '../src/persistence/database.js'
import {createAuthRuntime} from '../src/auth/runtime.js'
import {createApp} from '../src/app.js'
import {MarketRelay} from '../src/tracker/market.js'
import {DailyUsdRelay} from '../src/tracker/usd-fx.js'
import {exportBackup} from '../src/tracker/backup.js'
import {createHash} from 'node:crypto'
import {DailyCloseRelay,TiingoDailyProvider,prismaDailyCloseStore,type DailyCloseConfiguration} from '../src/tracker/daily-close.js'
import {MarketKeyCipher,PersonalDailyCloses} from '../src/tracker/market-keys.js'

function target(env:NodeJS.ProcessEnv){
 const url=new URL(env.DATABASE_URL??'postgresql://invalid')
 if(env.FINNTECH_DAILY_CLOSE_TEST!=='synthetic-only'||url.hostname!=='127.0.0.1'||url.port!=='5452'||url.pathname!=='/finntech_daily_close_test'||url.username!=='daily_close_synthetic')throw Error('Refused non-synthetic daily-close target')
 return url
}
const url=target(process.env),db=createTrackerDatabase(url.href),origin='http://127.0.0.1:4331'
const authSecret=randomUUID()+randomUUID(),auth=createAuthRuntime(db,{databaseUrl:url.href,secret:authSecret,origin,secureCookies:false})
const TOKEN='SyntheticIntegrationToken0123456789',PERSONAL='SyntheticPersonalTokenA0123456789xyz',WRONG='SyntheticWrongToken0123456789abcdef'
const clock=()=>Date.parse('2026-10-09T23:00:00Z') // Fri 19:00 New York: Friday's close is expected
const closes:Record<string,string>={AAPL:'227.5',MSFT:'410.1',NVDA:'120.25',AMZN:'180',GOOGL:'160.5',TSLA:'250',SPY:'600.125',QQQ:'500'}
const upstream:string[]=[],personalUpstream:string[]=[]
const fakeTiingo=(async(input:unknown,init:RequestInit)=>{
 const u=new URL(String(input)),symbol=u.pathname.split('/')[3]!.toUpperCase()
 const auth=(init.headers as Record<string,string>).Authorization;assert.ok(!String(input).includes(TOKEN)&&!String(input).includes(PERSONAL))
 if(auth!==`Token ${TOKEN}`&&auth!==`Token ${PERSONAL}`)return new Response('{"detail":"Invalid token"}',{status:401})
 if(auth===`Token ${PERSONAL}`){personalUpstream.push(symbol);return new Response(`[{"date":"2026-10-09T00:00:00.000Z","close":${Number(closes[symbol])+100},"adjClose":1}]`)}
 upstream.push(symbol)
 // adjClose deliberately differs: valuation must use the raw close.
 return new Response(`[{"date":"2026-10-08T00:00:00.000Z","close":1,"adjClose":1},{"date":"2026-10-09T00:00:00.000Z","close":${closes[symbol]},"adjClose":${Number(closes[symbol])-5}}]`)
}) as typeof fetch
const config=(over:Partial<DailyCloseConfiguration>={}):DailyCloseConfiguration=>({provider:'tiingo',token:TOKEN,license:'REDISTRIBUTION',ownerId:null,symbols:Object.keys(closes),maxRequestsPerHour:40,maxRequestsPerDay:500,...over})
const logs:string[]=[]
const shared=new DailyCloseRelay(config(),new TiingoDailyProvider(TOKEN,fakeTiingo),prismaDailyCloseStore(db),clock,l=>logs.push(l))
const market=new MarketRelay(async()=>{throw Error('not used')}),usdFx=new DailyUsdRelay(async()=>{throw Error('isolated: ECB not contacted')})
const personalCloses=new PersonalDailyCloses(db,new MarketKeyCipher(authSecret),token=>new TiingoDailyProvider(token,fakeTiingo),clock,l=>logs.push(l))
const server=createApp({auth,database:db,market,usdFx,dailyCloses:shared,personalCloses}).listen(4331,'127.0.0.1')
const jars=['',''],owners=['',''],accounts=[0,1].map(i=>({email:`daily-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),name:`Synthetic daily ${i}`}))
async function api(path:string,body?:unknown,index=0,base=origin,key=randomUUID()){
 const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:jars[index]!,'Content-Type':'application/json','Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)})
 const cookie=r.headers.getSetCookie().find(s=>s.startsWith('finntech.session_token='));if(cookie)jars[index]=cookie.split(';')[0]!
 const text=await r.text();return {status:r.status,text,body:text?JSON.parse(text):null}
}
const evidence:Record<string,unknown>={kind:'SYNTHETIC upstream; real PostgreSQL and auth'}
before(async()=>{await once(server,'listening');for(let i=0;i<2;i++){assert.equal((await api('auth/sign-up/email',accounts[i],i)).status,200);owners[i]=(await api('me',undefined,i)).body.ownerId}})
after(async()=>{shared.stop();market.stop();await new Promise<void>(r=>server.close(()=>r()));await db.$disconnect();if(process.env.FINNTECH_DAILY_CLOSE_EVIDENCE)await import('node:fs').then(fs=>fs.writeFileSync(process.env.FINNTECH_DAILY_CLOSE_EVIDENCE!,JSON.stringify(evidence,null,2)))})

test('migration constraints reject non-closing data at the database layer',async()=>{
 const insert=(date:string,close:string,currency='USD',price='CLOSE')=>db.$executeRawUnsafe(`INSERT INTO daily_close_prices(id,source,symbol,trading_date,close,currency,price_type,fetched_at) VALUES ('${randomUUID()}','Constraint probe','ZZZ','${date}',${close},'${currency}','${price}',now())`)
 await assert.rejects(insert('2026-10-10','1'))           // Saturday
 await assert.rejects(insert('2026-10-09','0'))           // non-positive
 await assert.rejects(insert('2026-10-09','1','THB'))     // currency
 await assert.rejects(insert('2026-10-09','1','USD','ADJ_CLOSE'))
 assert.equal(await db.dailyClosePrice.count({where:{source:'Constraint probe'}}),0)
})
test('two accounts read one shared cache: each symbol fetched once, stored with provenance, no key exposed',async()=>{
 assert.equal((await fetch(origin+'/api/valuation/references')).status,401)
 await api('valuation/references');await shared.refresh()
 const [a,b]=await Promise.all([api('valuation/references',undefined,0),api('valuation/references',undefined,1)]);await shared.refresh()
 assert.deepEqual(upstream.sort(),Object.keys(closes).sort())
 assert.deepEqual(a.body.dailyCloses,b.body.dailyCloses)
 assert.equal(a.body.dailyCloses.provider,'READY');assert.equal(a.body.dailyCloses.expectedSession,'2026-10-09')
 const aapl=a.body.dailyCloses.quotes.find((q:any)=>q.symbol==='AAPL')
 assert.deepEqual({close:aapl.close,tradingDate:aapl.tradingDate,status:aapl.status,priceType:aapl.priceType,currency:aapl.currency},{close:'227.5',tradingDate:'2026-10-09',status:'CURRENT',priceType:'CLOSE',currency:'USD'})
 for(const r of [a,b])assert.ok(!r.text.includes(TOKEN));assert.ok(!logs.join('\n').includes(TOKEN))
 const rows=await db.dailyClosePrice.findMany({where:{source:'Tiingo EOD'}})
 assert.equal(rows.length,8);assert.ok(rows.every(r=>r.currency==='USD'&&r.priceType==='CLOSE'&&r.tradingDate.toISOString()==='2026-10-09T00:00:00.000Z'&&r.fetchedAt.toISOString()==='2026-10-09T23:00:00.000Z'))
 evidence.sharedFetch={upstreamRequests:upstream.length,accounts:2,storedRows:rows.length,aapl}
})
test('each account values only its own holdings with the shared closes; data stays owner-isolated',async()=>{
 const pa=(await api('stocks/portfolios',{name:'A1',quoteCurrency:'USD'},0)).body.id,pa2=(await api('stocks/portfolios',{name:'A2',quoteCurrency:'USD'},0)).body.id,pb=(await api('stocks/portfolios',{name:'B1',quoteCurrency:'USD'},1)).body.id
 const trade=(portfolioId:string,symbol:string,side:string,quantity:string,price:string,fee='0')=>({portfolioId,symbol,side,quantity,price,fee,date:'2026-10-08',note:'synthetic',quoteCurrency:'USD'})
 for(const [body,i] of [[trade(pa,'AAPL','buy','0.5','200','1'),0],[trade(pa2,'AAPL','buy','0.25','210'),0],[trade(pa2,'SPY','buy','1.5','590','1.5'),0],[trade(pa2,'SPY','sell','0.5','595','1'),0],[trade(pb,'QQQ','buy','2','480'),1]] as const)
  assert.equal((await api('stocks/trades',body,i)).status,200)
 assert.equal((await api('stocks/trades',trade(pa,'AAPL','buy','1','1'),1)).status,404) // B cannot write into A's portfolio
 const [sa,sb,ra]=[await api('stocks',undefined,0),await api('stocks',undefined,1),await api('valuation/references',undefined,0)]
 assert.ok(sb.body.holdings.every((h:any)=>h.portfolioId===pb));assert.ok(!JSON.stringify(sb.body).includes(pa))
 const prices=new Map<string,string>(ra.body.dailyCloses.quotes.map((q:any)=>[q.symbol,q.close]))
 const summaryA=summarizeStockHoldings(sa.body.holdings,prices),summaryB=summarizeStockHoldings(sb.body.holdings,prices)
 // A (two portfolios, fractional): AAPL 0.75×227.5=170.625 ; SPY 1.0×600.125=600.125 → 770.75.
 // Remaining cost: 101 + 52.5 + SPY (886.5 − 0.5×591 released by the sale) = 744.5
 assert.equal(summaryA.valueUsd,'770.75');assert.equal(summaryA.costUsd,'744.5');assert.equal(summaryA.unrealizedUsd,'26.25')
 assert.equal(summaryB.valueUsd,'1000');assert.equal(summaryB.unrealizedUsd,'40')
 evidence.ownerValuations={A:summaryA,B:summaryB}
 // Shared market rows are not owner data: they are absent from an owner backup.
 assert.ok(!JSON.stringify(await exportBackup(db,owners[0]!)).includes('Tiingo EOD'))
})
test('a restarted server shows stored closes with status when the provider fails; never cost or invented prices',async()=>{
 const failing=(async()=>{throw Error('synthetic outage')}) as typeof fetch
 const restarted=new DailyCloseRelay(config(),new TiingoDailyProvider(TOKEN,failing),prismaDailyCloseStore(db),()=>Date.parse('2026-10-12T23:00:00Z'),()=>{})
 await restarted.snapshotFor(owners[0]!);await restarted.refresh()
 const snap=await restarted.snapshotFor(owners[0]!),aapl=snap.quotes.find(q=>q.symbol==='AAPL')!
 assert.deepEqual({close:aapl.close,tradingDate:aapl.tradingDate,status:aapl.status,problem:aapl.problem},{close:'227.5',tradingDate:'2026-10-09',status:'DELAYED',problem:'UNAVAILABLE'})
 const later=new DailyCloseRelay(config(),new TiingoDailyProvider(TOKEN,failing),prismaDailyCloseStore(db),()=>Date.parse('2026-10-13T23:00:00Z'),()=>{})
 assert.equal((await later.snapshotFor(owners[0]!)).quotes.find(q=>q.symbol==='AAPL')!.status,'STALE')
 evidence.outage={monday:aapl,tuesdayStatus:'STALE'}
})
test('a personal-licence key serves only its owner through the real route',async()=>{
 const personal=new DailyCloseRelay(config({license:'PERSONAL',ownerId:owners[0]!}),new TiingoDailyProvider(TOKEN,fakeTiingo),prismaDailyCloseStore(db),clock,()=>{})
 const second=createApp({auth,database:db,market,usdFx,dailyCloses:personal}).listen(4332,'127.0.0.1');await once(second,'listening')
 try{
  const a=await api('valuation/references',undefined,0,'http://127.0.0.1:4332'),b=await api('valuation/references',undefined,1,'http://127.0.0.1:4332')
  assert.equal(a.body.dailyCloses.provider,'READY');assert.equal(a.body.dailyCloses.quotes.length,8)
  assert.deepEqual(b.body.dailyCloses,{provider:'NOT_LICENSED',source:'Tiingo EOD',license:'PERSONAL',expectedSession:'2026-10-09',attribution:null,quotes:[]})
  evidence.personalLicence={owner:'READY',otherAccount:'NOT_LICENSED'}
 }finally{await new Promise<void>(r=>second.close(()=>r()))}
})
test('personal key: verified before saving, encrypted at rest, used only for its owner, removable',async()=>{
 assert.deepEqual((await api('market-key',undefined,0)).body,{available:true,provider:'TIINGO',status:'NONE',hint:null,updatedAt:null,version:null})
 const rejected=await api('market-key',{provider:'TIINGO',token:WRONG,confirmPersonalUse:true,expectedVersion:null},0)
 assert.equal(rejected.status,422);assert.equal(rejected.body.error.code,'MARKET_KEY_REJECTED');assert.equal(await db.ownerMarketKey.count(),0)
 assert.equal((await api('market-key',{provider:'TIINGO',token:PERSONAL,confirmPersonalUse:false,expectedVersion:null},0)).status,422)
 const key=randomUUID(),body={provider:'TIINGO',token:PERSONAL,confirmPersonalUse:true,expectedVersion:null}
 const [a,b]=await Promise.all([api('market-key',body,0,origin,key),api('market-key',body,0,origin,key)])
 assert.equal(a.status,200);assert.deepEqual(a.body,b.body);assert.deepEqual(a.body,{status:'ACTIVE',hint:'9xyz',version:1})
 const row=await db.ownerMarketKey.findUniqueOrThrow({where:{ownerId:owners[0]!}})
 assert.ok(row.ciphertext&&!Buffer.from(row.ciphertext).includes(Buffer.from(PERSONAL)));assert.equal(row.keyHint,'9xyz')
 const receipt=await db.idempotencyKey.findFirstOrThrow({where:{ownerId:owners[0]!,endpoint:'market.key'}})
 assert.ok(!JSON.stringify(receipt).includes(PERSONAL));assert.notEqual(receipt.requestSha256,createHash('sha256').update(JSON.stringify(body)).digest('hex'))
 const status=await api('market-key',undefined,0);assert.equal(status.body.status,'ACTIVE');assert.equal(status.body.hint,'9xyz');assert.ok(!status.text.includes(PERSONAL))
 assert.equal((await api('market-key',undefined,1)).body.status,'NONE')
 await api('valuation/references',undefined,0);await new Promise(r=>setTimeout(r,200))
 const [ra,rb]=[await api('valuation/references',undefined,0),await api('valuation/references',undefined,1)]
 assert.equal(ra.body.dailyCloses.keySource,'ACCOUNT');assert.equal(ra.body.dailyCloses.license,'PERSONAL')
 assert.equal(ra.body.dailyCloses.quotes.find((q:any)=>q.symbol==='AAPL').close,'327.5')
 assert.equal(rb.body.dailyCloses.keySource,undefined);assert.equal(rb.body.dailyCloses.quotes.find((q:any)=>q.symbol==='AAPL').close,'227.5')
 for(const r of [ra,rb])assert.ok(!r.text.includes(PERSONAL));assert.ok(!logs.join('\n').includes(PERSONAL))
 assert.equal(await db.dailyClosePrice.count({where:{ownerId:owners[0]!,scope:owners[0]!}}),8)
 assert.equal(personalUpstream.filter(s=>s==='SPY').length>=1,true)
 assert.equal((await api('market-key/remove',{expectedVersion:9},0)).status,409)
 const removed=await api('market-key/remove',{expectedVersion:1},0);assert.equal(removed.status,200);assert.deepEqual(removed.body,{status:'REMOVED',version:2})
 const cleared=await db.ownerMarketKey.findUniqueOrThrow({where:{ownerId:owners[0]!}});assert.equal(cleared.ciphertext,null);assert.equal(cleared.keyHint,null)
 assert.equal(await db.dailyClosePrice.count({where:{ownerId:owners[0]!}}),0)
 assert.equal((await api('valuation/references',undefined,0)).body.dailyCloses.keySource,undefined)
 evidence.personalKey={rejectedWrongToken:422,savedOnce:true,ciphertextContainsToken:false,ownerAAppl:'327.5',ownerBAppl:'227.5',personalRows:8,removedRowsLeft:0}
})
