import { createHash, createHmac } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import type { AuthConfiguration } from './config.js'
import { createAuthRuntime, type AuthRuntime, type RecoveryIntegration } from './runtime.js'
import { enqueueDelivery } from './delivery.js'
import { isAPIError } from 'better-auth/api'
import { assertRealBoundary, boundedAuthBody, consumeRealBudget, realStorageAvailable, realSignupAllowed, realEmailAllowed } from './real.js'

const generic = { status: true, message: 'หากบัญชีนี้รองรับการกู้คืน ระบบจะส่งขั้นตอนไปยังอีเมลที่ลงทะเบียนไว้' }
const invalid = () => Response.json({ error: { code: 'INVALID_CHALLENGE' } }, { status: 400 })
const digest = (token: string) => createHash('sha256').update(token).digest('base64url')
class Rejected extends Error { constructor(readonly response: Response) { super('recovery_rejected') } }

export class RecoveryService {
  readonly auth: AuthRuntime
  constructor(private readonly database: PrismaClient, private readonly config: AuthConfiguration,
    private readonly fault?: (stage: string) => void) {
    if (!config.recovery || (config.recovery.mode === 'synthetic-3a'
      ? (new URL(config.databaseUrl).pathname !== '/finntech_recovery_3a_20261007' || config.origin !== 'http://127.0.0.1:4197')
      : !config.real || config.beta || config.demo)) throw new Error('Recovery target guard rejected')
    this.auth = this.runtime(database, true)
  }
  private runtime(database: PrismaClient | Prisma.TransactionClient, transaction: boolean): AuthRuntime {
    const settings = this.config.recovery!
    const integration: RecoveryIntegration = {
      transaction,
      enroll: async userId => { await database.authRecoveryEnrollment.create({ data: { userId } }) },
      verify: async (user, token) => {
        const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { exp: number }
        const expiresAt = new Date(payload.exp * 1000)
        const identifier = `email-verify:${digest(token)}`
        if (await database.authVerification.findFirst({ where: { identifier } })) return
        await database.authVerification.create({ data: { identifier, value: user.id, expiresAt } })
        this.fault?.('before-delivery-enqueue')
        await enqueueDelivery(database, user.id, { email: user.email, kind: 'verify', link: `${this.config.origin}/account/verify${this.config.real ? '#' : '?'}token=${encodeURIComponent(token)}` }, expiresAt, settings.key, !!this.config.real)
      },
      reset: async (user, token) => {
        this.fault?.('before-delivery-enqueue')
        const challenge = await database.authVerification.findFirstOrThrow({ where: { identifier: digest(`reset-password:${token}`), value: user.id } })
        await enqueueDelivery(database, user.id, { email: user.email, kind: 'reset', link: `${this.config.origin}/account/reset${this.config.real ? '#' : '?'}token=${encodeURIComponent(token)}` },
          challenge.expiresAt, settings.key, !!this.config.real)
      },
      afterReset: async user => {
        this.fault?.('before-session-revoke')
        await database.authVerification.deleteMany({ where: { value: user.id } })
        await database.authDeliveryJob.updateMany({ where: { userId: user.id, status: 'PENDING' }, data: { status: 'EXPIRED', envelope: '', reason: 'CHALLENGE_REVOKED' } })
        await enqueueDelivery(database, user.id, { email: user.email, kind: 'notice' }, new Date(Date.now() + 86400000), settings.key, !!this.config.real)
        this.fault?.('after-reset-hook')
      },
      ...(this.fault ? { fault: this.fault } : {}),
    }
    return createAuthRuntime(database as PrismaClient, this.config, integration)
  }
  private async atomic<T>(subject: string | undefined, operation: (runtime: AuthRuntime, tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.database.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`
      if (subject) {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth_users WHERE id = ${subject}::uuid FOR UPDATE`
        if (rows.length !== 1) throw new Rejected(invalid())
        const enrollment = await tx.authRecoveryEnrollment.findUnique({ where: { userId: subject } })
        if (!enrollment || enrollment.blocked) throw new Rejected(invalid())
        const user = await tx.authUser.findUniqueOrThrow({ where: { id: subject } })
        if (this.config.real && !realEmailAllowed(this.config.real, user.email)) throw new Rejected(invalid())
      }
      return operation(this.runtime(tx, false), tx)
    }, { maxWait: 3000, timeout: 15000 })
  }
  private async rate(email: string, peer: string): Promise<boolean> {
    if (this.config.real) return this.database.$transaction(tx => consumeRealBudget(tx, 'recovery:global', 30, 60))
    const key = this.config.recovery!.key, now = new Date(), start = new Date(Math.floor(now.getTime() / 60000) * 60000)
    const accountKey = createHmac('sha256', key).update(`account:${email}`).digest('hex')
    const keys = [accountKey, createHmac('sha256', key).update(`peer:${peer}`).digest('hex')]
    return this.database.$transaction(async tx => {
      const counts = []
      for (const bucket of keys.sort()) {
        const row = await tx.authRecoveryRate.upsert({ where: { key_window: { key: bucket, window: start } }, update: { hits: { increment: 1 } }, create: { key: bucket, window: start, hits: 1 } })
        counts.push({ key: bucket, hits: row.hits })
      }
      return counts.every(row => row.hits <= (row.key === accountKey ? 20 : 60))
    })
  }
  async handle(request: Request, peer = 'loopback'): Promise<Response | undefined> {
    const url = new URL(request.url), route = url.pathname.slice('/api/auth'.length)
    const routes = ['/sign-up/email', '/request-password-reset', '/reset-password', '/confirm-email', '/begin-verification']
    if (!routes.includes(route)) return undefined
    if (request.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405 })
    if (request.headers.get('origin') !== this.config.origin || (!this.config.real && (request.headers.has('x-forwarded-for')
      || request.headers.has('x-forwarded-host') || request.headers.has('forwarded')
      || (request.headers.get('host') && request.headers.get('host') !== new URL(this.config.origin).host)))) return Response.json({ error: { code: 'UNTRUSTED_ORIGIN' } }, { status: 403 })
    const started = Date.now()
    let body: Record<string, unknown>
    try { body = this.config.real ? (await boundedAuthBody(request))! : await request.clone().json() as Record<string, unknown> } catch { return invalid() }
    if (!body || typeof body !== 'object' || Array.isArray(body) || url.search) return invalid()
    for (const field of ['callbackURL', 'redirectTo']) if (body[field] !== undefined
      && body[field] !== `${this.config.origin}/account/${field === 'redirectTo' ? 'reset' : 'verify'}`) return Response.json({ error: { code: 'INVALID_CALLBACK' } }, { status: 400 })
    try {
      if (route === '/sign-up/email') {
        if (typeof body.email !== 'string' || (this.config.real
          ? (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(body.email) || body.email.length > 254 || body.email.endsWith('.invalid'))
          : !/^[^@\s]+@example\.invalid$/i.test(body.email))) return invalid()
        if (this.config.real) {
          await assertRealBoundary(this.database, this.config.real, this.config.origin)
          if (!await realStorageAvailable(this.database, this.config.real)) return Response.json({ error: { code: 'REGISTRATION_PAUSED' } }, { status: 403 })
          if (!realSignupAllowed(this.config.real, body.email)) return Response.json({ error: { code: 'REGISTRATION_CLOSED' } }, { status: 403 })
        }
        return await this.atomic(undefined, async (runtime, tx) => {
          if (this.config.real) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(734032)`
            if (await tx.authUser.count() >= this.config.real.accountLimit) throw new Rejected(Response.json({ error: { code: 'REGISTRATION_PAUSED' } }, { status: 403 }))
          }
          const result = await runtime.handler(new Request(`${this.config.origin}/api/auth/sign-up/email`, { method: 'POST', headers: request.headers, body: JSON.stringify(body) }))
          if (!result.ok) throw new Rejected(result)
          return result
        })
      }
      if (route === '/request-password-reset') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!await this.rate(email, peer)) return Response.json(generic, { status: 429 })
        const user = await this.database.authUser.findUnique({ where: { email }, include: { recovery: true } })
        if (user?.emailVerified && user.recovery && !user.recovery.blocked && (!this.config.real || realEmailAllowed(this.config.real,email))) {
          await this.atomic(user.id, async (runtime, tx) => {
            const current = await tx.authUser.findUniqueOrThrow({ where: { id: user.id } })
            if (!current.emailVerified) return
            await runtime.api.requestPasswordReset({ body: { email, redirectTo: `${this.config.origin}/account/reset` } })
          })
        }
        return Response.json(generic)
      }
      if (route === '/begin-verification') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!await this.rate(email, peer)) return Response.json(generic, { status: 429 })
        const user = await this.database.authUser.findUnique({ where: { email }, include: { accounts: true } })
        const ctx = await this.auth.$context
        const account = user?.accounts.find(row => row.providerId === 'credential')
        const validPassword = account?.password && typeof body.password === 'string' && body.password.length <= 128
          && await ctx.password.verify({ password: body.password, hash: account.password })
        if (user && validPassword && !user.emailVerified && (!this.config.real || realEmailAllowed(this.config.real, email))) {
          await this.database.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM auth_users WHERE id = ${user.id}::uuid FOR UPDATE`
            const freshAccount = await tx.authAccount.findUniqueOrThrow({ where: { id: account!.id } })
            if (freshAccount.password !== account!.password) throw new Rejected(invalid())
            const enrollment = this.config.real ? await tx.authRecoveryEnrollment.findUnique({ where: { userId: user.id } })
              : await tx.authRecoveryEnrollment.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} })
            if (!enrollment || enrollment.blocked) throw new Rejected(invalid())
            await this.runtime(tx, false).api.sendVerificationEmail({ body: { email, callbackURL: `${this.config.origin}/account/verify` } })
          }, { timeout: 15000 })
        }
        return Response.json(generic)
      }
      const token = typeof body.token === 'string' ? body.token : ''
      if (!token || token.length > 4096) return invalid()
      if (route === '/confirm-email') {
        const identifier = `email-verify:${digest(token)}`
        const candidate = await this.database.authVerification.findFirst({ where: { identifier } })
        if (!candidate) return invalid()
        return await this.atomic(candidate.value, async (runtime, tx) => {
          const row = await tx.authVerification.findFirst({ where: { identifier } })
          if (!row || row.expiresAt <= new Date()) throw new Rejected(invalid())
          const session = await this.auth.api.getSession({ headers: request.headers })
          if (session && session.user.id !== row.value) throw new Rejected(invalid())
          await tx.authVerification.deleteMany({ where: { identifier } })
          await runtime.api.verifyEmail({ query: { token } })
          await tx.authVerification.deleteMany({ where: { value: row.value, identifier: { startsWith: 'email-verify:' } } })
          return Response.json({ status: true })
        })
      }
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 128
        || body.confirmation !== body.newPassword) return invalid()
      const ctx = await this.auth.$context
      const candidate = await ctx.internalAdapter.findVerificationValue(`reset-password:${token}`)
      if (!candidate || candidate.expiresAt <= new Date()) return invalid()
      return await this.atomic(candidate.value, async (runtime, tx) => {
        const user = await tx.authUser.findUniqueOrThrow({ where: { id: candidate.value } })
        if (!user.emailVerified) throw new Rejected(invalid())
        const session = await this.auth.api.getSession({ headers: request.headers })
        if (session && session.user.id !== candidate.value) throw new Rejected(invalid())
        await runtime.api.resetPassword({ body: { token, newPassword: body.newPassword as string } })
        this.fault?.('after-session-revoke')
        return Response.json({ status: true })
      })
    } catch (error) {
      if (route === '/request-password-reset' || route === '/begin-verification') {
        console.error('Recovery request unavailable: ENQUEUE_OR_DATABASE_FAILED; details withheld')
        return Response.json(generic)
      }
      if (error instanceof Rejected) return error.response
      if (isAPIError(error) && error.statusCode >= 400 && error.statusCode < 500) return invalid()
      return Response.json({ error: { code: 'RECOVERY_UNAVAILABLE' } }, { status: 503 })
    } finally {
      if (route === '/request-password-reset' || route === '/begin-verification') await delay(Math.max(0, 500 - (Date.now() - started)))
    }
  }
}
