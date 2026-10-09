import type { ValuationOverview, StockMarketSnapshot } from '@finntech/contracts'
export const REFERENCE_MAX_AGE=7*86400000
export type SelectedReference={value:string|null;source:string;asOf:string|null;state:'LIVE'|'DAILY'|'MANUAL'|'STALE'|'MISSING'|'ERROR'}
const valid=(date:string|null,now:number,limit:number)=>date!==null&&now-Date.parse(date)>=0&&now-Date.parse(date)<=limit
/** An enabled manual override wins, including when stale. Disable it explicitly to resume automatic. */
export function selectReference(symbol:string, overview:ValuationOverview|null,market:StockMarketSnapshot|null,now:number):SelectedReference {
 const manual=overview?.references.find(r=>r.symbol===symbol&&r.enabled)
 if(manual)return {value:valid(manual.asOf,now,REFERENCE_MAX_AGE)?manual.value:null,source:'กรอกเอง (แทนอัตโนมัติ)',asOf:manual.asOf,state:valid(manual.asOf,now,REFERENCE_MAX_AGE)?'MANUAL':'STALE'}
 if(symbol==='USDTHB'){
  const fx=overview?.usdThb
  if(fx?.status==='DAILY'&&valid(fx.asOf,now,REFERENCE_MAX_AGE)&&fx.rate)return {value:fx.rate,source:'ECB · อ้างอิงรายวัน (THB/EUR ÷ USD/EUR)',asOf:fx.asOf,state:'DAILY'}
  return {value:null,source:'ECB · อ้างอิงรายวัน',asOf:fx?.asOf??null,state:fx?.status==='ERROR'?'ERROR':fx?.asOf?'STALE':'MISSING'}
 }
 const q=market?.quotes.find(q=>q.symbol===symbol)
 if(q?.status==='LIVE'&&q.price&&valid(q.observedAt??null,now,30000)&&valid(q.receivedAt,now,30000))return {value:q.price,source:market!.source,asOf:q.observedAt!,state:'LIVE'}
 return {value:null,source:market?.source??'ยังไม่มี feed ที่อนุญาต',asOf:q?.observedAt??null,state:q?.price?'STALE':q?.status==='UNAVAILABLE'?'ERROR':'MISSING'}
}
