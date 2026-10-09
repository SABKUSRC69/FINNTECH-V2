import { useRef, useState, type FormEvent } from 'react'
import { AuthRequestError, readAccount, submitDemo, type AccountSnapshot } from './client'

export default function DemoEntry({ complete, lock, pendingLock, disabled }: { complete: (snapshot: AccountSnapshot) => void; lock: (busy: boolean) => void; pendingLock: (pending: boolean) => void; disabled: boolean }): JSX.Element {
  const [code, setCode] = useState(''), [message, setMessage] = useState(''), [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false), sending = useRef(false), prepared = useRef(false)
  const needsVerification = useRef(false)
  async function enter(event?: FormEvent): Promise<void> {
    event?.preventDefault()
    if (sending.current || disabled || (event && pending)) return
    sending.current = true; setBusy(true); lock(true); setMessage('')
    try {
      if (!prepared.current) { await submitDemo('prepare'); prepared.current = true }
      await submitDemo('enter', code)
      needsVerification.current = true
      const snapshot = await readAccount()
      if (snapshot.status !== 'signed-in') throw new AuthRequestError('ยังยืนยัน session ไม่ได้ กรุณาตรวจผลคำขอเดิม', true)
      needsVerification.current = false
      setCode(''); setPending(false); pendingLock(false); complete(snapshot)
    } catch (error) {
      setMessage(error instanceof AuthRequestError ? error.message : 'ยังไม่ทราบผล กรุณาตรวจผลคำขอเดิม')
      // A failed GET or a later replay rejection cannot undo a successful/unknown
      // entry. Only an authoritative ended receipt permits a deliberate fresh action.
      if (error instanceof AuthRequestError && error.demoEnded) needsVerification.current = false
      else if (!(error instanceof AuthRequestError) || error.outcomeUnknown) needsVerification.current = true
      const unknown = needsVerification.current
      setPending(unknown); pendingLock(unknown)
    } finally { sending.current = false; setBusy(false); lock(false) }
  }
  async function fresh(): Promise<void> {
    if (sending.current || pending) return
    sending.current = true; setBusy(true); lock(true)
    try { await submitDemo('reset'); prepared.current = true; setCode(''); setMessage('พร้อมเริ่มพื้นที่ใหม่ กรอกรหัสทดลองอีกครั้ง') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'เริ่มพื้นที่ใหม่ไม่สำเร็จ') }
    finally { sending.current = false; setBusy(false); lock(false) }
  }
  return <section aria-label="ทดลองใช้งาน DEMO">
    <h2 className="text-2xl font-semibold">ทดลองใช้งาน</h2>
    <p className="mt-3 text-sm leading-7">DEMO — ข้อมูลทดลอง · แยกพื้นที่ของแต่ละเบราว์เซอร์ ใช้ข้อมูลสมมติเท่านั้น ไม่ต้องสมัครบัญชี ไม่มีการกู้รหัสผ่าน</p>
    <form onSubmit={event => { void enter(event) }} aria-label="เข้า DEMO" className="mt-5 space-y-4">
      <label className="auth-label">รหัสทดลอง<input className="auth-input" type="password" autoComplete="off" required maxLength={128} value={code} disabled={disabled || busy || pending} onChange={event => setCode(event.target.value)} /></label>
      <button className="auth-primary w-full" type="submit" disabled={disabled || busy || pending}>{busy ? 'กำลังตรวจสอบ…' : 'เข้าพื้นที่ทดลอง'}</button>
    </form>
    {message && <p role="alert" className="mt-4 text-sm leading-7">{message}</p>}
    {pending && <><p role="status" className="mt-3 text-sm">คำขออาจสำเร็จแล้ว ลองคำขอเดิมเพื่อรับ session ของพื้นที่เดิม รหัสยังอยู่เฉพาะในหน่วยความจำหน้านี้</p><button className="auth-secondary mt-3" disabled={busy} onClick={() => { void enter() }}>ตรวจผลคำขอ DEMO เดิม</button></>}
    <button type="button" className="auth-secondary mt-4" disabled={disabled || busy || pending} onClick={() => { void fresh() }}>เริ่มพื้นที่ทดลองใหม่</button>
    <p className="mt-3 text-sm text-slate-500">พื้นที่เดิมยังเก็บอยู่ การเริ่มใหม่ไม่ลบข้อมูล หลังออกจากระบบหรือหมดอายุ ต้องเริ่มพื้นที่ใหม่</p>
  </section>
}
