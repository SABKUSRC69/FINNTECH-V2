// SYNTHETIC: fabricated provider responses only.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { clearValuationCache, useValuationReferences } from './useValuationReferences'
import { openingAccount, tradeCash } from './CashSettlementFields'

const quote = (symbol: string, close: string | null) => ({ symbol, currency: 'USD', priceType: 'CLOSE', close, tradingDate: close ? '2026-10-09' : null,
  fetchedAt: close ? '2026-10-10T01:00:00.000Z' : null, status: close ? 'CURRENT' : 'MISSING', problem: null })
const daily = (quotes: unknown[], keyVersion = 1) => ({ provider: 'READY', source: 'Tiingo EOD', license: 'PERSONAL', keySource: 'ACCOUNT', retention: 'TRANSIENT', keyVersion,
  expectedSession: '2026-10-09', attribution: null, quotes })
let keyVersion = 1, failDaily = false
const calls: string[] = []
function respond(path: string): Response {
  calls.push(path)
  if (path.startsWith('/api/valuation/references')) return Response.json({ references: [], usdThb: { source: 'ECB', kind: 'DAILY', status: 'MISSING', rate: null, asOf: null, receivedAt: null },
    dailyCloses: daily([quote('AAPL', null)], keyVersion) })
  if (failDaily) return Response.json({ error: { code: 'STORAGE_UNAVAILABLE' } }, { status: 503 })
  return Response.json(daily([quote('AAPL', '227.5')], keyVersion))
}
const providerReads = () => calls.filter(path => path.startsWith('/api/valuation/daily-close')).length
const close = (result: { current: ReturnType<typeof useValuationReferences> }) => result.current.overview?.dailyCloses?.quotes[0]?.close ?? null

beforeEach(() => {
  calls.length = 0; keyVersion = 1; failDaily = false; clearValuationCache()
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => respond(String(input))))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('reuses held closes across page mounts and tab returns instead of spending provider quota', async () => {
  const first = renderHook(() => useValuationReferences(() => {}))
  await waitFor(() => expect(close(first.result)).toBe('227.5'))
  first.unmount()
  const second = renderHook(() => useValuationReferences(() => {}))
  await waitFor(() => expect(close(second.result)).toBe('227.5'))
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  await act(async () => { await second.result.current.load(true) }) // manual refresh inside the 5 minute gap
  expect(providerReads()).toBe(1)
})

it('keeps the last close of the same key when a refresh fails, and drops it when the key changes', async () => {
  const view = renderHook(() => useValuationReferences(() => {}))
  await waitFor(() => expect(close(view.result)).toBe('227.5'))
  failDaily = true
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60000)
  await act(async () => { await view.result.current.load() })
  expect(providerReads()).toBe(2)
  expect(view.result.current.overview?.dailyCloses?.quotes[0]).toMatchObject({ close: '227.5', problem: 'UNAVAILABLE' })
  keyVersion = 2
  await act(async () => { await view.result.current.load() })
  expect(close(view.result)).toBeNull()
})

it('logout/session end clears held closes so the next account cannot see them', async () => {
  const view = renderHook(() => useValuationReferences(() => {}))
  await waitFor(() => expect(close(view.result)).toBe('227.5'))
  view.unmount(); clearValuationCache(); failDaily = true
  const next = renderHook(() => useValuationReferences(() => {}))
  await waitFor(() => expect(providerReads()).toBe(2))
  await waitFor(() => expect(next.result.current.overview?.dailyCloses?.quotes[0]?.close ?? null).toBeNull())
})

it('asks about the opening balance only for records dated before the opening date', () => {
  const accounts = [{ id: 'a', name: 'Bank', balance: '9000.00', currency: 'THB' as const, asOf: '2026-10-01', version: 1 }]
  expect(openingAccount(accounts, 'a', '2026-09-30')?.asOf).toBe('2026-10-01')
  expect(openingAccount(accounts, 'a', '2026-10-01')).toBeNull()
  expect(tradeCash(accounts, 'a', '', '2026-09-30', true)).toEqual({ cashSettlement: { accountId: 'a' }, inOpeningBalance: true })
  expect(tradeCash(accounts, 'a', '50.00', '2026-09-30', false)).toEqual({ cashSettlement: { accountId: 'a', amountThb: '50.00' }, inOpeningBalance: false })
  expect(tradeCash(accounts, 'a', '50.00', '2026-10-02', true)).toEqual({ cashSettlement: { accountId: 'a', amountThb: '50.00' } })
})
