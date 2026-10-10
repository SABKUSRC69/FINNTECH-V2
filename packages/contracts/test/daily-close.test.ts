import {describe,expect,it} from 'vitest'
import {dailyCloseSnapshotSchema,valuationOverviewSchema} from '../src/index.js'
// Synthetic contract fixtures only; not provider evidence.
const quote={symbol:'AAPL',currency:'USD',priceType:'CLOSE',close:'227.52',tradingDate:'2026-10-09',fetchedAt:'2026-10-09T22:05:00.000Z',status:'CURRENT',problem:null}
const snapshot={provider:'READY',source:'Tiingo EOD',license:'REDISTRIBUTION',expectedSession:'2026-10-09',attribution:{label:'Tiingo',url:'https://www.tiingo.com'},quotes:[quote]}
describe('daily close contract',()=>{
 it('accepts a dated unadjusted close with provenance and keeps the overview backward compatible',()=>{
  expect(dailyCloseSnapshotSchema.parse(snapshot).quotes[0]?.close).toBe('227.52')
  const usdThb={source:'ECB',kind:'DAILY',status:'DAILY',rate:'33.6',asOf:'2026-10-09T00:00:00.000Z',receivedAt:'2026-10-09T15:00:00.000Z'}
  expect(valuationOverviewSchema.parse({references:[],usdThb}).dailyCloses).toBeUndefined()
  expect(valuationOverviewSchema.parse({references:[],usdThb,dailyCloses:snapshot}).dailyCloses?.provider).toBe('READY')
 })
 it('rejects adjusted/unknown price types, non-USD, impossible dates, zero prices and extra fields such as keys',()=>{
  const bad=(q:object)=>dailyCloseSnapshotSchema.safeParse({...snapshot,quotes:[{...quote,...q}]}).success
  expect(bad({priceType:'ADJ_CLOSE'})).toBe(false)
  expect(bad({currency:'THB'})).toBe(false)
  expect(bad({tradingDate:'2026-02-30'})).toBe(false)
  expect(bad({close:'0'})).toBe(false)
  expect(bad({apiKey:'x'})).toBe(false)
  expect(dailyCloseSnapshotSchema.safeParse({...snapshot,token:'x'}).success).toBe(false)
  expect(bad({close:null,tradingDate:null,fetchedAt:null,status:'MISSING',problem:'NOT_FOUND'})).toBe(true)
 })
})
