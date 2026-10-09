import {useEffect,useRef,useState} from 'react'
import {resourceIdSchema} from '@finntech/contracts'
import ImageEditor from './ImageEditor'
import {extractReceipt,type DraftFields,type ReceiptKind} from './extract'
import {readImageText} from './ocr'
import {useMediaWrite} from './useMediaWrite'
import {usePresentation} from '../presentation'
const labels:Record<string,string>={amount:'จำนวนเงิน',date:'วันที่',note:'บันทึกช่วยจำ',asset:'สินทรัพย์',symbol:'หลักทรัพย์',side:'ซื้อ/ขาย (buy/sell)',quantity:'จำนวน',price:'ราคาต่อหน่วย',fee:'ค่าธรรมเนียม'}
export default function ReceiptAssist({kind,disabled,lock,expired,onAttachment,onApply}:{kind:ReceiptKind;disabled:boolean;lock:(v:boolean)=>void;expired:()=>void;onAttachment:(id:string|undefined)=>void;onApply:(fields:DraftFields)=>void}){
 const [image,setImage]=useState<Blob|null>(null),[staged,setStaged]=useState<string>(),[text,setText]=useState(''),[fields,setFields]=useState<DraftFields>({}),[chosen,setChosen]=useState<string[]>([]),[warnings,setWarnings]=useState<string[]>([]),[amounts,setAmounts]=useState<string[]>([]),[ocrBusy,setOcrBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[low,setLow]=useState(false),controller=useRef<AbortController>(),job=useRef(0)
 const [duration,setDuration]=useState<number>()
 const write=useMediaWrite(lock,expired)
 const {hidden}=usePresentation()
 const blocked=disabled||write.busy||!!write.pending
 useEffect(()=>()=>{job.current++;controller.current?.abort()},[])
 function imageChanged(blob:Blob|null){controller.current?.abort();job.current++;setImage(blob);setOcrBusy(false);setText('');setFields({});setChosen([]);setStaged(undefined);onAttachment(undefined);setError('')}
 function analyze(value:string){const result=extractReceipt(value,kind);setFields(result.fields);setWarnings(result.warnings);setAmounts(result.amounts);setChosen([])}
 async function recognize(){if(!image||blocked||ocrBusy)return;const id=++job.current,start=performance.now();controller.current=new AbortController();setOcrBusy(true);setError('');setProgress(0);try{const result=await readImageText(image,setProgress,controller.current.signal);if(id!==job.current)return;setDuration(Math.round(performance.now()-start));setText(result.text);setLow(result.confidence<70);analyze(result.text)}catch(e){if(id===job.current)setError(e instanceof Error?e.message:'อ่านรูปไม่สำเร็จ')}finally{if(id===job.current)setOcrBusy(false)}}
 return <>{hidden&&<div><p>ซ่อนรูปและร่าง OCR ขณะซ่อนยอดเงิน</p>{write.pending&&<button type="button" onClick={write.retry}>ตรวจคำขอเก็บรูปเดิม</button>}</div>}<section hidden={hidden} data-ocr-duration-ms={duration} aria-label="ช่วยกรอกข้อมูลจากรูป" className="journal-media-panel sm:col-span-2 space-y-3">
  <ImageEditor purpose="receipt" disabled={blocked||ocrBusy||!!staged} onImage={imageChanged}/>
  <p className="text-xs">OCR ทำในเบราว์เซอร์ อาจอ่านผิด ไม่ยืนยันการชำระเงิน ไม่ส่งรูปไปบริการ OCR ภายนอก เมื่อเตรียมรูปจะเก็บรูปส่วนตัวใน FINNTECH; ไม่เก็บข้อความ OCR ทั้งหมด</p>
  {image&&<div className="flex flex-wrap gap-2"><button type="button" className="auth-secondary" disabled={blocked||ocrBusy} onClick={()=>{void recognize()}}>อ่านข้อมูลจากรูป / ลองใหม่</button><button type="button" className="auth-secondary" disabled={blocked||ocrBusy||!!staged} onClick={()=>write.submit('media/stage/receipt',image,v=>{if(v&&typeof v==='object'&&'id'in v){const id=resourceIdSchema.parse(v.id);setStaged(id);onAttachment(id)}})}>เตรียมรูปแนบสำหรับบันทึก</button></div>}
  {ocrBusy&&<><p role="status">กำลังอ่านรูป {progress}% · ครั้งแรกดาวน์โหลดชุดภาษา อาจใช้เวลานาน</p><progress max="100" value={progress}/><button type="button" className="auth-secondary" onClick={()=>controller.current?.abort()}>ยกเลิก OCR</button></>}
  {staged&&<><p role="status">รูปพร้อมแนบแล้ว ตรวจฟอร์มและกดบันทึกเอง · รูปพักที่ยังไม่บันทึกหมดอายุใน 24 ชั่วโมง</p><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>write.submit(`media/objects/${staged}/discard`,{},()=>{setStaged(undefined);onAttachment(undefined)} )}>นำรูปที่เตรียมออก</button></>}
  {image&&!staged&&<p className="text-xs">หากต้องการเก็บรูปกับรายการ กดเตรียมรูปก่อนบันทึก หากไม่กด รายการจะบันทึกโดยไม่มีรูป</p>}
  {text&&<div className="space-y-3"><label className="auth-label">ตรวจและแก้ข้อความที่อ่านได้ (ไม่บันทึกทั้งหมด)<textarea className="auth-input" rows={5} value={text} disabled={blocked} onChange={e=>setText(e.target.value)} maxLength={12000}/></label><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>analyze(text)}>วิเคราะห์ข้อความอีกครั้ง</button>{low&&<p>ข้อความอ่านได้ไม่ชัด ควรตรวจทุกช่องกับรูป</p>}
   {warnings.map(v=><p key={v} className="text-xs">{v}</p>)}
   {amounts.length>1&&kind==='finance'&&<label className="auth-label">เลือกยอดที่เห็นในรูป<select className="auth-input" value={fields.amount??''} onChange={e=>setFields(v=>({...v,amount:e.target.value}))}><option value="">ยังไม่เลือก</option>{amounts.map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
   <p>เลือกช่องที่ต้องการใช้ ช่องที่เลือกจะเขียนทับค่าฟอร์มเมื่อกดปุ่มด้านล่าง</p>
   {Object.entries(fields).map(([key,value])=><div key={key} className="journal-review-field"><label><input type="checkbox" disabled={blocked} checked={chosen.includes(key)} onChange={e=>setChosen(c=>e.target.checked?[...c,key]:c.filter(v=>v!==key))}/> ใช้{labels[key]}</label><input className="auth-input" aria-label={`ค่าเสนอ ${labels[key]}`} value={value??''} disabled={blocked} onChange={e=>setFields(f=>({...f,[key]:e.target.value}))}/></div>)}
   <button type="button" className="auth-secondary" disabled={blocked||chosen.length===0} onClick={()=>onApply(Object.fromEntries(Object.entries(fields).filter(([key])=>chosen.includes(key))))}>ใช้ช่องที่เลือกในฟอร์ม (ยังไม่บันทึก)</button>
  </div>}
  {(error||write.message)&&<p role="alert">{error||write.message}</p>}{write.pending&&<button className="auth-secondary" type="button" onClick={write.retry}>ตรวจคำขอเก็บรูปเดิม</button>}
 </section></>
}
