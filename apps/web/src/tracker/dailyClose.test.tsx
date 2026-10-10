// SYNTHETIC: prices below are fabricated fixtures for UI/calculation tests, not provider evidence.
import {it,expect,vi,afterEach,describe} from 'vitest'
import {render,cleanup,screen,fireEvent,waitFor} from '@testing-library/react'
import {latestSessionAt,previousTradingDay,CLOSE_PUBLISHED_MINUTES} from '@finntech/finance'
import type {ValuationOverview,StockMarketSnapshot} from '@finntech/contracts'
import Assets from './Assets'
import StockPrices from './StockPrices'
import {selectReference} from './valuationPolicy'
import {resetStockMarketForTests} from './stockMarket'

// Dates follow the real clock so the trading-session policy is exercised as deployed.
const expected=latestSessionAt(Date.now(),CLOSE_PUBLISHED_MINUTES),previous=previousTradingDay(expected),old=previousTradingDay(previousTradingDay(previous))
const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000b1',refId='00000000-0000-4000-8000-0000000000c1'
const iso=new Date().toISOString()
const close=(symbol:string,price:string|null,tradingDate:string|null=expected,extra:object={})=>({symbol,currency:'USD',priceType:'CLOSE',close:price,tradingDate:price?tradingDate:null,fetchedAt:price?iso:null,status:price?'CURRENT':'MISSING',problem:null,...extra})
const stocks={quoteCurrency:'USD',portfolios:[{id:A,name:'Synthetic A'},{id:B,name:'Synthetic B'}],trades:[],holdings:[
 {portfolioId:A,symbol:'AAPL',quantity:'0.5',totalCost:'51',realizedPnl:'0'},{portfolioId:B,symbol:'AAPL',quantity:'0.25',totalCost:'30',realizedPnl:'0'},
 {portfolioId:B,symbol:'SPY',quantity:'1.5',totalCost:'900',realizedPnl:'0'},{portfolioId:A,symbol:'QQQ',quantity:'0.1',totalCost:'50',realizedPnl:'0'}]}
type Daily=NonNullable<ValuationOverview['dailyCloses']>
const ready=(quotes:unknown[]):Daily=>({provider:'READY',source:'Synthetic EOD',license:'REDISTRIBUTION',expectedSession:expected,attribution:{label:'Synthetic',url:'https://example.test'},quotes} as Daily)
function setup(dailyCloses:Daily|undefined,manual?:{value:string;enabled:boolean}){
 vi.stubGlobal('WebSocket',undefined);const writes:{path:string;body:any}[]=[]
 const fetch=vi.fn(async(path:string,o:RequestInit={})=>{
  const reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body})
  if(o.method==='POST'){const body=JSON.parse(String(o.body));writes.push({path,body});if(path==='/api/valuation/references')manual={value:body.value,enabled:body.enabled};return reply({id:refId})}
  if(path==='/api/cash')return reply({accounts:[{id:A,name:'Synthetic cash',balance:'100',currency:'THB',asOf:expected,version:1}]})
  if(path==='/api/reference-rate')return reply({base:'USDT',quote:'THB',rate:null,receivedAt:null,status:'UNAVAILABLE',source:'Bitkub public',kind:'LAST_PRICE_SNAPSHOT'})
  if(path==='/api/stocks')return reply(structuredClone(stocks))
  if(path==='/api/assets/manual')return reply({assets:[]})
  // Not the Alpaca key owner: live prices are unavailable to this account.
  if(path==='/api/stocks/market')return reply({error:{code:'STOCK_ACCESS_REQUIRED'}},403)
  if(path==='/api/valuation/references')return reply({references:manual?[{id:refId,version:1,symbol:'AAPL',currency:'USD',source:'MANUAL',value:manual.value,asOf:iso,updatedAt:iso,enabled:manual.enabled}]:[],
   usdThb:{source:'ECB',kind:'DAILY',status:'DAILY',rate:'35',asOf:new Date(Date.now()-86400000).toISOString(),receivedAt:iso},...(dailyCloses?{dailyCloses}:{})})
  return reply({})
 });vi.stubGlobal('fetch',fetch);return {fetch,writes}
}
const assets=()=>render(<Assets crypto={{quoteCurrency:'USDT',portfolios:[],holdings:[],trades:[]}} market={{quotes:[]}} now={Date.now()} expired={vi.fn()} lock={vi.fn()}/>)
const total=()=>screen.getByTestId('assets-total').textContent
afterEach(()=>{cleanup();resetStockMarketForTests();vi.unstubAllGlobals();vi.restoreAllMocks()})

