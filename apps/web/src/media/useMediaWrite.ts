import {useEffect,useRef,useState} from 'react'
import {trackerRequest,TrackerRequestError} from '../tracker/client'
import {useScopedMediaLock} from './Locks'
type Request={path:string;body:unknown;key:string;done:(value:unknown)=>void}
export async function mediaRequest(path:string,body:unknown,key:string){
 if(!(body instanceof Blob))return trackerRequest(path,'POST',body,key)
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000)
 try{
  const res=await fetch(`/api/${path}`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':body.type,'Idempotency-Key':key},body})
  const value=await res.json()
  if(!res.ok)throw new TrackerRequestError(res.status===409?'รูปเกินโควตา หรือข้อมูลเปลี่ยนแล้ว ตรวจรูปเดิมก่อนลองใหม่':res.status===422||res.status===413?'รูปไม่ถูกต้องหรือใหญ่เกินกำหนด':res.status===429?'เตรียมรูปถี่เกินไป ลองใหม่อีกสักครู่':'ยังไม่ทราบผลการเก็บรูป ตรวจคำขอเดิมอีกครั้ง',res.status>=500,res.status===401)
  return value
 }catch(e){if(e instanceof TrackerRequestError)throw e;throw new TrackerRequestError('ยังไม่ทราบผลการเก็บรูป กดตรวจคำขอเดิม',true)}finally{clearTimeout(timer)}
}
export function useMediaWrite(lock:(value:boolean)=>void,expired:()=>void){
 const scopedLock=useScopedMediaLock(lock)
 const [busy,setBusy]=useState(false),[pending,setPending]=useState<Request|null>(null),[message,setMessage]=useState(''),inflight=useRef(false)
 useEffect(()=>{scopedLock(busy||!!pending);return()=>scopedLock(false)},[busy,pending,scopedLock])
 async function send(r:Request){if(inflight.current)return;inflight.current=true;setBusy(true);setMessage('');try{const v=await mediaRequest(r.path,r.body,r.key);setPending(null);r.done(v);setMessage('เก็บรูปสำเร็จ')}catch(e){setMessage(e instanceof Error?e.message:'เก็บรูปไม่สำเร็จ');if(e instanceof TrackerRequestError&&e.unknownOutcome)setPending(r);else{setPending(null);if(e instanceof TrackerRequestError&&e.expired)expired()}}finally{inflight.current=false;setBusy(false)}}
 return {busy,pending,message,setMessage,submit:(path:string,body:unknown,done:(v:unknown)=>void)=>{if(!busy&&!pending&&!inflight.current)void send({path,body,key:crypto.randomUUID(),done})},retry:()=>{if(pending)void send(pending)}}
}
