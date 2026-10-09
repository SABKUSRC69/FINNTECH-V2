import { useState } from 'react'
import { Icon, NotebookCat } from '../presentation'
import ModalDialog from './ModalDialog'

export const sections = [
  ['assets', 'สินทรัพย์รวม'], ['finance', 'รายรับรายจ่าย'], ['crypto', 'พอร์ตคริปโต'],
  ['budget', 'งบประมาณ'], ['backup', 'สำรองข้อมูล'], ['account', 'บัญชีและดูแลข้อมูล'], ['stocks', 'ราคาหุ้นสหรัฐ'],
] as const
export type Section = typeof sections[number][0]
export const sectionTitle = (section: Section): string => sections.find(([value]) => value === section)![1]
const secondary = sections.slice(3)

export default function TrackerNavigation({ section, locked, navigate }: {
  section: Section; locked: boolean; navigate: (section: Section) => boolean
}): JSX.Element {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = secondary.some(([value]) => value === section)
  return <>
    <nav aria-label="ส่วนการเงิน" className="tracker-nav">
      <div className="notebook-index-brand"><Icon name="notebook" /><span>FINNTECH<small>สมุดการเงินของคุณ</small></span></div>
      <p className="tracker-nav-heading">สารบัญการเงิน</p>
      {sections.map(([value, label]) => <button key={value} title={label} type="button" disabled={locked} onClick={() => navigate(value)} aria-current={section === value ? 'page' : undefined} aria-pressed={section === value} className={`tracker-nav-item ${section === value ? 'tracker-nav-active' : ''}`}><Icon name={value} /><span>{label}</span></button>)}
      <div className="tracker-nav-note"><Icon name="shield" /><p>บันทึกด้วยตัวเอง<br />THB และ USDT แยกกัน</p></div>
      <NotebookCat compact />
    </nav>
    <nav aria-label="เมนูมือถือ" className="tracker-mobile-nav">
      {([['assets', 'ภาพรวม'], ['finance', 'รายการ'], ['crypto', 'พอร์ต']] as const).map(([value, label]) => <button key={value} type="button" disabled={locked} onClick={() => navigate(value)} aria-current={section === value ? 'page' : undefined} className={`tracker-nav-item ${section === value ? 'tracker-nav-active' : ''}`}><Icon name={value} /><span>{label}</span></button>)}
      <button type="button" aria-expanded={moreOpen} aria-haspopup="dialog" className={`tracker-nav-item ${moreActive ? 'tracker-nav-active' : ''}`} aria-current={moreActive ? 'page' : undefined} onClick={() => setMoreOpen(true)}><Icon name="more" /><span>เพิ่มเติม</span></button>
    </nav>
    {moreOpen && <ModalDialog title="เพิ่มเติม" sheet onDismiss={() => setMoreOpen(false)}>
      <p className="mt-2 text-sm text-slate-500">หน้าปัจจุบัน: {sectionTitle(section)}</p>
      {locked && <p role="status" className="mt-3 text-sm">กำลังดำเนินการหรือยังไม่ทราบผล จึงยังเปลี่ยนหน้าไม่ได้ ปิดเมนูเพื่อตรวจผลคำขอเดิม</p>}
      <div className="mt-4">{secondary.map(([value, label]) => <button key={value} type="button" disabled={locked} aria-current={section === value ? 'page' : undefined} className={`tracker-nav-item ${section === value ? 'tracker-nav-active' : ''}`} onClick={() => { if (navigate(value)) setMoreOpen(false) }}><Icon name={value} /><span>{label}</span></button>)}</div>
    </ModalDialog>}
  </>
}
