import CashSettlementFields, {CashAccountField, OpeningBalanceChoice, openingAccount, tradeCash, unlinkedLabel} from './CashSettlementFields'
import { clearValuationCache } from './useValuationReferences'
import ReceiptAssist from '../media/ReceiptAssist'
import Attachment from '../media/Attachment'
import {MediaLocks} from '../media/Locks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  cashOverviewSchema, type CashOverview, stockOverviewSchema, budgetInputSchema, categoryInputSchema, financeEntrySchema, financeOverviewSchema,
  cryptoOverviewSchema, marketSnapshotSchema, portfolioInputSchema, tradeEntrySchema,
  financeCorrectionSchema, tradeCorrectionSchema, starterCategoriesInputSchema, STARTER_CATEGORIES,
  type FinanceOverview, type CryptoOverview, type MarketSnapshot,
} from '@finntech/contracts'
import { parseCryptoDecimal, serializeCrypto, serializeThb } from '@finntech/finance'
import { displayDecimal, trackerRequest, TrackerRequestError } from './client'
import StockPrices from './StockPrices'
import CryptoPrices from './CryptoPrices'
import Backup from './Backup'
import Assets from './Assets'
import ExpenseBreakdown from './ExpenseBreakdown'
import { CRYPTO_PRICE_MAX_AGE_MS, isFreshCryptoQuote } from './marketFreshness'
import { Icon, usePresentation } from '../presentation'
import TrackerNavigation, { type Section } from './TrackerNavigation'
import Account from './Account'
import ModalDialog from './ModalDialog'
import PageIntro from './PageIntro'
import FinanceHistory from './FinanceHistory'

type Pending = { path: string; body: unknown; key: string; method: string }
const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
const card = 'tracker-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6'
const input = 'auth-input'

