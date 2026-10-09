/**
 * Local Demo Profile & Accounts Service for FINNTECH.
 * Data is stored in this browser only. Profiles, balances and orders are DEMO/PAPER data.
 */
import { INITIAL_TRANSACTIONS, INITIAL_PORTFOLIO } from '../data/initialData.js'
import { INITIAL_SPOT_BALANCES, INITIAL_OPEN_ORDERS, INITIAL_TRADE_HISTORY, INITIAL_POSITIONS } from '../data/tradingData.js'
import { ZERO_SPOT_BALANCES, migrateLegacyOpenOrders } from './spotTradingService.js'

const USERS_KEY = 'finntech_users_db'
const CURRENT_USER_KEY = 'finntech_current_user_id'
const GUEST_DATA_KEY = 'finntech_guest_data'
const userDataKey = (userId) => userId ? `finntech_user_${userId}_data` : GUEST_DATA_KEY

const ARRAY_FIELDS = ['transactions', 'portfolio', 'openOrders', 'tradeHistory', 'cancelledOrderIds', 'priceAlerts', 'positions']
const PORTFOLIO_CURRENCIES = new Set(['THB', 'USD', 'EUR', 'USDT'])
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim().length > 0
const isId = (value) => (typeof value === 'string' && value.trim().length > 0) || (typeof value === 'number' && Number.isFinite(value))
const isAmount = (value, { positive = false } = {}) => (
  typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0)
)

export class LocalDataError extends Error {
  constructor(status, message, cause) {
    super(message)
    this.name = 'LocalDataError'
    this.status = status
    this.cause = cause
  }
}

