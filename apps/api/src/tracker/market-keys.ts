import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { STOCK_INSTRUMENTS, marketKeyInputSchema, marketKeyRemoveSchema, type DailyCloseSnapshot, type MarketKeyStatus } from '@finntech/contracts'
import { latestSessionAt, CLOSE_PUBLISHED_MINUTES } from '@finntech/finance'
import type { PrismaClient } from '../generated/prisma/client.js'
import { ownedMutation, priorReceipt, TrackerError } from './service.js'
import { DailyCloseProviderError, TiingoDailyProvider, type DailyCloseProvider, type DailyCloseConfiguration } from './daily-close.js'
import { TransientCloseReader } from './transient-closes.js'

/**
 * Bring-your-own-key end-of-day prices. Each account may store its own personal (free, internal-use)
 * Tiingo token. Provider prices exist only in a read operation and its active browser view. They
 * never enter a database, file, log, shared cache, backup or subsequent user's response.
 *
 * Encryption key: HKDF-SHA256 of the server's existing auth secret (no extra secret to provision).
 * Rotating that secret makes stored tokens undecryptable; owners then simply enter their key again.
 */
const SALT = 'finntech-market-key-v1'
export class MarketKeyCipher {
  private readonly key: Buffer
  private readonly mac: Buffer
  constructor(secret: string) {
    if (secret.length < 32) throw new Error('Market key encryption requires the server auth secret')
    this.key = Buffer.from(hkdfSync('sha256', secret, SALT, 'tiingo-token-encryption', 32))
    this.mac = Buffer.from(hkdfSync('sha256', secret, SALT, 'tiingo-token-request-digest', 32))
  }
  /** v1 | iv(12) | tag(16) | ciphertext; the owner id is authenticated data, so rows cannot be swapped. */
  seal(ownerId: string, token: string): Buffer {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(ownerId))
    const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body])
  }
  open(ownerId: string, sealed: Uint8Array): string {
    const blob = Buffer.from(sealed)
    if (blob.length < 30 || blob[0] !== 1) throw new Error('MARKET_KEY_FORMAT')
    const decipher = createDecipheriv('aes-256-gcm', this.key, blob.subarray(1, 13))
    decipher.setAAD(Buffer.from(ownerId)); decipher.setAuthTag(blob.subarray(13, 29))
    return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]).toString('utf8')
  }
  /** Keyed digest for idempotency hashing, so request receipts never hash the raw token. */
  digest(ownerId: string, token: string): string { return createHmac('sha256', this.mac).update(ownerId + '\0' + token).digest('hex') }
}

const HOUR = 3600000
const daysBefore = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00.000Z') - days * 86400000).toISOString().slice(0, 10)
const symbols = STOCK_INSTRUMENTS.map(row => row.symbol)

export class PersonalDailyCloses {
  private readonly reader: TransientCloseReader
  private readonly attempts = new Map<string, number[]>()
  /** owner:version pairs already reported as undecryptable (logged once, not on every read). */
  private readonly undecryptable = new Set<string>()
  constructor(private readonly db: PrismaClient, private readonly cipher: MarketKeyCipher | null,
    private readonly makeProvider: (token: string) => DailyCloseProvider = token => new TiingoDailyProvider(token),
    private readonly clock: () => number = Date.now, private readonly log: (line: string) => void = line => console.info(line),
    private readonly maxCachedOwners = 200, private readonly serverPersonal: DailyCloseConfiguration | null = null) {
    this.reader = new TransientCloseReader(clock)
  }

  get available(): boolean { return !!this.cipher }

  async status(ownerId: string): Promise<MarketKeyStatus> {
    const row = await this.db.ownerMarketKey.findUnique({ where: { ownerId } })
    return { available: this.available, provider: 'TIINGO', status: row ? row.status as 'ACTIVE' | 'REMOVED' : 'NONE', hint: row?.keyHint ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null, version: row?.version ?? null }
  }

