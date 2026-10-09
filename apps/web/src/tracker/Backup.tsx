import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { BACKUP_MAX_BYTES, backupDocumentSchema, backupPreviewSchema, backupSummarySchema, type BackupDocument, type BackupPreview } from '@finntech/contracts'
import { displayDecimal, trackerRequest, TrackerRequestError } from './client'
import { usePresentation } from '../presentation'

type PendingRestore = { body: { backup: BackupDocument; previewDigest: string; consent: true }; key: string }
export default function Backup({ lock, restored, expired }: { lock: (value: boolean) => void; restored: () => Promise<void>; expired: () => void }): JSX.Element {
  const { money } = usePresentation()
  const [backup, setBackup] = useState<BackupDocument | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingRestore | null>(null)
  const [message, setMessage] = useState('')
  const running = useRef(false)
  const disabled = busy || !!pending
  useEffect(() => { lock(disabled); return () => lock(false) }, [disabled, lock])
  function errorMessage(error: unknown): string {
    if (error instanceof TrackerRequestError) { if (error.expired) expired(); return error.message }
    return 'ไฟล์หรือข้อมูลตอบกลับไม่ถูกต้อง ระบบยังไม่กู้คืนข้อมูล'
  }
  async function download(): Promise<void> {
    if (running.current || disabled) return
    running.current = true; setBusy(true); setMessage('')
    let url: string | undefined
    try {
      const data = backupDocumentSchema.parse(await trackerRequest('backup'))
      const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      // Formatting can enlarge an otherwise valid export; retain the compact complete file if needed.
      const bytes = file.size > BACKUP_MAX_BYTES ? new Blob([JSON.stringify(data)], { type: 'application/json' }) : file
      url = URL.createObjectURL(bytes)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `finntech-backup-${data.exportedAt.slice(0, 10)}.json`
      document.body.append(anchor); anchor.click(); anchor.remove()
      setMessage('ส่งไฟล์สำรองให้ browser แล้ว ตรวจว่าไฟล์ถูกบันทึกใน Downloads ก่อนปิดหน้า')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { if (url) { const created = url; setTimeout(() => URL.revokeObjectURL(created), 1000) }; running.current = false; setBusy(false) }
  }
  async function selectFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file || running.current || disabled) return
    running.current = true; setBusy(true); setBackup(null); setPreview(null); setConsent(false); setMessage('')
    try {
      if (file.size > BACKUP_MAX_BYTES) { setMessage('ไฟล์เกิน 2 MiB กรุณาเลือกไฟล์สำรองที่ระบบรองรับ'); return }
      let parsed: unknown
      try { parsed = JSON.parse(await file.text()) } catch { setMessage('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'); return }
      const checked = backupDocumentSchema.safeParse(parsed)
      if (!checked.success) { setMessage('ไม่ใช่ไฟล์สำรอง FINNTECH tracker รุ่นที่รองรับ หรือข้อมูลไม่ครบ/ไม่ถูกต้อง'); return }
      const view = backupPreviewSchema.parse(await trackerRequest('backup/preview', 'POST', checked.data))
      setBackup(checked.data); setPreview(view)
    } catch (error) { setMessage(errorMessage(error)) }
    finally { running.current = false; setBusy(false) }
  }
  async function restore(request: PendingRestore): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setMessage('')
    try {
      const result = await trackerRequest('backup/restore', 'POST', request.body, request.key) as { digest?: unknown; summary?: unknown }
      const summary = backupSummarySchema.parse(result.summary)
      if (result.digest !== request.body.previewDigest || JSON.stringify(summary) !== JSON.stringify(preview?.summary)) throw new Error('Unknown restore receipt')
      setPending(null); setConsent(false); setBackup(null); setPreview(null)
      setMessage('กู้คืนสำเร็จ จำนวนรายการและยอดตรงกับ preview'); await restored()
    } catch (error) {
      if (error instanceof TrackerRequestError && !error.unknownOutcome) { setPending(null); setMessage(errorMessage(error)) }
      else { setPending(request); setMessage('ยังไม่ทราบผลการกู้คืน ให้ตรวจด้วยคำขอเดิม ห้ามเริ่มกู้คืนใหม่หรือปิดหน้า') }
    } finally { running.current = false; setBusy(false) }
  }
  return <section className="journal-backup-layout" aria-label="สำรองและกู้คืน">
    <div className="tracker-card notebook-export rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><p className="journal-kicker">เก็บสำเนา · EXPORT</p><h2 className="text-xl font-semibold">สำรองและกู้คืนข้อมูล</h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">สำรองรายรับรายจ่ายทุกเดือน หมวดหมู่ งบประมาณ พอร์ต ประวัติคริปโตและยอดเงินสด รวมรายการที่ยกเลิก เก็บไฟล์ไว้ในที่ส่วนตัว เพราะมีข้อมูลการเงินและบันทึกช่วยจำของคุณ</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">ไฟล์นี้ไม่มีข้อมูลบัญชีล็อกอินหรือการตั้งค่า server ไม่รวม legacy DEMO ราคาตลาด หรือ credentials · v4 รวมพอร์ตหุ้น สินทรัพย์ประเมินเอง และราคา/อัตราที่กรอกเองพร้อมวันอ้างอิง อ่าน v1/v2/v3 เดิมได้ เป็นสำเนาข้อมูล tracker สูงสุด 2,000 รายการ / 2 MiB</p>
      <button className="auth-primary mt-4" disabled={disabled} onClick={() => { void download() }}>ดาวน์โหลดไฟล์สำรอง</button>
    </div>
    <div className="tracker-card notebook-import rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><p className="journal-kicker">ตรวจแล้วค่อยนำเข้า · RESTORE</p><h3 className="font-semibold">ตรวจไฟล์ก่อนกู้คืน</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600">กู้คืนลงบัญชีที่ยังไม่มีข้อมูลการเงินเท่านั้น ไม่เขียนทับ ไม่รวมข้อมูลกับรายการเดิม และไม่รับไฟล์ DEMO เก่า เลือกเฉพาะไฟล์สำรองของคุณที่เชื่อถือได้</p>
      <label className="auth-label mt-4">ไฟล์สำรอง JSON<input className="auth-input" type="file" accept="application/json,.json" disabled={disabled} onChange={event => { void selectFile(event) }} /></label>
      {preview && <div className="mt-5 space-y-3">
        <h4 className="font-semibold">ผลตรวจไฟล์ · ยังไม่บันทึกข้อมูล</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">{[['ราคา/อัตราที่กรอกเอง',preview.summary.references.length],['บัญชีเงินสด', preview.summary.cash.length],['พอร์ตหุ้น',preview.summary.stockCounts.portfolios],['ประวัติหุ้น',preview.summary.stockCounts.trades],['สินทรัพย์ประเมินเอง',preview.summary.stockCounts.manualAssets], ['หมวดหมู่', preview.summary.counts.categories], ['รายรับรายจ่าย', preview.summary.counts.transactions], ['รายการการเงินยกเลิก', preview.summary.counts.cancelledTransactions], ['งบประมาณ', preview.summary.counts.budgets], ['พอร์ตคริปโต', preview.summary.counts.portfolios], ['ประวัติคริปโต', preview.summary.counts.trades], ['ประวัติคริปโตยกเลิก', preview.summary.counts.cancelledTrades]].map(([label, count]) => <div key={String(label)}>{label}: {count}</div>)}</dl>
        {preview.summary.cash.map(row => <p className="break-all text-sm" key={row.name}>{row.name}: {money(displayDecimal(row.balance))} THB · ยอด ณ {row.asOf}</p>)}
        {preview.summary.stockHoldings.map(row=><p className="break-all text-sm" key={row.portfolioId+row.symbol}>{row.symbol}: {money(row.quantity)} หุ้น · ต้นทุน {money(row.totalCost)} · P&amp;L รับรู้ {money(row.realizedPnl)} USD</p>)}
        {preview.summary.references.map(r=><p className="break-all text-sm" key={r.symbol}>{r.symbol}: {money(displayDecimal(r.value))} {r.currency} · กรอกเอง ณ {new Date(r.asOf).toLocaleString('th-TH')} · {r.enabled?'เปิดใช้แทนอัตโนมัติ':'ปิดใช้'} · restore ไม่เปลี่ยนวันอ้างอิง</p>)}
        {preview.summary.manual.map(row=><p className="break-all text-sm" key={row.name}>{row.name}: ประเมินด้วยตนเอง ณ {row.date} · {money(displayDecimal(row.value))} {row.currency} · ต้นทุน {row.cost===null?'ไม่ทราบ':money(displayDecimal(row.cost))} {row.currency}</p>)}
        {preview.summary.months.map(row => <p className="break-all text-sm" key={row.month}>{row.month}: รายรับ {money(displayDecimal(row.income))} · รายจ่าย {money(displayDecimal(row.expense))} · คงเหลือ {money(displayDecimal(row.balance))} THB</p>)}
        {preview.summary.holdings.map(row => <p className="break-all text-sm" key={`${row.portfolioId}|${row.asset}`}>{backup?.portfolios.find(p => p.id === row.portfolioId)?.name} · {row.asset}: {money(row.quantity)} · ต้นทุน {money(row.totalCost)} · P&amp;L รับรู้ {money(row.realizedPnl)} USDT</p>)}
        {!preview.canRestore && <p role="alert" className="text-sm text-rose-700">บัญชีนี้มีข้อมูลแล้ว กู้คืนไม่ได้ ระบบจะไม่เขียนทับข้อมูลเดิม</p>}
        <label className="flex gap-3 text-sm leading-7"><input type="checkbox" checked={consent} disabled={disabled || !preview.canRestore} onChange={e => setConsent(e.target.checked)} />ฉันตรวจจำนวนและยอดแล้ว และยืนยันว่าเป็นข้อมูล tracker ของฉันที่ต้องการกู้คืน</label>
        <button className="auth-primary" disabled={disabled || !preview.canRestore || !consent || !backup} onClick={() => { if (backup && consent && preview.canRestore) void restore({ body: { backup, previewDigest: preview.digest, consent: true }, key: globalThis.crypto.randomUUID() }) }}>ยืนยันกู้คืนข้อมูล</button>
      </div>}
    </div>
    {busy && <p role="status">กำลังตรวจสอบ…</p>}
    {message && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {pending && <button className="auth-primary" disabled={busy} onClick={() => { void restore(pending) }}>ตรวจผลด้วยคำขอเดิม</button>}
    <p className="text-xs leading-6 text-slate-500">หลัง timeout ห้ามสรุปว่ากู้คืนล้มเหลว หากปิดหรือรีโหลดหน้า ให้ตรวจประวัติก่อนส่งคำขอใหม่ การกู้คืนไม่กู้บัญชีล็อกอิน และยังไม่ใช่ระบบสำรอง PostgreSQL ทั้งฐานข้อมูล</p>
  </section>
}
