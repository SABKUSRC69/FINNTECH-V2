import type { MarketSnapshot } from '@finntech/contracts'

export const CRYPTO_PRICE_MAX_AGE_MS = 30_000
type CryptoQuote = MarketSnapshot['quotes'][number]

export function isFreshCryptoQuote(quote: CryptoQuote | undefined, now: number): boolean {
  if (quote?.status !== 'LIVE' || quote.price === null || quote.receivedAt === null) return false
  const age = now - Date.parse(quote.receivedAt)
  const observedAge = quote.observedAt ? now - Date.parse(quote.observedAt) : age
  return Number.isFinite(age) && age >= 0 && age <= CRYPTO_PRICE_MAX_AGE_MS && Number.isFinite(observedAge) && observedAge >= 0 && observedAge <= CRYPTO_PRICE_MAX_AGE_MS
}
