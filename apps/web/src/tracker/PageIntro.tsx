import type { ReactNode } from 'react'
import { sectionTitle, type Section } from './TrackerNavigation'

const copy: Record<Section, [string, string]> = {
  assets: ['YOUR PERSONAL MONEY JOURNAL', 'เงินสด คริปโต หุ้น และสินทรัพย์ประเมินเอง · แยกสกุลและวันที่'],
  finance: ['EVERYDAY RECORDS', 'ค่อย ๆ บันทึก แล้วภาพรวมจะชัดขึ้น · รายรับรายจ่ายใช้ THB'],
  budget: ['A PLAN FOR THIS MONTH', 'วางแผนสิ่งที่ใช้ · งบประมาณไม่สร้างรายการรายจ่าย'],
  crypto: ['YOUR INVESTMENT RECORDS', 'ติดตามต้นทุนและประวัติ · USDT แยกต่อพอร์ต ไม่มีการส่งคำสั่งซื้อขาย'],
  stocks: ['YOUR STOCK RECORDS', 'บันทึกหุ้นและ ETF · ต้นทุน/ประวัติ USD แยกจาก watchlist'],
  backup: ['TAKE CARE OF YOUR RECORDS', 'เก็บสำเนาข้อมูลของคุณ · ตรวจไฟล์ก่อนกู้คืนเสมอ'],
  account: ['YOUR PERSONAL SPACE', 'บัญชีและการดูแลข้อมูล · เก็บสำเนาไว้ในที่ส่วนตัว'],
}

export default function PageIntro({ section, name, children }: {
  section: Section; name: string; children: ReactNode
}): JSX.Element {
  return <header className="tracker-page-heading journal-page-intro">
    <div><p className="journal-kicker">{copy[section][0]}</p><h1>{sectionTitle(section)}</h1><p className="journal-page-description">{copy[section][1]}</p><p className="journal-greeting">สวัสดี {name}</p></div>
    <div className="journal-page-actions">{children}</div>
  </header>
}
