import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile, link, unlink, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Prisma, PrismaClient } from '../generated/prisma/client.js'
import { consumeRealBudget, realEmailAllowed } from './real.js'
import type { RealConfiguration } from './real.js'

export interface SyntheticMessage { email: string; kind: 'verify' | 'reset' | 'notice'; link?: string }
export interface DeliverySink { deliver(id: string, encryptedEnvelope: string): Promise<void> }
export function seal(message: SyntheticMessage, key: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(value => value.toString('base64url')).join('.')
}
// Server-only / restricted test harness. Not imported into web and never exposed by a route.
export function openEnvelope(envelope: string, key: string): SyntheticMessage {
  const parts = envelope.split('.').map(value => Buffer.from(value, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), parts[0]!)
  decipher.setAuthTag(parts[1]!)
  return JSON.parse(Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString('utf8')) as SyntheticMessage
}
export class LocalSyntheticSink implements DeliverySink {
  constructor(private readonly directory: string) { if (!path.isAbsolute(directory)) throw new Error('Synthetic sink requires an absolute restricted directory') }
  async deliver(id: string, envelope: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('invalid_delivery_id')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = path.join(this.directory, `${id}.${randomUUID()}.pending`), destination = path.join(this.directory, `${id}.mail`)
    await writeFile(temporary, envelope, { flag: 'wx', mode: 0o600 })
    try {
      try { await link(temporary, destination) }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') || await readFile(destination, 'utf8') !== envelope) throw new Error('synthetic_delivery_failed')
      }
    } finally { await unlink(temporary) }
  }
}
export async function enqueueDelivery(tx: Prisma.TransactionClient, userId: string, message: SyntheticMessage, expiresAt: Date, key: string, real = false): Promise<void> {
  if (real ? (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(message.email) || message.email.length > 254)
    : !/^[^@\s]+@example\.invalid$/i.test(message.email)) throw new Error('recipient_rejected')
  if (real && (await tx.authDeliveryJob.count({ where: { userId } }) >= 1000
    || await tx.authDeliveryJob.count({ where: { userId, status: 'PENDING' } }) >= 4)) throw new Error('mail_queue_paused')
  const fingerprint = createHmac('sha256', Buffer.from(key, 'hex')).update(`${userId}:${message.kind}:${message.link ?? randomUUID()}`).digest('hex')
  await tx.authDeliveryJob.upsert({ where: { fingerprint }, update: {}, create: { id: randomUUID(), userId, fingerprint,
    kind: message.kind, envelope: seal(message, key), expiresAt } })
}

// Claim/attempt time is committed BEFORE the network call. A killed worker cannot reset
// the provider's 15-minute deduplication window. No automatic retry beyond 14 minutes.
export async function drainRealDelivery(database: PrismaClient, sink: DeliverySink, config: RealConfiguration, now = new Date()): Promise<string> {
  const claim = await database.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth_delivery_jobs WHERE status = 'PENDING' AND next_at <= ${now} ORDER BY next_at, id FOR UPDATE SKIP LOCKED LIMIT 1`
    if (!rows[0]) return undefined
    const job = await tx.authDeliveryJob.findUniqueOrThrow({ where: { id: rows[0].id } })
    const subject = await tx.authUser.findUnique({ where: { id: job.userId }, include: { recovery: true } })
    const expired = job.expiresAt <= now || !subject?.recovery || subject.recovery.blocked || !realEmailAllowed(config, subject.email) || (job.kind === 'reset' && !subject.emailVerified)
    const uncertain = job.attempts >= 4 || (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= 840000)
    if (expired || uncertain) {
      await tx.authDeliveryJob.update({ where: { id: job.id }, data: { status: expired ? 'EXPIRED' : 'FAILED', envelope: '', reason: expired ? 'LIFETIME_ENDED' : 'DELIVERY_UNCONFIRMED' } })
      return { result: expired ? 'EXPIRED' : 'FAILED' } as const
    }
    if (!await consumeRealBudget(tx, 'mail:attempts', config.mailAttemptLimit, 86400, now)) return { result: 'QUOTA_PAUSED' } as const
    const attempts = job.attempts + 1
    await tx.authDeliveryJob.update({ where: { id: job.id }, data: { attempts, firstAttemptAt: job.firstAttemptAt ?? now, nextAt: new Date(now.getTime() + 30000) } })
    return { job, attempts } as const
  }, { timeout: 5000 })
  if (!claim) return 'IDLE'
  if ('result' in claim) return claim.result
  let accepted = false
  try { await sink.deliver(claim.job.id, claim.job.envelope); accepted = true } catch { /* No provider body, recipient or credentials in logs. */ }
  const failed = !accepted && claim.attempts >= 4
  await database.authDeliveryJob.updateMany({ where: { id: claim.job.id, status: 'PENDING', attempts: claim.attempts }, data: {
    status: accepted ? 'SENT' : failed ? 'FAILED' : 'PENDING', ...(accepted || failed ? { envelope: '' } : {}),
    reason: accepted ? null : 'DELIVERY_UNCONFIRMED', nextAt: new Date(now.getTime() + 30000 * 2 ** claim.attempts),
  } })
  return accepted ? 'SENT' : failed ? 'FAILED' : 'RETRY'
}
export async function drainDelivery(database: PrismaClient, sink: DeliverySink, now = new Date()): Promise<string> {
  return database.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth_delivery_jobs WHERE status = 'PENDING' AND next_at <= ${now} ORDER BY next_at, id FOR UPDATE SKIP LOCKED LIMIT 1`
    if (!rows[0]) return 'IDLE'
    const job = await tx.authDeliveryJob.findUniqueOrThrow({ where: { id: rows[0].id } })
    const subject = await tx.authUser.findUnique({ where: { id: job.userId }, include: { recovery: true } })
    if (!subject?.recovery || subject.recovery.blocked || (job.kind === 'reset' && !subject.emailVerified)) {
      await tx.authDeliveryJob.update({ where: { id: job.id }, data: { status: 'EXPIRED', envelope: '', reason: 'SUBJECT_NOT_READY' } }); return 'EXPIRED'
    }
    if (job.expiresAt <= now) { await tx.authDeliveryJob.update({ where: { id: job.id }, data: { status: 'EXPIRED', envelope: '', reason: 'LIFETIME_ENDED' } }); return 'EXPIRED' }
    const attempts = job.attempts + 1
    try {
      await sink.deliver(job.id, job.envelope)
      await tx.authDeliveryJob.update({ where: { id: job.id }, data: { status: 'SENT', attempts, envelope: '', reason: null } })
      return 'SENT'
    } catch {
      await tx.authDeliveryJob.update({ where: { id: job.id }, data: { attempts, status: attempts === 4 ? 'FAILED' : 'PENDING',
        reason: 'SINK_UNAVAILABLE', nextAt: new Date(now.getTime() + 1000 * 2 ** attempts) } })
      return attempts === 4 ? 'FAILED' : 'RETRY'
    }
  }, { maxWait: 2000, timeout: 5000 })
}
