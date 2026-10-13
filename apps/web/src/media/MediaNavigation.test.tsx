import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import Dashboard from '../tracker/Dashboard'
vi.mock('./ImageEditor',()=>({default:({onImage}:{onImage:(b:Blob)=>void})=><button type="button" onClick={()=>onImage(new Blob(['fixture'],{type:'image/jpeg'}))}>เลือกภาพสังเคราะห์</button>}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('keeps header logout and section navigation locked after an uncertain media upload',async()=>{
 let retry=false
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url==='/api/media/stage/receipt'){if(!retry)throw Error('lost response');return {ok:true,json:async()=>({id:'33333333-3333-4333-8333-333333333333'})}}
  const body=url.startsWith('/api/finance?')?{month:'2026-10',currency:'THB',income:'0',expense:'0',balance:'0',categories:[],transactions:[],budgets:[]}:url==='/api/crypto'?{quoteCurrency:'USDT',portfolios:[],holdings:[],trades:[]}:url==='/api/cash'?{accounts:[]}:{quotes:[]}
  return {ok:true,json:async()=>body}
 }))
 render(<Dashboard name="Synthetic" logout={vi.fn()} expired={vi.fn()} authBusy={false}/>)
 await waitFor(()=>expect((screen.getByRole('button',{name:'บันทึกรายการ'}) as HTMLButtonElement).disabled).toBe(false))
 fireEvent.click(screen.getByText('เลือกภาพสังเคราะห์'));fireEvent.click(screen.getByText('เตรียมรูปแนบสำหรับบันทึก'));await screen.findByText('ตรวจคำขอเก็บรูปเดิม')
 expect((screen.getByRole('button',{name:'ออกจากระบบ'}) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.getAllByRole('button',{name:'บัญชีและดูแลข้อมูล'}).every(b=>(b as HTMLButtonElement).disabled)).toBe(true)
 retry=true;fireEvent.click(screen.getByText('ตรวจคำขอเก็บรูปเดิม'));await screen.findByText(/รูปพร้อมแนบแล้ว/)
 await waitFor(()=>expect((screen.getByRole('button',{name:'ออกจากระบบ'}) as HTMLButtonElement).disabled).toBe(false))
})
