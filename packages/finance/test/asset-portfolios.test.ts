import {describe,expect,it} from 'vitest'
import {valueAssets,valueMixedAssets,valuePosition} from '../src/analytics.js'
describe('native-currency position and asset valuation',()=>{
 it('keeps exact fractional costs, separates personal return from market movement, handles zero/unknown',()=>{
  expect(valuePosition('0.25','25.5','120')).toEqual({averageCost:'102',value:'30',unrealized:'4.5',returnPercent:'17.65'})
  expect(valuePosition('0.25','25.5',null)).toMatchObject({averageCost:'102',value:null,unrealized:null})
  expect(valuePosition('0','0',null)).toMatchObject({value:'0',returnPercent:null})
  expect(valuePosition('1','0','120').returnPercent).toBeNull()
  expect(()=>valuePosition('1','1','0')).toThrow()
 })
 it('uses separate USD/THB and direct USDT/THB, never quantity-multiplies manual totals or debits cash',()=>{
  const base=valueAssets(['100'],[{portfolioId:'p',asset:'SOL',quantity:'2'}],new Map([['SOL','150']]),'33')
  const manual=[{currency:'THB' as const,value:'1000'},{currency:'USD' as const,value:'10'},{currency:'USDT' as const,value:'2'}]
  const partial=valueMixedAssets(base,[{symbol:'AAPL',quantity:'0.5'}],new Map([['AAPL','100']]),manual,'33',null)
  expect(partial).toMatchObject({totalThb:null,knownThb:'11066',complete:false,native:{THB:'1100',USDT:'302',USD:'60'}})
  expect(valueMixedAssets(base,[{symbol:'AAPL',quantity:'0.5'}],new Map([['AAPL','100']]),manual,'33','34').totalThb).toBe('13106')
  expect(base.cashThb).toBe('100')
 })
 it('marks missing positive stock valuations partial while an empty/zero position needs no price or conversion',()=>{
  const base=valueAssets(['100'],[],new Map(),null)
  expect(valueMixedAssets(base,[{symbol:'AAPL',quantity:'1'}],new Map(),[],null,null)).toMatchObject({totalThb:null,knownThb:'100',native:{USD:null},knownNative:{USD:'0'}})
  expect(valueMixedAssets(base,[{symbol:'AAPL',quantity:'0'}],new Map(),[],null,null)).toMatchObject({totalThb:'100',complete:true})
 })
 it('refuses unrepresentable aggregate values without silently replacing overflow with zero',()=>{
  const base=valueAssets(['999999999999999999.99'],[{portfolioId:'p',asset:'SOL',quantity:'1'}],new Map([['SOL','1']]),'1')
  expect(()=>valueMixedAssets(base,[],new Map(),[],null,null)).toThrow('Unrepresentable')
  expect(()=>valueMixedAssets(valueAssets(['999999999999999999.99'],[],new Map(),null),[],new Map(),[{currency:'THB',value:'1'}],null,null)).toThrow()
 })
})
