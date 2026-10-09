import { z } from 'zod'
import { parseCryptoDecimal, serializeCrypto } from '@finntech/finance'
import { referenceRateSchema, type ReferenceRate } from '@finntech/contracts'
import { parseProviderJson } from './provider-json.js'

const root = 'https://api.bitkub.com/api/v3/market'
const symbols = z.object({ error: z.literal('0'), result: z.array(z.object({ symbol: z.string(), base_asset: z.string(), quote_asset: z.string(), status: z.string() })) })
const tickers = z.array(z.object({ symbol: z.string(), last: z.string() }))
export const REFERENCE_RATE_MAX_AGE_MS = 30000

/** Public direct USDT/THB last-price snapshot, not a USD peg or executable conversion quote. */
export class ReferenceFxRelay {
  private rate: string | null = null
  private receivedAt: string | null = null
  private nextAttempt = 0
  private failures = 0
  private refreshing: Promise<void> | null = null
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}
  snapshot(): ReferenceRate {
    void this.refresh()
    const fresh = this.receivedAt !== null && this.now() - Date.parse(this.receivedAt) <= REFERENCE_RATE_MAX_AGE_MS
    return referenceRateSchema.parse({ base: 'USDT', quote: 'THB', rate: this.rate, receivedAt: this.receivedAt,
      status: this.rate === null ? 'UNAVAILABLE' : fresh ? 'FRESH' : 'STALE', source: 'Bitkub public', kind: 'LAST_PRICE_SNAPSHOT' })
  }
  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    if (this.now() < this.nextAttempt) return
    this.refreshing = this.update().finally(() => { this.refreshing = null })
    return this.refreshing
  }
  private async request(url: string): Promise<unknown> {
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Rate unavailable')
    return parseProviderJson(await response.text())
  }
  private async update(): Promise<void> {
    try {
      const metadata = symbols.parse(await this.request(`${root}/symbols`))
      if (!metadata.result.some(row => row.symbol === 'USDT_THB' && row.base_asset === 'USDT' && row.quote_asset === 'THB' && row.status === 'active')) throw new Error('Unsupported pair')
      const rows = tickers.parse(await this.request(`${root}/ticker?sym=usdt_thb`))
      if (rows.length !== 1 || rows[0]!.symbol !== 'USDT_THB') throw new Error('Invalid pair response')
      const rate = parseCryptoDecimal(rows[0]!.last)
      if (!rate.gt('0')) throw new Error('Invalid rate')
      this.rate = serializeCrypto(rate); this.receivedAt = new Date(this.now()).toISOString(); this.failures = 0
    } catch { this.failures = Math.min(this.failures + 1, 5) }
    finally { this.nextAttempt = this.now() + Math.min(15000 * 2 ** this.failures, 300000) }
  }
}
