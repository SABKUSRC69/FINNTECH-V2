// SYNTHETIC loopback preview: real app/auth/ledger on a throwaway PostgreSQL, but the daily-close
// provider is a local fake labelled "SYNTHETIC". Screenshots from it are UI evidence only, never
// evidence that a real provider was connected. Requires DATABASE_URL to the throwaway target.
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {latestSessionAt,previousTradingDay,CLOSE_PUBLISHED_MINUTES} from '@finntech/finance'
import {createTrackerDatabase} from '../../../apps/api/dist/persistence/database.js'
import {createAuthRuntime} from '../../../apps/api/dist/auth/runtime.js'
import {createApp} from '../../../apps/api/dist/app.js'
import {MarketRelay} from '../../../apps/api/dist/tracker/market.js'
import {StockMarketRelay} from '../../../apps/api/dist/tracker/stocks.js'
import {DailyUsdRelay} from '../../../apps/api/dist/tracker/usd-fx.js'
import {DailyCloseRelay,DailyCloseProviderError,prismaDailyCloseStore} from '../../../apps/api/dist/tracker/daily-close.js'

const url=new URL(process.env.DATABASE_URL??'postgresql://invalid')
if(process.env.FINNTECH_DAILY_CLOSE_TEST!=='synthetic-only'||url.port!=='5452'||url.hostname!=='127.0.0.1')throw Error('Refused non-synthetic preview target')
const origin='http://127.0.0.1:4333',privateDir=process.argv[2]
const db=createTrackerDatabase(url.href),auth=createAuthRuntime(db,{databaseUrl:url.href,origin,secret:randomUUID()+randomUUID(),secureCookies:false})
const session=latestSessionAt(Date.now(),CLOSE_PUBLISHED_MINUTES),stale=previousTradingDay(previousTradingDay(previousTradingDay(session)))
// QQQ answers with an old session to show the missing/partial path honestly.
const table={AAPL:[session,'231.40'],MSFT:[session,'415.20'],NVDA:[session,'121.75'],AMZN:[session,'182.10'],GOOGL:[session,'161.30'],TSLA:[session,'248.90'],SPY:[session,'601.55'],QQQ:[stale,'498.00']}
const provider={source:'SYNTHETIC EOD (ทดสอบ)',attribution:{label:'SYNTHETIC',url:'https://example.test'},
 async latestClose(symbol){const row=table[symbol];if(!row)throw new DailyCloseProviderError('NOT_FOUND');return {tradingDate:row[0],close:row[1]}}}
const daily=new DailyCloseRelay({provider:'tiingo',token:'unused',license:'REDISTRIBUTION',ownerId:null,symbols:Object.keys(table),maxRequestsPerHour:40,maxRequestsPerDay:500},provider,prismaDailyCloseStore(db))
const market=new MarketRelay(async()=>{throw Error('preview: crypto provider disabled')})
const server=createApp({auth,database:db,market,stocks:new StockMarketRelay(null),usdFx:new DailyUsdRelay(),dailyCloses:daily,webDistDir:path.resolve('apps/web/dist')}).listen(4333,'127.0.0.1')
await once(server,'listening')
let cookie=''
async function api(route,body){const r=await fetch(origin+'/api/'+route,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});const t=r.headers.getSetCookie().find(s=>s.startsWith('finntech.session_token='));if(t)cookie=t.split(';')[0];if(!r.ok)throw Error('setup rejected at '+route);return r.json()}
const account={name:'บัญชีสังเคราะห์ราคาปิด',email:`daily-preview-${randomUUID()}@example.test`,password:randomUUID()+randomUUID()}
await api('auth/sign-up/email',account)
await fs.writeFile(path.join(privateDir,'preview-account.json'),JSON.stringify(account))
const a=await api('stocks/portfolios',{name:'พอร์ตสังเคราะห์ A',quoteCurrency:'USD'}),b=await api('stocks/portfolios',{name:'พอร์ตสังเคราะห์ B',quoteCurrency:'USD'})
const t=(p,symbol,side,quantity,price,fee='0')=>api('stocks/trades',{portfolioId:p.id,symbol,side,quantity,price,fee,date:'2026-10-01',note:'ประวัติสมมติ',quoteCurrency:'USD'})
await t(a,'AAPL','buy','0.5','200','1');await t(b,'AAPL','buy','0.25','210');await t(b,'SPY','buy','1.5','590','1.5');await t(b,'SPY','sell','0.5','595','1');await t(a,'QQQ','buy','0.1','480')
await api('cash',{name:'เงินสดสังเคราะห์',balance:'1000',currency:'THB',asOf:'2026-10-01'})
console.log('SYNTHETIC daily-close preview ready at '+origin)
