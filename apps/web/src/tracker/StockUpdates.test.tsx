// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import StockPrices from './StockPrices'
const portfolio='00000000-0000-4000-8000-000000000001',newPortfolio='00000000-0000-4000-8000-000000000002'
const base={quoteCurrency:'USD',portfolios:[{id:portfolio,name:'พอร์ตทดสอบ'}],holdings:[{portfolioId:portfolio,symbol:'AAPL',quantity:'0.5',totalCost:'51',realizedPnl:'0'}],trades:[] as unknown[]}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
function setup(){
 let data=structuredClone(base),phase=0
 vi.stubGlobal('WebSocket',undefined)
 const fetch=vi.fn(async(path:string,options:RequestInit={})=>{
  if(path==='/api/stocks/market')return reply({source:'Alpaca IEX',currency:'USD',connection:'NOT_CONFIGURED',quotes:[]})
  if(options.method==='POST'){
   if(path==='/api/stocks/portfolios'){data.portfolios.push({id:newPortfolio,name:'พอร์ตใหม่'});return reply({id:newPortfolio})}
   const entry=JSON.parse(options.body as string);phase++
   data.holdings=[{portfolioId:portfolio,symbol:'AAPL',quantity:phase===1?'1':'0.75',totalCost:phase===1?'152':'114',realizedPnl:phase===1?'0':'36'}]
   data.trades.push({...entry,id:`00000000-0000-4000-8000-00000000000${phase+2}`,realizedPnl:phase===1?'0':'36',voidedAt:null,voidReason:null})
   return reply({id:`00000000-0000-4000-8000-00000000000${phase+2}`})
  }
  return reply(structuredClone(data))
 })
 vi.stubGlobal('fetch',fetch)
 return {fetch,setQuantity:(quantity:string)=>{data.holdings[0]!.quantity=quantity}}
}
function reply(body:unknown){return {ok:true,status:200,json:async()=>body}}
async function submit(side:string,quantity:string,price:string){
 const form=within(screen.getByRole('form',{name:'บันทึกประวัติหุ้น'}))
 fireEvent.change(form.getByLabelText('ชนิดประวัติหุ้น'),{target:{value:side}})
 fireEvent.change(form.getByLabelText('จำนวนหุ้น (รวมเศษหุ้น)'),{target:{value:quantity}})
 fireEvent.change(form.getByLabelText('ราคาประวัติต่อหุ้น USD'),{target:{value:price}})
 fireEvent.change(form.getByLabelText('ค่าธรรมเนียม USD'),{target:{value:'1'}})
 fireEvent.submit(screen.getByRole('form',{name:'บันทึกประวัติหุ้น'}))
 await waitFor(()=>expect(form.getByRole('button',{name:'บันทึกประวัติหุ้น'}).hasAttribute('disabled')).toBe(false))
}
it('updates shares, remaining cost, realized gains, history and the opted-in quote after buy and sell',async()=>{
 const {fetch}=setup();render(<StockPrices expired={vi.fn()}/>)
 await screen.findByText('จำนวน 0.50 หุ้น');expect((screen.getByLabelText('พอร์ตหุ้น') as HTMLSelectElement).value).toBe(portfolio)
 fireEvent.click(screen.getByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'}))
 await submit('buy','0.5','200');expect(await screen.findByText('จำนวน 1.00 หุ้น')).toBeTruthy()
 expect(screen.getByText('ต้นทุนคงเหลือรวม: 152.00 USD')).toBeTruthy()
 let url=new URL((screen.getByTitle('มูลค่าพอร์ตหุ้น USD โดย TradingView') as HTMLIFrameElement).src)
 expect(JSON.parse(decodeURIComponent(url.hash.slice(1))).symbol).toBe('NASDAQ:AAPL*1')
 await submit('sell','0.25','300');expect(await screen.findByText('จำนวน 0.75 หุ้น')).toBeTruthy()
 expect(screen.getByText('ต้นทุนคงเหลือรวม: 114.00 USD')).toBeTruthy();expect(screen.getByText('กำไร/ขาดทุนที่ขายแล้วรวม: 36.00 USD')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'กำไร/ขาดทุนยังไม่รับรู้ USD'}))
 url=new URL((screen.getByTitle('กำไรขาดทุนพอร์ตหุ้น USD โดย TradingView') as HTMLIFrameElement).src)
 expect(JSON.parse(decodeURIComponent(url.hash.slice(1))).symbol).toBe('NASDAQ:AAPL*0.75-114')
 expect(fetch.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(2)
 expect(screen.queryByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'})).toBeNull()
})
it('refreshes the stock ledger without discarding the chosen portfolio or opt-in',async()=>{
 const {setQuantity,fetch}=setup(),view=render(<StockPrices expired={vi.fn()} refreshRevision={0}/>)
 await screen.findByText('จำนวน 0.50 หุ้น');fireEvent.click(screen.getByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'}))
 setQuantity('2');view.rerender(<StockPrices expired={vi.fn()} refreshRevision={1}/>)
 expect(await screen.findByText('จำนวน 2.00 หุ้น')).toBeTruthy()
 expect(fetch.mock.calls.filter(([path])=>path==='/api/stocks')).toHaveLength(2)
 expect(screen.getByTitle('มูลค่าพอร์ตหุ้น USD โดย TradingView')).toBeTruthy()
})
it('selects a newly created portfolio and resets sharing when switching portfolios',async()=>{
 setup();render(<StockPrices expired={vi.fn()}/>);await screen.findByText('จำนวน 0.50 หุ้น')
 fireEvent.click(screen.getByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'}))
 fireEvent.change(screen.getByLabelText('ชื่อพอร์ตหุ้น'),{target:{value:'พอร์ตใหม่'}})
 fireEvent.submit(screen.getByRole('form',{name:'สร้างพอร์ตหุ้น'}))
 await waitFor(()=>expect((screen.getByLabelText('พอร์ตหุ้น') as HTMLSelectElement).value).toBe(newPortfolio))
 expect(screen.queryByTitle('มูลค่าพอร์ตหุ้น USD โดย TradingView')).toBeNull()
 fireEvent.change(screen.getByLabelText('พอร์ตหุ้น'),{target:{value:portfolio}})
 expect(screen.getByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'})).toBeTruthy()
})
