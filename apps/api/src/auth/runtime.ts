import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { hashPassword } from 'better-auth/crypto'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { AuthConfiguration } from './config.js'
import { registerBeta } from './beta.js'
import { demoPlugin, registerDemo } from './demo.js'
import { registerReal, registerRealDatabase } from './real.js'

export interface RecoveryIntegration {
  transaction: boolean
  enroll(userId: string): Promise<void>
  verify(user: { id: string; email: string }, token: string): Promise<void>
  reset(user: { id: string; email: string }, token: string): Promise<void>
  afterReset(user: { id: string; email: string }): Promise<void>
  fault?(stage: string): void
}

const runtimeConfigurations = new WeakMap<object, AuthConfiguration>()
export function authConfigurationFor(auth: object): AuthConfiguration | undefined { return runtimeConfigurations.get(auth) }

export function createAuthRuntime(database: PrismaClient, config: AuthConfiguration, recovery?: RecoveryIntegration, registrationTransaction = true) {
  if (Boolean(config.recovery) !== Boolean(recovery)) throw new Error('Recovery requires its explicit isolated integration')
  if (config.demo && config.recovery) throw new Error('Demo and recovery cannot share a runtime')
  const auth = betterAuth({
    telemetry: { enabled: false },
    ...(config.demo ? { plugins: [demoPlugin(database, config.demo)] } : {}),
    appName: 'FINNTECH',
    secret: config.secret,
    baseURL: config.origin,
    basePath: '/api/auth',
    trustedOrigins: [config.origin],
    database: prismaAdapter(database, { provider: 'postgresql', transaction: recovery?.transaction ?? registrationTransaction }),
    user: { modelName: 'AuthUser', deleteUser: { enabled: false } },
    account: { modelName: 'AuthAccount', accountLinking: { enabled: false } },
    verification: { modelName: 'AuthVerification', ...(recovery ? { storeIdentifier: 'hashed' as const, disableCleanup: true } : {}) },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      ...(config.real?.authenticationMode === 'email-password' ? { requireEmailVerification: false, autoSignIn: true } : {}),
      ...(recovery && config.recovery ? { requireEmailVerification: true, autoSignIn: false,
        password: { hash: async (password: string) => { const hash = await hashPassword(password); recovery.fault?.('after-hash'); return hash } },
        resetPasswordTokenExpiresIn: config.recovery.resetExpiresIn, revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, token }: { user: { id: string; email: string }; token: string }) => recovery.reset(user, token),
        onPasswordReset: async ({ user }: { user: { id: string; email: string } }) => recovery.afterReset(user) } : {}) },
    ...(recovery && config.recovery ? {
      emailVerification: { expiresIn: config.recovery.verificationExpiresIn, sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false,
        sendVerificationEmail: async ({ user, token }: { user: { id: string; email: string }; token: string }) => recovery.verify(user, token) },
      databaseHooks: { user: { create: { after: async (user: { id: string }) => recovery.enroll(user.id) } },
        verification: { delete: { after: async () => recovery.fault?.('after-consume') } },
        account: { update: { after: async () => recovery.fault?.('after-password-update') } } },
    } : config.real?.authenticationMode === 'email-password' ? {
      // Lifecycle enrollment is still required for deletion/ownership. It does not verify an email.
      databaseHooks: { user: { create: { after: async (user: { id: string }) => {
        await database.authRecoveryEnrollment.create({ data: { userId: user.id } })
      } } } },
    } : {}),
    session: {
      modelName: 'AuthSession', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      ...(config.beta || config.real ? { trustedProxyHeaders: false, ipAddress: { ipAddressHeaders: [] } } : {}),
      database: { generateId: () => randomUUID() },
      cookiePrefix: 'finntech', useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' },
    },
    // Real mode has no trustworthy client IP (Render appends to client-supplied X-Forwarded-For), so
    // Better Auth's limiter would key every visitor to one shared "no-trusted-ip" bucket (3 sign-ins
    // per 10 s site-wide). createRealAuthGuard enforces per-email and global budgets instead.
    rateLimit: config.real ? { enabled: false } : { enabled: true, storage: 'memory', window: 60, max: 100 },
    // Driver exceptions can contain credentials/PII. Log the event class only.
    logger: { level: 'warn', log: (level) => { console.error(`Auth ${level}: details withheld`) } },
    onAPIError: { onError: () => { /* The HTTP wrapper returns a generic failure; no raw driver/request logs. */ } },
  })
  if (config.beta) registerBeta(auth, config.beta)
  if (config.demo) registerDemo(auth, config.demo)
  if (config.real) { registerReal(auth, config.real); registerRealDatabase(database, config.real) }
  runtimeConfigurations.set(auth, config)
  return auth
}

export type AuthRuntime = ReturnType<typeof createAuthRuntime>
