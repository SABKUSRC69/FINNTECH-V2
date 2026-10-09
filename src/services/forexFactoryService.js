const MAX_FRESH_AGE_MS = 10 * 60_000

function normalizeStatus(payload, now = Date.now()) {
  const source = typeof payload?.source === 'string' ? payload.source.trim() : ''
  const updatedAt = Date.parse(payload?.updatedAt || payload?.lastUpdated || '')
  if (!source || !Number.isFinite(updatedAt) || updatedAt > now + 5 * 60_000) {
    return { status: 'UNAVAILABLE', source: 'proxy ต้องระบุ source และ updatedAt', lastUpdated: null }
  }
  const stale = now - updatedAt > MAX_FRESH_AGE_MS || payload?.status === 'STALE'
  if (payload?.status !== 'LIVE' && payload?.status !== 'STALE') {
    return { status: 'UNAVAILABLE', source: 'proxy ยังไม่ได้ยืนยันสถานะข้อมูล', lastUpdated: null }
  }
  return { status: stale ? 'STALE' : 'LIVE', source, lastUpdated: updatedAt }
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function normalizeCalendarItems(payload) {
  if (!Array.isArray(payload?.items)) return []
  return payload.items.flatMap((item) => {
    const date = Date.parse(item?.date || item?.timestamp || '')
    const title = typeof item?.title === 'string' ? item.title.trim() : ''
    if (!title || !Number.isFinite(date)) return []
    return [{
      ...item,
      id: String(item.id || `${date}:${title}`),
      title,
      date: new Date(date).toISOString(),
      country: String(item.country || item.currency || '').toUpperCase(),
      currency: String(item.currency || item.country || '').toUpperCase(),
      forecast: item.forecast ?? '',
      previous: item.previous ?? '',
      actual: item.actual ?? '',
    }]
  })
}

function normalizeNewsItems(payload) {
  if (!Array.isArray(payload?.items)) return []
  return payload.items.flatMap((item) => {
    const publishedAt = Date.parse(item?.publishedAt || item?.published || '')
    const title = typeof item?.title === 'string' ? item.title.trim() : ''
    if (!title || !Number.isFinite(publishedAt) || !isHttpUrl(item?.url) || typeof item?.source !== 'string' || !item.source.trim()) return []
    return [{
      id: String(item.id || `${publishedAt}:${title}`),
      title,
      source: item.source.trim(),
      publishedAt: new Date(publishedAt).toISOString(),
      url: item.url,
      summary: typeof item.summary === 'string' ? item.summary : '',
    }]
  })
}

export class EconomicNewsService {
  constructor({
    baseUrl = import.meta.env?.VITE_FINNTECH_ECONOMIC_PROXY_URL || '',
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = () => Date.now(),
  } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '')
    this.fetchImpl = fetchImpl
    this.now = now
    this.calendarEvents = []
    this.newsItems = []
    this.calendarStatus = this.unavailableStatus()
    this.newsStatus = this.unavailableStatus()
  }

  unavailableStatus(source = 'ยังไม่ได้ตั้งค่า news/calendar proxy ที่ได้รับสิทธิ์') {
    return { status: 'UNAVAILABLE', source, lastUpdated: null }
  }

  async fetchFeed(kind) {
    if (!this.baseUrl) {
      const status = this.unavailableStatus()
      if (kind === 'calendar') {
        this.calendarEvents = []
        this.calendarStatus = status
      } else {
        this.newsItems = []
        this.newsStatus = status
      }
      return []
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/${kind}`, { headers: { Accept: 'application/json' } })
      if (!response?.ok) throw new Error(`proxy ตอบ HTTP ${response?.status || 'error'}`)
      const payload = await response.json()
      const status = normalizeStatus(payload, this.now())
      const items = kind === 'calendar' ? normalizeCalendarItems(payload) : normalizeNewsItems(payload)
      if (status.status === 'UNAVAILABLE' || items.length === 0) {
        const unavailable = { ...this.unavailableStatus(status.source), lastUpdated: null }
        if (kind === 'calendar') {
          this.calendarEvents = []
          this.calendarStatus = unavailable
        } else {
          this.newsItems = []
          this.newsStatus = unavailable
        }
        return []
      }
      if (kind === 'calendar') {
        this.calendarEvents = items
        this.calendarStatus = status
      } else {
        this.newsItems = items
        this.newsStatus = status
      }
      return items
    } catch (error) {
      const status = this.unavailableStatus(error?.message || 'news/calendar proxy ไม่พร้อมใช้งาน')
      if (kind === 'calendar') {
        this.calendarEvents = []
        this.calendarStatus = status
      } else {
        this.newsItems = []
        this.newsStatus = status
      }
      return []
    }
  }

  getCalendarEvents(forceRefresh = false) {
    void forceRefresh
    return this.fetchFeed('calendar')
  }

  getHeadlines(forceRefresh = false) {
    void forceRefresh
    return this.fetchFeed('news')
  }

  getStatus(kind = 'calendar') {
    return { ...(kind === 'news' ? this.newsStatus : this.calendarStatus) }
  }
}

// The legacy export name is retained for existing imports. It no longer calls
// Forex Factory or contains sample events; a licensed owner-controlled proxy is required.
const forexFactoryService = new EconomicNewsService()
export default forexFactoryService
