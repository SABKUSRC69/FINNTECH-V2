import { describe, it, expect } from 'vitest'
import { assessDailyClose, isTradingDay, nyseHolidays, previousTradingDay, summarizeStockHoldings } from '../src/index.js'

describe('NYSE calendar', () => {
  it('matches the published 2026 and 2027 holiday schedules, including Saturday/Sunday observance', () => {
    expect([...nyseHolidays(2026)].sort()).toEqual(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'])
    expect([...nyseHolidays(2027)].sort()).toEqual(['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'])
    // New Year's Day 2028 falls on a Saturday: no Friday observance, 31 Dec 2027 trades.
    expect(nyseHolidays(2028).has('2027-12-31')).toBe(false)
    expect(isTradingDay('2027-12-31')).toBe(true)
  })
  it('skips weekends and holidays when walking back, and rejects impossible dates', () => {
    expect(previousTradingDay('2026-10-12')).toBe('2026-10-09')
    expect(previousTradingDay('2026-11-27')).toBe('2026-11-25')
    expect(previousTradingDay('2026-04-06')).toBe('2026-04-02')
    expect(isTradingDay('2026-10-10')).toBe(false)
    expect(isTradingDay('2026-02-30')).toBe(false)
    expect(isTradingDay('2026-10-9')).toBe(false)
  })
})

describe('daily close freshness (separate from the 30 s live rule)', () => {
  const at = (iso: string) => Date.parse(iso)
  it('before the 18:00 New York publication cut-off the previous session is still current', () => {
    const now = at('2026-10-09T21:00:00Z') // Fri 17:00 EDT
    expect(assessDailyClose('2026-10-09', now)).toMatchObject({ state: 'CURRENT', eligible: true, expectedSession: '2026-10-08', latestClosedSession: '2026-10-09' })
    expect(assessDailyClose('2026-10-08', now)).toMatchObject({ state: 'CURRENT', eligible: true })
    expect(assessDailyClose('2026-10-07', now)).toMatchObject({ state: 'DELAYED', eligible: true })
    expect(assessDailyClose('2026-10-06', now)).toMatchObject({ state: 'STALE', eligible: false })
  })
  it('after publication the same day is expected; one session late is DELAYED, older is STALE', () => {
    const now = at('2026-10-09T23:00:00Z') // Fri 19:00 EDT
    expect(assessDailyClose('2026-10-09', now).state).toBe('CURRENT')
    expect(assessDailyClose('2026-10-08', now).state).toBe('DELAYED')
    expect(assessDailyClose('2026-10-07', now)).toMatchObject({ state: 'STALE', eligible: false })
  })
  it('weekends and holidays keep the latest session current, with no false staleness', () => {
    expect(assessDailyClose('2026-10-09', at('2026-10-10T15:00:00Z')).state).toBe('CURRENT') // Saturday
    expect(assessDailyClose('2026-10-09', at('2026-10-12T14:00:00Z')).state).toBe('CURRENT') // Monday 10:00 before close
    expect(assessDailyClose('2026-11-25', at('2026-11-27T00:30:00Z')).state).toBe('CURRENT') // Thanksgiving evening
    expect(assessDailyClose('2026-04-02', at('2026-04-04T16:00:00Z')).state).toBe('CURRENT') // Good Friday weekend
    expect(assessDailyClose('2026-07-02', at('2026-07-06T13:00:00Z')).state).toBe('CURRENT') // observed Independence Day
  })
  it('rejects non-trading days and sessions that have not closed yet', () => {
    expect(assessDailyClose('2026-10-10', at('2026-10-12T23:00:00Z'))).toMatchObject({ state: 'INVALID', eligible: false })
    expect(assessDailyClose('2026-11-26', at('2026-11-30T23:00:00Z')).state).toBe('INVALID')
    expect(assessDailyClose('2026-10-09', at('2026-10-09T19:00:00Z')).state).toBe('INVALID') // 15:00 EDT, still open
  })
  it('follows the New York clock across the November DST change', () => {
    expect(assessDailyClose('2026-10-30', at('2026-11-02T22:30:00Z')).expectedSession).toBe('2026-10-30') // 17:30 EST
    expect(assessDailyClose('2026-10-30', at('2026-11-02T23:00:00Z'))).toMatchObject({ expectedSession: '2026-11-02', state: 'DELAYED' })
  })
})

describe('stock totals across portfolios', () => {
  const rows = [
    { portfolioId: 'a', symbol: 'AAPL', quantity: '0.5', totalCost: '51' },
    { portfolioId: 'b', symbol: 'AAPL', quantity: '0.25', totalCost: '30' },
    { portfolioId: 'b', symbol: 'SPY', quantity: '1.123456789', totalCost: '600' },
    { portfolioId: 'a', symbol: 'QQQ', quantity: '0', totalCost: '0' },
  ]
  it('values fractional shares in several portfolios with one shared price and exact decimals', () => {
    const s = summarizeStockHoldings(rows, new Map([['AAPL', '120.5'], ['SPY', '600.01']]))
    // 0.75 × 120.5 = 90.375 ; 1.123456789 × 600.01 = 674.08530796789
    expect(s).toMatchObject({ complete: true, missing: [], valueUsd: '764.46030796789', costUsd: '681', unrealizedUsd: '83.46030796789' })
  })
  it('a missing price reports the priced part and the missing symbol, never cost or zero for it', () => {
    const s = summarizeStockHoldings(rows, new Map([['AAPL', '120.5']]))
    expect(s).toMatchObject({ complete: false, missing: ['SPY'], valueUsd: null, unrealizedUsd: null, knownValueUsd: '90.375', knownCostUsd: '81', knownUnrealizedUsd: '9.375', costUsd: '681' })
  })
  it('zero quantity needs no price and an empty book is complete at zero', () => {
    expect(summarizeStockHoldings([rows[3]!], new Map())).toMatchObject({ complete: true, valueUsd: '0', unrealizedUsd: '0' })
    expect(summarizeStockHoldings([], new Map())).toMatchObject({ complete: true, valueUsd: '0' })
    expect(() => summarizeStockHoldings(rows, new Map([['AAPL', '0'], ['SPY', '1']]))).toThrow()
  })
})