  /** Verifies the key with one provider request before anything is stored. */
  async save(ownerId: string, requestKey: unknown, body: unknown) {
    if (!this.cipher) throw new TrackerError('MARKET_KEY_UNAVAILABLE', 422)
    const input = marketKeyInputSchema.parse(body), cipher = this.cipher
    const payload = { provider: input.provider, token: cipher.digest(ownerId, input.token), confirmPersonalUse: true, expectedVersion: input.expectedVersion }
    // A retry of a save that already committed returns its receipt without re-contacting the provider
    // or spending an attempt, so a lost response is never reported as "not saved".
    const prior = await priorReceipt(this.db, ownerId, 'market.key', requestKey, payload)
    if (prior) return prior
    const now = this.clock(), recent = (this.attempts.get(ownerId) ?? []).filter(t => now - t < HOUR)
    if (recent.length >= 10) throw new TrackerError('MARKET_KEY_ATTEMPTS', 429)
    if (!this.reader.reserve(ownerId)) throw new TrackerError('MARKET_KEY_ATTEMPTS', 429)
    this.attempts.set(ownerId, [...recent, now])
    try { await this.makeProvider(input.token).latestClose('SPY', daysBefore(latestSessionAt(now, CLOSE_PUBLISHED_MINUTES), 14)) }
    catch (error) {
      const problem = error instanceof DailyCloseProviderError ? error.problem : 'UNAVAILABLE'
      // Only an explicit authentication refusal proves the key is wrong; anything else is "try later".
      if (problem === 'AUTH_FAILED') throw new TrackerError('MARKET_KEY_REJECTED', 422)
      if (problem !== 'NOT_YET_PUBLISHED') throw new TrackerError('MARKET_KEY_UNVERIFIED', 424)
    }
    const receipt = await ownedMutation(this.db, ownerId, 'market.key', requestKey, payload,
      async tx => {
        const old = await tx.ownerMarketKey.findUnique({ where: { ownerId } })
        if ((old?.version ?? null) !== input.expectedVersion) throw new TrackerError('MARKET_KEY_CHANGED', 409)
        const data = { provider: 'TIINGO', ciphertext: new Uint8Array(cipher.seal(ownerId, input.token)), keyHint: input.token.slice(-4), status: 'ACTIVE',
          personalUseConfirmedAt: new Date(now), updatedAt: new Date(now) }
        const row = old ? await tx.ownerMarketKey.update({ where: { ownerId }, data: { ...data, version: { increment: 1 } } })
          : await tx.ownerMarketKey.create({ data: { ownerId, ...data } })
        return { status: row.status, hint: row.keyHint, version: row.version }
      })
    return receipt
  }

  /** Clears the ciphertext and this owner's cached closes; ledger data is untouched. */
  async remove(ownerId: string, requestKey: unknown, body: unknown) {
    const input = marketKeyRemoveSchema.parse(body)
    const receipt = await ownedMutation(this.db, ownerId, 'market.key.remove', requestKey, input, async tx => {
      const old = await tx.ownerMarketKey.findUnique({ where: { ownerId } })
      if (!old || old.version !== input.expectedVersion) throw new TrackerError('MARKET_KEY_CHANGED', 409)
      const row = await tx.ownerMarketKey.update({ where: { ownerId }, data: { ciphertext: null, keyHint: null, status: 'REMOVED', updatedAt: new Date(this.clock()), version: { increment: 1 } } })
      await tx.dailyClosePrice.deleteMany({ where: { ownerId } })
      return { status: row.status, version: row.version }
    })
    return receipt
  }
  /** Metadata only: reconciliation never contacts Tiingo or returns cached provider data. */
  async describe(ownerId: string): Promise<DailyCloseSnapshot | null> {
    const row = this.cipher ? await this.db.ownerMarketKey.findUnique({ where: { ownerId } }) : null
    const own = !!row && row.status === 'ACTIVE' && !!row.ciphertext
    if (!own && this.serverPersonal?.ownerId !== ownerId) return null
    const held = await this.db.stockHolding.findMany({ where: { ownerId, quantity: { gt: 0 } }, select: { symbol: true } })
    const selected = new Set(held.map(r => r.symbol))
    return { provider: 'READY', source: 'Tiingo EOD', license: 'PERSONAL', keySource: own ? 'ACCOUNT' : 'SERVER',
      retention: 'TRANSIENT', keyVersion: own ? row!.version : null,
      expectedSession: latestSessionAt(this.clock(), CLOSE_PUBLISHED_MINUTES), attribution: { label: 'Tiingo', url: 'https://www.tiingo.com' },
      quotes: symbols.filter(symbol => selected.has(symbol)).map(symbol => ({ symbol, currency: 'USD', priceType: 'CLOSE',
        close: null, tradingDate: null, fetchedAt: null, status: 'MISSING', problem: null })) }
  }

  /** Provider data belongs only to this response, never to a process/session cache. */
  async snapshotFor(ownerId: string): Promise<DailyCloseSnapshot | null> {
    const description = await this.describe(ownerId)
    if (!description) return null
    const row = await this.db.ownerMarketKey.findUnique({ where: { ownerId } })
    let token: string
    if (description.keySource === 'ACCOUNT') {
      if (!this.cipher || !row || row.status !== 'ACTIVE' || !row.ciphertext || row.version !== description.keyVersion) return this.describe(ownerId)
      try { token = this.cipher.open(ownerId, row.ciphertext) }
      catch {
        const id = `${ownerId}:${row.version}`
        if (!this.undecryptable.has(id)) {
          if (this.undecryptable.size >= this.maxCachedOwners) this.undecryptable.clear()
          this.undecryptable.add(id); this.log('Personal market key could not be decrypted; owner must re-enter it (details withheld)')
        }
        return { ...description, quotes: description.quotes.map(q => ({ ...q, status: 'ERROR', problem: 'AUTH_FAILED' })) }
      }
    } else token = this.serverPersonal!.token
    const result = await this.reader.read(ownerId, description, this.makeProvider(token))
    // Removal/replacement during an upstream request must not disclose the old key's results.
    const current = await this.describe(ownerId)
    return current && current.keySource === description.keySource && current.keyVersion === description.keyVersion ? result : current
  }
}
