import { useEffect,useRef,useState } from 'react'
import { trackerRequest,TrackerRequestError } from './client'
type Pending={path:string;body:unknown;key:string;method:string}
/** Unknown outcomes retain exactly the validated payload/key and keep parent navigation locked. */
export function useOwnedWrite(lock:(value:boolean)=>void,expired:()=>void,refresh:()=>Promise<void>,completed?:(value:unknown,path:string)=>void){
 const [busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[message,setMessage]=useState(''),writing=useRef(false)
 useEffect(()=>{lock(busy||!!pending);return()=>lock(false)},[busy,pending,lock])
 async function send(request:Pending){
  if(writing.current)return
  writing.current=true;lock(true);setBusy(true);setMessage('')
  try{const value=await trackerRequest(request.path,request.method,request.body,request.key);setPending(null);completed?.(value,request.path);setMessage('บันทึกสำเร็จ');await refresh()}
  catch(error){setMessage(error instanceof Error?error.message:'บันทึกไม่สำเร็จ');if(error instanceof TrackerRequestError&&error.unknownOutcome)setPending(request);else{setPending(null);if(error instanceof TrackerRequestError&&error.expired)expired();else await refresh()}}
  finally{writing.current=false;setBusy(false)}
 }
 function submit(path:string,schema:{safeParse:(body:unknown)=>{success:boolean;data?:unknown}},body:unknown,method='POST'){
  if(writing.current||busy||pending)return
  const parsed=schema.safeParse(body);if(!parsed.success){setMessage('ตรวจข้อมูล จำนวนเงิน วันที่ และหน่วยอีกครั้ง');return}
  void send({path,body:parsed.data,key:globalThis.crypto.randomUUID(),method})
 }
 return {busy,pending,message,setMessage,submit,retry:()=>{if(pending)void send(pending)}}
}
