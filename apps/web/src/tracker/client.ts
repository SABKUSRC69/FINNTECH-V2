import { BACKUP_MAX_BYTES, BACKUP_MAX_ROWS } from '@finntech/contracts'
export class TrackerRequestError extends Error {
  constructor(message: string, readonly unknownOutcome: boolean, readonly expired = false, readonly status?: number, readonly code?: string) { super(message) }
}
const messages: Record<string, string> = {
  CASH_ACCOUNT_REQUIRED: 'เลือกบัญชีเงินสดและกรอกเงินบาทจริงก่อนบันทึก หากใช้หน้าเก่าให้โหลดเว็บใหม่',
  CASH_ACCOUNT_NOT_FOUND: 'ไม่พบบัญชีเงินสดที่เลือก กรุณาโหลดข้อมูลล่าสุด',
  CASH_INSUFFICIENT: 'ยอดเงินสดไม่พอ รายการนี้ยังไม่ถูกบันทึก ตรวจยอดจริงในหน้าสินทรัพย์รวม',
  CASH_AMOUNT_REQUIRED: 'กรอกเงินบาทที่จ่ายหรือได้รับจริงก่อนบันทึก',
  CASH_OPENING_CHOICE_REQUIRED: 'รายการนี้เกิดก่อนวันตั้งยอดเงินสด กรุณาโหลดหน้าใหม่แล้วเลือกว่ารวมอยู่ในยอดตั้งต้นแล้วหรือไม่',
  CASH_OPENING_DATE: 'รายการนี้ไม่ได้เกิดก่อนวันตั้งยอดเงินสด จึงต้องปรับเงินสดตามปกติ',
  LEGACY_CASH_LINK: 'รายการเดิมแก้ประวัติได้ แต่ไม่ปรับยอดเงินสดย้อนหลัง',
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
  BACKUP_TOO_LARGE: `ข้อมูลเกินขนาดสำรองที่รองรับ (${BACKUP_MAX_BYTES / 1024 / 1024} MiB / ${BACKUP_MAX_ROWS.toLocaleString('en-US')} รายการ) ระบบไม่ส่งออกบางส่วน`,
  BODY_TOO_LARGE: 'ไฟล์หรือคำขอมีขนาดเกินที่ระบบรองรับ',
  WRITE_RATE_LIMITED: 'บัญชีของคุณบันทึกถี่เกินโควตาต่อนาที รายการนี้ยังไม่ถูกบันทึก กรุณารอสักครู่แล้วบันทึกใหม่',
  SERVICE_BUSY: 'ระบบมีผู้ใช้บันทึกพร้อมกันจำนวนมาก รายการนี้ยังไม่ถูกบันทึก กรุณารอสักครู่แล้วบันทึกใหม่',
  BACKUP_INCONSISTENT: 'ยอดบัญชีไม่ตรงกับประวัติในไฟล์ จึงยังสำรองหรือกู้คืนไม่ได้',
  BACKUP_PREVIEW_CHANGED: 'ไฟล์ไม่ตรงกับ preview กรุณาตรวจไฟล์ใหม่',
  BACKUP_TARGET_NOT_EMPTY: 'บัญชีนี้มีข้อมูลการเงินแล้ว ระบบจะไม่เขียนทับหรือรวมข้อมูล',
  MARKET_KEY_REJECTED: 'Tiingo ปฏิเสธ key นี้ (ยืนยันตัวตนไม่ผ่าน) ตรวจว่าคัดลอก API Token ครบแล้วลองใหม่ ระบบไม่ได้บันทึก key',
  MARKET_KEY_UNVERIFIED: 'ยังติดต่อ Tiingo เพื่อทดสอบ key ไม่ได้ ระบบไม่ได้บันทึก key กรุณาลองใหม่ภายหลัง',
  MARKET_KEY_CHANGED: 'การตั้งค่า key เปลี่ยนจากอีกหน้าหนึ่งแล้ว โหลดสถานะล่าสุดก่อนทำอีกครั้ง',
  MARKET_KEY_UNAVAILABLE: 'server นี้ยังไม่เปิดให้ใส่ key ราคาปิด',
  MARKET_KEY_ATTEMPTS: 'ทดสอบ key บ่อยเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่',
  BACKUP_VERIFY_FAILED: 'ตรวจยอดหลังนำเข้าไม่ตรง ระบบยกเลิกการกู้คืนทั้งหมดแล้ว',
}
/** Whole-dataset backup requests may run far longer than ordinary reads/writes on the free instance. */
export const BACKUP_REQUEST_TIMEOUT_MS = 150000
export async function trackerRequest(path: string, method = 'GET', body?: unknown, key?: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`/api/${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const value = await response.json() as { error?: { code?: string } }
    if (!response.ok) throw new TrackerRequestError(
      response.status === 401 ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' : messages[value.error?.code ?? ''] ?? 'ระบบยังตอบกลับไม่ได้ กรุณาลองอีกครั้งด้วยคำขอเดิม',
      method !== 'GET' && response.status >= 500, response.status === 401, response.status, value.error?.code,
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
