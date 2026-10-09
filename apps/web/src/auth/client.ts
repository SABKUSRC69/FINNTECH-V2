import { healthResponseSchema } from '@finntech/contracts'

export interface SignedInAccount { name: string; demo?: boolean }
export type AccountSnapshot = ({ status: 'signed-out' } | { status: 'signed-in'; account: SignedInAccount }) & { recovery?: boolean; beta?: boolean; demoAvailable?: boolean; real?: boolean; registrationsOpen?: boolean; stagingEnrollment?: boolean; supportEmail?: string; rehearsal?: boolean }
export type AuthAction = 'sign-in' | 'sign-up' | 'sign-out'

export class AuthRequestError extends Error {
  constructor(message: string, readonly outcomeUnknown = false, readonly demoEnded = false) { super(message) }
}

interface ApiReply { status: number; ok: boolean; body: unknown }

async function apiRequest(path: string, options: RequestInit = {}): Promise<ApiReply> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timeout = window.setTimeout(abort, 8_000)
  try {
    const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
    const body: unknown = await response.json()
    return { status: response.status, ok: response.ok, body }
  } catch {
    throw new AuthRequestError('ติดต่อระบบไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง', options.method === 'POST')
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

export async function readAccount(signal?: AbortSignal): Promise<AccountSnapshot> {
  const requestOptions = signal ? { signal } : {}
  const health = await apiRequest('/api/health', requestOptions)
  if (!health.ok) throw new AuthRequestError('ระบบยังไม่พร้อม กรุณาลองอีกครั้ง')
  const parsed = healthResponseSchema.safeParse(health.body)
  if (!parsed.success || parsed.data.checks.database !== 'ok' || parsed.data.checks.auth === 'not_configured') {
    throw new AuthRequestError('ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาลองอีกครั้งภายหลัง')
  }
  const capabilities = health.body && typeof health.body === 'object' && 'capabilities' in health.body
    ? health.body.capabilities as { recovery?: unknown } : undefined
  const real = health.body && typeof health.body === 'object' && 'real' in health.body && health.body.real && typeof health.body.real === 'object'
    ? health.body.real as { supportEmail?: unknown; rehearsal?: unknown; stagingEnrollment?: unknown } : undefined
  const feature = { ...(real?.stagingEnrollment === true ? {stagingEnrollment:true} : {}), ...(capabilities?.recovery === true ? { recovery: true } : {}),
    ...(real?.rehearsal === true ? { rehearsal: true } : {}),
    ...(typeof real?.supportEmail === 'string' ? { supportEmail: real.supportEmail } : {}),
    ...(health.body && typeof health.body === 'object' && 'real' in health.body ? { real: true,
      registrationsOpen: !!(health.body.real && typeof health.body.real === 'object' && 'registrationsOpen' in health.body.real && health.body.real.registrationsOpen === true) } : {}),
    ...(health.body && typeof health.body === 'object' && 'demo' in health.body ? { demoAvailable: true } : {}),
    ...(health.body && typeof health.body === 'object' && 'beta' in health.body ? { beta: true } : {}) }
  const response = await apiRequest('/api/auth/get-session', requestOptions)
  if (!response.ok) throw new AuthRequestError('ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง')
  const session = response.body
  if (session === null) return { status: 'signed-out', ...feature }
  if (typeof session !== 'object' || !('user' in session) || !session.user
    || typeof session.user !== 'object' || !('name' in session.user) || typeof session.user.name !== 'string') {
    throw new AuthRequestError('ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง')
  }
  // Only the server establishes ownership. Never persist or send a client owner ID.
  const owner = await apiRequest('/api/me', requestOptions)
  if (owner.status === 401) return { status: 'signed-out', ...feature }
  if (!owner.ok) throw new AuthRequestError('ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง')
  const identity = owner.body
  if (!identity || typeof identity !== 'object' || !('ownerId' in identity) || typeof identity.ownerId !== 'string') {
    throw new AuthRequestError('ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง')
  }
  return { status: 'signed-in', account: { name: session.user.name, ...('demo' in identity && identity.demo === true ? { demo: true } : {}) }, ...feature }
}

export async function submitDemo(route: 'prepare' | 'enter' | 'reset', code?: string): Promise<void> {
  const response = await apiRequest(`/api/auth/demo/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(route === 'enter' ? { code } : {}) })
  if (response.ok) return
  if (response.status >= 500) throw new AuthRequestError('ยังไม่ทราบผล กรุณาตรวจสอบหรือลองคำขอเดิมอีกครั้ง', true)
  if (response.status === 429) throw new AuthRequestError('ทำรายการถี่เกินไปหรือพื้นที่ DEMO เต็ม กรุณาลองภายหลัง')
  if (response.status === 410) throw new AuthRequestError('พื้นที่ทดลองเดิมสิ้นสุดแล้ว กรุณาเริ่มพื้นที่ทดลองใหม่', false, true)
  throw new AuthRequestError('รหัสทดลองไม่ถูกต้อง หรือเจ้าของยังไม่เปิด DEMO')
}

export async function submitAuth(action: AuthAction, input: { email?: string; password?: string; name?: string } = {}): Promise<void | 'await-verification'> {
  const path = action === 'sign-out' ? '/api/auth/sign-out' : `/api/auth/${action}/email`
  const response = await apiRequest(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.ok) {
    if (action === 'sign-up' && response.body && typeof response.body === 'object' && 'awaitingVerification' in response.body && response.body.awaitingVerification === true) return 'await-verification'
    return
  }
  if (response.status === 429) throw new AuthRequestError('ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง')
  if (response.status >= 500) throw new AuthRequestError('ระบบยังไม่พร้อม กรุณาตรวจสอบสถานะก่อนลองอีกครั้ง', true)
  if (response.status === 403) throw new AuthRequestError('คำขอถูกปฏิเสธ กรุณาเปิดหน้าเว็บใหม่แล้วลองอีกครั้ง')
  if (action === 'sign-in') throw new AuthRequestError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง')
  if (action === 'sign-up') throw new AuthRequestError('สมัครบัญชีไม่สำเร็จ หากเคยสมัครแล้ว กรุณาเข้าสู่ระบบ')
  throw new AuthRequestError('ออกจากระบบไม่สำเร็จ กรุณาตรวจสอบสถานะก่อนลองอีกครั้ง', true)
}

export async function submitRecovery(route: 'request-password-reset' | 'reset-password' | 'confirm-email' | 'begin-verification', body: Record<string, string>): Promise<void> {
  const response = await apiRequest(`/api/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (response.ok) return
  if (response.status >= 500) throw new AuthRequestError('ยังยืนยันผลไม่ได้ กรุณาตรวจด้วยการเข้าสู่ระบบปกติหรือขอลิงก์ใหม่', true)
  if (response.status === 429) throw new AuthRequestError('ทำรายการถี่เกินไป กรุณารอสักครู่')
  throw new AuthRequestError('ลิงก์หรือข้อมูลไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่')
}
