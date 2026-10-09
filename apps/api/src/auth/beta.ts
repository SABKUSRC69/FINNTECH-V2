import { createHmac } from 'node:crypto'
import type { AuthRuntime } from './runtime.js'

export interface BetaConfiguration {
  access: 'public' | 'invited'
  registrationsOpen: boolean
  invitedEmails: ReadonlySet<string>
}
const configurations = new WeakMap<AuthRuntime, BetaConfiguration>()
export function registerBeta(auth: AuthRuntime, config: BetaConfiguration): void { configurations.set(auth, config) }
export function betaFor(auth: AuthRuntime): BetaConfiguration | undefined { return configurations.get(auth) }
export function betaEmailAllowed(config: BetaConfiguration, email: string): boolean {
  return config.access === 'public' || config.invitedEmails.has(email.trim().toLowerCase())
}

// Single-instance beta: bounded account buckets and shared service bucket. Never trust proxy IP input.
export function createBetaAuthGuard(config: BetaConfiguration, secret: string) {
  const buckets = new Map<string, { window: number; hits: number }>()
  return async (request: Request): Promise<Response | undefined> => {
    const route = new URL(request.url).pathname
    if (request.method !== 'POST' || !['/api/auth/sign-up/email', '/api/auth/sign-in/email'].includes(route)) return undefined
    const denied = () => Response.json({ error: { code: 'BETA_ACCESS_DENIED' } }, { status: 403 })
    let body: unknown
    try {
      const reader = request.clone().body?.getReader()
      if (!reader) return denied()
      const chunks: Uint8Array[] = []; let size = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 16384) { void reader.cancel().catch(() => {}); return Response.json({ error: { code: 'BODY_TOO_LARGE' } }, { status: 413 }) }
        chunks.push(chunk.value)
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    } catch { return denied() }
    const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const now = Math.floor(Date.now() / 60000)
    for (const [key, row] of buckets) if (row.window !== now) buckets.delete(key)
    const account = createHmac('sha256', secret).update(`${route}:${email}`).digest('hex')
    for (const [key, limit] of [[route, 60], [account, 10]] as const) {
      if (!buckets.has(key) && buckets.size >= 4096) return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 })
      const row = buckets.get(key) ?? { window: now, hits: 0 }; row.hits++; buckets.set(key, row)
      if (row.hits > limit) return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 })
    }
    if (!email || !betaEmailAllowed(config, email) || (route.endsWith('sign-up/email') && !config.registrationsOpen)) return denied()
    return undefined
  }
}
