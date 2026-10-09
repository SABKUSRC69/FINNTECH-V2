import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { setSessionCookie } from 'better-auth/cookies'
import { runWithAdapter } from '@better-auth/core/context'
import { parseThbDecimal, serializeThb } from '@finntech/finance'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { AuthRuntime } from './runtime.js'

export interface DemoConfiguration { enabled: boolean; code: string; epoch: string; expiresIn: number; accountLimit: number }
const configurations = new WeakMap<AuthRuntime, DemoConfiguration>()
export function registerDemo(auth: AuthRuntime, configuration: DemoConfiguration): void { configurations.set(auth, configuration) }
export function demoFor(auth: AuthRuntime): DemoConfiguration | undefined { return configurations.get(auth) }
export function demoCodeMatches(input: unknown, code: string): boolean {
  return typeof input === 'string' && input.length <= 128 && timingSafeEqual(createHash('sha256').update(input).digest(), createHash('sha256').update(code).digest())
}
export async function demoSubjectAllowed(auth: AuthRuntime, database: PrismaClient, userId: string): Promise<boolean> {
  const workspace = await database.demoWorkspace.findUnique({ where: { userId } })
  if (!workspace) return true
  const configuration = demoFor(auth)
  // Entry can be disabled without revoking sessions. Epoch changes revoke HTTP and WS.
  return !!configuration && workspace.epoch === configuration.epoch && workspace.expiresAt.getTime() > Date.now()
}

/** Bound parsing before Better Auth's endpoint parser, including chunked bodies. No proxy-IP trust. */
export function createDemoRequestGuard() {
  const buckets = new Map<string, { window: number; hits: number }>()
  return async (request: Request): Promise<Response | undefined> => {
    if (!new URL(request.url).pathname.startsWith('/api/auth/demo/')) return undefined
    if (request.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405 })
    const window = Math.floor(Date.now() / 60000)
    for (const [key, row] of buckets) if (row.window !== window) buckets.delete(key)
    // Global ceiling intentionally includes prepare/reset and does not trust X-Forwarded-For.
    const key = 'demo-service', row = buckets.get(key) ?? { window, hits: 0 }
    row.hits++; buckets.set(key, row)
    if (row.hits > 30) return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'Retry-After': '60' } })
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const reader = request.clone().body?.getReader(); let bytes = 0
      if (!reader) return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 })
      const timeout = new Promise<never>((_, reject) => { deadline = setTimeout(() => { reject(new Error('body_deadline')); void reader.cancel().catch(() => {}) }, 5000) })
      while (true) {
        const chunk = await Promise.race([reader.read(), timeout]); if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 1024) { void reader.cancel().catch(() => {}); return Response.json({ error: { code: 'BODY_TOO_LARGE' } }, { status: 413 }) }
      }
    } catch { return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 }) }
    finally { clearTimeout(deadline) }
    return undefined
  }
}

