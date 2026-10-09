import { parseCryptoDecimal, serializeCrypto } from '@finntech/finance'
import type { DailyUsdRate } from '@finntech/contracts'
export const ECB_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
const WEEK=7*86400000
/** Parse only the bounded official daily format; no XML entities or remote resources. */
export function parseEcbDaily(xml:string, now:number):DailyUsdRate {
  if(xml.length>32768||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('INVALID_ECB_XML')
  const dates=[...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g)]
  if(dates.length!==1)throw Error('INVALID_ECB_DATE')
  const asOf=dates[0]![1]+'T00:00:00.000Z', age=now-Date.parse(asOf)
  if(!Number.isFinite(age)||age<0||new Date(asOf).toISOString()!==asOf)throw Error('INVALID_ECB_DATE')
  const read=(currency:string)=>{
    const rows=[...xml.matchAll(new RegExp(`<Cube\\s+currency=['"]${currency}['"]\\s+rate=['"]([0-9]+(?:\\.[0-9]+)?)['"]\\s*\\/>`,'g'))]
    if(rows.length!==1)throw Error('INVALID_ECB_RATE')
    const value=parseCryptoDecimal(rows[0]![1]);if(!value.gt('0'))throw Error('INVALID_ECB_RATE');return value
  }
  return {source:'ECB',kind:'DAILY',status:age<=WEEK?'DAILY':'STALE',rate:serializeCrypto(read('THB').div(read('USD'))),asOf,receivedAt:new Date(now).toISOString()}
}
export class DailyUsdRelay {
  private data:DailyUsdRate={source:'ECB',kind:'DAILY',status:'MISSING',rate:null,asOf:null,receivedAt:null}
  private flight:Promise<void>|null=null
  private next=0;private failures=0
  constructor(private fetcher:typeof fetch=fetch,private clock:()=>number=Date.now){}
  snapshot():DailyUsdRate {
    if(this.clock()>=this.next&&!this.flight)void this.refresh()
    const age=this.data.asOf?this.clock()-Date.parse(this.data.asOf):null
    return {...this.data,status:age!==null&&(age<0||age>WEEK)?'STALE':this.data.status}
  }
  refresh():Promise<void> {
    if(this.flight)return this.flight
    if(this.clock()<this.next)return Promise.resolve()
    this.flight=this.fetchOnce().finally(()=>{this.flight=null})
    return this.flight
  }
  private async fetchOnce(){
    try{
      const response=await this.fetcher(ECB_URL,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/xml'}})
      if(!response.ok||Number(response.headers.get('content-length')??0)>32768||!response.body)throw Error('ECB_UNAVAILABLE')
      const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder()
      try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768)throw Error('ECB_TOO_LARGE');text+=decoder.decode(part.value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel()}
      this.data=parseEcbDaily(text,this.clock());this.failures=0;this.next=this.clock()+3600000
    }catch{
      // A failed refresh does not alter the original observation/receipt timestamps.
      this.data={...this.data,status:'ERROR'};this.next=this.clock()+Math.min(3600000,60000*2**Math.min(this.failures++,6))
    }
  }
}
