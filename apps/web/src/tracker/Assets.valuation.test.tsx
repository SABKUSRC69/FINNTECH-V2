import {it,expect,vi,afterEach} from 'vitest'
import {render,cleanup,screen,fireEvent,waitFor,within} from '@testing-library/react'
import Assets from './Assets'
import StockPrices from './StockPrices'
import {PresentationProvider,PresentationControls} from '../presentation'
import {expectHeld,heldRow} from './heldAssetsTestUtils'
const now=Date.now(),asOf=new Date(now-60000).toISOString(),id='00000000-0000-4000-8000-000000000001'
const baseStocks={quoteCurrency:'USD',portfolios:[{id,name:'Synthetic'}],holdings:[{portfolioId:id,symbol:'AAPL',quantity:'0.5',totalCost:'50',realizedPnl:'0'}],trades:[] as unknown[]}
const emptyCrypto={quoteCurrency:'USDT' as const,portfolios:[],holdings:[],trades:[]},emptyMarket={quotes:[]}
const refs={references:[{id,version:1,symbol:'AAPL',currency:'USD',source:'MANUAL',value:'120',asOf,updatedAt:asOf,enabled:true}],usdThb:{source:'ECB',kind:'DAILY',status:'DAILY',rate:'35',asOf,receivedAt:asOf}}
function setup(){let stocks=structuredClone(baseStocks),references=structuredClone(refs),lost=false;const writes:RequestInit[]=[]
 vi.stubGlobal('WebSocket',undefined)
 const fetch=vi.fn(async(path:string,o:RequestInit={})=>{
  if(o.method==='POST'){writes.push(o);const b=JSON.parse(String(o.body));if(path==='/api/valuation/references'){if(lost){lost=false;throw Error('lost response')}const {expectedVersion:_version,...fields}=b;references.references=[{...references.references[0]!,...fields,source:'MANUAL',updatedAt:asOf,version:2}];return reply({id})}
   const quantity=b.side==='buy'?'1':'0.75';stocks.holdings=[{...stocks.holdings[0]!,quantity,totalCost:b.side==='buy'?'100':'75'}];stocks.trades.push({...b,id,realizedPnl:'0',voidedAt:null,voidReason:null});return reply({id})}
  if(path==='/api/stocks')return reply(structuredClone(stocks))
  if(path==='/api/assets/manual')return reply({assets:[]})
  if(path==='/api/stocks/market')return reply({source:'Alpaca IEX',currency:'USD',connection:'NOT_CONFIGURED',quotes:[]})
  if(path==='/api/valuation/references')return reply(structuredClone(references))
  if(path==='/api/reference-rate')return reply({base:'USDT',quote:'THB',rate:null,receivedAt:null,status:'UNAVAILABLE',source:'Bitkub public',kind:'LAST_PRICE_SNAPSHOT'})
  return reply({accounts:[{id,name:'Synthetic cash',balance:'100',currency:'THB',asOf:'2026-10-09',version:1}]})
 });vi.stubGlobal('fetch',fetch)
 return {fetch,writes,lose:()=>{lost=true},missingFx:()=>{references.usdThb={...references.usdThb,status:'ERROR'}},missingQuote:()=>{references.references=[]}}
}
function reply(body:unknown){return {ok:true,status:200,json:async()=>body}}
function asset(lock=vi.fn()){return <Assets crypto={emptyCrypto} market={emptyMarket} now={now} expired={vi.fn()} lock={lock}/>}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('confirmed buy/sell then navigating to Assets reads current holdings once and does not replay trades',async()=>{
 const {writes,fetch}=setup()
 for(const [side,quantity,total] of [['buy','0.5','4,300.00 THB'],['sell','0.25','3,250.00 THB']]){
  const page=render(<StockPrices expired={vi.fn()}/>);await screen.findByText(side==='buy'?'จำนวน 0.50 หุ้น':'จำนวน 1.00 หุ้น')
  const form=within(screen.getByRole('form',{name:'บันทึกประวัติหุ้น'}));fireEvent.change(form.getByLabelText('ชนิดประวัติหุ้น'),{target:{value:side}});fireEvent.change(form.getByLabelText('จำนวนหุ้น (รวมเศษหุ้น)'),{target:{value:quantity}});fireEvent.change(form.getByLabelText('ราคาประวัติต่อหุ้น USD'),{target:{value:'100'}});fireEvent.change(form.getByLabelText(side==='buy'?'จ่ายจากบัญชีเงินสด':'รับเข้าบัญชีเงินสด'),{target:{value:id}});fireEvent.change(form.getByLabelText(side==='buy'?/^เงินบาทที่จ่ายจริง/:/^เงินบาทที่ได้รับจริง/),{target:{value:'1000'}});fireEvent.submit(screen.getByRole('form',{name:'บันทึกประวัติหุ้น'}));await screen.findByText('บันทึกสำเร็จ');await waitFor(()=>expect(form.getByRole('button',{name:'บันทึกประวัติหุ้น'}).hasAttribute('disabled')).toBe(false));page.unmount()
  const assets=render(asset());await waitFor(()=>expect(screen.getByTestId('assets-total').textContent).toBe(total));assets.unmount()
 }
 expect(writes).toHaveLength(2);expect(fetch.mock.calls.filter(([p,o])=>p==='/api/stocks/trades'&&o?.method==='POST')).toHaveLength(2)
})
it('missing FX keeps native USD/partial THB; missing quote is actionable rather than zero; privacy masks valuation',async()=>{
 const control=setup();control.missingFx();const view=render(<PresentationProvider><PresentationControls/>{asset()}</PresentationProvider>)
 await waitFor(()=>expectHeld('AAPL',['กรอกเอง','0.5 หุ้น','N/A THB','60.00 USD']))
 expect(document.body.textContent).toContain('USD: 60.00');expect(screen.getByTestId('assets-total').textContent).toBe('N/A THB')
 expect(screen.getByText(/ประเมินได้บางส่วน 100.00 THB · ยังไม่ใช่ยอดรวม/)).toBeTruthy();expect(screen.getByTestId('usd-thb-label').textContent).toContain('USD → THB: N/A')
 fireEvent.click(screen.getByRole('button',{name:'ซ่อนยอดเงิน'}));expect(document.body.textContent).not.toContain('USD: 60.00');expect(heldRow('AAPL').textContent).not.toContain('60.00 USD')
 view.unmount();control.missingQuote();render(asset())
 await waitFor(()=>expect(screen.getByTestId('stock-missing').textContent).toBe('ขาดราคา: AAPL'))
 expect(screen.getByTestId('assets-total').textContent).toBe('N/A THB');expectHeld('AAPL',['ราคาไม่พร้อม','N/A THB','N/A USD'])
 // Actionable: the reference editor offers AAPL so the owner can enter a price.
 expect(within(screen.getByRole('form',{name:'บันทึกราคาอ้างอิง'})).getByRole('option',{name:'AAPL'})).toBeTruthy()
})
it('reference unknown outcome locks all asset forms/navigation and retries identical version, payload and key before refreshing',async()=>{
 const {writes,lose}=setup();const lock=vi.fn();render(asset(lock));await waitFor(()=>expect(screen.getByLabelText('รายการอ้างอิง').hasAttribute('disabled')).toBe(false))
 fireEvent.change(screen.getByLabelText('รายการอ้างอิง'),{target:{value:'AAPL'}});fireEvent.change(screen.getByLabelText('ราคา USD ต่อหุ้น'),{target:{value:'130'}});lose();fireEvent.submit(screen.getByRole('form',{name:'บันทึกราคาอ้างอิง'}))
 const retry=await screen.findByRole('button',{name:'ตรวจผลราคาอ้างอิงด้วยคำขอเดิม'});expect(lock.mock.calls.at(-1)).toEqual([true]);expect(screen.getByLabelText('ชื่อเงินสดหรือบัญชี').hasAttribute('disabled')).toBe(true);expect(screen.getByLabelText('ชื่อสินทรัพย์อื่น').hasAttribute('disabled')).toBe(true)
 fireEvent.submit(screen.getByRole('form',{name:'บันทึกราคาอ้างอิง'}));expect(writes).toHaveLength(1);fireEvent.click(retry);await waitFor(()=>expect(screen.getByTestId('assets-total').textContent).toBe('2,375.00 THB'));expect(writes).toHaveLength(2);expect(writes[0]!.body).toBe(writes[1]!.body);expect(writes[0]!.headers).toEqual(writes[1]!.headers);expect(JSON.parse(String(writes[0]!.body)).expectedVersion).toBe(1);await waitFor(()=>expect(lock.mock.calls.at(-1)).toEqual([false]))
})
