import { createHmac } from 'node:crypto'
import type { PrismaClient, Prisma } from '../generated/prisma/client.js'
import type { AuthRuntime } from './runtime.js'

export interface RealConfiguration {
  authenticationMode?: 'verified-email' | 'email-password'
  databaseHost: string
  databaseName: string
  databaseRole: string
  boundary: 'real' | 'real-rehearsal'
  registrationsOpen: boolean
  accountLimit: number
  mailAttemptLimit: number
  databaseLimitBytes: number
  supportEmail: string
  stagingEmails?: ReadonlySet<string>
}
export function realEmailAllowed(config: RealConfiguration, email: string): boolean {
  return !config.stagingEmails || config.stagingEmails.has(email.trim().toLowerCase())
}
export function realSignupAllowed(config: RealConfiguration, email: string): boolean {
  return config.registrationsOpen || !!config.stagingEmails?.has(email.trim().toLowerCase())
}
const configurations = new WeakMap<AuthRuntime, RealConfiguration>()
const databases = new WeakMap<PrismaClient, RealConfiguration>()
export function registerRealDatabase(database: PrismaClient, config: RealConfiguration): void { databases.set(database, config) }
export function realDatabaseFor(database: PrismaClient): RealConfiguration | undefined { return databases.get(database) }
export async function realStorageAvailable(database: PrismaClient | Prisma.TransactionClient, config: RealConfiguration): Promise<boolean> {
  const rows = await database.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`
  return !!rows[0] && rows[0].bytes < BigInt(config.databaseLimitBytes)
}
export function registerReal(auth: AuthRuntime, config: RealConfiguration): void { configurations.set(auth, config) }
export function realFor(auth: AuthRuntime): RealConfiguration | undefined { return configurations.get(auth) }

// Fixed buckets: attacker-controlled identities cannot grow the rate table indefinitely.
export async function consumeRealBudget(tx: Prisma.TransactionClient, key: string, limit: number, seconds: number, now = new Date()): Promise<boolean> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(734031)`
  const row = await tx.realRuntimeCounter.findUnique({ where: { key } })
  const expired = !row || now.getTime() - row.window.getTime() >= seconds * 1000
  const hits = expired ? 1 : row.hits + 1
  if (hits > limit) return false
  await tx.realRuntimeCounter.upsert({ where: { key }, create: { key, window: now, hits },
    update: { window: expired ? now : row.window, hits } })
  return true
}

export async function assertRealBoundary(database: PrismaClient, config: RealConfiguration, origin: string): Promise<void> {
  const current = await database.$queryRaw<{ name: string; role: string }[]>`SELECT current_database() AS name, current_user AS role`
  const marker = await database.runtimeBoundary.findUnique({ where: { id: 'singleton' } })
  if (current[0]?.name !== config.databaseName || current[0]?.role !== config.databaseRole
    || marker?.mode !== config.boundary || marker.databaseName !== config.databaseName || marker.databaseRole !== config.databaseRole
    || marker.origin !== origin || await database.demoWorkspace.count() !== 0
    || await database.legacyImport.count() !== 0 || await database.legacyDemoSummary.count() !== 0
    || await database.trackerUser.count({ where: { identityState: { not: 'VERIFIED' } } }) !== 0
    || await database.authUser.count({ where: { recovery: null } }) !== 0) throw new Error('Real-use database boundary rejected; values withheld')
}

export async function boundedAuthBody(request: Request): Promise<Record<string, unknown> | undefined> {
  const reader = request.clone().body?.getReader()
  if (!reader) return undefined
  const chunks: Uint8Array[] = []; let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const read = async () => {
      while (true) {
        const item = await reader.read()
        if (item.done) break
        size += item.value.byteLength
        if (size > 16384) throw new Error('body_limit')
        chunks.push(item.value)
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : undefined
    }
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('body_timeout')), 3000)
    })])
  } catch { return undefined }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}) }
}

export function createRealAuthGuard(database: PrismaClient, config: RealConfiguration, origin: string, secret: string) {
  return async (request: Request): Promise<Response | undefined> => {
    if (request.method !== 'POST') return undefined
    const route = new URL(request.url).pathname
    if (request.headers.get('origin') !== origin) return Response.json({ error: { code: 'UNTRUSTED_ORIGIN' } }, { status: 403 })
    const body = await boundedAuthBody(request)
    if (!body) return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 })
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
    const bucket = Number.parseInt(createHmac('sha256', secret).update(email).digest('hex').slice(0, 4), 16) % 256
    const allowed = await database.$transaction(async tx => {
      const global = await consumeRealBudget(tx, 'auth:global', 60, 60)
      const account = await consumeRealBudget(tx, `auth:bucket:${bucket}`, 10, 60)
      return global && account
    })
    if (!allowed) return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 })
    if (route.endsWith('/sign-up/email') && !realSignupAllowed(config, email)) return Response.json({ error: { code: 'REGISTRATION_CLOSED' } }, { status: 403 })
    if (route.endsWith('/sign-in/email') && !realEmailAllowed(config, email)) return Response.json({ error: { code: 'ACCOUNT_NOT_READY' } }, { status: 403 })
    return undefined
  }
}