export default function Dashboard({ name, logout, expired, authBusy, recovery = false, demo = false, freshDemo, real = false }: {
  name: string; logout: () => void; expired: () => void; authBusy: boolean; recovery?: boolean; demo?: boolean; freshDemo?: () => void; real?: boolean
}): JSX.Element {
  const { money } = usePresentation()
  const [mediaLocked,setMediaLocked]=useState(false),[financeImage,setFinanceImage]=useState<string>(),[cryptoImage,setCryptoImage]=useState<string>(),[receiptReset,setReceiptReset]=useState(0)
  const [section, setSection] = useState<Section>('finance')
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [month, setMonth] = useState(today().slice(0, 7))
  const [finance, setFinance] = useState<FinanceOverview | null>(null)
  const [crypto, setCrypto] = useState<CryptoOverview | null>(null)
  const [cash, setCash] = useState<CashOverview>({accounts:[]})
  const [financeCashId,setFinanceCashId]=useState(''),[tradeCashId,setTradeCashId]=useState(''),[cashAmount,setCashAmount]=useState('')
  // Records dated before an account's opening date default to "already in the opening balance".
  const [financeIncluded,setFinanceIncluded]=useState(true),[tradeIncluded,setTradeIncluded]=useState(true)
  const [legacyFinanceOpening,setLegacyFinanceOpening]=useState(false),[legacyTradeOpening,setLegacyTradeOpening]=useState(false)
  // Settled stock sales, used only to ask before the same proceeds are entered again as income.
  const [stockSells,setStockSells]=useState<{label:string;date:string;accountId:string;amountThb:string}[]>([])
  const [incomeCheck,setIncomeCheck]=useState<{text:string;proceed:()=>void}|null>(null)
  const [legacyFinance,setLegacyFinance]=useState(false),[legacyTrade,setLegacyTrade]=useState(false)
  const [market, setMarket] = useState<MarketSnapshot>({ quotes: [] })
  const [marketTime, setMarketTime] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [backupLocked, setBackupLocked] = useState(false)
  const writing = useRef(false)
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [inlineCategory, setInlineCategory] = useState('')
  const [inlineType, setInlineType] = useState<'income' | 'expense'>('expense')
  const [inlineOpen, setInlineOpen] = useState(false)
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [portfolioName, setPortfolioName] = useState('')
  const [portfolioId, setPortfolioId] = useState('')
  const [asset, setAsset] = useState('BTC')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fee, setFee] = useState('0')
  const [tradeDate, setTradeDate] = useState(today())
  const [renameId, setRenameId] = useState('')
  const [rename, setRename] = useState('')
  const [editingFinance, setEditingFinance] = useState<string | null>(null)
  const [editingTrade, setEditingTrade] = useState<string | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [voiding, setVoiding] = useState<{ kind: 'finance' | 'crypto'; id: string; label: string } | null>(null)
  const financeForm = useRef<HTMLFormElement>(null)
  const tradeForm = useRef<HTMLFormElement>(null)
  const voidForm = useRef<HTMLFormElement>(null)
  const disabled = mediaLocked || loading || busy || !!pending || !available || authBusy || backupLocked

  const navigationLocked = mediaLocked || backupLocked || busy || !!pending || authBusy
  function navigate(next: Section): boolean {
    if (mediaLocked || backupLocked || busy || pending || writing.current || authBusy) return false
    if (next === section) return true
    setMessage('')
    setSection(next)
    if(next==='finance'||next==='crypto')void load()
    return true
  }

  useEffect(() => {
    const form = voiding ? voidForm.current : editingFinance ? financeForm.current : editingTrade ? tradeForm.current : null
    form?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    form?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus({ preventScroll: true })
  }, [editingFinance, editingTrade, voiding])

  function cancelCorrection(): void {
    setLegacyFinance(false); setLegacyTrade(false); setCashAmount(''); setFinanceIncluded(true); setTradeIncluded(true)
    setEditingFinance(null); setEditingTrade(null); setVoiding(null); setCorrectionReason('')
    setAmount(''); setNote(''); setQuantity(''); setPrice(''); setFee('0')
  }
  function editFinance(row: FinanceOverview['transactions'][number]): void {
    cancelCorrection(); setEditingFinance(row.id); setType(row.type); setCategoryId(row.categoryId)
    setLegacyFinance(!row.cashAccountId); setLegacyFinanceOpening(!!row.inOpeningBalance); setFinanceCashId(row.cashAccountId??'')
    setAmount(row.amount); setDate(row.date); setNote(row.note)
  }
  function editTrade(row: CryptoOverview['trades'][number]): void {
    cancelCorrection(); setEditingTrade(row.id); setPortfolioId(row.portfolioId); setAsset(row.asset)
    setLegacyTrade(!row.cashSettlement); setLegacyTradeOpening(!!row.inOpeningBalance); setTradeCashId(row.cashSettlement?.accountId??''); setCashAmount(row.cashSettlement?.amountThb??'')
    setSide(row.side); setQuantity(row.quantity); setPrice(row.price); setFee(row.fee); setTradeDate(row.date)
  }

  async function load(selected = month): Promise<void> {
    setLoading(true)
    try {
      const [f, c, a] = await Promise.all([trackerRequest(`finance?month=${selected}`), trackerRequest('crypto'),trackerRequest('cash')])
      const accounts=cashOverviewSchema.parse(a);setCash(accounts)
      void trackerRequest('stocks').then(value => {
        const parsed = stockOverviewSchema.safeParse(value)
        setStockSells(parsed.success ? parsed.data.trades.flatMap(t => t.side === 'sell' && !t.voidedAt && t.cashSettlement ? [{ label: `ขาย ${t.symbol}`, date: t.date, accountId: t.cashSettlement.accountId, amountThb: t.cashSettlement.amountThb }] : []) : [])
      }).catch(() => { setStockSells([]) })
      setFinance(financeOverviewSchema.parse(f)); setCrypto(cryptoOverviewSchema.parse(c)); setAvailable(true)
    } catch (error) {
      setAvailable(false)
      setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ')
      if (error instanceof TrackerRequestError && error.expired) expired()
    } finally { setLoading(false) }
  }
  useEffect(() => { void load(month) }, [month])
  // Personal closes are held for this signed-in view only; leaving the dashboard (logout, expiry) drops them.
  useEffect(() => () => { clearValuationCache() }, [])
  /** A settled sale into the same account with the same THB amount within 7 days of this income. */
  function saleMatch(accountId: string, value: string, day: string): string | null {
    const near = (other: string) => Math.abs(Date.parse(other) - Date.parse(day)) <= 7 * 86400000
    const same = (other: string) => { try { return parseCryptoDecimal(other).eq(value) } catch { return false } }
    const sales = [...(crypto?.trades ?? []).flatMap(t => t.side === 'sell' && !t.voidedAt && t.cashSettlement ? [{ label: `ขาย ${t.asset}`, date: t.date, accountId: t.cashSettlement.accountId, amountThb: t.cashSettlement.amountThb }] : []), ...stockSells]
    const hit = sales.find(row => row.accountId === accountId && same(row.amountThb) && near(row.date))
    return hit ? `${hit.label} วันที่ ${hit.date} เพิ่มเงิน ${displayDecimal(hit.amountThb)} THB เข้าบัญชีนี้แล้ว` : null
  }
  useEffect(() => {
    const updateClock = () => setMarketTime(Date.now())
    // Expire locally even when API/WS stop replying, including after a background tab wakes.
    const timer = setInterval(updateClock, 1000)
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateClock)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateClock)
    }
  }, [])
  useEffect(() => {
    const now = Date.now()
    const expiries = market.quotes.filter(quote => isFreshCryptoQuote(quote, now))
      .map(quote => Math.min(Date.parse(quote.receivedAt!),quote.observedAt?Date.parse(quote.observedAt):Infinity) + CRYPTO_PRICE_MAX_AGE_MS + 1)
    if (expiries.length === 0) return
    const timer = setTimeout(() => setMarketTime(Date.now()), Math.min(...expiries) - now)
    return () => clearTimeout(timer)
  }, [market, marketTime])
  useEffect(() => {
    let mounted = true
    let socket: WebSocket | null = null
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const accept = (value: MarketSnapshot) => {
      if (mounted) { setMarket(value); setMarketTime(Date.now()) }
    }
    const connect = () => {
      if (!mounted || typeof WebSocket === 'undefined') return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/market`)
      socket.onmessage = event => {
        try { accept(marketSnapshotSchema.parse(JSON.parse(String(event.data)))); failures = 0 }
        catch { if (mounted) setMarket({ quotes: [] }) }
      }
      socket.onclose = () => { if (mounted) { failures = Math.min(failures + 1, 5); reconnect = setTimeout(connect, 1000 * 2 ** failures) } }
      socket.onerror = () => socket?.close()
    }
    const refresh = async () => {
      try { accept(marketSnapshotSchema.parse(await trackerRequest('crypto/market'))) }
      catch {
        // A failed HTTP poll must not discard a valid WS observation. Its original
        // receivedAt still expires locally after 30 seconds, without refreshing age.
      }
    }
    void refresh()
    connect()
    const timer = setInterval(() => { void refresh() }, 15000)
    return () => { mounted = false; clearInterval(timer); if (reconnect) clearTimeout(reconnect); socket?.close() }
  }, [])

  async function send(request: Pending): Promise<void> {
    if (writing.current) return
    writing.current = true; setBusy(true); setMessage('')
    try {
      const result = await trackerRequest(request.path, request.method, request.body, request.key) as { id?: unknown } | null
      setPending(null)
      // Reset only the form that was written, so a draft transaction survives category/portfolio setup.
      if (request.path.startsWith('finance/transactions') || request.path.startsWith('crypto/trades')) {
        setFinanceImage(undefined); setCryptoImage(undefined); setReceiptReset(v => v + 1)
        setAmount(''); setNote(''); setQuantity(''); setPrice('')
        cancelCorrection()
      } else if (request.path === 'finance/categories') {
        setCategoryName(''); setInlineCategory(''); setInlineOpen(false)
        const created = request.body as { type?: string }
        if (created.type === type && typeof result?.id === 'string') setCategoryId(result.id)
      } else if (request.path === 'finance/categories/starter') setInlineOpen(false)
      else if (request.path.startsWith('finance/categories/')) { setRename(''); setRenameId('') }
      else if (request.path === 'crypto/portfolios') setPortfolioName('')
      setMessage('บันทึกสำเร็จ'); await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
      if (error instanceof TrackerRequestError && error.unknownOutcome) setPending(request)
      if (error instanceof TrackerRequestError && error.expired) expired()
    } finally { writing.current = false; setBusy(false) }
  }
  function submit(event: FormEvent, path: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }, body: unknown, method = 'POST'): void {
    event.preventDefault()
    write(path, schema, body, method)
  }
  function write(path: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }, body: unknown, method = 'POST'): void {
    if (disabled || writing.current) return
    const result = schema.safeParse(body)
    if (!result.success) { setMessage('ข้อมูลไม่ถูกต้อง เงิน THB รับทศนิยมไม่เกิน 2 ตำแหน่ง คริปโตไม่เกิน 18 ตำแหน่ง และต้องเป็นจำนวนบวก'); return }
    void send({ path, body: result.data, key: globalThis.crypto.randomUUID(), method })
  }
  const categories = finance?.categories ?? []
  const typeCategories = categories.filter(c => c.type === type)
  const categoryLabel = (id: string) => categories.find(c => c.id === id)?.name ?? 'ไม่ระบุหมวดหมู่'
  const portfolios = crypto?.portfolios ?? []
  const holdings = (crypto?.holdings ?? []).filter(h => h.portfolioId === portfolioId)
  const valuations = holdings.map(h => {
    if (parseCryptoDecimal(h.quantity).isZero()) return { ...h, value: '0', unrealized: '0' }
    const quote = market.quotes.find(q => q.asset === h.asset)
    if (!isFreshCryptoQuote(quote, marketTime) || !quote?.price || h.totalCost === null) return { ...h, value: null, unrealized: null }
    try {
      const value = parseCryptoDecimal(h.quantity).times(quote.price)
      return { ...h, value: serializeCrypto(value), unrealized: serializeCrypto(value.minus(h.totalCost)) }
    } catch { return { ...h, value: null, unrealized: null } }
  })
  const completePrices = !!portfolioId && valuations.every(h => h.value !== null)
  const total = valuations.reduce((sum, h) => h.value ? sum.plus(h.value) : sum, parseCryptoDecimal('0'))
  let totalText: string | null = null
  try { if (completePrices) totalText = serializeCrypto(total) } catch { /* Display N/A on summary overflow. */ }

  const feedback = <>
    {message && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {pending && <div className={card}><p className="text-sm leading-6">ยังไม่ทราบผลการบันทึก ห้ามสร้างคำขอใหม่ ระบบจะส่งข้อมูลและ key เดิมเพื่อตรวจผลโดยไม่เพิ่มรายการซ้ำ</p><button className="auth-primary mt-3" disabled={busy} onClick={() => { void send(pending) }}>ลองส่งคำขอเดิมอีกครั้ง</button></div>}
  </>
  return <MediaLocks lock={setMediaLocked}><div className="tracker-layout">
    <TrackerNavigation section={section} locked={navigationLocked} navigate={navigate} />
    <main id="tracker-content" tabIndex={-1} className="tracker-main space-y-6" data-page={section}>
    <PageIntro section={section} name={name}>
      {available && <button className="auth-secondary" disabled={disabled} onClick={() => { setRefreshRevision(value => value + 1); void load() }}>โหลดข้อมูลล่าสุด</button>}<button type="button" className="auth-secondary" disabled={navigationLocked} onClick={logout}>ออกจากระบบ</button>
    </PageIntro>
    {!voiding && feedback}
    {!available && !loading && <button className="auth-secondary" onClick={() => { void load() }}>โหลดข้อมูลอีกครั้ง</button>}
    {loading && <p role="status">กำลังโหลดข้อมูล…</p>}
    {incomeCheck && <ModalDialog title="รายรับนี้อาจซ้ำกับเงินจากการขาย" onDismiss={() => setIncomeCheck(null)} closeDisabled={busy || !!pending}>
      <p className="mt-3 text-sm leading-7">{incomeCheck.text} ถ้าเป็นเงินก้อนเดียวกัน ไม่ต้องบันทึกเป็นรายรับอีก เพราะเงินสดจะถูกบวกสองครั้ง</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="auth-primary" onClick={() => setIncomeCheck(null)}>ไม่บันทึก</button><button type="button" className="auth-secondary" disabled={busy || !!pending} onClick={() => { const next = incomeCheck; setIncomeCheck(null); next.proceed() }}>เป็นเงินคนละก้อน บันทึกรายรับนี้</button></div>
    </ModalDialog>}
    {voiding && <ModalDialog title="ยืนยันยกเลิกรายการ" onDismiss={cancelCorrection} closeDisabled={busy || !!pending}>
      <p className="mt-4 font-semibold">ยกเลิกรายการ {money(voiding.label)}</p>
      <p className="mt-2 text-sm leading-7">รายการเดิมยังอยู่ในประวัติ แต่จะไม่รวมในยอด หากทำให้ประวัติคริปโตขายเกินจำนวน ระบบจะปฏิเสธและคงข้อมูลเดิม</p>
      <form ref={voidForm} className="mt-4 space-y-3" onSubmit={e => submit(e,
        `${voiding.kind === 'finance' ? 'finance/transactions' : 'crypto/trades'}/${voiding.id}/corrections`,
        voiding.kind === 'finance' ? financeCorrectionSchema : tradeCorrectionSchema,
        { action: 'void', reason: correctionReason })}>
        <label className="auth-label">เหตุผลการยกเลิก<input className={input} required maxLength={500} value={correctionReason} disabled={disabled} onChange={e => setCorrectionReason(e.target.value)} /></label>
        <div className="flex flex-wrap gap-3"><button className="auth-primary" disabled={disabled}>ยืนยันยกเลิกรายการ</button><button type="button" className="auth-secondary" disabled={disabled} onClick={cancelCorrection}>กลับโดยไม่ยกเลิก</button></div>
      </form>
      <div className="mt-4 space-y-3">{feedback}</div>
    </ModalDialog>}
    {section === 'account' && <Account name={name} deletionLock={setBackupLocked} expired={expired} real={real} demo={demo} freshDemo={freshDemo} recovery={recovery} locked={navigationLocked} logout={logout} backup={() => { navigate('backup') }} />}
    {(section === 'finance' || section === 'budget') && <>
      <div className="tracker-section-heading"><div><h2 className="text-xl font-semibold">ภาพรวมรายรับรายจ่าย</h2><p className="mt-1 text-sm text-slate-500">จากรายการที่บันทึก · ไม่ใช่ยอดบัญชีธนาคาร</p></div><label className="auth-label tracker-month">เดือนที่ดู<input className={input} type="month" value={month} disabled={busy || !!pending || loading} onChange={e => { if (e.target.value) setMonth(e.target.value) }} /></label></div>
      {finance && <div className="tracker-summary grid gap-3 sm:grid-cols-3">{[['คงเหลือเดือนนี้', finance.balance], ['รายรับ', finance.income], ['รายจ่าย', finance.expense]].map(([label, value], index) => <div key={label} className={`${card} tracker-summary-card ${index === 0 ? 'tracker-balance-card' : ''}`}><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><span className="tracker-stat-icon"><Icon name={index === 0 ? 'budget' : 'finance'} /></span></div><p className="mt-3 break-all text-2xl font-semibold tabular-nums">{money(displayDecimal(value!))} <span className="text-xs text-slate-400">THB</span></p><p className="tracker-stat-caption">{index === 0 ? 'รายรับหักรายจ่ายในเดือนที่เลือก' : 'เฉพาะรายการที่ยังไม่ถูกยกเลิก'}</p></div>)}</div>}
    </>}
    {section === 'finance' && <div className="journal-finance-layout">
      <div className="journal-analysis">{finance && finance.month === month && !loading && <ExpenseBreakdown finance={finance} />}</div>
      <div className="journal-editor">
        <section className={card}><h2 className="text-lg font-semibold">{editingFinance ? 'แก้ไขรายรับรายจ่าย' : 'บันทึกรายการ'}</h2><form ref={financeForm} aria-label="บันทึกรายรับรายจ่าย" className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => {
          const opening = !legacyFinance && !editingFinance && !!openingAccount(cash.accounts, financeCashId, date)
          const entry = { ...(!legacyFinance?{cashAccountId:financeCashId}:{}), ...(opening?{inOpeningBalance:financeIncluded}:{}), ...(financeImage?{attachmentId:financeImage}:{}),type, categoryId, amount, currency: 'THB', date, note }
          if (editingFinance) { submit(e, `finance/transactions/${editingFinance}/corrections`, financeCorrectionSchema, { action: 'replace', reason: correctionReason, entry }); return }
          e.preventDefault()
          const match = type === 'income' && !(opening && financeIncluded) ? saleMatch(financeCashId, amount, date) : null
          if (match) setIncomeCheck({ text: match, proceed: () => write('finance/transactions', financeEntrySchema, entry) })
          else write('finance/transactions', financeEntrySchema, entry)
        }}>
          <label className="auth-label">ประเภทรายการ<select className={input} value={type} disabled={disabled} onChange={e => { const next = e.target.value as typeof type; setType(next); setInlineType(next); setCategoryId('') }}><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select></label>
          <label className="auth-label">หมวดหมู่<select className={input} required value={categoryId} disabled={disabled} onChange={e => setCategoryId(e.target.value)}><option value="">เลือกหมวดหมู่</option>{typeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {!editingFinance && <div className="journal-category-helper sm:col-span-2 space-y-3" data-testid="category-helper">
            {loading && !finance && <p role="status" className="text-sm">กำลังโหลดหมวดหมู่…</p>}
            {!loading && !available && <div role="alert" className="text-sm">โหลดหมวดหมู่ไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ <button type="button" className="auth-secondary ml-2" disabled={busy || !!pending} onClick={() => { void load() }}>ลองโหลดหมวดหมู่อีกครั้ง</button></div>}
            {available && typeCategories.length === 0 && <p role="status" className="text-sm">ยังไม่มีหมวด{type === 'expense' ? 'รายจ่าย' : 'รายรับ'} เพิ่มหมวดหมู่เพื่อเริ่มบันทึก</p>}
            {available && (typeCategories.length === 0 || inlineOpen) ? <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <label className="auth-label">ชื่อหมวดใหม่<input className={input} maxLength={100} value={inlineCategory} disabled={disabled} onChange={e => setInlineCategory(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); write('finance/categories', categoryInputSchema, { name: inlineCategory, type: inlineType }) } }} /></label>
              <label className="auth-label">ประเภทหมวด<select className={input} value={inlineType} disabled={disabled} onChange={e => setInlineType(e.target.value as typeof inlineType)}><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select></label>
              <button type="button" className="auth-secondary" disabled={disabled || !inlineCategory.trim()} onClick={() => write('finance/categories', categoryInputSchema, { name: inlineCategory, type: inlineType })}>เพิ่มหมวดนี้</button>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-3"><button type="button" className="auth-secondary" disabled={disabled} onClick={() => write('finance/categories/starter', starterCategoriesInputSchema, {})}>เพิ่มหมวดหมู่พื้นฐาน</button><p className="text-xs text-slate-500">เพิ่มเฉพาะชื่อหมวดที่ยังไม่มี เช่น {STARTER_CATEGORIES[type].slice(0, 3).join(', ')} · ไม่สร้างจำนวนเงินหรือรายการ เปลี่ยนชื่อหรือเพิ่มเองได้ภายหลัง</p></div>
            </div> : available && <button type="button" className="auth-secondary" disabled={disabled} onClick={() => setInlineOpen(true)}>+ เพิ่มหมวดใหม่โดยไม่ล้างข้อมูลที่กรอก</button>}
          </div>}
          {type === 'income' && !editingFinance && <p className="sm:col-span-2 text-xs" role="note" data-testid="sale-income-hint">เงินจากการขายหุ้น/คริปโตที่บันทึกในหน้าพอร์ต เข้าบัญชีเงินสดให้อัตโนมัติแล้ว ไม่ต้องลงเป็นรายรับซ้ำ</p>}
          {!legacyFinance && !editingFinance && (() => { const opening = openingAccount(cash.accounts, financeCashId, date); return opening ? <OpeningBalanceChoice asOf={opening.asOf} checked={financeIncluded} onChange={setFinanceIncluded} disabled={disabled} /> : null })()}
          {legacyFinance?<p className="sm:col-span-2 text-xs" role="status">{unlinkedLabel(legacyFinanceOpening)} · แก้ประวัติเท่านั้น</p>:<CashAccountField accounts={cash.accounts} value={financeCashId} onChange={setFinanceCashId} disabled={disabled} onSetup={available ? () => { navigate('assets') } : undefined} label={type==='income'?'รับเข้าบัญชีเงินสด':'จ่ายจากบัญชีเงินสด'}/>}
          <label className="auth-label">จำนวนเงิน THB<input className={input} inputMode="decimal" required value={amount} disabled={disabled} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
          <label className="auth-label">วันที่<input className={input} type="date" required value={date} disabled={disabled} onChange={e => setDate(e.target.value)} /></label>
          <label className="auth-label sm:col-span-2">บันทึกช่วยจำ<input className={input} maxLength={500} value={note} disabled={disabled} onChange={e => setNote(e.target.value)} /></label>
          {!demo&&<ReceiptAssist key={'finance-'+receiptReset} kind="finance" disabled={disabled} lock={setMediaLocked} expired={expired} onAttachment={setFinanceImage} onApply={f=>{if(f.amount!==undefined)setAmount(f.amount);if(f.date!==undefined)setDate(f.date);if(f.note!==undefined)setNote(f.note)}}/>}
          {editingFinance && <label className="auth-label sm:col-span-2">เหตุผลการแก้ไข<input className={input} required maxLength={500} value={correctionReason} disabled={disabled} onChange={e => setCorrectionReason(e.target.value)} /></label>}
          <button className="auth-primary sm:col-span-2" disabled={disabled || !!voiding}>{editingFinance ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</button>
          {editingFinance && <button type="button" className="auth-secondary sm:col-span-2" disabled={disabled} onClick={cancelCorrection}>เลิกแก้ไข</button>}
        </form></section>
        <section className={card}><h2 className="text-lg font-semibold">หมวดหมู่ของคุณ</h2><p className="mt-2 text-sm text-slate-500">สร้างหมวดหมู่รายรับและรายจ่ายแยกกัน</p><form aria-label="เพิ่มหมวดหมู่" className="mt-5 space-y-4" onSubmit={e => submit(e, 'finance/categories', categoryInputSchema, { name: categoryName, type })}>
          <label className="auth-label">ชื่อหมวดหมู่<input className={input} required maxLength={100} value={categoryName} disabled={disabled} onChange={e => setCategoryName(e.target.value)} /></label><p className="text-sm text-slate-500">ประเภท: {type === 'expense' ? 'รายจ่าย' : 'รายรับ'} ตามฟอร์มบันทึก</p><button className="auth-secondary w-full" disabled={disabled}>เพิ่มหมวดหมู่</button>
        </form><div className="mt-5 space-y-2">{categories.map(c => <div key={c.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm"><span className="break-all">{c.name} · {c.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</span><button disabled={disabled} className="shrink-0 text-teal-700" onClick={() => { setRenameId(c.id); setRename(c.name) }}>เปลี่ยนชื่อ</button></div>)}</div>
          {renameId && <form aria-label="เปลี่ยนชื่อหมวดหมู่" className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); if (!disabled && rename.trim()) void send({ path: `finance/categories/${renameId}`, method: 'PATCH', body: { name: rename.trim() }, key: globalThis.crypto.randomUUID() }) }}><label className="auth-label">ชื่อใหม่<input className={input} maxLength={100} required value={rename} disabled={disabled} onChange={e => setRename(e.target.value)} /></label><button className="auth-secondary" disabled={disabled}>บันทึกชื่อ</button></form>}
        </section>
      </div>
      <FinanceHistory mediaEnabled={!demo} mediaLock={setMediaLocked} expired={expired} finance={finance} categoryLabel={categoryLabel} cashLabel={id=>cash.accounts.find(row=>row.id===id)?.name??'บัญชีเงินสด'} money={money} disabled={disabled} edit={editFinance} cancel={row => { cancelCorrection(); setVoiding({ kind: 'finance', id: row.id, label: `${categoryLabel(row.categoryId)} ${money(displayDecimal(row.amount))} THB` }) }} />
    </div>}
    {section === 'budget' && <div className="journal-budget-layout"><section className={card}><h2 className="text-lg font-semibold">ตั้งงบประมาณรายเดือน</h2><form aria-label="ตั้งงบประมาณ" className="mt-5 space-y-4" onSubmit={e => submit(e, 'finance/budgets', budgetInputSchema, { categoryId: budgetCategory, month, amount: budgetAmount, currency: 'THB' })}>
      <label className="auth-label">หมวดรายจ่าย<select className={input} required value={budgetCategory} disabled={disabled} onChange={e => setBudgetCategory(e.target.value)}><option value="">เลือกหมวดหมู่</option>{categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{available && !categories.some(c => c.type === 'expense') && <p role="status" className="text-sm">ยังไม่มีหมวดรายจ่าย เพิ่มหมวดหรือหมวดหมู่พื้นฐานได้ที่หน้ารายรับรายจ่าย</p>}<label className="auth-label">งบ THB<input className={input} inputMode="decimal" required value={budgetAmount} disabled={disabled} onChange={e => setBudgetAmount(e.target.value)} /></label><button disabled={disabled} className="auth-primary w-full">บันทึกงบประมาณ</button><p className="text-xs leading-6 text-slate-500">บันทึกซ้ำหมวดและเดือนเดิมเป็นการปรับงบ ไม่มีการสร้างรายการรายจ่าย</p>
    </form></section><section className={`${card} journal-budget-track`}><h2 className="text-lg font-semibold">ติดตามงบเดือนนี้</h2><div className="mt-5 space-y-4">{finance?.budgets.length === 0 && <p className="text-sm text-slate-500">ยังไม่ได้ตั้งงบประมาณ</p>}{finance?.budgets.map(b => <div key={b.id} className="rounded-xl border border-slate-200 p-4"><p className="font-medium">{categoryLabel(b.categoryId)}</p><p className="mt-2 break-all text-sm">ใช้ไป {money(displayDecimal(b.spent))} / {money(displayDecimal(b.amount))} THB</p><p className={`mt-1 break-all text-sm ${b.remaining.startsWith('-') ? 'text-rose-700' : 'text-teal-700'}`}>{b.remaining.startsWith('-') ? 'เกินงบ ' : 'เหลือ '}{money(displayDecimal(b.remaining.replace(/^-/, '')))} THB</p></div>)}</div></section></div>}
    {section === 'assets' && <Assets crypto={available ? crypto : null} market={market} now={marketTime} expired={expired} lock={setBackupLocked} />}
    {section === 'crypto' && <div className="journal-crypto-layout">
      <CryptoPrices market={market} now={marketTime} />
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">พอร์ตคริปโต · USDT</h2><p className="mt-2 text-sm text-slate-500">บันทึกประวัติด้วยมือ · ไม่มีการส่งคำสั่งตลาด · ค่าธรรมเนียมคิดเป็น USDT</p></div><label className="auth-label min-w-48">พอร์ตที่ดู<select className={input} value={portfolioId} disabled={disabled || !!editingTrade} onChange={e => setPortfolioId(e.target.value)}><option value="">เลือกพอร์ต</option>{portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      <section className={`${card} journal-holdings`}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">สินทรัพย์ที่ถืออยู่</h3><p className="break-all text-sm">มูลค่ารวม: {totalText === null ? 'N/A' : `${money(displayDecimal(totalText))} USDT`}</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2">{valuations.length === 0 && <p className="text-sm text-slate-500">เลือกพอร์ตและบันทึกประวัติเพื่อดูต้นทุน</p>}{valuations.map(h => {
        const quote = market.quotes.find(q => q.asset === h.asset)
        const fresh = isFreshCryptoQuote(quote, marketTime)
        let average = 'N/A', allocation = 'N/A'
        try { if (h.totalCost && !parseCryptoDecimal(h.quantity).isZero()) average = `${money(displayDecimal(serializeCrypto(parseCryptoDecimal(h.totalCost).div(h.quantity))))} USDT`; if (completePrices && h.value && !total.isZero()) allocation = `${money(displayDecimal(serializeCrypto(parseCryptoDecimal(h.value).div(total).times('100'))))}%` } catch { /* Keep unavailable calculations N/A. */ }
        return <article key={h.asset} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><h4 className="font-semibold">{h.asset}</h4><span className="text-xs text-slate-500">{fresh ? 'ราคาอ้างอิงพร้อม' : quote?.price && quote.status !== 'UNAVAILABLE' ? 'ราคาล้าสมัย' : 'ราคาไม่พร้อม'}</span></div><dl className="mt-3 space-y-2 break-all text-sm"><div>ปริมาณ {money(displayDecimal(h.quantity, 0))}</div><div>ต้นทุน {h.totalCost === null ? 'N/A' : `${money(displayDecimal(h.totalCost))} USDT`}</div><div>ต้นทุนเฉลี่ย {money(average)}</div><div>{fresh ? 'ราคาอ้างอิง' : 'ราคาล่าสุดที่ได้รับ (ไม่ใช้คำนวณ)'} {quote?.price ? `${money(displayDecimal(quote.price))} USDT` : 'N/A'}</div><div>มูลค่าประเมิน {h.value===null?'N/A':money(displayDecimal(h.value))} USDT</div><div>กำไร/ขาดทุนรับรู้ {h.realizedPnl === null ? 'N/A' : `${money(displayDecimal(h.realizedPnl))} USDT`}</div><div>กำไร/ขาดทุนยังไม่รับรู้ {h.unrealized === null ? 'N/A' : `${money(displayDecimal(h.unrealized))} USDT`}</div><div>ผลตอบแทนต้นทุน {h.unrealized!==null&&h.totalCost&&parseCryptoDecimal(h.totalCost).gt('0')?money(displayDecimal(serializeThb(parseCryptoDecimal(h.unrealized).div(h.totalCost).times('100')))):'N/A'}% · ไม่ใช่การเปลี่ยนแปลงราคาตลาด</div><div>สัดส่วนพอร์ต {money(allocation)}</div><div className="text-xs">Binance public · USDT · {quote?.kind==='TRADE'?'รายการซื้อขายต้นทาง':'snapshot ที่ดึงล่าสุด (ไม่มีเวลาซื้อขาย)'}<br/>เวลาต้นทาง: {quote?.observedAt??'N/A'}<br/>เวลารับ: {quote?.receivedAt??'N/A'} · ไม่มี feed/ไม่รองรับแสดง N/A</div></dl></article>
      })}</div><p className="mt-4 text-xs text-slate-500">ราคาผ่าน backend · เกิน 30 วินาทีถือว่าล้าสมัย · ไม่รวมยอดกับ THB</p></section>
      <div className="journal-crypto-editor"><section className={card}><h3 className="font-semibold">{editingTrade ? 'แก้ไขประวัติคริปโต' : 'บันทึกซื้อ/ขายในประวัติ'}</h3><form ref={tradeForm} aria-label="บันทึกคริปโต" className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => {
        const entry = { ...(!legacyTrade?(editingTrade?{cashSettlement:{accountId:tradeCashId,amountThb:cashAmount}}:tradeCash(cash.accounts,tradeCashId,cashAmount,tradeDate,tradeIncluded)):{}), ...(cryptoImage?{attachmentId:cryptoImage}:{}),side, quantity, price, fee, quoteCurrency: 'USDT', date: tradeDate }
        if (editingTrade) submit(e, `crypto/trades/${editingTrade}/corrections`, tradeCorrectionSchema, { action: 'replace', reason: correctionReason, entry })
        else submit(e, 'crypto/trades', tradeEntrySchema, { ...entry, portfolioId, asset })
      }}>
        <label className="auth-label">สินทรัพย์<input className={input} required maxLength={32} list="crypto-asset-catalog" value={asset} disabled={disabled || !portfolioId || !!editingTrade} onChange={e => setAsset(e.target.value)} /></label><datalist id="crypto-asset-catalog">{market.catalog?.filter(row=>row.available).map(row=><option key={row.asset} value={row.asset}>{row.symbol} · USDT</option>)}</datalist><label className="auth-label">ชนิดประวัติ<select className={input} value={side} disabled={disabled || !portfolioId} onChange={e => setSide(e.target.value as typeof side)}><option value="buy">ซื้อ</option><option value="sell">ขาย</option></select></label>
        <label className="auth-label">ปริมาณ<input className={input} inputMode="decimal" required value={quantity} disabled={disabled || !portfolioId} onChange={e => setQuantity(e.target.value)} /></label><label className="auth-label">ราคาต่อหน่วย USDT<input className={input} inputMode="decimal" required value={price} disabled={disabled || !portfolioId} onChange={e => setPrice(e.target.value)} /></label><label className="auth-label">ค่าธรรมเนียม USDT<input className={input} inputMode="decimal" required value={fee} disabled={disabled || !portfolioId} onChange={e => setFee(e.target.value)} /></label><label className="auth-label">วันที่ในประวัติ<input className={input} type="date" required value={tradeDate} disabled={disabled || !portfolioId} onChange={e => setTradeDate(e.target.value)} /></label>
        <CashSettlementFields onSetup={available ? () => { navigate('assets') } : undefined} accounts={cash.accounts} accountId={tradeCashId} setAccountId={setTradeCashId} amount={cashAmount} setAmount={setCashAmount} side={side} disabled={disabled||!portfolioId} legacy={legacyTrade} legacyLabel={unlinkedLabel(legacyTradeOpening)} date={editingTrade?'':tradeDate} included={tradeIncluded} setIncluded={setTradeIncluded}/>
        {!demo&&<ReceiptAssist key={'crypto-'+receiptReset} kind="crypto" disabled={disabled} lock={setMediaLocked} expired={expired} onAttachment={setCryptoImage} onApply={f=>{if(f.asset!==undefined&&!editingTrade)setAsset(f.asset);if(f.side==='buy'||f.side==='sell')setSide(f.side);if(f.quantity!==undefined)setQuantity(f.quantity);if(f.price!==undefined)setPrice(f.price);if(f.fee!==undefined)setFee(f.fee);if(f.date!==undefined)setTradeDate(f.date)}}/>}
        {editingTrade && <label className="auth-label sm:col-span-2">เหตุผลการแก้ไข<input className={input} required maxLength={500} value={correctionReason} disabled={disabled} onChange={e => setCorrectionReason(e.target.value)} /></label>}
        <button disabled={disabled || !portfolioId || !!voiding} className="auth-primary sm:col-span-2">{editingTrade ? 'บันทึกการแก้ไข' : 'บันทึกประวัติ'}</button>
        {editingTrade && <button type="button" className="auth-secondary sm:col-span-2" disabled={disabled} onClick={cancelCorrection}>เลิกแก้ไข</button>}
      </form></section><section className={card}><h3 className="font-semibold">สร้างพอร์ตแยก</h3><form aria-label="สร้างพอร์ต" className="mt-5 space-y-4" onSubmit={e => submit(e, 'crypto/portfolios', portfolioInputSchema, { name: portfolioName, quoteCurrency: 'USDT' })}><label className="auth-label">ชื่อพอร์ต<input className={input} required maxLength={100} value={portfolioName} disabled={disabled} onChange={e => setPortfolioName(e.target.value)} /></label><button className="auth-secondary w-full" disabled={disabled}>สร้างพอร์ต</button></form><p className="mt-6 text-sm leading-7 text-slate-500">ต้นทุนแยกต่อพอร์ตและสินทรัพย์ ค้นหา BTC, ETH, SOL, XRP, BNB, DOGE และ ADA จากรายชื่อที่ backend ยืนยันคู่ spot USDT แล้ว สินทรัพย์ไม่รองรับ/ถูกถอดยังเก็บประวัติไว้ แต่การประเมินเป็น N/A รายการซื้อขายใหม่ปรับเงินสดตามเงินบาทจริงที่กรอก</p></section></div>
      <section className={`${card} journal-trade-history`}><h3 className="font-semibold">ประวัติของพอร์ต</h3><p className="mt-2 text-xs text-slate-500">การแก้ไขรักษาพอร์ตและสินทรัพย์เดิม เก็บต้นฉบับและคำนวณต้นทุนใหม่ทั้งประวัติ</p><div className="mt-4 space-y-3">{crypto?.trades.filter(t => t.portfolioId === portfolioId).map(t => <div key={t.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-3 text-sm"><div><p className={`font-medium ${t.voidedAt ? 'text-slate-400 line-through' : ''}`}>{t.side === 'buy' ? 'ซื้อ' : 'ขาย'} {t.asset} · {t.date}</p><p className="mt-1 break-all text-slate-500">{money(t.quantity)} @ {money(displayDecimal(t.price))} USDT · fee {money(t.fee)}</p><p className="mt-1 text-xs">{t.cashSettlement?`${cash.accounts.find(a=>a.id===t.cashSettlement!.accountId)?.name??'เงินสด'} · ${money(displayDecimal(t.cashSettlement.amountThb))} THB`:unlinkedLabel(t.inOpeningBalance)}</p>{t.voidedAt && <p className="mt-1 break-all text-xs text-rose-700">ยกเลิกแล้ว · ไม่รวมยอด · {t.voidReason}</p>}</div>{!demo&&<Attachment kind="crypto" id={t.id} disabled={disabled} lock={setMediaLocked} expired={expired}/>} {!t.voidedAt && <><div className="flex gap-3"><button type="button" className="text-teal-700" disabled={disabled} onClick={() => editTrade(t)}>แก้ไขประวัติ</button><button type="button" className="text-rose-700" disabled={disabled} onClick={() => { cancelCorrection(); setVoiding({ kind: 'crypto', id: t.id, label: `${t.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${t.asset} ${money(t.quantity)}` }) }}>ยกเลิกประวัติ</button></div>{t.side === 'sell' && <p className="break-all">P&amp;L {money(t.realizedPnl ?? 'N/A')} USDT</p>}</>}</div>)}</div></section>
    </div>}
    {section === 'stocks' && <StockPrices mediaEnabled={!demo} expired={expired} lock={setBackupLocked} blocked={authBusy} refreshRevision={refreshRevision}/>}
    {section === 'backup' && <Backup lock={setBackupLocked} expired={expired} restored={async () => { await load() }} />}
    <p className="text-xs leading-6 text-slate-500">ข้อมูล DEMO เดิมยังอยู่ที่ต้นทาง ไม่มีการย้ายหรือรวมยอดอัตโนมัติ เวอร์ชันนี้ยังไม่เปิดการนำเข้า legacy</p>
  </main></div></MediaLocks>
}
