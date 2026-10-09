import {EventEmitter} from 'node:events'
import {afterEach,describe,expect,it,vi} from 'vitest'
import type {WebSocket} from 'ws'
import {MarketRelay,CRYPTO_CATALOG} from '../src/tracker/market.js'

const start=1_800_000_000_000
const metadata=()=>({symbols:CRYPTO_CATALOG.map(asset=>({symbol:asset+'USDT',baseAsset:asset,quoteAsset:'USDT',status:'TRADING'}))})
async function settle(){for(let i=0;i<50;i++)await Promise.resolve()}
class Socket extends EventEmitter{
 terminate=vi.fn(()=>this.emit('close'))
 trade(symbol:string,price:unknown,T:number,a:number){this.emit('message',JSON.stringify({stream:symbol.toLowerCase()+'@aggTrade',data:{e:'aggTrade',s:symbol,p:price,T,a}}))}
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})
describe('one bounded crypto upstream and truthful observation cache',()=>{
 it('validates seven quote/base/status pairs, coalesces REST and subscribes only approved USDT markets',async()=>{
  vi.useFakeTimers();vi.setSystemTime(start)
  const data=metadata();data.symbols[3]!.quoteAsset='USD';data.symbols[4]!.status='BREAK';data.symbols[6]!.baseAsset='BTC'
  const request=vi.fn(async(url:unknown)=>Response.json(String(url).includes('exchangeInfo')?data:{symbol:new URL(String(url)).searchParams.get('symbol'),price:'100.10'}))
  const socket=new Socket(),factory=vi.fn((_url:string)=>socket as unknown as WebSocket),relay=new MarketRelay(request as typeof fetch,Date.now,factory)
  relay.start();await Promise.all([relay.snapshot(),relay.snapshot(),relay.snapshot()]);await settle()
  const result=await relay.snapshot()
  expect(result.catalog?.filter(q=>q.available).map(q=>q.asset)).toEqual(['BTC','ETH','SOL','DOGE'])
  expect(request).toHaveBeenCalledTimes(5);expect(factory).toHaveBeenCalledTimes(1)
  const streams=new URL(factory.mock.calls[0]![0] as unknown as string).searchParams.get('streams')
  expect(streams).toBe('btcusdt@aggTrade/dogeusdt@aggTrade/ethusdt@aggTrade/solusdt@aggTrade')
  expect(result.quotes.find(q=>q.asset==='SOL')).toMatchObject({price:'100.1',quoteCurrency:'USDT',kind:'REST_SNAPSHOT',observedAt:null,source:'Binance public'})
  relay.stop();expect(socket.terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0)
 })
 it('keeps a genuine trade over racing REST, rejects old/duplicate/future/invalid trades and ages provider time',async()=>{
  vi.useFakeTimers();vi.setSystemTime(start)
  let release!:(value:Response)=>void
  const request=vi.fn(async(url:unknown)=>String(url).includes('exchangeInfo')?Response.json({symbols:metadata().symbols.filter(s=>s.baseAsset==='SOL')}):await new Promise<Response>(r=>{release=r}))
  const socket=new Socket(),relay=new MarketRelay(request as typeof fetch,Date.now,()=>socket as unknown as WebSocket)
  relay.start();await relay.snapshot();await settle()
  socket.trade('SOLUSDT','150.00000001',start,5);release(Response.json({symbol:'SOLUSDT',price:'1'}));await settle()
  expect((await relay.snapshot()).quotes.find(q=>q.asset==='SOL')).toMatchObject({price:'150.00000001',kind:'TRADE',observedAt:new Date(start).toISOString()})
  for(const [price,T,a] of [['99',start-1,6],['99',start,5],['99',start+1,7],[150,start,7],['0',start,7],['-1',start,7]] as const)socket.trade('SOLUSDT',price,T,a)
  expect((await relay.snapshot()).quotes.find(q=>q.asset==='SOL')?.price).toBe('150.00000001')
  vi.setSystemTime(start+30001)
  expect((await relay.snapshot()).quotes.find(q=>q.asset==='SOL')?.status).toBe('STALE')
  socket.trade('SOLUSDT','151',start+30001,8)
  expect((await relay.snapshot()).quotes.find(q=>q.asset==='SOL')).toMatchObject({price:'151',status:'LIVE'})
  relay.stop()
 })
 it('uses bounded timeout and failure backoff without inventing prices; closes idle sockets and reconnects on demand',async()=>{
  vi.useFakeTimers();vi.setSystemTime(start)
  let offline=true
  const request=vi.fn(async(url:unknown,_options?:RequestInit)=>{if(offline)throw Error('offline');return Response.json(String(url).includes('exchangeInfo')?{symbols:[metadata().symbols[2]]}:{symbol:'SOLUSDT',price:'150'})})
  const sockets:Socket[]=[],relay=new MarketRelay(request as typeof fetch,Date.now,()=>{const s=new Socket();sockets.push(s);return s as unknown as WebSocket})
  relay.start();await relay.snapshot();await settle();expect(request).toHaveBeenCalledTimes(1)
  expect((await relay.snapshot()).quotes.every(q=>q.price===null&&q.status==='UNAVAILABLE')).toBe(true)
  await vi.advanceTimersByTimeAsync(29999);expect(request).toHaveBeenCalledTimes(1)
  offline=false;await vi.advanceTimersByTimeAsync(1);await settle();expect(sockets).toHaveLength(1)
  expect(request.mock.calls[0]![1]).toMatchObject({redirect:'error',signal:expect.any(AbortSignal)})
  sockets[0]!.emit('error',Error('offline'));await relay.snapshot();expect(sockets).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(2000);await relay.snapshot();expect(sockets).toHaveLength(2)
  await vi.advanceTimersByTimeAsync(65000);expect(sockets[1]!.terminate).toHaveBeenCalledOnce()
  await relay.snapshot();expect(sockets).toHaveLength(3)
  relay.stop()
 })
 it('invalidates delisted metadata while retaining the last observed price',async()=>{
  let now=start,available=true
  const request=(async(url:unknown)=>Response.json(String(url).includes('exchangeInfo')?{symbols:available?[metadata().symbols[2]]:[]}:{symbol:'SOLUSDT',price:'150'})) as typeof fetch
  const relay=new MarketRelay(request,()=>now)
  await relay.snapshot();await settle();expect((await relay.snapshot()).quotes.find(q=>q.asset==='SOL')?.status).toBe('LIVE')
  now+=3600001;available=false;await relay.snapshot();await settle()
  expect((await relay.snapshot()).quotes.find(q=>q.asset==='SOL')).toMatchObject({price:'150',status:'UNAVAILABLE'})
  relay.stop()
 })
})
