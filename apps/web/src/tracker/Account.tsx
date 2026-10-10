import ProfileEditor from '../media/Profile'
import AccountDeletion from '../auth/AccountDeletion'
import MarketKey from './MarketKey'
export default function Account({ name, locked, logout, backup, recovery = false, demo = false, freshDemo, real = false, deletionLock, expired }: {
  name: string; locked: boolean; logout: () => void; backup: () => void; recovery?: boolean; demo?: boolean; freshDemo?: (() => void) | undefined; real?: boolean; deletionLock?:((value:boolean)=>void)|undefined; expired?:(()=>void)|undefined
}): JSX.Element {
  return <section aria-label="บัญชีและดูแลข้อมูล" className="journal-care-layout">
    <div className="tracker-card rounded-2xl border border-slate-200 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">บัญชีของคุณ</h2>
      <p className="mt-3 text-sm text-slate-500">ชื่อจากบัญชีที่เข้าสู่ระบบอยู่</p><p className="mt-1 break-words text-lg font-semibold">{name}</p>
      {!demo&&deletionLock&&expired&&<ProfileEditor name={name} disabled={locked} lock={deletionLock} expired={expired}/>}
      <button type="button" className="auth-secondary mt-5" disabled={locked} onClick={logout}>ออกจากระบบบัญชีนี้</button>
      {demo && <><p className="mt-4 text-sm">DEMO — ข้อมูลทดลอง · ใช้ข้อมูลสมมติเท่านั้น พื้นที่หมดอายุตามเวลาที่เจ้าของกำหนด</p><button type="button" className="auth-secondary mt-4" disabled={locked} onClick={freshDemo}>ออกและเริ่มพื้นที่ทดลองใหม่</button><p className="mt-3 text-sm">ออกจาก session เดิมก่อนเริ่มใหม่ ข้อมูลเดิมยังเก็บอยู่และไม่ลบพื้นที่ของผู้อื่น</p></>}
      <p className="mt-4 text-sm leading-7 text-slate-500">{real ? (recovery ? 'ยืนยันอีเมลแล้ว ข้อมูลอยู่ในบัญชีส่วนบุคคลและไม่หมดอายุเมื่อออกจากระบบ ใช้หน้าลืมรหัสผ่านเพื่อขอลิงก์ไปยังอีเมลบัญชี การ reset จะออกจาก sessions เดิมทั้งหมด' : 'บัญชีอีเมลและรหัสผ่าน — อีเมลยังไม่ยืนยัน ไม่มีบริการกู้รหัสผ่าน ข้อมูลอยู่ในบัญชีส่วนบุคคลและคงอยู่หลังออกจากระบบ เก็บรหัสผ่านและไฟล์ส่งออกไว้ในที่ปลอดภัย') : recovery ? 'บัญชีผ่านเงื่อนไขยืนยันอีเมลของ server แล้ว การกู้คืนเปิดเฉพาะพื้นที่ทดสอบสังเคราะห์นี้ ใช้หน้าลืมรหัสผ่านหลังออกจากระบบ ไม่ใช่อีเมล delivery จริง' : 'การกู้คืนบัญชีและยืนยันอีเมลยังไม่เปิดในรุ่นที่ตรวจ อย่าใช้รุ่นทดลองนี้เป็นพื้นที่เดียวสำหรับข้อมูลสำคัญ'}</p>
    </div>
    {!demo && deletionLock && expired && <MarketKey disabled={locked} lock={deletionLock} expired={expired}/>}
    <div className="tracker-card rounded-2xl border border-slate-200 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">ดูแลข้อมูลของคุณ</h2>
      <p className="mt-3 text-sm leading-7 text-slate-500">ไฟล์สำรอง JSON เก็บรายการการเงิน เงินสด และประวัติคริปโตที่บันทึกเอง ไม่รวมรูปโปรไฟล์ รูปแนบ บัญชีล็อกอินหรือการตั้งค่าระบบ ดาวน์โหลดรูปแยกจากแต่ละรายการ; กู้คืน JSON จะไม่มีรูปแนบ ไฟล์ไม่เข้ารหัสและอาจมีบันทึกช่วยจำส่วนตัว เก็บไว้ในที่ส่วนตัวและตรวจว่าไฟล์ถูกบันทึกจริง</p>
      <button type="button" className="auth-primary mt-4" disabled={locked} onClick={backup}>ไปสำรองและกู้คืนข้อมูล</button>
      <p className="mt-4 text-sm leading-7 text-slate-500">JSON ไม่ใช่สำเนาฐานข้อมูลทั้งระบบและใช้กู้บัญชีล็อกอินไม่ได้ การสำรองฐานข้อมูลและการกู้เมื่อเครื่องเสียยังต้องเตรียมแยกต่างหาก</p>
    </div>
    <div className="tracker-card rounded-2xl border border-slate-200 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">{real ? 'ขอบเขตการใช้งาน' : 'ใช้งานในเครื่อง'}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-500">เปิดเว็บจากเครื่องที่เริ่มระบบไว้ บันทึกรายการด้วยตัวเอง ตรวจประวัติก่อนส่งรายการซ้ำเมื่อผลยังไม่แน่นอน และใช้ปุ่มตรวจผลคำขอเดิมก่อนปิดหน้า</p>
      <p className="mt-3 text-sm leading-7 text-slate-500">{real ? 'บันทึกด้วยตนเอง · บริการฟรีอาจพักหรือหยุดเมื่อเกินโควตา · ไม่มี SLA · ไม่มีการส่งคำสั่งซื้อขาย ฝากถอน หรือเครดิตเริ่มต้น' : 'เวอร์ชันทดลองในเครื่อง · ยังไม่รับรองความพร้อมสำหรับข้อมูลจริงหรือออนไลน์ · ไม่มีการส่งคำสั่งซื้อขาย ฝากถอน หรือเครดิตเริ่มต้น'}</p>
      <p className="mt-3 text-sm text-slate-500">รายรับรายจ่ายและเงินสดใช้ THB · ต้นทุนและกำไรขาดทุนคริปโตใช้ USDT แยกพอร์ต</p>
    </div>
    {real && deletionLock && expired && <AccountDeletion locked={locked} lock={deletionLock} done={expired}/>}
  </section>
}
