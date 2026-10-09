import {useState} from 'react'
import {resourceIdSchema} from '@finntech/contracts'
import {trackerRequest} from '../tracker/client'
import ModalDialog from '../tracker/ModalDialog'
import ImageEditor from './ImageEditor'
import {useMediaWrite} from './useMediaWrite'
import type {ReceiptKind} from './extract'
import {usePresentation} from '../presentation'
export default function Attachment({kind,id,disabled,lock,expired}:{kind:ReceiptKind;id:string;disabled:boolean;lock:(v:boolean)=>void;expired:()=>void}){
 const {hidden}=usePresentation()
 const [open,setOpen]=useState(false),[mediaId,setMediaId]=useState<string|null>(null),[image,setImage]=useState<Blob|null>(null),[stage,setStage]=useState<string>(),[loading,setLoading]=useState(false),[error,setError]=useState(''),[remove,setRemove]=useState(false),write=useMediaWrite(lock,expired)
 async function show(){setOpen(true);setLoading(true);try{const v=await trackerRequest(`media/attachments/${kind}/${id}`) as {mediaId:string|null};if(v.mediaId)resourceIdSchema.parse(v.mediaId);setMediaId(v.mediaId);setError('')}catch{setError('โหลดรูปแนบไม่ได้')}finally{setLoading(false)}}
 const blocked=disabled||loading||write.busy||!!write.pending
 function save(next:string|null){write.submit(`media/attachments/${kind}/${id}`,{mediaId:next},()=>{setMediaId(next);setStage(undefined);setImage(null);setRemove(false)})}
 if(hidden)return <><p className="text-xs">ซ่อนรูปแนบขณะซ่อนยอดเงิน</p>{write.pending&&<button type="button" onClick={write.retry}>ตรวจคำขอรูปแนบเดิม</button>}</>
 return <><button type="button" className="auth-secondary" disabled={disabled} onClick={()=>{void show()}}>ดูรูปแนบ / จัดการรูป</button>{open&&<ModalDialog title="รูปแนบส่วนตัว" closeDisabled={write.busy||!!write.pending} onDismiss={()=>{setOpen(false);setStage(undefined)}}>
  {loading?<p role="status">กำลังโหลดรูป…</p>:mediaId?<><img className="journal-media-preview" loading="lazy" src={`/api/media/objects/${mediaId}`} alt="รูปแนบรายการของคุณ"/><a className="auth-secondary" href={`/api/media/objects/${mediaId}?download=1`}>ดาวน์โหลดรูปแนบ</a><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>setRemove(true)}>นำรูปแนบออก</button></>:<p>รายการนี้ยังไม่มีรูปแนบ</p>}
  <p className="text-xs">การเปลี่ยนหรือนำรูปออกไม่ลบรายการการเงิน รายการแก้ไขอาจยังเก็บรูปเดิมร่วมกัน</p>
  {remove&&<div><p>ยืนยันนำรูปแนบออกจากรายการนี้?</p><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>save(null)}>ยืนยันนำรูปแนบออก</button><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>setRemove(false)}>เก็บรูปแนบเดิม</button></div>}
  <ImageEditor purpose="receipt" disabled={blocked||!!stage} onImage={setImage}/>
  {image&&!stage&&<button className="auth-secondary" type="button" disabled={blocked} onClick={()=>write.submit('media/stage/receipt',image,v=>setStage(resourceIdSchema.parse((v as {id:unknown}).id)))}>เตรียมรูปใหม่</button>}
  {stage&&<button className="auth-primary" type="button" disabled={blocked} onClick={()=>save(stage)}>ยืนยันแนบ / แทนที่รูป</button>}
  {stage&&<p className="text-xs">รูปพักที่ยังไม่ยืนยันจะหมดอายุใน 24 ชั่วโมง จัดการรูปพักได้ในหน้าบัญชี</p>}
  {(error||write.message)&&<p role="alert">{error||write.message}</p>}{write.pending&&<button type="button" className="auth-secondary" onClick={write.retry}>ตรวจคำขอรูปแนบเดิม</button>}
 </ModalDialog>}</>
}
