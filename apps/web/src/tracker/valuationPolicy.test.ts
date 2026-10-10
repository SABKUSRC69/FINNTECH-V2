import {it,expect} from 'vitest'
import type {ValuationOverview,StockMarketSnapshot} from '@finntech/contracts'
import {selectReference,REFERENCE_MAX_AGE} from './valuationPolicy'
import {valueMixedAssets,valueAssets} from '@finntech/finance'
const now=Date.parse('2026-10-09T12:00:00.000Z'),asOf=new Date(now).toISOString()
const data:ValuationOverview={references:[],usdThb:{source:'ECB',kind:'DAILY',status:'DAILY',rate:'35',asOf,receivedAt:asOf}}
const market:StockMarketSnapshot={source:'Alpaca IEX',currency:'USD',connection:'STREAMING',quotes:[{symbol:'AAPL',price:'120',status:'LIVE',observedAt:asOf,receivedAt:asOf}]}
it('manual override is visible, reversible, bounded by observation age and never substitutes purchase cost',()=>{
 const manual={id:'00000000-0000-4000-8000-000000000001',version:1,symbol:'AAPL',currency:'USD' as const,source:'MANUAL' as const,value:'130',asOf,updatedAt:asOf,enabled:true}
 const override={...data,references:[manual]}
 expect(selectReference('AAPL',override,market,now)).toMatchObject({value:'130',state:'MANUAL'})
 expect(selectReference('AAPL',{...data,references:[{...manual,enabled:false}]},market,now).value).toBe('120')
 expect(selectReference('AAPL',override,market,now+REFERENCE_MAX_AGE+1)).toMatchObject({value:null,state:'STALE'})
 expect(selectReference('AAPL',{...data,references:[{...manual,asOf:new Date(now-REFERENCE_MAX_AGE-1).toISOString()}]},market,now).value).toBeNull()
 expect(selectReference('AAPL',null,null,now)).toMatchObject({value:null,state:'MISSING'})
 expect(selectReference('AAPL',data,market,now+30001)).toMatchObject({value:null,state:'STALE'})
 // Up to 2 s of provider/browser clock skew is tolerated; anything further in the future is not live.
 expect(selectReference('AAPL',data,market,now-1).value).toBe('120')
 expect(selectReference('AAPL',data,market,now-2001).value).toBeNull()
})
it('USD daily/manual policy is separate from live rates, and errors need explicit fallback',()=>{
 expect(selectReference('USDTHB',data,null,now+30001)).toMatchObject({value:'35',state:'DAILY'})
 expect(selectReference('USDTHB',{...data,usdThb:{...data.usdThb,status:'ERROR'}},null,now)).toMatchObject({value:null,state:'ERROR'})
 expect(selectReference('USDTHB',data,null,now+REFERENCE_MAX_AGE+1).value).toBeNull()
 const manual={id:'00000000-0000-4000-8000-000000000002',version:1,symbol:'USDTHB',currency:'THB' as const,source:'MANUAL' as const,value:'36',asOf,updatedAt:asOf,enabled:true}
 expect(selectReference('USDTHB',{...data,references:[manual]},null,now)).toMatchObject({value:'36',state:'MANUAL'})
})
it('fractional shares in different portfolios aggregate once; missing quote differs from missing FX and zero needs neither',()=>{
 const base=valueAssets(['100'],[{portfolioId:'c',asset:'BTC',quantity:'0.1'}],new Map([['BTC','20']]),'34')
 const holdings=[{portfolioId:'a',symbol:'AAPL',quantity:'0.5'},{portfolioId:'b',symbol:'AAPL',quantity:'0.25'}],prices=new Map([['AAPL','120']]),manual=[{currency:'THB' as const,value:'10'},{currency:'USD' as const,value:'5'},{currency:'USDT' as const,value:'1'}]
 expect(valueMixedAssets(base,holdings,prices,manual,'34','35')).toMatchObject({totalThb:'3537',complete:true,native:{USD:'95'}})
 expect(valueMixedAssets(base,holdings,prices,manual,'34',null)).toMatchObject({totalThb:null,knownThb:'212',native:{USD:'95'}})
 expect(valueMixedAssets(base,holdings,new Map(),manual,'34','35')).toMatchObject({totalThb:null,knownThb:'387',native:{USD:null},knownNative:{USD:'5'}})
 expect(valueMixedAssets(valueAssets([],[],new Map(),null),[{symbol:'AAPL',quantity:'0'}],new Map(),[],null,null)).toMatchObject({complete:true,totalThb:'0'})
})
