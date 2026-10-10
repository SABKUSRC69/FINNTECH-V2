import type { ValuationOverview, StockMarketSnapshot, DailyCloseQuote } from '@finntech/contracts'
import { assessDailyClose } from '@finntech/finance'
export const REFERENCE_MAX_AGE=7*86400000
export const LIVE_MAX_AGE=30000
const CLOCK_SKEW=2000
export type SelectedReference={value:string|null;source:string;asOf:string|null;state:'LIVE'|'CLOSE'|'DAILY'|'MANUAL'|'STALE'|'CLOSED'|'MISSING'|'ERROR'
 /** Daily close used for valuation (state CLOSE): its own New York trading date, never a receipt time. */
 close?:{tradingDate:string;fetchedAt:string|null;status:'CURRENT'|'DELAYED';expectedSession:string;problem:DailyCloseQuote['problem']}
 /** A daily close too old for valuation, shown for context only; never counted in totals. */
 lastKnownClose?:{price:string;tradingDate:string}
 /** An eligible daily close that an enabled manual override is currently hiding. */
 overriddenDaily?:{price:string;tradingDate:string}
 /** A last observed provider trade shown for context only; never counted in totals. */
 lastKnown?:{price:string;observedAt:string|null}
 /** A fresh live price that an enabled manual override is currently hiding. */
 overriddenLive?:{price:string;observedAt:string}}
