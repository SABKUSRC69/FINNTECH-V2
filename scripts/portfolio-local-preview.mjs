// Synthetic loopback preview using the actual app/auth/ledger and genuine public quotes.
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {portfolioTestTarget} from './portfolio-db-target.mjs'
import {createTrackerDatabase} from '../apps/api/dist/persistence/database.js'
import {createAuthRuntime} from '../apps/api/dist/auth/runtime.js'
import {createApp} from '../apps/api/dist/app.js'
import {MarketRelay} from '../apps/api/dist/tracker/market.js'
import {ReferenceFxRelay} from '../apps/api/dist/tracker/fx.js'
import {StockMarketRelay} from '../apps/api/dist/tracker/stocks.js'
import {attachMarketStream} from '../apps/api/dist/tracker/stream.js'
const target=portfolioTestTarget(process.env),origin='http://127.0.0.1:4312'
const directory=path.resolve('.portfolio-20261009.local')
let secret
try{secret=await fs.readFile(path.join(directory,'preview-auth-secret'),'utf8')}catch{secret=randomUUID()+randomUUID();await fs.writeFile(path.join(directory,'preview-auth-secret'),secret)}
const db=createTrackerDatabase(target.href),auth=createAuthRuntime(db,{databaseUrl:target.href,origin,secret,secureCookies:false})
const market=new MarketRelay(),fx=new ReferenceFxRelay(),stocks=new StockMarketRelay(null)
const server=createApp({auth,database:db,market,fx,stocks,webDistDir:path.resolve('apps/web/dist')}).listen(4312,'127.0.0.1')
const stop=attachMarketStream(server,auth,market,stocks)
await once(server,'listening');market.start()
let account,cookie=''
try{account=JSON.parse(await fs.readFile(path.join(directory,'preview-account.json'),'utf8'))}catch{account={name:'บัญชีสังเคราะห์ — ทดสอบพอร์ต',email:`preview-${randomUUID()}@example.test`,password:randomUUID()+randomUUID()}}
async function api(route,body){const r=await fetch(origin+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const token=r.headers.getSetCookie().find(s=>s.startsWith('finntech.session_token='));if(token)cookie=token.split(';')[0];if(!r.ok)throw Error('Synthetic preview setup rejected at '+route);return r.json()}
try{
 try{await api('auth/sign-in/email',{email:account.email,password:account.password})}catch{await api('auth/sign-up/email',account)}
 await fs.writeFile(path.join(directory,'preview-account.json'),JSON.stringify(account))
 const crypto=await api('crypto')
 if(!crypto.portfolios.length){const p=await api('crypto/portfolios',{name:'พอร์ตสังเคราะห์ SOL',quoteCurrency:'USDT'});await api('crypto/trades',{portfolioId:p.id,asset:'SOL',side:'buy',quantity:'2',price:'100',fee:'1',date:'2026-10-08',quoteCurrency:'USDT'})}
 const stock=await api('stocks')
 if(!stock.portfolios.length){const p=await api('stocks/portfolios',{name:'พอร์ตหุ้นสังเคราะห์',quoteCurrency:'USD'});await api('stocks/trades',{portfolioId:p.id,symbol:'AAPL',side:'buy',quantity:'0.5',price:'100',fee:'1',date:'2026-10-08',note:'ประวัติสมมติ ไม่มีการซื้อขายจริง',quoteCurrency:'USD'})}
 if(!(await api('assets/manual')).assets.length)await api('assets/manual',{name:'ทองคำสังเคราะห์สำหรับทดสอบ',type:'GOLD',currency:'THB',quantity:'10',unit:'กรัม',cost:'10000',value:'12500',date:'2026-10-08',note:'ประเมินด้วยตนเอง ไม่ใช่ราคาทองสด'})
 if(!(await api('cash')).accounts.length)await api('cash',{name:'เงินสดสังเคราะห์',balance:'5000',currency:'THB',asOf:'2026-10-08'})
 console.log('Synthetic portfolio preview ready: '+origin+' (credentials kept in private ignored setup file)')
}catch{console.error('Synthetic preview setup failed; details withheld');stop();market.stop();stocks.stop();server.close();await db.$disconnect();process.exitCode=1}
const observations=[]
const sampler=setInterval(async()=>{
 const q=(await market.snapshot()).quotes.find(q=>q.asset==='SOL')
 if(q?.kind==='TRADE'&&q.status==='LIVE'&&observations.at(-1)?.price!==q.price){observations.push(q);if(observations.length>40)observations.shift();await fs.writeFile(path.join(directory,'real-public-observations.json'),JSON.stringify({source:'genuine public Binance aggTrade',syntheticQuantity:'2',syntheticCost:'201',observations},null,2))}
},2000);sampler.unref()
function shutdown(){clearInterval(sampler);stop();market.stop();stocks.stop();server.close(()=>{void db.$disconnect().then(()=>process.exit(0))})}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown)
