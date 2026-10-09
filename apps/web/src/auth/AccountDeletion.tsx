import { useEffect, useRef, useState } from 'react'
import { trackerRequest, TrackerRequestError } from '../tracker/client'

const storageKey='finntech.deletion.pending-receipt'
export function pendingDeletionKey(): string | undefined {
  try { const key=sessionStorage.getItem(storageKey); return key && /^[a-f0-9-]{36}$/i.test(key)?key:undefined } catch { return undefined }
}
export default function AccountDeletion({ locked=false, lock, done, initialKey }: {
  locked?:boolean; lock:(value:boolean)=>void; done:()=>void; initialKey?:string|undefined
}):JSX.Element {
  const [password,setPassword]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false)
  const [message,setMessage]=useState(''),[receipt,setReceipt]=useState<{status:string;caseId?:string}|null>(null)
  const [pending,setPending]=useState(initialKey ?? pendingDeletionKey()),running=useRef(false)
  const original=useRef<{password:string;consent:string;requestKey:string}|null>(null)
  useEffect(()=>{if(pending)lock(true)},[pending,lock])
  function clear():void {try{sessionStorage.removeItem(storageKey)}catch{};setPending(undefined);original.current=null;setPassword('');lock(false)}
  async function check(key:string):Promise<{status:string;caseId?:string}> {
    const result=await trackerRequest('account/deletion/status','POST',{requestKey:key}) as {status:string;caseId?:string}
    if (!['REQUESTED','PURGED','NOT_FOUND'].includes(result.status))throw new Error('unknown receipt')
    setReceipt(result);return result
  }
  async function submit(reconcile=false):Promise<void> {
    if(running.current || (!pending && locked))return
    running.current=true;setBusy(true);lock(true);setMessage('')
    const key=pending ?? crypto.randomUUID()
    setPending(key);try{sessionStorage.setItem(storageKey,key)}catch{}
    try {
      if(reconcile) {await check(key);return}
      original.current ??= {password,consent:'DELETE_MY_ACCOUNT',requestKey:key}
      const result=await trackerRequest('account/deletion/request','POST',original.current) as {status:string;caseId?:string}
      if(result.status!=='REQUESTED')throw new Error('unknown receipt')
      setReceipt(result);setPassword('');original.current=null
    } catch(error) {
      if(error instanceof TrackerRequestError && !error.unknownOutcome) {
        try {const result=await check(key);if(result.status==='NOT_FOUND'){clear();setReceipt(null);setMessage('ยังไม่ได้รับคำขอลบ ตรวจรหัสผ่านและเซสชันก่อนลองอีกครั้ง');return}}catch{}
      }
      setMessage('ยังไม่ทราบผล คงคำขอเดิมไว้และตรวจผลอีกครั้งก่อนทำรายการอื่น')
    } finally {running.current=false;setBusy(false)}
  }
  const confirmed=receipt?.status==='REQUESTED'||receipt?.status==='PURGED'
  return <section aria-label="ขอลบบัญชี" className="tracker-card notebook-danger rounded-2xl border border-slate-200 p-5 space-y-4">
    <h2 className="text-xl font-semibold">ขอลบบัญชีและข้อมูล</h2>
    <p>ส่งออกข้อมูลก่อนยืนยัน คำขอนี้จะปิดการใช้งานและเพิกถอนทุกเซสชันทันที ผู้ดูแลจะลบข้อมูลตามหมายเลขคำขอ สำเนาสำรองหมดอายุตามนโยบายและจะไม่นำบัญชีที่ขอลบกลับมาเปิดใช้งาน</p>
    {confirmed ? <><p role="status">{receipt.status==='PURGED'?'ลบข้อมูลในฐานที่ใช้งานแล้ว':'รับคำขอลบแล้ว รอผู้ดูแลดำเนินการ'} · เลขที่ {receipt.caseId}</p><button className="auth-secondary" onClick={()=>{clear();done()}}>กลับไปเข้าสู่ระบบ</button></> : <>
      {pending && <button className="auth-secondary" disabled={busy} onClick={()=>void submit(true)}>ตรวจผลคำขอลบเดิม</button>}
      {(!pending||receipt?.status==='NOT_FOUND') && <form onSubmit={event=>{event.preventDefault();if(consent)void submit()}}>
        <label className="auth-label">รหัสผ่านปัจจุบัน<input type="password" className="auth-input" autoComplete="current-password" required minLength={12} maxLength={128} value={password} disabled={busy||(!pending&&locked)} onChange={event=>setPassword(event.target.value)}/></label>
        <label className="block my-4"><input type="checkbox" checked={consent} disabled={busy||(!pending&&locked)} onChange={event=>setConsent(event.target.checked)}/> ฉันยืนยันขอลบบัญชีและข้อมูลของฉัน</label>
        <button className="auth-primary" disabled={busy||!consent||(!pending&&locked)}>{pending?'ส่งคำขอลบเดิมอีกครั้ง':'ยืนยันขอลบบัญชี'}</button>
      </form>}
    </>}
    {message&&<p role="alert">{message}</p>}
  </section>
}
