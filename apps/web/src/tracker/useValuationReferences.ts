import { useCallback, useEffect, useRef, useState } from 'react'
import { dailyCloseSnapshotSchema, valuationOverviewSchema, type DailyCloseQuote, type ValuationOverview } from '@finntech/contracts'
import { trackerRequest, TrackerRequestError } from './client'

/** A provider read is repeated at most every 30 minutes, or 5 minutes after a failed read or a manual refresh. */
const RETRY_MS = 30 * 60000, RETRY_AFTER_FAILURE_MS = 5 * 60000, MANUAL_GAP_MS = 5 * 60000
const keyOf = (value: ValuationOverview) => { const d = value.dailyCloses!; return `${d.keySource}:${d.keyVersion}` }
/** Same key, same expected session and same held symbols: a new session or holding triggers a read. */
const identityOf = (value: ValuationOverview) => { const d = value.dailyCloses!; return [keyOf(value), d.expectedSession, ...d.quotes.map(q => q.symbol)].join(':') }

/**
 * Personal closes live only in this tab's memory, shared by the asset and stock views so moving
 * between pages or apps does not spend the owner's provider quota. Nothing is written to browser
 * storage; logout, session end, page close and any key change discard them.
 */
let held: { key: string; identity: string; quotes: DailyCloseQuote[]; dueAt: number; readAt: number } | null = null
let reading: { identity: string; promise: Promise<void> } | null = null
export function clearValuationCache(): void { held = null; reading = null }

/** A failed refresh keeps the previous close of the same key (with its own dates); it never invents one. */
function merge(next: DailyCloseQuote[], key: string): { quotes: DailyCloseQuote[]; failed: boolean } {
  let failed = false
  const quotes = next.map(quote => {
    if (quote.close) return quote
    failed = true
    const previous = held?.key === key ? held.quotes.find(q => q.symbol === quote.symbol && q.close) : undefined
    return previous ? { ...previous, problem: quote.problem ?? 'UNAVAILABLE' } : quote
  })
  return { quotes, failed }
}

export function useValuationReferences(expired: () => void) {
  const [overview, setOverview] = useState<ValuationOverview | null>(null)
  const [readingNow, setReading] = useState(false)
  const active = useRef(true), onExpired = useRef(expired), pending = useRef<Promise<void> | null>(null)
  onExpired.current = expired
  const load = useCallback((force = false): Promise<void> => {
    if (!active.current) return Promise.resolve()
    if (pending.current) return pending.current
    setReading(true)
    const publish = (value: ValuationOverview | null) => { if (active.current) setOverview(value) }
    const flight = (async () => {
      try {
        const metadata = valuationOverviewSchema.parse(await trackerRequest('valuation/references'))
        if (metadata.dailyCloses?.retention !== 'TRANSIENT') { publish(metadata); return }
        const key = keyOf(metadata), identity = identityOf(metadata), now = Date.now()
        if (held && held.key !== key) held = null // a removed or replaced key never shows its old prices
        const withHeld = () => publish(held ? { ...metadata, dailyCloses: { ...metadata.dailyCloses!, quotes: metadata.dailyCloses!.quotes.map(q => held!.quotes.find(h => h.symbol === q.symbol) ?? q) } } : metadata)
        const due = !held || held.identity !== identity || now >= held.dueAt || (force && now - held.readAt >= MANUAL_GAP_MS)
        if (!due || !metadata.dailyCloses.quotes.length) { withHeld(); return }
        withHeld()
        if (reading?.identity !== identity) {
          const promise = (async () => {
            try {
              const daily = dailyCloseSnapshotSchema.parse(await trackerRequest('valuation/daily-close', 'GET', undefined, undefined, 20000))
              if (daily.keySource !== metadata.dailyCloses!.keySource || daily.keyVersion !== metadata.dailyCloses!.keyVersion) { held = null; return }
              const result = merge(daily.quotes, key), at = Date.now()
              held = { key, identity, quotes: result.quotes, readAt: at, dueAt: at + (result.failed ? RETRY_AFTER_FAILURE_MS : RETRY_MS) }
            } catch (error) {
              const result = merge(metadata.dailyCloses!.quotes.map(q => ({ ...q, status: 'ERROR' as const, problem: 'UNAVAILABLE' as const })), key), at = Date.now()
              held = { key, identity, quotes: result.quotes, readAt: at, dueAt: at + RETRY_AFTER_FAILURE_MS }
              if (error instanceof TrackerRequestError && error.expired) { clearValuationCache(); throw error }
            }
          })()
          reading = { identity, promise }
          void promise.catch(() => {}).finally(() => { if (reading?.promise === promise) reading = null })
        }
        await reading!.promise
        withHeld()
      } catch (error) {
        publish(null)
        if (error instanceof TrackerRequestError && error.expired) { clearValuationCache(); onExpired.current() }
      }
    })()
    pending.current = flight
    void flight.finally(() => { if (pending.current === flight) pending.current = null; if (active.current) setReading(false) })
    return flight
  }, [])

  useEffect(() => {
    active.current = true
    void load()
    // Returning to the tab only checks metadata; the held closes are reused until they are due.
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const pageHide = () => { clearValuationCache() }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('pageshow', visible)
    // Metadata every minute: catches a new trading session, holdings or key changes without a provider read.
    const timer = setInterval(() => { void load() }, 60000)
    return () => {
      active.current = false
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', visible)
      clearInterval(timer)
    }
  }, [load])
  return { overview, load, reading: readingNow }
}