const valid=(date:string|null,now:number,limit:number)=>date!==null&&now-Date.parse(date)>=0&&now-Date.parse(date)<=limit
/** One wording for each Alpaca connection state, shared by the stock, asset and valuation views. */
export const stockConnectionLabels: Record<StockMarketSnapshot['connection'], string> = {
  NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่า Alpaca key ฝั่ง server', CONNECTING: 'กำลังเชื่อมต่อข้อมูล IEX',
  STREAMING: 'เชื่อมต่อ feed IEX แล้ว', UNAVAILABLE: 'ยังเชื่อมต่อ Alpaca ไม่ได้ กำลังลองใหม่',
  AUTH_FAILED: 'Alpaca ปฏิเสธ key (ยืนยันตัวตนไม่ผ่าน) ตรวจ key ใน Render', NOT_ENTITLED: 'บัญชี Alpaca ไม่มีสิทธิ์ข้อมูล feed นี้',
  CONNECTION_LIMIT: 'มีการเชื่อมต่ออื่นใช้บัญชี Alpaca นี้อยู่ ระบบจะลองใหม่เอง',
}
const providerProblem:Partial<Record<StockMarketSnapshot['connection'],string>>=Object.fromEntries((['AUTH_FAILED','NOT_ENTITLED','CONNECTION_LIMIT'] as const).map(c=>[c,`${stockConnectionLabels[c]} · ตั้งราคาอ้างอิงเองได้`]))
const fetchedLabel=(at:string|null)=>at?new Date(at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'N/A'
/** A close is dated by its New York trading session; live/manual prices by their observation time. */
export const referenceDateLabel=(r:SelectedReference)=>r.close?`ราคาปิดวันที่ซื้อขาย ${r.close.tradingDate} (นิวยอร์ก) · ดึงเมื่อ ${fetchedLabel(r.close.fetchedAt)}`:r.asOf?`เวลารายการ ${new Date(r.asOf).toLocaleString('th-TH')}`:'ไม่มีวันอ้างอิง'
export const dailyProblemText:Record<NonNullable<DailyCloseQuote['problem']>,string>={
 AUTH_FAILED:'ผู้ให้บริการปฏิเสธ key ฝั่ง server',RATE_LIMITED:'ถึงโควตาผู้ให้บริการ กำลังรอลองใหม่',NOT_FOUND:'ผู้ให้บริการไม่มีข้อมูลหลักทรัพย์นี้',
 UNAVAILABLE:'ดึงข้อมูลไม่สำเร็จ กำลังลองใหม่',INVALID_DATA:'ข้อมูลจากผู้ให้บริการไม่ผ่านการตรวจสอบ',NOT_YET_PUBLISHED:'ราคาปิดวันล่าสุดยังไม่เผยแพร่ ระบบลองใหม่ทุก 30 นาที',BUDGET_EXHAUSTED:'ใช้โควตาคำขอของระบบครบแล้ว จะลองใหม่ภายหลัง',
}
/** Daily close eligibility is judged in trading sessions (weekends/holidays keep the last close), not by the 30 s live rule. */
export function dailyCloseFor(symbol:string,overview:ValuationOverview|null,now:number){
 const daily=overview?.dailyCloses,q=daily?.provider==='READY'?daily.quotes.find(q=>q.symbol===symbol):undefined
 if(!q?.close||!q.tradingDate)return {quote:q??null,eligible:null}
 const a=assessDailyClose(q.tradingDate,now)
 return {quote:q,eligible:a.eligible&&(a.state==='CURRENT'||a.state==='DELAYED')?{price:q.close,tradingDate:q.tradingDate,fetchedAt:q.fetchedAt,status:a.state as 'CURRENT'|'DELAYED',expectedSession:a.expectedSession,problem:q.problem}:null}
}
/** Live = provider trade time and receipt both within 30 s while streaming (last trade, not bid/ask). */
export function liveStockQuote(symbol:string,market:StockMarketSnapshot|null,now:number){
 const q=market?.quotes.find(q=>q.symbol===symbol)
 // A small tolerance absorbs provider/server/browser clock skew; it never extends the 30 s age limit.
 const fresh=(date:string|null|undefined)=>!!date&&now-Date.parse(date)>=-CLOCK_SKEW&&now-Date.parse(date)<=LIVE_MAX_AGE
 return market?.connection==='STREAMING'&&q?.status==='LIVE'&&q.price&&fresh(q.observedAt)&&fresh(q.receivedAt)?{price:q.price,observedAt:q.observedAt!}:null
}
/** An enabled manual override wins, including when stale. Disable it explicitly to resume automatic. */
export function selectReference(symbol:string, overview:ValuationOverview|null,market:StockMarketSnapshot|null,now:number):SelectedReference {
 const manual=overview?.references.find(r=>r.symbol===symbol&&r.enabled)
 if(manual){
  const live=symbol==='USDTHB'?null:liveStockQuote(symbol,market,now),daily=symbol==='USDTHB'?null:dailyCloseFor(symbol,overview,now).eligible
  return {value:valid(manual.asOf,now,REFERENCE_MAX_AGE)?manual.value:null,source:'กรอกเอง (แทนอัตโนมัติ)',asOf:manual.asOf,state:valid(manual.asOf,now,REFERENCE_MAX_AGE)?'MANUAL':'STALE',...(live?{overriddenLive:live}:{}),...(daily?{overriddenDaily:{price:daily.price,tradingDate:daily.tradingDate}}:{})}
 }
 if(symbol==='USDTHB'){
  const fx=overview?.usdThb
  if(fx?.status==='DAILY'&&valid(fx.asOf,now,REFERENCE_MAX_AGE)&&fx.rate)return {value:fx.rate,source:'ECB · อ้างอิงรายวัน (THB/EUR ÷ USD/EUR)',asOf:fx.asOf,state:'DAILY'}
  return {value:null,source:'ECB · อ้างอิงรายวัน',asOf:fx?.asOf??null,state:fx?.status==='ERROR'?'ERROR':fx?.asOf?'STALE':'MISSING'}
 }
 const live=liveStockQuote(symbol,market,now)
 if(live)return {value:live.price,source:'Alpaca IEX · ราคาซื้อขายล่าสุด (last trade)',asOf:live.observedAt,state:'LIVE'}
 const dailySnapshot=overview?.dailyCloses,{quote:closeQuote,eligible:close}=dailyCloseFor(symbol,overview,now)
 const closeSource=`${dailySnapshot?.source??'แหล่งราคาปิด'} · ราคาปิดรายวัน (ราคาปิดจริง ไม่ปรับปันผล/แตกหุ้น)`
 if(close)return {value:close.price,source:closeSource,asOf:null,state:'CLOSE',close:{tradingDate:close.tradingDate,fetchedAt:close.fetchedAt,status:close.status,expectedSession:close.expectedSession,problem:close.problem}}
 if(dailySnapshot?.provider==='READY'){
  // Shared daily feed is configured: report its own last known close/problem instead of a live-feed message.
  const problem=closeQuote?.problem?` · ${dailyProblemText[closeQuote.problem]}`:''
  if(closeQuote?.close&&closeQuote.tradingDate)return {value:null,source:`${dailySnapshot.source} · ราคาปิดล่าสุดเก่าเกิน 1 วันซื้อขาย ไม่นับในยอดรวม${problem}`,asOf:null,state:'STALE',lastKnownClose:{price:closeQuote.close,tradingDate:closeQuote.tradingDate}}
  return {value:null,source:`${dailySnapshot.source} · ยังไม่มีราคาปิด${problem||' · กำลังดึงข้อมูล'} · ตั้งราคาอ้างอิงเองได้`,asOf:null,state:closeQuote?.status==='ERROR'?'ERROR':'MISSING'}
 }
 if(dailySnapshot?.provider==='NOT_LICENSED'&&market?.connection!=='STREAMING')return {value:null,source:'ราคาปิดอัตโนมัติยังไม่เปิดให้บัญชีนี้ (สิทธิ์ข้อมูลของผู้ให้บริการครอบคลุมเฉพาะเจ้าของ key) · ตั้งราคาอ้างอิงเองได้',asOf:null,state:'MISSING'}
 // An unconfigured feed is not a provider failure: guide the owner to a manual reference instead.
 if(market?.connection==='NOT_CONFIGURED')return {value:null,source:'ยังไม่มี feed ราคาอัตโนมัติ · ตั้งราคาอ้างอิงเองได้',asOf:null,state:'MISSING'}
 const q=market?.quotes.find(q=>q.symbol===symbol)
 const lastKnown=q?.price?{lastKnown:{price:q.price,observedAt:q.observedAt}}:{}
 const problem=market?providerProblem[market.connection]:undefined
 if(problem)return {value:null,source:problem,asOf:q?.observedAt??null,state:'ERROR',...lastKnown}
 if(!market)return {value:null,source:'ยังไม่มี feed ที่อนุญาต',asOf:null,state:'MISSING'}
 if(!q)return {value:null,source:'Alpaca IEX · ไม่อยู่ในรายการที่ subscribe (เกินเพดาน 30) · ตั้งราคาอ้างอิงเองได้',asOf:null,state:'MISSING'}
 if(q.price)return {value:null,source:q.status==='CLOSED'?'Alpaca IEX · ตลาดปิด ราคาล่าสุดไม่นับในยอดรวม':'Alpaca IEX · ราคาไม่สด (เกิน 30 วินาที) ไม่นับในยอดรวม',asOf:q.observedAt,state:q.status==='CLOSED'?'CLOSED':'STALE',...lastKnown}
 return {value:null,source:market.connection==='CONNECTING'?'กำลังเชื่อมต่อ Alpaca IEX':'Alpaca IEX · ยังไม่มีรายการซื้อขาย',asOf:null,state:market.connection==='UNAVAILABLE'?'ERROR':'MISSING'}
}
