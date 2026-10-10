import { WebSocket } from 'ws'
import { providerMetadataSchema, providerPriceSchema, type MarketSnapshot } from '@finntech/contracts'
import { parseCryptoDecimal, serializeCrypto } from '@finntech/finance'

const upstream = 'https://data-api.binance.vision/api/v3'
export const CRYPTO_CATALOG = ['BTC','ETH','SOL','XRP','BNB','DOGE','ADA'] as const
const symbols = CRYPTO_CATALOG.map(asset=>asset+'USDT')
type Quote = { price:string; received:number; observed:number|null; sequence:number; kind:'TRADE'|'REST_SNAPSHOT' }
type Factory = (url:string)=>WebSocket
/** One bounded public upstream socket per server, never per owner/browser. */
export class MarketRelay {
 private quotes = new Map<string,Quote>()
 private approved = new Set<string>()
 private checkedAt = 0
 private nextAttempt = 0
 private pending:Promise<void>|null = null
 private failures = 0
 private socket:WebSocket|null = null
 private socketAttempt = 0
 private socketFailures = 0
 private heartbeat = 0
 private openedAt = 0
 private lastAccess = 0
 private timer:ReturnType<typeof setInterval>|null = null
 private stopped = false
 constructor(private readonly request:typeof fetch=fetch,private readonly now:()=>number=Date.now,
  private readonly socketFactory:Factory=url=>new WebSocket(url,{handshakeTimeout:5000,maxPayload:16_384,perMessageDeflate:false,followRedirects:false})) {}
 start():void {
  if(this.timer)return
  this.stopped=false
  this.timer=setInterval(()=>{
   if(this.socket&&(this.now()-this.heartbeat>60_000||this.now()-this.openedAt>23*60*60*1000||this.now()-this.lastAccess>60_000))this.disconnect(false)
   if(this.now()-this.lastAccess<=60_000)void this.snapshot(false)
  },5000);this.timer.unref()
 }
 stop():void {this.stopped=true;if(this.timer)clearInterval(this.timer);this.timer=null;this.disconnect(false)}
 private disconnect(failed:boolean):void {
  const socket=this.socket;this.socket=null
  if(failed){this.socketFailures=Math.min(this.socketFailures+1,6);this.socketAttempt=this.now()+Math.min(1000*2**this.socketFailures,60_000)}
  socket?.terminate()
 }
 private connect():void {
  if(!this.timer||this.stopped||this.socket||!this.approved.size||this.now()<this.socketAttempt)return
  const streams=[...this.approved].sort().map(symbol=>symbol.toLowerCase()+'@aggTrade').join('/')
  const socket=this.socketFactory('wss://data-stream.binance.vision/stream?streams='+streams);this.socket=socket;this.heartbeat=this.now();this.openedAt=this.now()
  socket.on('open',()=>{if(this.socket===socket)this.heartbeat=this.now()})
  // ws automatically echoes provider ping payloads as pong. No extra subscription chatter.
  socket.on('ping',()=>{if(this.socket===socket)this.heartbeat=this.now()})
  socket.on('message',bytes=>{
   if(this.socket!==socket)return
   this.heartbeat=this.now()
   try{
    const body=JSON.parse(String(bytes)),data=body.data??body
    if(data.e==='serverShutdown'){this.disconnect(true);return}
    if(data.e!=='aggTrade'||typeof data.s!=='string'||!this.approved.has(data.s)||!Number.isSafeInteger(data.T)||data.T<=0||data.T>this.now()||!Number.isSafeInteger(data.a)||data.a<0)return
    const parsed=providerPriceSchema.parse({symbol:data.s,price:data.p}),previous=this.quotes.get(data.s)
    if(previous?.observed!==null&&previous?.observed!==undefined&&(data.T<previous.observed||(data.T===previous.observed&&data.a<=previous.sequence)))return
    this.quotes.set(data.s,{price:serializeCrypto(parseCryptoDecimal(parsed.price)),received:this.now(),observed:data.T,sequence:data.a,kind:'TRADE'});this.socketFailures=0
   }catch{/* Invalid observations never refresh a quote's age. */}
  })
  socket.on('error',()=>{if(this.socket===socket)this.disconnect(true)})
  socket.on('close',()=>{if(this.socket===socket)this.disconnect(true)})
 }
 private async refresh():Promise<void> {
  try{
   if(this.now()-this.checkedAt>60*60*1000||this.checkedAt===0){
    const result=await this.request(`${upstream}/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,{signal:AbortSignal.timeout(5000),redirect:'error'})
    if(!result.ok)throw Error('metadata_unavailable')
    const metadata=providerMetadataSchema.parse(await result.json()),approved=new Set<string>()
    for(const symbol of symbols)if(metadata.symbols.some(s=>s.symbol===symbol&&s.baseAsset===symbol.slice(0,-4)&&s.quoteAsset==='USDT'&&s.status==='TRADING'&&s.isSpotTradingAllowed!==false))approved.add(symbol)
    const changed=[...approved].join(',')!==[...this.approved].join(',');this.approved=approved;this.checkedAt=this.now();if(changed)this.disconnect(false)
   }
   this.connect()
   // One failing symbol must not withhold REST snapshots for the others; the failure still backs off.
   let failed=false
   for(const symbol of this.approved){
    const previous=this.quotes.get(symbol)
    if(previous?.kind==='TRADE'&&this.now()-previous.observed!<=30_000)continue
    try{
     const before=this.quotes.get(symbol),result=await this.request(`${upstream}/ticker/price?symbol=${symbol}`,{signal:AbortSignal.timeout(5000),redirect:'error'})
     if(!result.ok)throw Error('price_unavailable')
     const quote=providerPriceSchema.parse(await result.json());if(quote.symbol!==symbol)throw Error('symbol_mismatch')
     // Object identity also catches a trade arriving in the same millisecond as REST.
     if(this.quotes.get(symbol)!==before)continue
     this.quotes.set(symbol,{price:serializeCrypto(parseCryptoDecimal(quote.price)),received:this.now(),observed:null,sequence:0,kind:'REST_SNAPSHOT'})
    }catch{failed=true}
   }
   if(failed)throw Error('price_unavailable')
   this.failures=0
  }catch{this.failures=Math.min(this.failures+1,5)}
  finally{this.nextAttempt=this.now()+Math.min(15_000*2**this.failures,300_000)}
 }
 async snapshot(touch=true):Promise<MarketSnapshot>{
  if(touch)this.lastAccess=this.now()
  if(!this.stopped&&!this.pending&&this.now()>=this.nextAttempt)this.pending=this.refresh().finally(()=>{this.pending=null})
  this.connect()
  return {catalog:CRYPTO_CATALOG.map(asset=>({asset,symbol:asset+'USDT',quoteCurrency:'USDT',available:this.approved.has(asset+'USDT')&&this.now()-this.checkedAt<=3600000})),quotes:CRYPTO_CATALOG.map(asset=>{
   const symbol=asset+'USDT',quote=this.quotes.get(symbol),age=quote?this.now()-(quote.observed??quote.received):Infinity
   return {asset,price:quote?.price??null,status:!quote||!this.approved.has(symbol)||this.now()-this.checkedAt>3600000?'UNAVAILABLE':age>30000||age<0?'STALE':'LIVE',
    receivedAt:quote?new Date(quote.received).toISOString():null,observedAt:quote?.observed?new Date(quote.observed).toISOString():null,kind:quote?.kind??'REST_SNAPSHOT',quoteCurrency:'USDT',source:'Binance public'}
  })}
 }
}
