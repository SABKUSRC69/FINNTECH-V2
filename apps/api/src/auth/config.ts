import type { BetaConfiguration } from './beta.js'
import type { DemoConfiguration } from './demo.js'
import type { RealConfiguration } from './real.js'
export interface MailConfiguration { provider: 'brevo'; apiKey: string; sender: string }
type RecoveryConfiguration = { key: string; resetExpiresIn: number; verificationExpiresIn: number } &
  ({ mode: 'synthetic-3a'; sinkDirectory: string } | { mode: 'real-email'; mail: MailConfiguration })
export interface AuthConfiguration {
  databaseUrl: string
  secret: string
  origin: string
  secureCookies: boolean
  beta?: BetaConfiguration
  demo?: DemoConfiguration
  real?: RealConfiguration
  recovery?: RecoveryConfiguration
}

export function readAuthConfiguration(environment: NodeJS.ProcessEnv): AuthConfiguration | undefined {
  const { DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: secret, TRACKER_ORIGIN: origin } = environment
  if (!secret && !origin && environment.NODE_ENV !== 'production') return undefined
  if (!databaseUrl || !secret || !origin) throw new Error('Auth requires DATABASE_URL, BETTER_AUTH_SECRET and TRACKER_ORIGIN')
  if (secret.length < 32 || /placeholder|change-me|[<>]/i.test(secret)) {
    throw new Error('Auth requires a non-placeholder secret of at least 32 characters')
  }
  let parsed: URL
  let database: URL
  try { parsed = new URL(origin); database = new URL(databaseUrl) } catch {
    throw new Error('Invalid Auth URL configuration (values withheld)')
  }
  if (origin !== parsed.origin || parsed.username || parsed.password
    || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('TRACKER_ORIGIN must be one exact HTTP(S) origin')
  if (parsed.protocol === 'http:' && (environment.NODE_ENV === 'production'
    || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))) {
    throw new Error('Auth requires HTTPS except on a local development loopback origin')
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)
    || !database.username || !database.password || /placeholder|change-me|[<>]/i.test(databaseUrl)) {
    throw new Error('Auth requires an explicit PostgreSQL configuration (values withheld)')
  }
  const config: AuthConfiguration = { databaseUrl, secret, origin, secureCookies: parsed.protocol === 'https:' }
  const realMode = environment.TRACKER_RUNTIME_MODE === 'cloud-real' || environment.TRACKER_RUNTIME_MODE === 'real-rehearsal'
  if (realMode) {
    const rehearsal = environment.TRACKER_RUNTIME_MODE === 'real-rehearsal'
    const authenticationMode = environment.TRACKER_REAL_AUTH_MODE ?? 'verified-email'
    if (!['verified-email', 'email-password'].includes(authenticationMode)) throw new Error('Unsupported real account authentication mode')
    const passwordOnly = authenticationMode === 'email-password'
    const finishRehearsal = rehearsal && environment.TRACKER_REAL_REHEARSAL_ID === 'finish-20261008'
    const host = environment.TRACKER_REAL_DATABASE_HOST ?? ''
    const name = environment.TRACKER_REAL_DATABASE_NAME ?? ''
    const role = environment.TRACKER_REAL_DATABASE_ROLE ?? ''
    const limit = environment.TRACKER_REAL_ACCOUNT_LIMIT ?? '100'
    const mailLimit = environment.TRACKER_REAL_MAIL_ATTEMPT_LIMIT ?? '100'
    const databaseLimit = environment.TRACKER_REAL_DATABASE_LIMIT_BYTES ?? '268435456'
    const registration = environment.TRACKER_REAL_REGISTRATIONS_OPEN ?? 'false'
    const enrollment = environment.TRACKER_REAL_ENROLLMENT_MODE ?? (registration === 'true' ? 'public' : 'closed')
    const staged = (environment.TRACKER_REAL_STAGING_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    if (!['closed', 'staging', 'public'].includes(enrollment)
      || (enrollment === 'public') !== (registration === 'true')
      || (enrollment === 'staging' ? (!staged.length || staged.length > 20 || staged.some(email => !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email) || email.length > 254)) : staged.length > 0)) {
      throw new Error('Invalid private staging enrollment configuration; values withheld')
    }
    const supportEmail = environment.TRACKER_REAL_SUPPORT_EMAIL ?? (rehearsal ? 'support@example.test' : '')
    if (environment.TRACKER_DATA_MODE !== (rehearsal ? 'real-rehearsal' : 'real')
      || environment.TRACKER_RECOVERY_MODE !== (passwordOnly ? 'off' : 'real-email') || environment.FINNTECH_DEMO_ENABLED !== undefined
      || !/^[a-z][a-z0-9_]{1,62}$/.test(name) || !/^[a-z][a-z0-9_]{1,62}$/.test(role)
      || /beta|demo|fixture|synthetic|recovery_3a|auth_local|auth_test/i.test(`${name}:${role}`)
      || (!rehearsal && /rehearsal|test|fresh_schema/i.test(`${name}:${role}`))
      || database.hostname.replace('-pooler.', '.') !== host || database.pathname !== `/${name}` || database.username !== role
      || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 1000
      || !/^\d+$/.test(mailLimit) || Number(mailLimit) < 1 || Number(mailLimit) > 100
      || !/^\d+$/.test(databaseLimit) || Number(databaseLimit) < 1048576 || Number(databaseLimit) > 536870912
      || !['true', 'false'].includes(registration)
      || ((!passwordOnly || supportEmail !== '') && (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(supportEmail) || supportEmail.length > 254))
      || (registration === 'true' && !rehearsal && environment.TRACKER_REAL_ACCEPTANCE_APPROVED !== 'review-approved')
      || (rehearsal ? (environment.NODE_ENV !== 'test' || host !== '127.0.0.1' || database.port !== (finishRehearsal ? '5446' : '5444')
        || name !== (finishRehearsal ? 'finntech_finish_real' : 'finntech_real_rehearsal') || role !== (finishRehearsal ? 'finish_rehearsal' : 'real_rehearsal') || parsed.origin !== (finishRehearsal ? 'http://127.0.0.1:4199' : 'http://127.0.0.1:4198'))
        : (environment.NODE_ENV !== 'production' || parsed.protocol !== 'https:' || !host.endsWith('.neon.tech')
          || database.searchParams.get('sslmode') !== 'verify-full'))) throw new Error('Real-use requires a distinct explicit database and reviewed HTTPS configuration; values withheld')
    const apiKey = environment.TRACKER_MAIL_API_KEY ?? '', sender = environment.TRACKER_MAIL_SENDER ?? ''
    if (!passwordOnly && (environment.TRACKER_MAIL_PROVIDER !== 'brevo' || apiKey.length < 32 || /placeholder|change-me|[<>\s]/i.test(apiKey)
      || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(sender) || sender.length > 254
      || !/^[a-f0-9]{64}$/i.test(environment.TRACKER_RECOVERY_OUTBOX_KEY ?? '')
      || environment.TRACKER_MAIL_SENDER_CONFIRMED !== (rehearsal ? 'test-only' : 'owner-verified'))) throw new Error('Real email requires server secrets and a verified sender; values withheld')
    config.real = { databaseHost: host, databaseName: name, databaseRole: role, boundary: rehearsal ? 'real-rehearsal' : 'real',
      authenticationMode: authenticationMode as 'verified-email' | 'email-password', registrationsOpen: registration === 'true', accountLimit: Number(limit), mailAttemptLimit: Number(mailLimit), databaseLimitBytes: Number(databaseLimit), supportEmail,
      ...(enrollment === 'staging' ? { stagingEmails: new Set(staged) } : {}) }
    if (!passwordOnly) config.recovery = { mode: 'real-email', key: environment.TRACKER_RECOVERY_OUTBOX_KEY!, resetExpiresIn: 900,
      verificationExpiresIn: 86400, mail: { provider: 'brevo', apiKey, sender } }
  }
  if (environment.TRACKER_RUNTIME_MODE === 'cloud-beta') {
    const access = environment.TRACKER_BETA_ACCESS
    if (environment.NODE_ENV !== 'production' || parsed.protocol !== 'https:'
      || environment.TRACKER_BETA_DATA_MODE !== 'synthetic'
      || !['public', 'invited'].includes(access ?? '')
      || environment.TRACKER_RECOVERY_MODE !== 'off'
      || !['true', 'false'].includes(environment.TRACKER_BETA_REGISTRATIONS_OPEN ?? '')
      || !database.hostname.endsWith('.neon.tech') || !environment.TRACKER_BETA_DATABASE_HOST
      || database.hostname.replace('-pooler.', '.') !== environment.TRACKER_BETA_DATABASE_HOST
      || database.pathname !== '/finntech_beta'
      || database.username !== 'beta_app' || database.searchParams.get('sslmode') !== 'verify-full') {
      throw new Error('Cloud beta requires explicit isolated synthetic HTTPS configuration (values withheld)')
    }
    const invitedEmails = new Set((environment.TRACKER_BETA_INVITED_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
    if (access === 'invited' && !invitedEmails.size) throw new Error('Invited beta requires a server allowlist')
    config.beta = { access: access as 'public' | 'invited', registrationsOpen: environment.TRACKER_BETA_REGISTRATIONS_OPEN === 'true', invitedEmails }
  }
  const mode = environment.TRACKER_RECOVERY_MODE
  if (environment.FINNTECH_DEMO_ENABLED !== undefined) {
    const enabled = environment.FINNTECH_DEMO_ENABLED === 'true'
    const code = environment.FINNTECH_DEMO_ACCESS_CODE ?? ''
    const epoch = environment.FINNTECH_DEMO_SESSION_EPOCH ?? '1'
    const ttl = environment.FINNTECH_DEMO_SESSION_SECONDS ?? '14400'
    const limit = environment.FINNTECH_DEMO_ACCOUNT_LIMIT ?? '100'
    if (!config.beta || !['true', 'false'].includes(environment.FINNTECH_DEMO_ENABLED)
      || (enabled && (code.length < 12 || code.length > 128 || !code.trim()))
      || !/^[a-zA-Z0-9._-]{1,64}$/.test(epoch)
      || !/^\d+$/.test(ttl) || Number(ttl) < 60 || Number(ttl) > 86400
      || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 5000) throw new Error('Invalid isolated demo configuration (values withheld)')
    config.demo = { enabled, code, epoch, expiresIn: Number(ttl), accountLimit: Number(limit) }
  }
  if (mode && mode !== 'off' && !realMode) {
    if (mode !== 'synthetic-3a' || environment.NODE_ENV === 'production'
      || environment.TRACKER_RECOVERY_CONFIRM !== 'synthetic-only'
      || database.hostname !== '127.0.0.1' || database.port !== '5441'
      || database.pathname !== '/finntech_recovery_3a_20261007' || database.username !== 'recovery_fixture'
      || parsed.origin !== 'http://127.0.0.1:4197'
      || !/^[a-f0-9]{64}$/i.test(environment.TRACKER_RECOVERY_OUTBOX_KEY ?? '')
      || !environment.TRACKER_RECOVERY_SINK_DIRECTORY) throw new Error('Recovery is restricted to the dedicated synthetic 3A target (values withheld)')
    config.recovery = { mode, key: environment.TRACKER_RECOVERY_OUTBOX_KEY!, sinkDirectory: environment.TRACKER_RECOVERY_SINK_DIRECTORY,
      resetExpiresIn: 900, verificationExpiresIn: 86400 }
  }
  return config
}
