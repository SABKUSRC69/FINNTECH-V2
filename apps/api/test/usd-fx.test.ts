import {it,expect,vi} from 'vitest'
import {DailyUsdRelay,parseEcbDaily,ECB_URL} from '../src/tracker/usd-fx.js'
const now=Date.parse('2026-10-09T12:00:00.000Z'),xml="<Cube><Cube time='2026-10-08'><Cube currency='USD' rate='1.1'/><Cube currency='THB' rate='38.5'/></Cube></Cube>"
it('uses genuine EUR cross rates and original daily date, never a USDT peg',()=>{
 expect(parseEcbDaily(xml,now)).toMatchObject({rate:'35',asOf:'2026-10-08T00:00:00.000Z',status:'DAILY',kind:'DAILY'})
 expect(parseEcbDaily(xml,now+8*86400000).status).toBe('STALE')
 expect(()=>parseEcbDaily(xml.replace('2026-10-08','2026-10-10'),now)).toThrow()
 expect(()=>parseEcbDaily(xml.replace("rate='1.1'","rate='0'"),now)).toThrow()
 expect(()=>parseEcbDaily(xml.replace('THB','USDT'),now)).toThrow()
 expect(()=>parseEcbDaily('<!DOCTYPE entity>'+xml,now)).toThrow()
 expect(()=>parseEcbDaily('x'.repeat(32769),now)).toThrow()
})
it('deduplicates concurrent users and polls, times out and backs off without retimestamping old data',async()=>{
 let time=now,fail=false
 const fetcher=vi.fn(async(url:unknown,options:RequestInit)=>{expect(url).toBe(ECB_URL);expect(options.redirect).toBe('error');expect(options.signal).toBeTruthy();if(fail)throw Error('offline');return new Response(xml)})
 const relay=new DailyUsdRelay(fetcher as typeof fetch,()=>time)
 await Promise.all([relay.refresh(),relay.refresh(),relay.refresh()]);expect(fetcher).toHaveBeenCalledTimes(1)
 for(let i=0;i<100;i++)relay.snapshot();await relay.refresh();expect(fetcher).toHaveBeenCalledTimes(1)
 const old=relay.snapshot();time+=3600000;fail=true;await relay.refresh()
 expect(relay.snapshot()).toMatchObject({status:'ERROR',rate:'35',asOf:old.asOf,receivedAt:old.receivedAt})
 await relay.refresh();expect(fetcher).toHaveBeenCalledTimes(2)
 time+=60000;await relay.refresh();expect(fetcher).toHaveBeenCalledTimes(3)
 time+=60000;await relay.refresh();expect(fetcher).toHaveBeenCalledTimes(3)
})
it('bounds streaming bodies even without content length',async()=>{
 const relay=new DailyUsdRelay((async()=>new Response('x'.repeat(32769))) as typeof fetch,()=>now)
 await relay.refresh();expect(relay.snapshot()).toMatchObject({status:'ERROR',rate:null})
})
it('a hanging provider is aborted at five seconds and remains in backoff',async()=>{
 vi.useFakeTimers()
 try{
  const fetcher=vi.fn(async(_url:unknown,o:RequestInit)=>new Promise<Response>((_resolve,reject)=>o.signal!.addEventListener('abort',()=>reject(Error('timeout')))))
  const relay=new DailyUsdRelay(fetcher as typeof fetch,()=>now)
  // AbortSignal.timeout uses native timing; inspect the actual configured signal deadline
  // through a stub so this regression exercises the same error/backoff path deterministically.
  const controller=new AbortController(),stub=vi.spyOn(AbortSignal,'timeout').mockReturnValue(controller.signal)
  const pending=relay.refresh();expect(stub).toHaveBeenCalledWith(5000);controller.abort();await pending
  expect(relay.snapshot().status).toBe('ERROR');await relay.refresh();expect(fetcher).toHaveBeenCalledTimes(1);stub.mockRestore()
 }finally{vi.useRealTimers()}
})
