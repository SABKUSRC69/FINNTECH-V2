import { useEffect, useState, type FormEvent } from 'react'
import { marketKeyInputSchema, marketKeyRemoveSchema, marketKeyStatusSchema, type MarketKeyStatus } from '@finntech/contracts'
import { trackerRequest, TrackerRequestError } from './client'
import { useOwnedWrite } from './useOwnedWrite'

/** The server verifies the key with Tiingo (up to 8 s) before saving; allow for that plus storage. */
const MARKET_KEY_TIMEOUT_MS = 25000

/**
 * The account's own Tiingo key for automatic daily closes. The key is write-only: it is sent once to
 * this site's server, verified, stored encrypted and never shown again (only its last 4 characters).
 */
export default function MarketKey({ disabled, lock, expired }: { disabled: boolean; lock: (value: boolean) => void; expired: () => void }): JSX.Element {
  const [status, setStatus] = useState<MarketKeyStatus | null>(null), [loadError, setLoadError] = useState(false)
  const [token, setToken] = useState(''), [confirmed, setConfirmed] = useState(false), [editing, setEditing] = useState(false), [removing, setRemoving] = useState(false)
  const [hint, setHint] = useState(''), [notice, setNotice] = useState('')
  async function load(): Promise<void> {
    try { setStatus(marketKeyStatusSchema.parse(await trackerRequest('market-key'))); setLoadError(false) }
    catch (error) { setLoadError(true); if (error instanceof TrackerRequestError && error.expired) expired() }
  }
  const write = useOwnedWrite(lock, expired, load, (_value, path) => {
    setToken(''); setConfirmed(false); setEditing(false); setRemoving(false)
    setNotice(path === 'market-key' ? 'เชื่อมต่อแล้ว เปิดหน้าสินทรัพย์รวมเพื่อดึงราคาปิดล่าสุด' : 'ลบ key แล้ว รายการซื้อขาย ต้นทุน และราคาที่กรอกเองยังอยู่ครบ')
  }, MARKET_KEY_TIMEOUT_MS)
  useEffect(() => { void load() }, [])
  const busy = disabled || write.busy || !!write.pending || !status
  function submit(event: FormEvent): void {
    event.preventDefault(); setHint('')
    if (busy) return
    const body = { provider: 'TIINGO', token: token.trim(), confirmPersonalUse: confirmed, expectedVersion: status?.version ?? null }
    if (!/^[A-Za-z0-9]{20,128}$/.test(body.token)) { setHint('API Token ต้องเป็นตัวอักษรภาษาอังกฤษและตัวเลขอย่างน้อย 20 ตัว ไม่มีช่องว่าง'); return }
    if (!confirmed) { setHint('ติ๊กยืนยันว่าเป็น key ส่วนตัวของคุณก่อน'); return }
    write.submit('market-key', marketKeyInputSchema, body)
  }
  const active = status?.status === 'ACTIVE', showForm = status?.available && (!active || editing)
  return <div className="tracker-card rounded-2xl border border-slate-200 p-5 sm:p-6" aria-label="ราคาปิดอัตโนมัติ (key ส่วนตัว)" role="region">
    <h2 className="text-xl font-semibold">ราคาปิดอัตโนมัติ (key ส่วนตัว)</h2>
    <p className="mt-3 text-sm leading-7 text-slate-500">ใช้ API Token ฟรีของคุณเองจาก Tiingo เพื่อให้ระบบดึงราคาปิดรายวันของหุ้น/ETF ที่คุณถือ ราคาที่ได้แสดงให้บัญชีนี้เท่านั้น ไม่ต้องกรอกราคาเองทุกวัน</p>
    <p className="mt-2 text-xs leading-6 text-slate-500">ดึงราคาเมื่อเปิดดูพอร์ต ใช้ชั่วคราวขณะเปิดหน้านั้น และดึงใหม่เมื่อกลับมาดู ระบบไม่เก็บราคาหรือประวัติมูลค่าที่คำนวณจาก Tiingo ไว้ถาวร</p>
    {!status && !loadError && <p className="mt-3 text-sm" role="status">กำลังโหลดสถานะ…</p>}
    {loadError && <><p className="mt-3 text-sm" role="alert">โหลดสถานะ key ไม่สำเร็จ</p><button type="button" className="auth-secondary mt-2" onClick={() => { void load() }}>ลองโหลดอีกครั้ง</button></>}
    {status && !status.available && <p className="mt-3 text-sm" role="status">server นี้ยังไม่เปิดให้ใส่ key · ยังกรอกราคาเองในหน้าสินทรัพย์รวมได้</p>}
    {active && <div className="mt-4 space-y-2" data-testid="market-key-active">
      <p className="font-medium">✅ เชื่อมต่อแล้ว · key ลงท้าย ••••{status.hint}</p>
      <p className="text-xs text-slate-500">ตั้งค่าเมื่อ {status.updatedAt ? new Date(status.updatedAt).toLocaleString('th-TH') : 'N/A'} · ดูวันที่และสถานะราคาได้ในหน้าสินทรัพย์รวม</p>
      {!editing && !removing && <div className="flex flex-wrap gap-3"><button type="button" className="auth-secondary" disabled={busy} onClick={() => { setEditing(true); write.setMessage('') }}>เปลี่ยน key</button><button type="button" className="auth-secondary" disabled={busy} onClick={() => { setRemoving(true); write.setMessage('') }}>ลบ key</button></div>}
      {removing && <div className="space-y-2"><p className="text-sm">ลบ key และราคาปิดที่ดึงด้วย key นี้? รายการซื้อขาย ต้นทุน และราคาที่กรอกเองไม่ถูกลบ</p>
        <div className="flex flex-wrap gap-3"><button type="button" className="auth-primary" disabled={busy} onClick={() => write.submit('market-key/remove', marketKeyRemoveSchema, { expectedVersion: status.version })}>ยืนยันลบ key</button><button type="button" className="auth-secondary" disabled={write.busy || !!write.pending} onClick={() => setRemoving(false)}>ยกเลิก</button></div></div>}
    </div>}
    {status?.status === 'REMOVED' && !editing && <p className="mt-3 text-sm">ยังไม่มี key ที่ใช้งาน (เคยลบแล้ว)</p>}
    {showForm && <form aria-label="บันทึก key ราคาปิด" className="mt-4 space-y-4" onSubmit={submit}>
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-7">
        <li>สมัครฟรีที่ <a className="underline" href="https://www.tiingo.com" target="_blank" rel="noreferrer">tiingo.com</a> (ไม่ต้องใช้บัตร) แล้วยืนยันอีเมล</li>
        <li>เปิดเมนูบัญชีหัวข้อ API แล้วคัดลอก API Token</li>
        <li>วางด้านล่าง แล้วกดบันทึกและทดสอบ</li>
      </ol>
      <label className="auth-label">API Token ของ Tiingo<input className="auth-input" type="password" autoComplete="off" spellCheck={false} maxLength={128} disabled={busy} value={token} onChange={event => setToken(event.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>ยืนยันว่าเป็น key ส่วนตัวของฉัน ใช้ดูพอร์ตของฉันเท่านั้น และไม่ได้รับ key นี้มาจากคนอื่น</span></label>
      <p className="text-xs leading-6 text-slate-500">ห้ามส่ง key ทางแชทหรือให้ผู้อื่น · key ถูกเข้ารหัสฝั่ง server และจะไม่แสดงอีก (เห็นเฉพาะ 4 ตัวท้าย) · ระบบทดสอบ key ด้วยคำขอ 1 ครั้งก่อนบันทึก</p>
      <div className="flex flex-wrap gap-3"><button className="auth-primary" disabled={busy}>{write.busy ? 'กำลังทดสอบ key…' : 'บันทึกและทดสอบ'}</button>{editing && <button type="button" className="auth-secondary" disabled={write.busy || !!write.pending} onClick={() => { setEditing(false); setToken(''); setConfirmed(false) }}>ยกเลิก</button>}</div>
    </form>}
    {hint && <p className="mt-3 text-sm" role="alert">{hint}</p>}
    {write.message === 'บันทึกสำเร็จ' ? notice && <p className="mt-3 text-sm" role="status">{notice}</p> : write.message && <p className="mt-3 text-sm" role="alert">{write.message}</p>}
    {write.pending && <div className="mt-3"><p className="text-sm">ยังไม่ทราบผล ตรวจผลด้วยคำขอเดิมก่อนเปลี่ยนหน้า</p><button type="button" className="auth-primary mt-2" disabled={write.busy} onClick={write.retry}>ตรวจผลด้วยคำขอเดิม</button></div>}
  </div>
}
