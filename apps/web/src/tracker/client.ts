export class TrackerRequestError extends Error {
  constructor(message: string, readonly unknownOutcome: boolean, readonly expired = false) { super(message) }
}
const messages: Record<string, string> = {
  MEDIA_QUOTA: 'พื้นที่รูปเต็ม (3 MiB / รูปแนบ 10 รูปต่อบัญชี หรือพื้นที่รวมของระบบ) ไม่มีการลบรูปเก่าอัตโนมัติ',
  MEDIA_NOT_FOUND: 'ไม่พบรูปส่วนตัวนี้ หรือรูปพักหมดอายุแล้ว',
  MEDIA_VERSION: 'รูปบัญชีเปลี่ยนจากอีกหน้าหนึ่งแล้ว โหลดรูปบัญชีก่อนบันทึกใหม่',
  MEDIA_STAGED_AVATAR: 'มีรูปโปรไฟล์พักอยู่แล้ว จัดการรูปพักในหน้าบัญชีก่อนเตรียมใหม่',
  MEDIA_DISABLED: 'รูปภาพยังไม่เปิดในพื้นที่ DEMO นี้',
  CASH_VERSION_CONFLICT: 'ยอดเงินสดเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลล่าสุดแล้วกดแก้ยอดอีกครั้ง',
  INVALID_INPUT: 'ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน ทศนิยม และวันที่อีกครั้ง',
  OVERSELL: 'จำนวนขายเกินจำนวนที่ถืออยู่ตามลำดับประวัติ รายการนี้ยังไม่ถูกบันทึก',
  NAME_CONFLICT: 'ชื่อนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น',
  CATEGORY_NOT_FOUND: 'ไม่พบหมวดหมู่ที่เลือกหรือชนิดไม่ตรงกับรายการ',
  PORTFOLIO_NOT_FOUND: 'ไม่พบพอร์ตที่เลือก',
  IDEMPOTENCY_CONFLICT: 'คำขอเดิมมีข้อมูลเปลี่ยนไป กรุณาตรวจสอบก่อนบันทึกใหม่',
  RECORD_ALREADY_CORRECTED: 'รายการนี้ถูกแก้หรือยกเลิกแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนทำต่อ',
  ENTRY_NOT_FOUND: 'ไม่พบรายการรายรับรายจ่ายนี้',
  TRADE_NOT_FOUND: 'ไม่พบประวัติคริปโตนี้',
  BACKUP_TOO_LARGE: 'ข้อมูลเกินขนาดสำรองที่รองรับ (2 MiB / 2,000 รายการ) ระบบไม่ส่งออกบางส่วน',
  BODY_TOO_LARGE: 'ไฟล์หรือคำขอมีขนาดเกินที่ระบบรองรับ',
  BACKUP_INCONSISTENT: 'ยอดบัญชีไม่ตรงกับประวัติในไฟล์ จึงยังสำรองหรือกู้คืนไม่ได้',
  BACKUP_PREVIEW_CHANGED: 'ไฟล์ไม่ตรงกับ preview กรุณาตรวจไฟล์ใหม่',
  BACKUP_TARGET_NOT_EMPTY: 'บัญชีนี้มีข้อมูลการเงินแล้ว ระบบจะไม่เขียนทับหรือรวมข้อมูล',
  BACKUP_VERIFY_FAILED: 'ตรวจยอดหลังนำเข้าไม่ตรง ระบบยกเลิกการกู้คืนทั้งหมดแล้ว',
}
export async function trackerRequest(path: string, method = 'GET', body?: unknown, key?: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`/api/${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const value = await response.json() as { error?: { code?: string } }
    if (!response.ok) throw new TrackerRequestError(
      response.status === 401 ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' : messages[value.error?.code ?? ''] ?? 'ระบบยังตอบกลับไม่ได้ กรุณาลองอีกครั้งด้วยคำขอเดิม',
      method !== 'GET' && response.status >= 500, response.status === 401,
    )
    return value
  } catch (error) {
    if (error instanceof TrackerRequestError) throw error
    throw new TrackerRequestError('การเชื่อมต่อขัดข้อง ยังไม่ทราบผลการบันทึก กดลองส่งคำขอเดิมอีกครั้ง', method !== 'GET')
  } finally { clearTimeout(timeout) }
}
export function displayDecimal(value: string, minimumScale = 2): string {
  const [integer = '0', fraction = ''] = value.split('.')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction || minimumScale ? `.${fraction.padEnd(minimumScale, '0')}` : ''}`
}
