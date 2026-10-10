import { assessDailyClose, CLOSE_PUBLISHED_MINUTES, latestSessionAt } from '@finntech/finance'
import type { DailyCloseQuote, DailyCloseSnapshot } from '@finntech/contracts'
import { DailyCloseProviderError, type DailyCloseProvider } from './daily-close.js'

const HOUR = 3600000
const daysBefore = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10)

/** No quotes, tokens, provider instances or resolved promises survive a read operation here.
 * Only request timestamps and the one in-flight read per owner are retained (the latter is shared by
 * that owner's concurrent requests, e.g. two tabs, and dropped as soon as it settles).
 */
export class TransientCloseReader {
  private readonly requests = new Map<string, number[]>()
  private readonly flights = new Map<string, Promise<DailyCloseSnapshot>>()
  constructor(private readonly clock: () => number = Date.now) {}

  reserve(owner: string): boolean {
    const now = this.clock()
    for (const [id, times] of this.requests) if (!times.length || now - times[times.length - 1]! >= 24 * HOUR) this.requests.delete(id)
    const times = (this.requests.get(owner) ?? []).filter(t => now - t < 24 * HOUR)
    if (times.length >= 500 || times.filter(t => now - t < HOUR).length >= 40) return false
    times.push(now); this.requests.set(owner, times); return true
  }

  read(owner: string, description: DailyCloseSnapshot, provider: DailyCloseProvider): Promise<DailyCloseSnapshot> {
    const running = this.flights.get(owner)
    if (running) return running
    const flight = this.fetch(owner, description, provider).finally(() => { this.flights.delete(owner) })
    this.flights.set(owner, flight)
    return flight
  }

  private async fetch(owner: string, description: DailyCloseSnapshot, provider: DailyCloseProvider): Promise<DailyCloseSnapshot> {
    const errorQuote = (quote: DailyCloseQuote, problem: NonNullable<DailyCloseQuote['problem']>): DailyCloseQuote =>
      ({ ...quote, close: null, tradingDate: null, fetchedAt: null, status: 'ERROR', problem })
    // Parallel bounded calls finish within the provider's 8 s timeout, even for eight holdings.
    const quotes = await Promise.all(description.quotes.map(async (quote): Promise<DailyCloseQuote> => {
      if (!this.reserve(owner)) return errorQuote(quote, 'BUDGET_EXHAUSTED')
      try {
        const result = await provider.latestClose(quote.symbol, daysBefore(description.expectedSession))
        const at = this.clock(), assessment = assessDailyClose(result.tradingDate, at)
        if (assessment.state === 'INVALID') return errorQuote(quote, 'INVALID_DATA')
        return { ...quote, close: result.close, tradingDate: result.tradingDate, fetchedAt: new Date(at).toISOString(),
          status: assessment.state, problem: assessment.state === 'DELAYED' ? 'NOT_YET_PUBLISHED' : null }
      } catch (error) {
        return errorQuote(quote, error instanceof DailyCloseProviderError ? error.problem : 'UNAVAILABLE')
      }
    }))
    return { ...description, expectedSession: latestSessionAt(this.clock(), CLOSE_PUBLISHED_MINUTES), quotes }
  }
}
