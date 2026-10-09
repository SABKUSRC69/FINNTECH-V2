import { useRef, useState, type FormEvent } from 'react'
import { AuthRequestError, submitRecovery } from './client'

export interface RecoveryLink { kind: 'reset' | 'verify'; token: string }
// Initial navigation only; no storage. Remove the sensitive query before any Auth/API request.
export function takeRecoveryLink(): RecoveryLink | undefined {
  const kind = location.pathname === '/account/reset' ? 'reset' : location.pathname === '/account/verify' ? 'verify' : undefined
  if (!kind) return undefined
  const url = new URL(location.href)
  const token = new URLSearchParams(url.hash.slice(1)).get('token') ?? url.searchParams.get('token') ?? ''
  history.replaceState(null, '', location.pathname)
  return { kind, token }
}
export default function RecoveryPanel({ link, close, lock, real = false }: { link?: RecoveryLink; close: () => void; lock?: (busy: boolean) => void; real?: boolean }): JSX.Element {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [done, setDone] = useState(false)
  const [existing, setExisting] = useState(false), token = useRef(link?.token ?? ''), writing = useRef(false)
  const reset = link?.kind === 'reset', verify = link?.kind === 'verify'
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (writing.current || unknown || done) return
    if (reset && password !== confirmation) { setMessage('รหัสผ่านทั้งสองช่องต้องตรงกัน'); return }
    writing.current = true; setBusy(true); lock?.(true); setMessage('')
    try {
      await submitRecovery(reset ? 'reset-password' : verify ? 'confirm-email' : existing ? 'begin-verification' : 'request-password-reset',
        reset ? { token: token.current, newPassword: password, confirmation } : verify ? { token: token.current } : existing ? { email, password } : { email })
      setDone(true); token.current = ''
      setMessage(reset ? 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่' : verify ? 'ยืนยันอีเมลแล้ว กรุณาเข้าสู่ระบบตามปกติ' : 'หากบัญชีนี้รองรับการกู้คืน ระบบจะส่งขั้นตอนไปยังอีเมลที่ลงทะเบียนไว้')
    } catch (error) {
      const uncertain = !(error instanceof AuthRequestError) || error.outcomeUnknown
      setUnknown(uncertain)
      setMessage(uncertain ? 'ยังยืนยันผลไม่ได้ ไม่ส่งรหัสผ่านซ้ำอัตโนมัติ กรุณาตรวจด้วยการเข้าสู่ระบบปกติหรือขอลิงก์ใหม่' : error.message)
      if (uncertain) token.current = ''
    } finally { setPassword(''); setConfirmation(''); writing.current = false; setBusy(false); lock?.(false) }
  }
  return <section aria-label="กู้คืนและยืนยันบัญชี" className="tracker-card p-6">
    <h2 className="text-xl">{reset ? 'ตั้งรหัสผ่านใหม่' : verify ? 'ยืนยันอีเมล' : 'ลืมรหัสผ่าน'}</h2>
    <p className="mt-3 text-sm">{real ? 'ระบบจะส่งลิงก์ไปยังอีเมลบัญชี ลิงก์ใช้ได้ครั้งเดียว ต้องกดยืนยันในหน้านี้ หากไม่ได้ร้องขอให้ปิดหน้านี้' : 'เปิดเฉพาะพื้นที่ทดสอบสังเคราะห์ในเครื่อง ไม่มีการส่งอีเมลออกภายนอก'}</p>
    <form className="mt-5 space-y-4" aria-label="ฟอร์มกู้คืนบัญชี" onSubmit={event => { void submit(event) }}>
      {!link && <label className="auth-label">อีเมล<input className="auth-input" type="email" autoComplete="email" required value={email} disabled={busy || unknown || done} onChange={e => setEmail(e.target.value)} /></label>}
      {(reset || existing) && <label className="auth-label">{reset ? 'รหัสผ่านใหม่' : 'รหัสผ่านปัจจุบัน'}<input className="auth-input" type="password" autoComplete={reset ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} value={password} disabled={busy || unknown || done} onChange={e => setPassword(e.target.value)} /></label>}
      {reset && <label className="auth-label">ยืนยันรหัสผ่านใหม่<input className="auth-input" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} disabled={busy || unknown || done} onChange={e => setConfirmation(e.target.value)} /></label>}
      <button className="auth-primary" disabled={busy || unknown || done || (!!link && !token.current)}>{busy ? 'กำลังตรวจผล…' : reset ? 'ยืนยันรหัสผ่านใหม่' : verify ? 'ยืนยันอีเมลนี้' : existing ? 'ขอเริ่มยืนยันอีเมล' : 'ขอลิงก์กู้คืน'}</button>
    </form>
    {!link && !done && <button className="auth-secondary mt-4" disabled={busy || unknown} onClick={() => { setExisting(!existing); setPassword(''); setMessage('') }}>{existing ? 'กลับไปลืมรหัสผ่าน' : 'ยังไม่ยืนยันอีเมล แต่จำรหัสผ่านปัจจุบันได้'}</button>}
    {message && <p role="status" className="mt-4">{message}</p>}
    <button className="auth-secondary mt-5" disabled={busy} onClick={() => { token.current = ''; close() }}>กลับไปเข้าสู่ระบบ</button>
  </section>
}