function hashPasscode(passcode) {
  if (!passcode) return ''
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d
  const str = String(passcode) + '_ft_local_demo_salt'
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 'demo_hash_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

const DEFAULT_DEMO_USER = {
  id: 'user_demo_001',
  name: 'Demo Trader',
  email: 'demo@finntech.local',
  passcodeHash: hashPasscode('demo'),
  avatarColor: 'from-emerald-500 to-teal-600',
  tier: 'DEMO PROFILE',
  isDemoProfile: true,
  createdAt: '2026-09-17',
  balance: 500000,
  positions: [],
  tradeHistory: [],
  transactions: [],
  portfolio: [],
}

function readJson(key) {
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch (error) {
    return { status: 'unavailable', error }
  }
  if (raw === null) return { status: 'missing' }
  try {
    return { status: 'loaded', value: JSON.parse(raw) }
  } catch (error) {
    return { status: 'corrupt', error }
  }
}

function makeZeroDemoData() {
  return {
    transactions: [],
    portfolio: [],
    balance: 0,
    spotBalances: { ...ZERO_SPOT_BALANCES },
    openOrders: [],
    tradeHistory: [],
    cancelledOrderIds: [],
    priceAlerts: [],
    positions: [],
  }
}

function makeNewDemoAccountData() {
  return {
    ...makeZeroDemoData(),
    balance: INITIAL_SPOT_BALANCES.THB,
    spotBalances: { ...INITIAL_SPOT_BALANCES },
  }
}

function assertRows(value, field, predicate, description) {
  const rows = value[field]
  if (rows === undefined) return
  if (!Array.isArray(rows)) throw new LocalDataError('corrupt', `ข้อมูล ${field} ไม่ใช่รายการที่ถูกต้อง`)
  rows.forEach((row, index) => {
    if (!predicate(row)) {
      throw new LocalDataError('corrupt', `ข้อมูล ${field} แถวที่ ${index + 1} ไม่ตรง schema (${description})`)
    }
  })
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isValidTransaction(row) {
  return isRecord(row) && isId(row.id) && isValidCalendarDate(row.date) &&
    (row.type === 'income' || row.type === 'expense') && isText(row.category) &&
    isText(row.categoryName) && isAmount(row.amount, { positive: true }) &&
    (row.note === undefined || typeof row.note === 'string')
}

function isPortfolioAssetBase(row) {
  return isRecord(row) && isId(row.id) && isText(row.name) && isText(row.symbol) &&
    ['fund', 'stock', 'crypto', 'gold', 'cash'].includes(row.type) &&
    isAmount(row.shares, { positive: true }) && isAmount(row.avgBuyPrice) && isAmount(row.currentPrice) &&
    (row.typeName === undefined || typeof row.typeName === 'string') &&
    (row.color === undefined || typeof row.color === 'string')
}

// Version 560fb4f stored these exact portfolio fields before currency was
// introduced. Missing currency is supported only for this identifiable shape;
// null/blank/invalid currencies remain corrupt and are never inferred as THB.
function isLegacyPortfolioAsset(row) {
  return isPortfolioAssetBase(row) && !Object.hasOwn(row, 'currency') &&
    isText(row.typeName) && isText(row.color)
}

function legacyPortfolioFingerprint(row) {
  return JSON.stringify([
    typeof row.id,
    String(row.id),
    row.name,
    row.symbol,
    row.type,
    row.typeName,
    row.shares,
    row.avgBuyPrice,
    row.currentPrice,
    row.color,
  ])
}

function isPortfolioCurrency(value) {
  return typeof value === 'string' && PORTFOLIO_CURRENCIES.has(value.trim().toUpperCase())
}

function isValidPortfolioAsset(row, { allowLegacyPortfolioCurrency = false, legacyPortfolioFingerprints = new Map() } = {}) {
  if (!isPortfolioAssetBase(row)) return false
  if (isPortfolioCurrency(row.currency)) return true
  if (!isLegacyPortfolioAsset(row)) return false
  if (allowLegacyPortfolioCurrency) return true
  const legacyKey = `${typeof row.id}:${String(row.id)}`
  return legacyPortfolioFingerprints.get(legacyKey) === legacyPortfolioFingerprint(row)
}

function isValidOpenOrder(row) {
  return isRecord(row) && isId(row.id) && isText(row.symbol) &&
    (row.side === 'BUY' || row.side === 'SELL') && row.status === 'OPEN' &&
    (row.orderType === undefined || row.orderType === 'LIMIT') &&
    isAmount(row.price, { positive: true }) && isAmount(row.amount, { positive: true }) &&
    (row.total === undefined || isAmount(row.total, { positive: true })) &&
    (row.fee === undefined || isAmount(row.fee)) &&
    (row.targetPrice === undefined || isAmount(row.targetPrice, { positive: true })) &&
    (row.lockedAmount === undefined || isAmount(row.lockedAmount, { positive: true })) &&
    (row.lockedFee === undefined || isAmount(row.lockedFee)) &&
    (row.lockedAsset === undefined || isText(row.lockedAsset)) &&
    (row.baseAsset === undefined || isText(row.baseAsset)) &&
    (row.quoteAsset === undefined || isText(row.quoteAsset)) &&
    (row.placedAt === undefined || typeof row.placedAt === 'string')
}

function isValidTrade(row) {
  return isRecord(row) && isId(row.id) && isText(row.symbol) &&
    (row.side === 'BUY' || row.side === 'SELL') &&
    (row.orderType === 'MARKET' || row.orderType === 'LIMIT') &&
    isAmount(row.price, { positive: true }) && isAmount(row.amount, { positive: true }) &&
    isAmount(row.total, { positive: true }) && isAmount(row.fee) && isText(row.status) &&
    (row.orderId === undefined || isId(row.orderId)) &&
    (row.executedAt === undefined || typeof row.executedAt === 'string') &&
    (row.closedAt === undefined || typeof row.closedAt === 'string')
}

function isValidPriceAlert(row) {
  return isRecord(row) && isId(row.id) && isText(row.symbol) &&
    (row.condition === 'GTE' || row.condition === 'LTE') &&
    isAmount(row.targetPrice, { positive: true }) &&
    (row.note === undefined || typeof row.note === 'string') &&
    (row.createdAt === undefined || typeof row.createdAt === 'string')
}

function validateAndNormalizeUserData(value, portfolioValidation = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalDataError('corrupt', 'รูปแบบข้อมูลบัญชีไม่ถูกต้อง')
  }

  for (const field of ARRAY_FIELDS) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      throw new LocalDataError('corrupt', `ข้อมูล ${field} ไม่ใช่รายการที่ถูกต้อง`)
    }
  }
  if (value.limitOrders !== undefined && !Array.isArray(value.limitOrders)) {
    throw new LocalDataError('corrupt', 'ข้อมูล limitOrders ไม่ใช่รายการที่ถูกต้อง')
  }

  assertRows(value, 'transactions', isValidTransaction, 'id/date/type/category/amount')
  assertRows(value, 'portfolio', (asset) => isValidPortfolioAsset(asset, portfolioValidation), 'id/name/symbol/currency/shares/prices')
  assertRows(value, 'openOrders', isValidOpenOrder, 'id/symbol/side/status/price/amount')
  assertRows(value, 'tradeHistory', isValidTrade, 'id/symbol/side/orderType/price/amount/total/fee/status')
  assertRows(value, 'priceAlerts', isValidPriceAlert, 'id/symbol/condition/targetPrice')
  if (value.limitOrders !== undefined) {
    value.limitOrders.forEach((order, index) => {
      if (!isValidOpenOrder(order)) {
        throw new LocalDataError('corrupt', `ข้อมูล limitOrders แถวที่ ${index + 1} ไม่ตรง schema`)
      }
    })
  }
  if (value.positions?.some((position) => !isRecord(position))) {
    throw new LocalDataError('corrupt', 'ข้อมูล positions มีแถวที่ไม่ใช่ object')
  }
  if (value.cancelledOrderIds?.some((id) => !isId(id))) {
    throw new LocalDataError('corrupt', 'ข้อมูล cancelledOrderIds มี ID ที่ไม่ถูกต้อง')
  }

  if (Object.hasOwn(value, 'balance') && !isAmount(value.balance)) {
    throw new LocalDataError('corrupt', 'ยอด DEMO ในข้อมูลบัญชีไม่ถูกต้อง')
  }
  if (value.spotBalances !== undefined && !isRecord(value.spotBalances)) {
    throw new LocalDataError('corrupt', 'รูปแบบ Spot Wallet ไม่ถูกต้อง')
  }
  if (value.spotBalances) {
    for (const [asset, rawAmount] of Object.entries(value.spotBalances)) {
      if (!isAmount(rawAmount)) {
        throw new LocalDataError('corrupt', `ยอด ${asset} ใน Spot Wallet ไม่ถูกต้อง`)
      }
    }
  }

  const hasBalance = Object.hasOwn(value, 'balance')
  const hasSpotBalances = Object.hasOwn(value, 'spotBalances')
  const numericBalances = hasSpotBalances ? value.spotBalances : {}
  if (!hasBalance && Object.keys(numericBalances).length === 0) {
    throw new LocalDataError('corrupt', 'ไม่พบยอด wallet ที่ยืนยันได้ในข้อมูลบัญชี')
  }
  const spotBalances = { ...ZERO_SPOT_BALANCES, ...numericBalances }
  if (hasBalance && Object.hasOwn(numericBalances, 'THB') && spotBalances.THB !== value.balance) {
    throw new LocalDataError('corrupt', 'ยอด THB กับ balance ในข้อมูลบัญชีไม่ตรงกัน')
  }
  const balance = hasBalance ? value.balance : spotBalances.THB
  if (hasBalance) spotBalances.THB = balance

  const normalized = {
    ...value,
    transactions: value.transactions || [],
    portfolio: value.portfolio || [],
    balance,
    spotBalances,
    openOrders: migrateLegacyOpenOrders(value.openOrders ?? value.limitOrders ?? []),
    tradeHistory: value.tradeHistory || [],
    cancelledOrderIds: value.cancelledOrderIds || [],
    priceAlerts: value.priceAlerts || [],
    positions: value.positions || [],
  }
  return normalized
}

