/**
 * NYSE/Nasdaq regular-session calendar and the daily-close freshness policy.
 *
 * This policy is deliberately separate from the 30-second live-quote rule: a daily close is the
 * official end-of-day price of one trading session, so its age is measured in trading sessions,
 * not seconds. Weekends and exchange holidays never make the latest close stale.
 *
 * Rule-based holidays only. Unscheduled closures (e.g. a national day of mourning) are not known
 * in advance; the one-session DELAYED allowance below keeps valuations honest-but-usable then.
 */
export type CalendarDate = string // YYYY-MM-DD, America/New_York trading date

const DAY = 86400000
const iso = (y: number, m: number, d: number): CalendarDate => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
const utc = (date: CalendarDate) => Date.parse(date + 'T00:00:00.000Z')
const shift = (date: CalendarDate, days: number): CalendarDate => new Date(utc(date) + days * DAY).toISOString().slice(0, 10)
const weekday = (date: CalendarDate) => new Date(utc(date)).getUTCDay()
/** n-th (1-based) weekday of a month; n=-1 means the last one. */
function nthWeekday(y: number, m: number, day: number, n: number): CalendarDate {
  if (n > 0) { const first = iso(y, m, 1); return shift(first, (day - weekday(first) + 7) % 7 + (n - 1) * 7) }
  const last = shift(iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1)
  return shift(last, -((weekday(last) - day + 7) % 7))
}
/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easter(y: number): CalendarDate {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return iso(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1)
}
/** Saturday holidays move to Friday, Sunday holidays to Monday (NYSE Rule 7.2). */
const observed = (date: CalendarDate) => weekday(date) === 6 ? shift(date, -1) : weekday(date) === 0 ? shift(date, 1) : date
const holidayCache = new Map<number, ReadonlySet<CalendarDate>>()
export function nyseHolidays(year: number): ReadonlySet<CalendarDate> {
  const cached = holidayCache.get(year); if (cached) return cached
  const days = [
    // New Year's Day on a Saturday is not observed on the prior Friday (year-end accounting).
    ...(weekday(iso(year, 1, 1)) === 6 ? [] : [observed(iso(year, 1, 1))]),
    nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), shift(easter(year), -2), nthWeekday(year, 5, 1, -1),
    ...(year >= 2022 ? [observed(iso(year, 6, 19))] : []), observed(iso(year, 7, 4)), nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4), observed(iso(year, 12, 25)),
  ]
  const set = new Set(days); holidayCache.set(year, set); return set
}
export function isTradingDay(date: CalendarDate): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || shift(date, 0) !== date) return false
  const w = weekday(date)
  return w !== 0 && w !== 6 && !nyseHolidays(Number(date.slice(0, 4))).has(date)
}
export function previousTradingDay(date: CalendarDate): CalendarDate {
  let d = shift(date, -1); while (!isTradingDay(d)) d = shift(d, -1); return d
}
/** Wall-clock date and minutes after midnight in New York (DST-aware via the platform tz database). */
const newYorkFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export function newYorkClock(now: number): { date: CalendarDate; minutes: number } {
  // One shared formatter: constructing Intl.DateTimeFormat per call is costly on hot render/refresh paths.
  const parts = Object.fromEntries(newYorkFormat.formatToParts(new Date(now)).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}
/** Latest trading day whose event (close at 16:00, or publication cut-off) has passed in New York. */
export function latestSessionAt(now: number, afterMinutes: number): CalendarDate {
  const clock = newYorkClock(now)
  return isTradingDay(clock.date) && clock.minutes >= afterMinutes ? clock.date : previousTradingDay(clock.date)
}
export const MARKET_CLOSE_MINUTES = 16 * 60
/** Providers publish end-of-day data ~17:30 New York; we expect it from 18:00 and retry until then. */
export const CLOSE_PUBLISHED_MINUTES = 18 * 60
/** Exchanges may still correct the day's prints until ~20:00; one later refetch picks those up. */
export const CLOSE_CORRECTIONS_MINUTES = 20 * 60 + 30

export type DailyCloseState = 'CURRENT' | 'DELAYED' | 'STALE' | 'INVALID'
export interface DailyCloseAssessment { state: DailyCloseState; eligible: boolean; expectedSession: CalendarDate; latestClosedSession: CalendarDate }
/**
 * CURRENT: the latest published session (or a newer, already closed one).
 * DELAYED: exactly one session behind (provider not yet published / unscheduled closure); still valued,
 *          always shown with its own trading date.
 * STALE: older; shown as last known only and never counted in totals.
 * INVALID: not a trading day, or a session that has not closed yet (not a closing price).
 */
export function assessDailyClose(tradingDate: CalendarDate, now: number): DailyCloseAssessment {
  const expectedSession = latestSessionAt(now, CLOSE_PUBLISHED_MINUTES), latestClosedSession = latestSessionAt(now, MARKET_CLOSE_MINUTES)
  const base = { expectedSession, latestClosedSession }
  if (!isTradingDay(tradingDate) || tradingDate > latestClosedSession) return { ...base, state: 'INVALID', eligible: false }
  if (tradingDate >= expectedSession) return { ...base, state: 'CURRENT', eligible: true }
  if (tradingDate === previousTradingDay(expectedSession)) return { ...base, state: 'DELAYED', eligible: true }
  return { ...base, state: 'STALE', eligible: false }
}
