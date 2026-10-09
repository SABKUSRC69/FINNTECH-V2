// @vitest-environment-options {"settings":{"enableJavaScriptEvaluation":false,"disableIframePageLoading":true}}
import {afterEach,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import ReceiptAssist from './ReceiptAssist'
import {PresentationProvider,PresentationControls} from '../presentation'
const fixture=vi.hoisted(()=>({text:'Total: 120.00 THB\nDate: 2026-10-09',read:vi.fn()}))
vi.mock('./ImageEditor',()=>({default:({onImage}:{onImage:(b:Blob)=>void})=><button type="button" onClick={()=>onImage(new Blob(['fictional'],{type:'image/jpeg'}))}>เลือกภาพสังเคราะห์</button>}))
vi.mock('./ocr',()=>({readImageText:fixture.read}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('hides local OCR drafts and receipt controls when amounts are hidden',()=>{
 render(<PresentationProvider><PresentationControls/><ReceiptAssist kind="finance" disabled={false} lock={vi.fn()} expired={vi.fn()} onAttachment={vi.fn()} onApply={vi.fn()}/></PresentationProvider>)
 fireEvent.click(screen.getByLabelText('ซ่อนยอดเงิน'));expect(screen.queryByRole('button',{name:'เลือกภาพสังเคราะห์'})).toBeNull();expect(screen.getByText('ซ่อนรูปและร่าง OCR ขณะซ่อนยอดเงิน')).toBeTruthy()
 fireEvent.click(screen.getByLabelText('แสดงยอดเงิน'));expect(screen.getByText('เลือกภาพสังเคราะห์')).toBeTruthy()
})
it('reviews OCR locally and applies only checked fields without submitting any ledger',async()=>{
 fixture.read.mockResolvedValue({text:fixture.text,confidence:60});const apply=vi.fn(),fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 render(<ReceiptAssist kind="finance" disabled={false} lock={vi.fn()} expired={vi.fn()} onAttachment={vi.fn()} onApply={apply}/>)
 fireEvent.click(screen.getByText('เลือกภาพสังเคราะห์'));fireEvent.click(screen.getByText('อ่านข้อมูลจากรูป / ลองใหม่'))
 await screen.findByLabelText('ค่าเสนอ จำนวนเงิน');expect(apply).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('ค่าเสนอ จำนวนเงิน'),{target:{value:'121.50'}});fireEvent.click(screen.getByLabelText('ใช้จำนวนเงิน'))
 fireEvent.click(screen.getByText('ใช้ช่องที่เลือกในฟอร์ม (ยังไม่บันทึก)'));expect(apply).toHaveBeenCalledWith({amount:'121.50'});expect(fetch).not.toHaveBeenCalled()
})
it('failed and cancelled OCR keep image attachment/manual workflows available',async()=>{
 fixture.read.mockImplementation((_image:Blob,_p:unknown,signal:AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('ยกเลิกการอ่านรูปแล้ว')))))
 const lock=vi.fn();render(<ReceiptAssist kind="finance" disabled={false} lock={lock} expired={vi.fn()} onAttachment={vi.fn()} onApply={vi.fn()}/>)
 fireEvent.click(screen.getByText('เลือกภาพสังเคราะห์'));fireEvent.click(screen.getByText('อ่านข้อมูลจากรูป / ลองใหม่'));fireEvent.click(screen.getByText('ยกเลิก OCR'))
 await screen.findByText('ยกเลิกการอ่านรูปแล้ว');expect((screen.getByText('เตรียมรูปแนบสำหรับบันทึก') as HTMLButtonElement).disabled).toBe(false)
 fixture.read.mockRejectedValue(Error('OCR unavailable'));fireEvent.click(screen.getByText('อ่านข้อมูลจากรูป / ลองใหม่'));await screen.findByText('OCR unavailable');expect(lock.mock.calls.some(([v])=>v===true)).toBe(false)
})
it('keeps original upload bytes and key after lost response and locks navigation',async()=>{
 const id='33333333-3333-4333-8333-333333333333',lock=vi.fn(),attached=vi.fn(),fetch=vi.fn().mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({ok:true,json:async()=>({id})});vi.stubGlobal('fetch',fetch)
 render(<ReceiptAssist kind="finance" disabled={false} lock={lock} expired={vi.fn()} onAttachment={attached} onApply={vi.fn()}/>)
 fireEvent.click(screen.getByText('เลือกภาพสังเคราะห์'));fireEvent.click(screen.getByText('เตรียมรูปแนบสำหรับบันทึก'));await screen.findByText('ตรวจคำขอเก็บรูปเดิม');expect(lock).toHaveBeenLastCalledWith(true)
 fireEvent.click(screen.getByText('ตรวจคำขอเก็บรูปเดิม'));await waitFor(()=>expect(attached).toHaveBeenCalledWith(id));const first=fetch.mock.calls[0]![1],second=fetch.mock.calls[1]![1];expect(second.body).toBe(first.body);expect(second.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key'])
})