export function getLocalDataErrorMessage(status) {
  if (status === 'corrupt') return 'อ่านข้อมูลบัญชีไม่ได้เพราะข้อมูลเสีย ต้นฉบับยังไม่ถูกเขียนทับ กรุณาสำรองข้อมูลเดิมและตรวจสอบก่อนใช้งานต่อ'
  if (status === 'unavailable' || status === 'write-failed') return 'เข้าถึงหรือบันทึกข้อมูลในเบราว์เซอร์ไม่ได้ การเปลี่ยนแปลงล่าสุดอาจยังไม่ถูกเก็บถาวร'
  if (status === 'not-ready' || status === 'owner-mismatch') return 'ยังไม่บันทึกข้อมูล: กำลังโหลดหรือสลับบัญชี กรุณารอสักครู่แล้วลองใหม่'
  return 'ไม่สามารถจัดการข้อมูลบัญชีในเครื่องได้'
}

class AuthService {
  constructor() {
    this.lastStorageIssue = null
    this.initDatabase()
  }

  initDatabase() {
    const result = this.readUsersResult()
    // Initialize only when the key is genuinely absent. Corrupt/unreadable
    // storage is left byte-for-byte untouched for recovery.
    if (result.status === 'missing') {
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify([]))
      } catch (error) {
        this.lastStorageIssue = { status: 'write-failed', error }
      }
    } else if (result.status === 'corrupt' || result.status === 'unavailable') {
      this.lastStorageIssue = result
    }

    try {
      if (localStorage.getItem(CURRENT_USER_KEY) === DEFAULT_DEMO_USER.id) {
        localStorage.removeItem(CURRENT_USER_KEY)
      }
    } catch (error) {
      this.lastStorageIssue = { status: 'unavailable', error }
    }
  }

  readUsersResult() {
    const result = readJson(USERS_KEY)
    if (result.status !== 'loaded') return result
    if (!Array.isArray(result.value) || result.value.some((user) => !user || typeof user !== 'object' || Array.isArray(user))) {
      return { status: 'corrupt', error: new Error('users database has an invalid shape') }
    }
    return { status: 'loaded', value: result.value }
  }

  getUsers() {
    const result = this.readUsersResult()
    if (result.status === 'missing') return []
    if (result.status !== 'loaded') {
      this.lastStorageIssue = result
      throw new LocalDataError(result.status, getLocalDataErrorMessage(result.status), result.error)
    }

    let modified = false
    const users = result.value.map((user) => {
      if (!user.password) return user
      const sanitized = { ...user, passcodeHash: hashPasscode(user.password) }
      delete sanitized.password
      modified = true
      return sanitized
    })
    if (modified) {
      try {
        this.saveUsers(users)
      } catch (error) {
        this.lastStorageIssue = { status: 'write-failed', error }
      }
    }
    return users
  }

  hasUsers() {
    try {
      return this.getUsers().length > 0
    } catch {
      return false
    }
  }

  saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users))
      this.lastStorageIssue = null
      return true
    } catch (error) {
      this.lastStorageIssue = { status: 'write-failed', error }
      throw new LocalDataError('write-failed', getLocalDataErrorMessage('write-failed'), error)
    }
  }

  getCurrentUser() {
    let currentId
    try {
      currentId = localStorage.getItem(CURRENT_USER_KEY)
    } catch (error) {
      this.lastStorageIssue = { status: 'unavailable', error }
      return null
    }
    if (!currentId) return null
    try {
      const users = this.getUsers()
      return users.find((user) => user.id === currentId) || null
    } catch (error) {
      this.lastStorageIssue = { status: error.status || 'unavailable', error }
      return null
    }
  }

  getLastStorageIssue() {
    return this.lastStorageIssue
  }

  // Structured load result keeps missing, corrupt JSON, and blocked storage distinct.
  loadUserData(userId) {
    const key = userDataKey(userId)
    const result = readJson(key)
    if (result.status === 'missing') {
      return { ok: true, status: 'missing', data: makeZeroDemoData() }
    }
    if (result.status !== 'loaded') {
      this.lastStorageIssue = result
      return { ok: false, status: result.status, error: result.error }
    }
    try {
      return {
        ok: true,
        status: 'loaded',
        data: validateAndNormalizeUserData(result.value, { allowLegacyPortfolioCurrency: true }),
      }
    } catch (error) {
      this.lastStorageIssue = { status: 'corrupt', error }
      return { ok: false, status: 'corrupt', error }
    }
  }

  // Compatibility accessor: callers that require data get an explicit error instead
  // of silently receiving a fresh wallet over corrupt/unavailable source data.
  getUserData(userId) {
    const result = this.loadUserData(userId)
    if (!result.ok) throw new LocalDataError(result.status, getLocalDataErrorMessage(result.status), result.error)
    return result.data
  }

  saveUserData(userId, updates, guard = {}) {
    const ownerKey = userId || '__guest__'
    if (guard.requireLoadedOwner && !guard.dataLoaded) {
      return { ok: false, status: 'not-ready', error: new LocalDataError('not-ready', getLocalDataErrorMessage('not-ready')) }
    }
    if (guard.requireLoadedOwner && guard.loadedOwnerId !== ownerKey) {
      return { ok: false, status: 'owner-mismatch', error: new LocalDataError('owner-mismatch', getLocalDataErrorMessage('owner-mismatch')) }
    }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return { ok: false, status: 'corrupt', error: new LocalDataError('corrupt', 'ข้อมูลที่จะบันทึกไม่ถูกต้อง') }
    }

    const currentResult = this.loadUserData(userId)
    if (!currentResult.ok) return currentResult
    const updated = { ...currentResult.data, ...updates }
    const legacyPortfolioFingerprints = new Map(currentResult.data.portfolio
      .filter(isLegacyPortfolioAsset)
      .map((asset) => [`${typeof asset.id}:${String(asset.id)}`, legacyPortfolioFingerprint(asset)]))
    if (Object.hasOwn(updates, 'spotBalances') && !Object.hasOwn(updates, 'balance')) {
      updated.balance = Number(updated.spotBalances?.THB)
    } else if (Object.hasOwn(updates, 'balance') && !Object.hasOwn(updates, 'spotBalances')) {
      updated.spotBalances = { ...updated.spotBalances, THB: Number(updates.balance) }
    }
    try {
      // Validate the merged value before it can replace the only saved copy.
      const normalized = validateAndNormalizeUserData(updated, { legacyPortfolioFingerprints })
      localStorage.setItem(userDataKey(userId), JSON.stringify(normalized))
      this.lastStorageIssue = null
      return { ok: true, status: 'saved', data: normalized }
    } catch (error) {
      const status = error instanceof LocalDataError ? error.status : 'write-failed'
      this.lastStorageIssue = { status, error }
      return { ok: false, status, error }
    }
  }

  clearUserData(userId) {
    const cleanData = {
      transactions: [], portfolio: [], balance: 0,
      spotBalances: { ...ZERO_SPOT_BALANCES }, openOrders: [], tradeHistory: [],
      cancelledOrderIds: [], priceAlerts: [], positions: [],
    }
    const result = this.saveUserData(userId, cleanData)
    if (!result.ok) throw result.error || new LocalDataError(result.status, getLocalDataErrorMessage(result.status))
    return cleanData
  }

  clearUserTransactions(userId) {
    return this.saveUserData(userId, { transactions: [] })
  }

  clearUserPortfolio(userId) {
    return this.saveUserData(userId, { portfolio: [] })
  }

  loadSampleData(userId) {
    const sampleData = {
      transactions: INITIAL_TRANSACTIONS.map((transaction) => ({ ...transaction })),
      portfolio: INITIAL_PORTFOLIO.map((asset) => ({ ...asset })),
      balance: INITIAL_SPOT_BALANCES.THB,
      spotBalances: { ...INITIAL_SPOT_BALANCES },
      openOrders: INITIAL_OPEN_ORDERS.map((order) => ({ ...order })),
      tradeHistory: INITIAL_TRADE_HISTORY.map((trade) => ({ ...trade })),
      cancelledOrderIds: [],
      positions: INITIAL_POSITIONS.map((position) => ({ ...position })),
      priceAlerts: [],
    }
    const result = this.saveUserData(userId, sampleData)
    if (!result.ok) throw result.error || new LocalDataError(result.status, getLocalDataErrorMessage(result.status))
    return sampleData
  }

  register(name, identifier, password) {
    const users = this.getUsers()
    const cleanId = (identifier || '').trim().toLowerCase()
    if (!cleanId) throw new Error('กรุณาระบุชื่อบัญชีหรืออีเมล')
    if (!password || password.length < 4) throw new Error('กรุณากำหนดรหัสผ่านอย่างน้อย 4 ตัวอักษร')
    if (users.some((user) => user.email?.toLowerCase() === cleanId || user.username?.toLowerCase() === cleanId)) {
      throw new Error('ชื่อบัญชีหรืออีเมลนี้มีอยู่ในระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านเดิม')
    }

    const colors = [
      'from-emerald-500 to-teal-600', 'from-cyan-500 to-blue-600',
      'from-violet-500 to-purple-600', 'from-amber-500 to-orange-600',
      'from-rose-500 to-pink-600',
    ]
    const newUser = {
      // Date.now alone can collide when accounts are created in the same tick.
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: (name || '').trim() || cleanId,
      username: cleanId,
      email: cleanId.includes('@') ? cleanId : `${cleanId}@finntech.local`,
      passcodeHash: hashPasscode(password),
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      tier: 'DEMO PROFILE',
      isDemoProfile: true,
      createdAt: new Date().toISOString().split('T')[0],
      balance: INITIAL_SPOT_BALANCES.THB,
      positions: [], tradeHistory: [], transactions: [], portfolio: [],
    }

    users.push(newUser)
    this.saveUsers(users)
    const dataSave = this.saveUserData(newUser.id, makeNewDemoAccountData())
    if (!dataSave.ok) throw dataSave.error || new LocalDataError(dataSave.status, getLocalDataErrorMessage(dataSave.status))
    try {
      localStorage.setItem(CURRENT_USER_KEY, newUser.id)
    } catch (error) {
      this.lastStorageIssue = { status: 'write-failed', error }
      throw new LocalDataError('write-failed', getLocalDataErrorMessage('write-failed'), error)
    }
    return newUser
  }

  login(identifier, password) {
    const users = this.getUsers()
    const cleanId = (identifier || '').trim().toLowerCase()
    if (!cleanId || !password) throw new Error('กรุณากรอกชื่อบัญชี/อีเมล และรหัสผ่าน')
    const inputHash = hashPasscode(password)
    const user = users.find((candidate) => (
      (candidate.email?.toLowerCase() === cleanId || candidate.username?.toLowerCase() === cleanId || candidate.name?.toLowerCase() === cleanId) &&
      (candidate.passcodeHash === inputHash || (candidate.password && candidate.password === password))
    ))
    if (!user) throw new Error('ชื่อบัญชี/อีเมล หรือรหัสผ่านไม่ถูกต้อง กรุณาใช้รหัสผ่านเดิมที่คุณเคยตั้งไว้')
    const safeUser = { ...user }
    delete safeUser.password
    try {
      localStorage.setItem(CURRENT_USER_KEY, safeUser.id)
    } catch (error) {
      this.lastStorageIssue = { status: 'write-failed', error }
      throw new LocalDataError('write-failed', getLocalDataErrorMessage('write-failed'), error)
    }
    return safeUser
  }

  loginDemo() {
    const users = this.getUsers()
    let demo = users.find((user) => user.id === DEFAULT_DEMO_USER.id)
    const isNewDemoUser = !demo
    if (!demo) {
      demo = DEFAULT_DEMO_USER
      users.push(demo)
      this.saveUsers(users)
    }
    if (isNewDemoUser) {
      const dataSave = this.saveUserData(demo.id, makeNewDemoAccountData())
      if (!dataSave.ok) throw dataSave.error || new LocalDataError(dataSave.status, getLocalDataErrorMessage(dataSave.status))
    }
    try {
      localStorage.setItem(CURRENT_USER_KEY, demo.id)
    } catch (error) {
      this.lastStorageIssue = { status: 'write-failed', error }
      throw new LocalDataError('write-failed', getLocalDataErrorMessage('write-failed'), error)
    }
    return demo
  }

  logout() {
    try {
      localStorage.removeItem(CURRENT_USER_KEY)
      this.lastStorageIssue = null
      return { ok: true, status: 'logged-out' }
    } catch (error) {
      this.lastStorageIssue = { status: 'unavailable', error }
      return { ok: false, status: 'unavailable', error }
    }
  }

  updateProfile(userId, updates) {
    const users = this.getUsers()
    const idx = users.findIndex((user) => user.id === userId)
    if (idx === -1) return null
    users[idx] = { ...users[idx], ...updates }
    this.saveUsers(users)
    return users[idx]
  }
}

export const authService = new AuthService()
export default authService
