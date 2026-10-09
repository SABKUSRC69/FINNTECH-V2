import {ProfileProvider,Avatar} from './media/Profile'
import AccountDeletion, { pendingDeletionKey } from './auth/AccountDeletion'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AuthRequestError, readAccount, submitAuth, submitDemo, type AccountSnapshot } from './auth/client'
import DemoEntry from './auth/DemoEntry'
import Dashboard from './tracker/Dashboard'
import { Icon, NotebookCat, PresentationControls, PresentationProvider, usePresentation } from './presentation'
import RecoveryPanel, { takeRecoveryLink, type RecoveryLink } from './auth/RecoveryPanel'
import RealUseNotice from './auth/RealUseNotice'

type ViewState = (AccountSnapshot | { status: 'checking' } | { status: 'unavailable' }) & { recovery?: boolean; beta?: boolean; demoAvailable?: boolean; real?: boolean; registrationsOpen?: boolean; stagingEnrollment?: boolean; supportEmail?: string; rehearsal?: boolean }
type FormMode = 'sign-in' | 'sign-up' | 'demo'

function AccountApp(): JSX.Element {
  const [deletionResume,setDeletionResume]=useState(pendingDeletionKey)
  const { theme, hidden } = usePresentation()
  const [view, setView] = useState<ViewState>({ status: 'checking' })
  const [mode, setMode] = useState<FormMode>('sign-in')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const inFlight = useRef(false)
  const [recoveryLink, setRecoveryLink] = useState<RecoveryLink>()
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [demoPending, setDemoPending] = useState(false)
  const freshNeedsVerification = useRef(false)
  const authNeedsVerification = useRef<'signed-in' | 'signed-out'>()

  useEffect(() => {
    const link = takeRecoveryLink()
    if (link?.token) setRecoveryLink(link)
    const controller = new AbortController()
    void readAccount(controller.signal).then(snapshot => {
      if (!controller.signal.aborted) {
        setView(snapshot)
        if (!snapshot.recovery) setRecoveryLink(undefined)
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setView({ status: 'unavailable' })
        setMessage(error instanceof AuthRequestError ? error.message : 'ตรวจสอบระบบไม่สำเร็จ กรุณาลองอีกครั้ง')
      }
    })
    return () => controller.abort()
  }, [])

  async function refresh(): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      const snapshot = await readAccount()
      if (authNeedsVerification.current && snapshot.status !== authNeedsVerification.current) throw new AuthRequestError('ยังยืนยันผลบัญชีไม่ได้ กรุณาตรวจสอบสถานะอีกครั้ง', true)
      authNeedsVerification.current = undefined
      if (freshNeedsVerification.current) {
        if (snapshot.status !== 'signed-out') throw new AuthRequestError('ยังยืนยันการออกจากระบบไม่ได้ กรุณาตรวจสอบสถานะอีกครั้ง', true)
        freshNeedsVerification.current = false
        setMode(snapshot.demoAvailable ? 'demo' : 'sign-in')
      }
      setView(snapshot)
      setUncertain(false)
    } catch (error) {
      setView(previous => ({ status: 'unavailable',
        ...(previous.rehearsal ? { rehearsal: true } : {}),
        ...(previous.supportEmail ? { supportEmail: previous.supportEmail } : {}),
        ...(previous.real ? { real: true, registrationsOpen: previous.registrationsOpen, stagingEnrollment: !!previous.stagingEnrollment } : {}),
        ...('beta' in previous && previous.beta ? { beta: true } : {}),
        ...('demoAvailable' in previous && previous.demoAvailable ? { demoAvailable: true } : {}),
        ...('recovery' in previous && previous.recovery ? { recovery: true } : {}) }))
      setMessage(error instanceof AuthRequestError ? error.message : 'ตรวจสอบระบบไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally { inFlight.current = false; setBusy(false) }
  }

  async function freshDemo(): Promise<void> {
    if (inFlight.current || busy || uncertain) return
    inFlight.current = true; setBusy(true); setMessage('')
    let committed = false
    try {
      await submitAuth('sign-out')
      committed = true; freshNeedsVerification.current = true
      const snapshot = await readAccount()
      if (snapshot.status !== 'signed-out') throw new AuthRequestError('ยังยืนยันการออกจากระบบไม่ได้', true)
      freshNeedsVerification.current = false
      setView(snapshot)
      setMode(snapshot.demoAvailable ? 'demo' : 'sign-in')
      await submitDemo('reset')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ยังไม่ทราบผล')
      const unknown = committed || !(error instanceof AuthRequestError) || error.outcomeUnknown
      if (unknown) freshNeedsVerification.current = true
      setUncertain(unknown)
    }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function handleAuth(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault()
    if (inFlight.current || uncertain || view.status === 'checking' || view.status === 'unavailable'
      || (view.status !== 'signed-in' && mode === 'sign-up' && awaitingVerification)) return
    const action = view.status === 'signed-in' ? 'sign-out' : mode
    if (action === 'demo') return
    if (action === 'sign-up' && (password !== confirmation || !name.trim())) {
      setMessage(password !== confirmation ? 'รหัสผ่านทั้งสองช่องต้องตรงกัน' : 'กรุณาระบุชื่อที่ใช้แสดง')
      return
    }
    inFlight.current = true
    setBusy(true)
    setMessage('')
    let committed = false
    try {
      const result = await submitAuth(action, action === 'sign-out' ? {} : {
        email: email.trim(), password, ...(action === 'sign-up' ? { name: name.trim() } : {}),
      })
      committed = true
      if (result === 'await-verification') {
        setAwaitingVerification(true)
        setView({ status: 'signed-out', recovery: true, ...(view.rehearsal ? { rehearsal: true } : {}), ...(view.supportEmail ? { supportEmail: view.supportEmail } : {}), ...(view.real ? { real: true, registrationsOpen: view.registrationsOpen, stagingEnrollment: !!view.stagingEnrollment } : {}) })
        setMessage(view.real ? 'สมัครบัญชีแล้ว รอยืนยันอีเมล กรุณาตรวจกล่องจดหมายและ spam แล้วยืนยันก่อนเข้าสู่ระบบ หากยังไม่ได้รับให้ขอเริ่มยืนยันอีเมลอีกครั้ง' : 'สมัครบัญชีแล้ว รอยืนยันอีเมล กรุณาเปิดช่องทางอีเมลทดสอบในเครื่อง แล้วยืนยันก่อนเข้าสู่ระบบ')
        return
      }
      authNeedsVerification.current = action === 'sign-out' ? 'signed-out' : 'signed-in'
      const snapshot = await readAccount()
      if (snapshot.status !== authNeedsVerification.current) {
        throw new AuthRequestError('ยืนยันการเข้าสู่ระบบไม่ได้ กรุณาตรวจสอบสถานะอีกครั้ง', true)
      }
      authNeedsVerification.current = undefined
      setView(snapshot)
    } catch (error) {
      setMessage(error instanceof AuthRequestError ? error.message : 'ตรวจสอบผลไม่สำเร็จ กรุณาตรวจสอบสถานะอีกครั้ง')
      // A failed response can follow a successful commit. Reconcile before resubmission.
      if (committed || !(error instanceof AuthRequestError) || error.outcomeUnknown) {
        if (action === 'sign-out') authNeedsVerification.current = 'signed-out'
        setUncertain(true)
      }
    } finally {
      setPassword('')
      setConfirmation('')
      inFlight.current = false
      setBusy(false)
    }
  }

  function switchMode(next: FormMode): void {
    if (busy || uncertain || demoPending || (next === 'sign-up' && view.real && !view.registrationsOpen && !view.stagingEnrollment)) return
    setMode(next)
    setMessage('')
    setPassword('')
    setConfirmation('')
  }

  const disabled = busy || uncertain || view.status === 'checking' || view.status === 'unavailable' || (awaitingVerification && mode === 'sign-up')

  if(deletionResume) return <AccountDeletion initialKey={deletionResume} lock={setBusy} done={()=>{setDeletionResume(undefined);void refresh()}}/>
  return (
    <ProfileProvider key={view.status==='signed-in'?view.account.name:'signed-out'} enabled={view.status==='signed-in'&&!view.account.demo}><div className="tracker-app min-h-screen text-slate-900" data-theme={theme} data-session={view.status}>
      <a className="tracker-skip" href="#tracker-content">ข้ามไปยังเนื้อหา</a>
      <header className="tracker-header border-b border-slate-200/80 bg-white">
        <div className="tracker-header-inner flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
          {view.status === 'signed-in' || busy || uncertain || demoPending ? <div className="tracker-brand flex items-center gap-3 text-slate-900">
            <span className="journal-mark flex h-10 items-center justify-center">F</span><span className="text-lg font-bold tracking-[0.12em]">FINNTECH<small className="journal-brand-subtitle">PERSONAL MONEY JOURNAL</small></span>
          </div> : <a href="/" className="tracker-brand flex items-center gap-3 text-slate-900" aria-label="FINNTECH หน้าหลัก">
            <span className="journal-mark flex h-10 items-center justify-center">F</span>
            <span className="text-lg font-bold tracking-[0.12em]">FINNTECH<small className="journal-brand-subtitle">PERSONAL MONEY JOURNAL</small></span>
          </a>}
          <div className="flex items-center gap-3"><span className="tracker-local-badge rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">{view.rehearsal ? 'ข้อมูลสังเคราะห์ · Real-use rehearsal' : view.real ? 'บัญชีส่วนบุคคล' : view.beta ? 'Beta · ข้อมูลสมมติ' : 'เวอร์ชันทดสอบในเครื่อง'}</span>{view.status==='signed-in'&&!view.account.demo&&<Avatar name={view.account.name}/>}<PresentationControls /></div>
        </div>
      </header>
      {view.beta && <p className="mx-auto max-w-6xl px-5 py-3 text-sm" role="note">Beta สำหรับข้อมูลสมมติเท่านั้น ห้ามบันทึกข้อมูลการเงินจริง ขณะนี้ยังไม่มีระบบกู้รหัสผ่าน เก็บไฟล์สำรองด้วยตนเอง บริการฟรีอาจพักหรือหยุดเมื่อเกินโควตา</p>}
      {view.status === 'signed-in' && view.account.demo && <p className="mx-auto max-w-6xl px-5 py-3 text-sm" role="note">DEMO — ข้อมูลทดลอง</p>}
      {hidden && <p className="tracker-privacy-note">ซ่อนเฉพาะยอดแสดงผล ช่องกรอก บันทึกช่วยจำ ไฟล์สำรอง และข้อมูลที่รับส่งยังเป็นข้อมูลเดิม ไม่ใช่การเข้ารหัส</p>}
      {view.status === 'signed-in' && !recoveryLink ? <>
        <Dashboard name={view.account.name} real={!!view.real} demo={!!view.account.demo} freshDemo={() => { void freshDemo() }} recovery={!!view.recovery} authBusy={disabled} logout={() => { void handleAuth() }} expired={() => setView({ status: 'signed-out', ...(view.rehearsal ? { rehearsal: true } : {}), ...(view.supportEmail ? { supportEmail: view.supportEmail } : {}), ...(view.real ? { real: true, registrationsOpen: view.registrationsOpen, stagingEnrollment: !!view.stagingEnrollment } : {}), ...(view.beta ? { beta: true } : {}), ...(view.demoAvailable ? { demoAvailable: true } : {}), ...(view.recovery ? { recovery: true } : {}) })} />
        {message && <p role="alert" className="mx-auto max-w-6xl px-5 py-3 text-sm text-amber-900">{message}</p>}
        {uncertain && <button className="auth-secondary mx-5 mb-5" disabled={busy} onClick={() => { void refresh() }}>ตรวจสอบสถานะอีกครั้ง</button>}
      </> : <main id="tracker-content" tabIndex={-1} className="tracker-auth-main mx-auto grid max-w-6xl gap-6 px-5 py-7 sm:px-8 sm:py-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20 lg:py-16">
        <section className="journal-auth-story space-y-3 lg:space-y-6">
          <div className="notebook-auth-art" aria-hidden="true"><span className="notebook-auth-wordmark">FINNTECH</span><span className="notebook-auth-caption">a little book of your money</span><NotebookCat /></div>
          {view.rehearsal && <p role="note" className="text-sm font-semibold text-teal-700">ข้อมูลสังเคราะห์ · Real-use rehearsal — ยังไม่เปิดรับข้อมูลจริง</p>}
          <p className="hidden text-sm font-semibold tracking-wide text-teal-700 lg:block">YOUR PERSONAL MONEY JOURNAL</p>
          <h1 className="text-3xl font-semibold leading-[1.35] tracking-tight lg:text-5xl">พื้นที่สำหรับ<br className="hidden lg:block" />การเงินของคุณ</h1>
          <p className="max-w-md text-sm leading-6 text-slate-600 lg:text-base lg:leading-8">บันทึกรายรับรายจ่ายและประวัติลงทุนด้วยตัวเอง มองเห็นการเงินชัดขึ้นในพื้นที่ส่วนตัวของคุณ</p>
          <div className="hidden space-y-4 border-t border-slate-200 pt-6 text-sm text-slate-600 lg:block">
            <p className="flex gap-3"><span aria-hidden="true" className="text-teal-700">✓</span> เข้าสู่ระบบและออกจากระบบได้</p>
            <p className="flex gap-3"><span aria-hidden="true" className="text-teal-700">✓</span> แยกพื้นที่บัญชีของแต่ละผู้ใช้</p>
            <p className="flex gap-3"><span aria-hidden="true" className="text-teal-700">✓</span> บันทึก THB และพอร์ต USDT แยกกัน</p>
          </div>
        </section>
        <section aria-label="บัญชี FINNTECH" aria-busy={busy || view.status === 'checking'} className="journal-auth-card tracker-card rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-35px_rgba(15,23,42,0.3)] sm:p-9">
          {('recovery' in view && view.recovery && (recoveryOpen || recoveryLink)) ? <RecoveryPanel real={!!view.real} {...(recoveryLink ? { link: recoveryLink } : {})} lock={setBusy} close={() => { setRecoveryOpen(false); setRecoveryLink(undefined); setMessage(''); setMode('sign-in'); history.replaceState(null, '', '/'); void refresh() }} /> : <>
            <div className="journal-auth-tabs mb-7 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" aria-label="เลือกการใช้งานบัญชี">
              {([['sign-in', 'เข้าสู่ระบบ'], ['sign-up', 'สมัครบัญชี'], ...(view.demoAvailable ? [['demo', 'ทดลองใช้งาน']] : [])] as [FormMode, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy || uncertain || demoPending || (value === 'sign-up' && !!view.real && !view.registrationsOpen && !view.stagingEnrollment)} onClick={() => switchMode(value)} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === value ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
            </div>
            {mode === 'demo' ? <DemoEntry disabled={uncertain || view.status === 'checking' || view.status === 'unavailable'} complete={snapshot => { setDemoPending(false); setView(snapshot) }} pendingLock={setDemoPending} lock={setBusy} /> : <><h2 className="text-2xl font-semibold">{mode === 'sign-in' ? 'ยินดีต้อนรับกลับ' : 'สร้างบัญชีของคุณ'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{view.real ? ((view.registrationsOpen || view.stagingEnrollment) ? (view.recovery ? 'บัญชีส่วนบุคคล ต้องยืนยันอีเมลก่อนเข้าใช้ เริ่มด้วยรายการว่าง' : 'บัญชีส่วนบุคคล เริ่มด้วยรายการว่าง อีเมลใช้เป็นชื่อบัญชีโดยยังไม่ยืนยัน ไม่มีบริการกู้รหัสผ่าน กรุณาเก็บรหัสผ่านให้ปลอดภัย') : 'ยังปิดรับสมัครบัญชีใหม่ระหว่างตรวจรับ') : view.beta ? 'ใช้บัญชีของคุณเองและข้อมูลสมมติสำหรับทดลอง Beta' : 'ใช้บัญชีและข้อมูลสังเคราะห์สำหรับทดสอบในเครื่อง'}</p>
            <form onSubmit={(event) => { void handleAuth(event) }} className="mt-7 space-y-4" aria-label={mode === 'sign-in' ? 'ฟอร์มเข้าสู่ระบบ' : 'ฟอร์มสมัครบัญชี'}>
              {mode === 'sign-up' && <label className="auth-label">ชื่อที่ใช้แสดง<input name="name" autoComplete="nickname" required maxLength={64} value={name} onChange={event => setName(event.target.value)} disabled={disabled} className="auth-input" /></label>}
              <label className="auth-label">อีเมล<input name="email" type="email" autoComplete="username" inputMode="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={disabled} className="auth-input" /></label>
              <label className="auth-label">รหัสผ่าน<input name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={12} maxLength={128} aria-describedby="password-hint" value={password} onChange={event => setPassword(event.target.value)} disabled={disabled} className="auth-input" /></label>
              <p id="password-hint" className="text-xs text-slate-500">ใช้รหัสผ่าน 12–128 ตัวอักษร</p>
              {mode === 'sign-up' && <label className="auth-label">ยืนยันรหัสผ่าน<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={disabled} className="auth-input" /></label>}
              <button type="submit" disabled={disabled} className="auth-primary w-full">{busy ? 'กำลังดำเนินการ…' : mode === 'sign-in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</button>
            </form>
            {'recovery' in view && view.recovery && <button type="button" className="auth-secondary mt-4" disabled={disabled} onClick={() => { setRecoveryOpen(true); setMessage('') }}>ลืมรหัสผ่าน / เริ่มยืนยันอีเมล</button>}</>}
          </>}
          {view.status === 'checking' && <p role="status" className="mt-5 text-sm text-slate-500">กำลังตรวจสอบบัญชี…</p>}
          {message && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{message}</p>}
          {uncertain && <p className="mt-3 text-sm leading-6 text-slate-600">ยังไม่ทราบผลรายการ กรุณาตรวจสอบสถานะก่อนส่งอีกครั้ง หากสมัครไปแล้วแต่ยังไม่เข้าสู่ระบบ ให้ลองเข้าสู่ระบบด้วยบัญชีเดิม</p>}
          {(view.status === 'unavailable' || uncertain) && <button type="button" onClick={() => { void refresh() }} disabled={busy} className="auth-secondary mt-4 w-full">{busy ? 'กำลังตรวจสอบ…' : 'ตรวจสอบสถานะอีกครั้ง'}</button>}
        </section>
      </main>}
      <footer className="tracker-footer mx-auto max-w-6xl px-5 pb-8 sm:px-8">
        {view.real && <RealUseNotice supportEmail={view.supportEmail} recovery={!!view.recovery} />}
        <p className="flex items-start gap-2 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-500"><Icon name="shield" />ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน</p>
      </footer>
    </div></ProfileProvider>
  )
}

export default function App(): JSX.Element {
  return <PresentationProvider><AccountApp /></PresentationProvider>
}
