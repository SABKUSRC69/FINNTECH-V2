import {describe,expect,it} from 'vitest'
import {manualAssetInputSchema,manualAssetOverviewSchema,stockTradeEntrySchema,backupDocumentSchema} from '../src/index.js'
const id='00000000-0000-4000-8000-000000000001'
const asset={name:'Synthetic gold',type:'GOLD',currency:'THB',quantity:'10',unit:'กรัม',cost:'10000',value:'12500.10',date:'2026-10-08',note:''}
const backup={format:'FINNTECH_TRACKER_BACKUP',version:3,provenance:'USER_ENTERED',exportedAt:'2026-10-08T00:00:00.000Z',categories:[],transactions:[],budgets:[],portfolios:[],trades:[],cashAccounts:[],stockPortfolios:[],stockTrades:[],manualAssets:[{id,asset}]}
describe('persisted owned asset contracts and backup v3',()=>{
 it('accepts server id/version on manual read rows while writes reject owner/credential injection',()=>{
  expect(manualAssetOverviewSchema.parse({assets:[{id,version:1,...asset}]}).assets[0]?.id).toBe(id)
  expect(manualAssetInputSchema.safeParse({...asset,ownerId:id}).success).toBe(false)
  expect(manualAssetInputSchema.safeParse({...asset,value:'1.001'}).success).toBe(false)
  expect(manualAssetInputSchema.safeParse({...asset,unit:''}).success).toBe(false)
 })
 it('accepts fractional USD histories only for curated identities with bounded notes and positive Decimal strings',()=>{
  const trade={portfolioId:id,symbol:'AAPL',side:'buy',quantity:'0.00000001',price:'100',fee:'0.01',date:'2026-10-08',quoteCurrency:'USD',note:''}
  expect(stockTradeEntrySchema.parse(trade).quantity).toBe('0.00000001')
  for(const patch of [{symbol:'UNKNOWN'},{quoteCurrency:'USDT'},{quantity:0.5},{quantity:'0'},{price:'1e2'},{fee:'-1'},{note:'x'.repeat(501)}])expect(stockTradeEntrySchema.safeParse({...trade,...patch}).success).toBe(false)
 })
 it('v3 forbids nested credentials, duplicate owner-remapped IDs/names, missing references and total row overflow',()=>{
  expect(backupDocumentSchema.parse(backup).version).toBe(3)
  for(const input of [{...backup,token:'no'},{...backup,manualAssets:[{id,asset:{...asset,password:'no'}}]},{...backup,manualAssets:[{id,asset},{id,asset}]},{...backup,manualAssets:Array.from({length:2001},()=>({id,asset}))}])expect(backupDocumentSchema.safeParse(input).success).toBe(false)
 })
})
