import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import StockHoldings from './StockHoldings'
import ManualAssets from './ManualAssets'
import {PresentationProvider,PresentationControls} from '../presentation'
const id='00000000-0000-4000-8000-000000000001',trade='00000000-0000-4000-8000-000000000002'
const stock={quoteCurrency:'USD',portfolios:[{id,name:'พอร์ตสังเคราะห์'}],holdings:[{portfolioId:id,symbol:'AAPL',quantity:'0.5',totalCost:'51',realizedPnl:'0'}],trades:[{id:trade,portfolioId:id,symbol:'AAPL',side:'buy',quantity:'0.5',price:'100',fee:'1',date:'2026-10-08',quoteCurrency:'USD',note:'ประวัติสมมติ',realizedPnl:'0',voidedAt:null,voidReason:null}]}
const cash={accounts:[{id,name:'เงินสดสังเคราะห์',balance:'1000.00',currency:'THB',asOf:'2026-01-01',version:1}]}
// Stock pages also read cash accounts; every other GET returns the stock ledger.
const read=(path:string)=>path==='/api/cash'?cash:stock
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('keeps unknown stock void reconciliation inside its trapped dialog until the same request completes',async()=>{
 const lock=vi.fn(),writes:RequestInit[]=[];let lost=true
 vi.stubGlobal('fetch',vi.fn(async(p:string,o:RequestInit)=>{if(o.method!=='GET'){writes.push(o);if(lost){lost=false;throw Error('lost commit response')}}return {ok:true,status:200,json:async()=>o.method==='GET'?read(p):{id:trade}}}))
 render(<StockHoldings snapshot={null} now={Date.now()} expired={vi.fn()} lock={lock}/>);await waitFor(()=>expect(screen.getByLabelText('พอร์ตหุ้น').hasAttribute('disabled')).toBe(false));fireEvent.change(screen.getByLabelText('พอร์ตหุ้น'),{target:{value:id}})
 fireEvent.click(screen.getByRole('button',{name:'ยกเลิกประวัติหุ้น'}));const dialog=screen.getByRole('dialog',{name:'ยกเลิกประวัติหุ้น'})
 fireEvent.change(within(dialog).getByLabelText('เหตุผลยกเลิกหุ้น'),{target:{value:'Synthetic correction'}});fireEvent.click(within(dialog).getByRole('button',{name:'ยืนยันยกเลิกหุ้น'}))
 const retry=await within(dialog).findByRole('button',{name:'ตรวจผลหุ้นด้วยคำขอเดิม'});expect(dialog.contains(retry)).toBe(true);expect(lock.mock.calls.at(-1)).toEqual([true])
 fireEvent.keyDown(dialog,{key:'Escape'});expect(screen.getByRole('dialog',{name:'ยกเลิกประวัติหุ้น'})).toBeTruthy()
 fireEvent.click(retry);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
 expect(writes).toHaveLength(2);expect(writes[1]?.body).toBe(writes[0]?.body);expect(writes[1]?.headers).toEqual(writes[0]?.headers)
})
it('ordinary users see their recorded stock cost with unavailable prices; unknown write locks navigation and retries exact payload/key',async()=>{
 const lock=vi.fn(),writes:RequestInit[]=[];let lost=true
 vi.stubGlobal('fetch',vi.fn(async(p:string,o:RequestInit)=>{if(o.method!=='GET'){writes.push(o);if(lost){lost=false;throw Error('lost response')}}return {ok:true,status:200,json:async()=>o.method==='GET'?read(p):{id:trade}}}))
 render(<PresentationProvider><PresentationControls/><StockHoldings snapshot={null} now={Date.now()} expired={vi.fn()} lock={lock}/></PresentationProvider>)
 await waitFor(()=>expect(screen.getByLabelText('พอร์ตหุ้น').hasAttribute('disabled')).toBe(false))
 fireEvent.change(screen.getByLabelText('พอร์ตหุ้น'),{target:{value:id}})
 expect(screen.getByText('ต้นทุน 51.00 USD · เฉลี่ย 102.00 USD')).toBeTruthy()
 expect(screen.getByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'})).toBeTruthy();expect(document.querySelector('iframe[title*="พอร์ตหุ้น"]')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'ซ่อนยอดเงิน'}));expect(screen.queryByText('ต้นทุน 51.00 USD · เฉลี่ย 102.00 USD')).toBeNull()
 fireEvent.change(screen.getByLabelText('จำนวนหุ้น (รวมเศษหุ้น)'),{target:{value:'0.25'}})
 fireEvent.change(screen.getByLabelText('ราคาประวัติต่อหุ้น USD'),{target:{value:'120'}})
 fireEvent.change(screen.getByLabelText('จ่ายจากบัญชีเงินสด'),{target:{value:id}})
 fireEvent.change(screen.getByLabelText(/^เงินบาทที่จ่ายจริง/),{target:{value:'1100'}})
 fireEvent.submit(screen.getByRole('form',{name:'บันทึกประวัติหุ้น'}))
 const retry=await screen.findByRole('button',{name:'ตรวจผลหุ้นด้วยคำขอเดิม'})
 expect(lock.mock.calls.at(-1)).toEqual([true]);expect(screen.getByLabelText('พอร์ตหุ้น').hasAttribute('disabled')).toBe(true)
 fireEvent.submit(screen.getByRole('form',{name:'บันทึกประวัติหุ้น'}));expect(writes).toHaveLength(1)
 fireEvent.click(retry);await screen.findByText('บันทึกสำเร็จ')
 await waitFor(()=>expect(lock.mock.calls.at(-1)).toEqual([false]))
 expect(writes).toHaveLength(2);expect(writes[1]?.body).toBe(writes[0]?.body);expect(writes[1]?.headers).toEqual(writes[0]?.headers)
 expect(JSON.parse(String(writes[0]?.body))).toMatchObject({portfolioId:id,quantity:'0.25',price:'120',quoteCurrency:'USD'})
})
it('provider observation changes USD estimate without rewriting recorded quantity/cost and ages to N/A',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(p:string)=>({ok:true,status:200,json:async()=>read(p)})))
 const now=Date.now(),time=new Date(now).toISOString(),props={now,lock:vi.fn(),expired:vi.fn()}
 const quote={source:'Alpaca IEX' as const,currency:'USD' as const,connection:'STREAMING' as const,quotes:[{symbol:'AAPL',price:'120',status:'LIVE' as const,observedAt:time,receivedAt:time}]}
 const {rerender}=render(<StockHoldings {...props} snapshot={quote}/>);await waitFor(()=>expect(screen.getByLabelText('พอร์ตหุ้น').hasAttribute('disabled')).toBe(false));fireEvent.change(screen.getByLabelText('พอร์ตหุ้น'),{target:{value:id}})
 expect(screen.getByText('มูลค่าประเมิน 60.00 USD')).toBeTruthy()
 rerender(<StockHoldings {...props} snapshot={{...quote,quotes:[{...quote.quotes[0]!,price:'122'}]}}/>);expect(screen.getByText('มูลค่าประเมิน 61.00 USD')).toBeTruthy();expect(screen.getByText('ต้นทุน 51.00 USD · เฉลี่ย 102.00 USD')).toBeTruthy()
 rerender(<StockHoldings {...props} now={now+30001} snapshot={quote}/>);expect(screen.queryByText('มูลค่าประเมิน 60.00 USD')).toBeNull();expect(screen.getByRole('button',{name:'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ'})).toBeTruthy();expect(document.querySelector('iframe[title*="พอร์ตหุ้น"]')).toBeNull();expect(screen.getByText('ต้นทุน 51.00 USD · เฉลี่ย 102.00 USD')).toBeTruthy()
})
it('manual valuations are dated totals; validates THB precision and preserves unknown PATCH version/payload/key',async()=>{
 const asset={id,version:2,name:'ทองคำทดสอบ',type:'GOLD',currency:'THB',quantity:'10',unit:'กรัม',cost:'10000',value:'12500',date:'2026-10-08',note:''},writes:RequestInit[]=[],lock=vi.fn();let lost=true
 vi.stubGlobal('fetch',vi.fn(async(_p:string,o:RequestInit)=>{if(o.method!=='GET'){writes.push(o);if(lost){lost=false;throw Error('lost response')}}return {ok:true,status:200,json:async()=>o.method==='GET'?{assets:[asset]}:{id}}}))
 render(<ManualAssets expired={vi.fn()} changed={vi.fn()} lock={lock}/>);fireEvent.click(await screen.findByRole('button',{name:'แก้ไขมูลค่าประเมิน'}))
 expect(screen.getByText('ประเมินด้วยตนเอง ณ 2026-10-08 · 12,500.00 THB')).toBeTruthy()
 fireEvent.change(screen.getByLabelText('มูลค่าประเมินรวม'),{target:{value:'1.001'}});fireEvent.submit(screen.getByRole('form',{name:'บันทึกสินทรัพย์ประเมินเอง'}));expect(writes).toHaveLength(0)
 fireEvent.change(screen.getByLabelText('มูลค่าประเมินรวม'),{target:{value:'13000.10'}});fireEvent.submit(screen.getByRole('form',{name:'บันทึกสินทรัพย์ประเมินเอง'}))
 const retry=await screen.findByRole('button',{name:'ตรวจผลสินทรัพย์ด้วยคำขอเดิม'});expect(lock.mock.calls.at(-1)).toEqual([true]);expect(screen.getByLabelText('ชื่อสินทรัพย์อื่น').hasAttribute('disabled')).toBe(true)
 fireEvent.click(retry);await screen.findByText('บันทึกสำเร็จ');expect(writes).toHaveLength(2);expect(writes[0]?.method).toBe('PATCH');expect(writes[1]?.body).toBe(writes[0]?.body);expect(writes[1]?.headers).toEqual(writes[0]?.headers)
 expect(JSON.parse(String(writes[0]?.body))).toMatchObject({expectedVersion:2,asset:{value:'13000.10',quantity:'10',currency:'THB'}})
})