/** Better Auth custom plugin: its adapter creates users/sessions, its cookie helper signs the genuine session. */
export function demoPlugin(database: PrismaClient, configuration: DemoConfiguration): BetterAuthPlugin {
  const cookieName = (secure: boolean) => `${secure ? '__Host-' : ''}finntech.demo_request`
  const denied = (status: 'FORBIDDEN' | 'GONE' | 'TOO_MANY_REQUESTS', code: string): never => { throw new APIError(status, { code, message: code }) }
  return { id: 'finntech-demo', endpoints: {
    prepareDemo: createAuthEndpoint('/demo/prepare', { method: 'POST' }, async ctx => {
      if (!configuration.enabled) denied('FORBIDDEN', 'DEMO_DISABLED')
      const name = cookieName(!!ctx.context.options.advanced?.useSecureCookies)
      if (!await ctx.getSignedCookie(name, ctx.context.secret)) await ctx.setSignedCookie(name, randomBytes(32).toString('hex'), ctx.context.secret,
        { httpOnly: true, secure: !!ctx.context.options.advanced?.useSecureCookies, sameSite: 'strict', path: '/', maxAge: 86400 })
      return ctx.json({ prepared: true })
    }),
    resetDemo: createAuthEndpoint('/demo/reset', { method: 'POST' }, async ctx => {
      if (!configuration.enabled) denied('FORBIDDEN', 'DEMO_DISABLED')
      const current = await ctx.context.internalAdapter.findSession((await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret)) || '')
      if (current && current.session.expiresAt.getTime() > Date.now()) denied('FORBIDDEN', 'LOGOUT_FIRST')
      await ctx.setSignedCookie(cookieName(!!ctx.context.options.advanced?.useSecureCookies), randomBytes(32).toString('hex'), ctx.context.secret,
        { httpOnly: true, secure: !!ctx.context.options.advanced?.useSecureCookies, sameSite: 'strict', path: '/', maxAge: 86400 })
      return ctx.json({ prepared: true })
    }),
    enterDemo: createAuthEndpoint('/demo/enter', { method: 'POST' }, async ctx => {
      if (!configuration.enabled) denied('FORBIDDEN', 'DEMO_DISABLED')
      const body = ctx.body as unknown
      if (!body || typeof body !== 'object' || !('code' in body) || Object.keys(body).length !== 1 || !demoCodeMatches(body.code, configuration.code)) denied('FORBIDDEN', 'DEMO_CODE_INVALID')
      const nonce = await ctx.getSignedCookie(cookieName(!!ctx.context.options.advanced?.useSecureCookies), ctx.context.secret)
      if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) denied('FORBIDDEN', 'DEMO_PREPARE_REQUIRED')
      const requestHash = createHmac('sha256', ctx.context.secret).update(`demo:${nonce}`).digest('hex')
      const current = await ctx.context.internalAdapter.findSession((await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret)) || '')
      if (current && current.session.expiresAt.getTime() > Date.now()) {
        const prior = await database.demoWorkspace.findUnique({ where: { userId: current.user.id } })
        if (!prior || prior.requestHash !== requestHash) denied('FORBIDDEN', 'LOGOUT_FIRST')
      }
      const result = await database.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3000ms'`
        // One persistent lock protects replay and the total creation cap across workers/restarts.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(70820261008::bigint)::text AS locked`
        const prior = await tx.demoWorkspace.findUnique({ where: { requestHash } })
        // Scoped Better Auth adapter uses this SAME transaction; failures leave no orphan user/session/seed.
        const scoped = betterAuth({ ...ctx.context.options, plugins: [], databaseHooks: undefined,
          database: prismaAdapter(tx, { provider: 'postgresql', transaction: false }) })
        const scopedContext = await scoped.$context
        const adapter = scopedContext.internalAdapter
        if (prior) {
          if (prior.epoch !== configuration.epoch || prior.expiresAt.getTime() <= Date.now()) denied('GONE', 'DEMO_EXPIRED')
          const session = await tx.authSession.findUnique({ where: { id: prior.sessionId } })
          if (!session || session.expiresAt.getTime() <= Date.now()) denied('GONE', 'DEMO_ENDED')
          const snapshot = await runWithAdapter(scopedContext.adapter, () => adapter.findSession(session!.token))
          if (!snapshot || snapshot.user.id !== prior.userId) denied('GONE', 'DEMO_ENDED')
          return snapshot!
        }
        if (await tx.demoWorkspace.count() >= configuration.accountLimit) denied('TOO_MANY_REQUESTS', 'DEMO_CAPACITY')
        // 1.7.7 uses ambient adapter storage: explicitly bind the transaction adapter,
        // otherwise the outer HTTP adapter overrides the scoped adapter and commits separately.
        const user = await runWithAdapter(scopedContext.adapter, () => adapter.createUser({ name: 'ผู้ทดลอง DEMO', email: `demo-${randomUUID()}@example.invalid`, emailVerified: false }, { method: 'anonymous' }))
        const expiresAt = new Date(Date.now() + configuration.expiresIn * 1000)
        const session = await runWithAdapter(scopedContext.adapter, () => adapter.createSession(user.id, false, { expiresAt }))
        const owner = await tx.trackerUser.create({ data: { identityState: 'VERIFIED' } })
        const identity = await tx.authIdentity.create({ data: { ownerId: owner.id, provider: 'better-auth', subject: user.id, authUserId: user.id, verifiedAt: new Date() } })
        await tx.demoWorkspace.create({ data: { requestHash, userId: user.id, sessionId: session.id, epoch: configuration.epoch, expiresAt } })
        // Only fictional THB seed records. No generated performance or market-price history.
        const category = await tx.financeCategory.create({ data: { ownerId: owner.id, name: 'รายรับตัวอย่าง DEMO', type: 'INCOME' } })
        await tx.financeCategory.create({ data: { ownerId: owner.id, name: 'ค่าใช้จ่ายตัวอย่าง DEMO', type: 'EXPENSE' } })
        await tx.financeTransaction.create({ data: { ownerId: owner.id, categoryId: category.id, type: 'INCOME', currency: 'THB', amount: serializeThb(parseThbDecimal('12000.00')), occurredAt: new Date(), note: 'ข้อมูลสมมติ DEMO เท่านั้น' } })
        await tx.cryptoPortfolio.create({ data: { ownerId: owner.id, name: 'พอร์ตตัวอย่าง DEMO', quoteCurrency: 'USDT' } })
        await tx.auditEvent.create({ data: { ownerId: owner.id, actorIdentityId: identity.id, requestId: randomUUID(), eventType: 'demo.workspace.create', entityType: 'demo', entityId: user.id } })
        return { user, session }
      }, { maxWait: 5000, timeout: 10000 }).catch(error => {
        if (error instanceof APIError) throw error
        // Avoid framework logging of driver exceptions or request details.
        throw new APIError('SERVICE_UNAVAILABLE', { code: 'DEMO_UNAVAILABLE', message: 'DEMO_UNAVAILABLE' })
      })
      // Replay uses the original session, never creates a new token or extends the workspace lifetime.
      await setSessionCookie(ctx, result, false, { maxAge: Math.max(0, Math.floor((result.session.expiresAt.getTime() - Date.now()) / 1000)) })
      return ctx.json({ demo: true })
    }),
  } }
}
