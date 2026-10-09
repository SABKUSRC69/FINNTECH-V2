import React, { useEffect, useRef, useState } from 'react'
import { AlertCircle, Calendar, ExternalLink, Newspaper, RefreshCw } from 'lucide-react'
import forexFactoryService from '../../services/forexFactoryService'

const STATUS_LABEL = { LIVE: 'LIVE', STALE: 'STALE', UNAVAILABLE: 'UNAVAILABLE', LOADING: 'กำลังโหลด' }
const formatThaiDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(date)
}

function FeedBadge({ status }) {
  const label = STATUS_LABEL[status] || 'UNAVAILABLE'
  const color = status === 'LIVE' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : status === 'STALE' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : status === 'LOADING' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
        : 'text-slate-400 border-slate-700 bg-slate-800/50'
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${color}`}>{label}</span>
}

export default function ForexNewsView() {
  const [activeTab, setActiveTab] = useState('calendar')
  const [calendar, setCalendar] = useState([])
  const [headlines, setHeadlines] = useState([])
  const [calendarStatus, setCalendarStatus] = useState(forexFactoryService.getStatus('calendar'))
  const [newsStatus, setNewsStatus] = useState(forexFactoryService.getStatus('news'))
  const [loading, setLoading] = useState(false)
  const [widgetStatus, setWidgetStatus] = useState('IDLE')
  const [widgetRetry, setWidgetRetry] = useState(0)
  const widgetRootRef = useRef(null)

  const refreshFeeds = async () => {
    setLoading(true)
    setCalendarStatus({ ...forexFactoryService.getStatus('calendar'), status: 'LOADING' })
    setNewsStatus({ ...forexFactoryService.getStatus('news'), status: 'LOADING' })
    const [events, news] = await Promise.all([
      forexFactoryService.getCalendarEvents(true),
      forexFactoryService.getHeadlines(true),
    ])
    setCalendar(events)
    setHeadlines(news)
    setCalendarStatus(forexFactoryService.getStatus('calendar'))
    setNewsStatus(forexFactoryService.getStatus('news'))
    setLoading(false)
  }

  useEffect(() => { refreshFeeds() }, [])

  useEffect(() => {
    if (activeTab !== 'widget' || !widgetRootRef.current) return undefined
    const root = widgetRootRef.current
    root.innerHTML = ''
    setWidgetStatus('LOADING')
    const container = document.createElement('div')
    container.className = 'tradingview-widget-container'
    container.style.height = '560px'
    container.style.width = '100%'
    const holder = document.createElement('div')
    holder.className = 'tradingview-widget-container__widget'
    holder.style.height = '100%'
    holder.style.width = '100%'
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark', isTransparent: true, width: '100%', height: '100%',
      locale: 'th_TH', importanceFilter: '-1,0,1', currencyFilter: 'USD,EUR,GBP,JPY,CAD,AUD,CHF,NZD,CNY,THB',
    })
    let frame
    let finished = false
    const timeout = window.setTimeout(() => {
      if (!finished) {
        finished = true
        setWidgetStatus('UNAVAILABLE')
      }
    }, 12000)
    const markReady = () => {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      setWidgetStatus('READY')
    }
    const markUnavailable = () => {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      setWidgetStatus('UNAVAILABLE')
    }
    const attachFrame = () => {
      const candidate = container.querySelector('iframe')
      if (!candidate || candidate === frame) return
      frame = candidate
      candidate.addEventListener('load', markReady, { once: true })
      candidate.addEventListener('error', markUnavailable, { once: true })
    }
    const observer = new MutationObserver(attachFrame)
    observer.observe(container, { childList: true, subtree: true })
    script.onerror = markUnavailable
    script.onload = attachFrame
    container.append(holder, script)
    root.appendChild(container)
    return () => {
      window.clearTimeout(timeout)
      observer.disconnect()
      root.innerHTML = ''
    }
  }, [activeTab, widgetRetry])

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-sans">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">ข่าวและปฏิทินเศรษฐกิจ</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">ปฏิทิน/ข่าว API: Trading Economics เป็น provider ที่ประเมินไว้แต่ยังไม่เชื่อมต่อหรือยืนยันสิทธิ์แสดงผล; คง UNAVAILABLE และไม่มีข้อมูลตัวอย่าง • TradingView เป็น widget ภายนอก</p>
        </div>
        <button onClick={refreshFeeds} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'กำลังโหลด' : 'รีเฟรชข้อมูล'}
        </button>
      </header>

      <div className="flex overflow-x-auto gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit max-w-full">
        {[
          ['calendar', 'ปฏิทินเศรษฐกิจ', Calendar],
          ['news', 'ข่าวบทความ', Newspaper],
          ['widget', 'TradingView widget', ExternalLink],
        ].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap ${activeTab === key ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
          <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800">
            <div><h2 className="font-semibold text-sm text-slate-900 dark:text-white">ปฏิทินเศรษฐกิจ</h2><p className="text-[11px] text-slate-500 mt-1">เวลาแสดงเขตเวลาไทย (ICT)</p></div>
            <FeedBadge status={calendarStatus.status} />
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500">Source: {calendarStatus.source} • อัปเดต: {calendarStatus.lastUpdated ? formatThaiDate(calendarStatus.lastUpdated) : 'ไม่มี'}</div>
          {calendar.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs text-left">
              <thead className="text-slate-500 bg-slate-50 dark:bg-slate-950/40"><tr>{['เวลา (ICT)', 'เหตุการณ์', 'สกุลเงิน', 'ผลกระทบ', 'Forecast', 'Previous', 'Actual'].map((name) => <th key={name} className="px-3 py-2">{name}</th>)}</tr></thead>
              <tbody>{calendar.map((event) => <tr key={event.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 whitespace-nowrap">{formatThaiDate(event.date)}</td><td className="px-3 py-2 font-medium">{event.title}</td><td className="px-3 py-2">{event.currency || event.country || '—'}</td><td className="px-3 py-2">{event.impact || '—'}</td><td className="px-3 py-2">{event.forecast || '—'}</td><td className="px-3 py-2">{event.previous || '—'}</td><td className="px-3 py-2">{event.actual || '—'}</td>
              </tr>)}</tbody>
            </table></div>
          ) : <div className="p-10 text-center text-slate-500 text-sm"><AlertCircle className="w-5 h-5 mx-auto mb-2" />{calendarStatus.status === 'LOADING' ? 'กำลังโหลดปฏิทิน' : 'ยังไม่มีข้อมูลปฏิทินจาก provider'}</div>}
        </section>
      )}

      {activeTab === 'news' && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
          <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800">
            <div><h2 className="font-semibold text-sm text-slate-900 dark:text-white">ข่าวบทความและพาดหัว</h2><p className="text-[11px] text-slate-500 mt-1">ลิงก์ต้นทางและเวลาเผยแพร่แสดงตามข้อมูล provider</p></div>
            <FeedBadge status={newsStatus.status} />
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500">Source: {newsStatus.source} • อัปเดต: {newsStatus.lastUpdated ? formatThaiDate(newsStatus.lastUpdated) : 'ไม่มี'}</div>
          {headlines.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{headlines.map((item) => (
            <article key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div><h3 className="font-semibold text-sm text-slate-900 dark:text-white">{item.title}</h3>{item.summary && <p className="text-xs text-slate-500 mt-1">{item.summary}</p>}<p className="text-[11px] text-slate-500 mt-2">{item.source || 'ไม่ระบุแหล่งข่าว'} • {formatThaiDate(item.publishedAt)}</p></div>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-500 hover:underline">เปิดต้นทาง <ExternalLink className="w-3 h-3" /></a>
            </article>
          ))}</div> : <div className="p-10 text-center text-slate-500 text-sm"><AlertCircle className="w-5 h-5 mx-auto mb-2" />{newsStatus.status === 'LOADING' ? 'กำลังโหลดข่าว' : 'ยังไม่มีพาดหัวข่าวจาก provider'}</div>}
        </section>
      )}

      {activeTab === 'widget' && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
            <div><h2 className="font-semibold text-sm text-white">TradingView Economic Calendar</h2><p className="text-[11px] text-slate-400 mt-1">widget ภายนอก ไม่ใช่ API ข่าวที่ FINNTECH ควบคุมหรือบันทึก</p></div>
            <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{widgetStatus === 'READY' ? 'widget พร้อมแสดง' : widgetStatus === 'LOADING' ? 'กำลังโหลด widget' : 'widget ไม่พร้อมใช้งาน'}</span><button onClick={() => setWidgetRetry((value) => value + 1)} className="text-xs text-cyan-400">ลองใหม่</button></div>
          </div>
          {widgetStatus === 'UNAVAILABLE' && <p className="p-3 text-xs text-amber-400">widget ไม่พร้อมใช้งานในขณะนี้</p>}
          <div ref={widgetRootRef} className="min-h-[240px]" />
        </section>
      )}
    </div>
  )
}