describe('Assets with automatic daily closes (any signed-in account, no live key)',()=>{
 it('values fractional shares across portfolios: quantity × close − remaining cost, converted with the dated ECB rate',async()=>{
  setup(ready([close('AAPL','200'),close('SPY','500'),close('QQQ','400')]));assets()
  // AAPL 0.75×200 + SPY 1.5×500 + QQQ 0.1×400 = 940 USD; ×35 = 32,900 THB; + 100 THB cash.
  await waitFor(()=>expect(total()).toBe('33,000.00 THB'))
  const summary=screen.getByTestId('stock-summary').textContent!
  expect(summary).toContain('มูลค่าตามราคาอ้างอิง 940.00 USD ≈ 32,900.00 THB');expect(summary).toContain('ต้นทุนคงเหลือ 1,031.00 USD');expect(summary).toMatch(/ยังไม่รับรู้ -91\.00 USD/)
  expect(screen.getByTestId('daily-close-status').textContent).toContain(`Synthetic EOD · วันซื้อขายล่าสุดที่ควรเผยแพร่แล้ว ${expected}`)
  expect(screen.getAllByText(new RegExp(`ราคาปิดวันที่ซื้อขาย ${expected} \\(นิวยอร์ก\\)`)).length).toBe(4)
  expect(screen.getByTestId('usd-thb-label').textContent).toContain('ECB')
  expect(screen.getAllByRole('button',{name:/กรอกราคาเองแทน AAPL/}).length).toBe(2)
 })
 it('a missing or stale close lists the symbol, shows a partial total and never substitutes cost or a made-up price',async()=>{
  setup(ready([close('AAPL','200'),close('SPY','500'),close('QQQ','400',old,{status:'STALE',problem:'UNAVAILABLE'})]));assets()
  await screen.findByTestId('stock-missing')
  expect(total()).toBe('N/A THB');expect(screen.getByTestId('stock-missing').textContent).toContain('ยังขาดราคา: QQQ')
  // Known part: 900 USD × 35 + 100 = 31,600 THB, explicitly labelled partial.
  expect(screen.getByText(/ยอดที่ประเมินได้บางส่วน: 31,600.00 THB/)).toBeTruthy()
  expect(screen.getByTestId('stock-summary').textContent).toMatch(/บางส่วน 900\.00 USD \(ไม่รวม QQQ\).*-81\.00 USD จากต้นทุน 981\.00 USD/)
  expect(screen.getByText(new RegExp(`ราคาปิดล่าสุดที่ทราบ 400.00 USD · วันที่ซื้อขาย ${old} · เก่าเกินเกณฑ์`))).toBeTruthy()
  expect(screen.getByText(/ขาดราคาอ้างอิง QQQ/)).toBeTruthy()
 })
 it('one session late (not yet published) still values, with both dates shown',async()=>{
  setup(ready([close('AAPL','200',previous,{status:'DELAYED',problem:'NOT_YET_PUBLISHED'}),close('SPY','500'),close('QQQ','400')]));assets()
  await waitFor(()=>expect(total()).toBe('33,000.00 THB'))
  expect(screen.getAllByText(new RegExp(`ยังไม่มีราคาปิดของวันที่ ${expected} จึงใช้ราคาปิดวันที่ ${previous}`)).length).toBe(2)
 })
 it('manual entry stays available, is labelled as replacing automatic, and can be switched back',async()=>{
  const {writes}=setup(ready([close('AAPL','200'),close('SPY','500'),close('QQQ','400')]),{value:'210',enabled:true});assets()
  await waitFor(()=>expect(total()).toBe('33,262.50 THB')) // AAPL 0.75 × 210 instead of 200
  expect(screen.getAllByText(/มีราคาปิดอัตโนมัติ 200.00 USD .* แต่ระบบใช้ราคาที่คุณกรอกเองอยู่/).length).toBe(2)
  expect(screen.getAllByText(/กรอกเอง \(แทนอัตโนมัติ\)/).length).toBe(2)
  fireEvent.click(screen.getAllByRole('button',{name:'กลับไปใช้ราคาปิดอัตโนมัติ AAPL'})[0]!)
  await waitFor(()=>expect(total()).toBe('33,000.00 THB'))
  expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({path:'/api/valuation/references',body:{symbol:'AAPL',value:'210',enabled:false,expectedVersion:1}})
 })
 it('licence or configuration gaps are explicit and leave totals unavailable',async()=>{
  setup({provider:'NOT_LICENSED',source:'Synthetic EOD',license:'PERSONAL',expectedSession:expected,attribution:null,quotes:[]});const view=assets()
  await screen.findByText(/ราคาปิดอัตโนมัติยังไม่เปิดให้บัญชีนี้ตามสิทธิ์ข้อมูล/);expect(total()).toBe('N/A THB');view.unmount();cleanup()
  setup({provider:'NOT_CONFIGURED',source:null,license:null,expectedSession:expected,attribution:null,quotes:[]});assets()
  await screen.findByText(/ใส่ key ฟรีของคุณเองได้ที่ เพิ่มเติม → บัญชีและดูแลข้อมูล/);expect(total()).toBe('N/A THB')
 })
})
it('stock portfolio page values the selected portfolio from the same daily closes',async()=>{
 setup(ready([close('AAPL','200'),close('SPY','500'),close('QQQ','400')]));render(<StockPrices expired={vi.fn()}/>)
 await screen.findByText('มูลค่าประเมินของพอร์ต: 140.00 USD · ครบตามรายการที่บันทึก') // A: 0.5×200 + 0.1×400
 expect(screen.getAllByText(new RegExp(`ราคาปิดวันที่ซื้อขาย ${expected}`)).length).toBe(2)
})
describe('selection policy',()=>{
 const sat=Date.parse('2026-10-10T15:00:00Z'),fri='2026-10-09'
 const base:ValuationOverview={references:[],usdThb:{source:'ECB',kind:'DAILY',status:'DAILY',rate:'35',asOf:'2026-10-09T00:00:00.000Z',receivedAt:'2026-10-09T15:00:00.000Z'},
  dailyCloses:{provider:'READY',source:'Synthetic EOD',license:'REDISTRIBUTION',expectedSession:fri,attribution:null,quotes:[{symbol:'AAPL',currency:'USD',priceType:'CLOSE',close:'200',tradingDate:fri,fetchedAt:'2026-10-09T22:30:00.000Z',status:'CURRENT',problem:null}]}}
 const live=(price:string,at:number):StockMarketSnapshot=>({source:'Alpaca IEX',currency:'USD',connection:'STREAMING',quotes:[{symbol:'AAPL',price,status:'LIVE',observedAt:new Date(at).toISOString(),receivedAt:new Date(at).toISOString()}]})
 it('weekend uses Friday close; a fresh live trade wins; the 30 s live rule never ages a close',()=>{
  expect(selectReference('AAPL',base,null,sat)).toMatchObject({value:'200',state:'CLOSE',close:{tradingDate:fri,status:'CURRENT'}})
  const tue=Date.parse('2026-10-13T15:00:00Z')
  expect(selectReference('AAPL',base,live('201',tue),tue)).toMatchObject({value:'201',state:'LIVE'})
  expect(selectReference('AAPL',base,live('201',tue),tue+31000)).toMatchObject({value:'200',state:'CLOSE',close:{status:'DELAYED'}}) // Tue: Mon expected, Fri is 1 session late
  expect(selectReference('AAPL',base,null,Date.parse('2026-10-13T23:00:00Z'))).toMatchObject({value:null,state:'STALE',lastKnownClose:{price:'200',tradingDate:fri}})
 })
 it('missing/failed closes say why; unknown symbols are not priced from other symbols',()=>{
  expect(selectReference('MSFT',base,null,sat)).toMatchObject({value:null,state:'MISSING'})
  const failed={...base,dailyCloses:{...base.dailyCloses!,quotes:[{...base.dailyCloses!.quotes[0]!,close:null,tradingDate:null,fetchedAt:null,status:'ERROR' as const,problem:'AUTH_FAILED' as const}]}}
  expect(selectReference('AAPL',failed,null,sat)).toMatchObject({value:null,state:'ERROR',source:expect.stringContaining('ผู้ให้บริการปฏิเสธ key')})
 })
})
