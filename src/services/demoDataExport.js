const EXPORT_SCHEMA = 'finntech-demo-data-export'
const EXPORT_VERSION = 1

const SECTION_FIELDS = {
  transactions: ['id', 'date', 'type', 'category', 'categoryName', 'amount', 'note'],
  portfolio: ['id', 'name', 'symbol', 'currency', 'type', 'typeName', 'shares', 'avgBuyPrice', 'currentPrice', 'color'],
  openOrders: [
    'id', 'symbol', 'side', 'orderType', 'price', 'amount', 'total', 'fee',
    'baseAsset', 'quoteAsset', 'targetPrice', 'status', 'lockedAsset',
    'lockedAmount', 'lockedFee', 'lockVersion', 'placedAt', 'legacyLockUnverified',
  ],
  tradeHistory: ['id', 'orderId', 'symbol', 'side', 'orderType', 'price', 'amount', 'total', 'fee', 'executedAt', 'status'],
  priceAlerts: ['id', 'symbol', 'condition', 'targetPrice', 'note', 'createdAt'],
}

const SUPPORTED_ASSETS = ['THB', 'BTC', 'ETH', 'SOL', 'USDT', 'BNB', 'XRP', 'DOGE']
const VALID_SECTIONS = ['transactions', 'portfolio', 'paperWallet', 'paperTrading', 'priceAlerts']

function pickWhitelistedFields(row, fields) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const safe = {}
  for (const field of fields) {
    const value = row[field]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[field] = value
    }
  }
  return safe
}

function safeRows(data, field) {
  if (!Array.isArray(data?.[field])) return []
  return data[field]
    .map((row) => pickWhitelistedFields(row, SECTION_FIELDS[field]))
    .filter(Boolean)
}

function safeOrigin(sourceOrigin) {
  if (typeof sourceOrigin !== 'string') return undefined
  try {
    return new URL(sourceOrigin).origin
  } catch {
    return undefined
  }
}

/** Build a portable, user-selected export without mutating its source snapshot. */
export function createDemoDataExport(data, selectedSections, { exportedAt = new Date().toISOString(), sourceOrigin } = {}) {
  const sections = [...new Set(Array.isArray(selectedSections) ? selectedSections : [])]
    .filter((section) => VALID_SECTIONS.includes(section))
  const selectedData = {}

  for (const section of sections) {
    if (section === 'transactions') selectedData.transactions = safeRows(data, 'transactions')
    if (section === 'portfolio') selectedData.portfolio = safeRows(data, 'portfolio')
    if (section === 'paperWallet') {
      const rawBalances = data?.spotBalances && typeof data.spotBalances === 'object' && !Array.isArray(data.spotBalances)
        ? data.spotBalances
        : {}
      const spotBalances = Object.fromEntries(SUPPORTED_ASSETS
        .filter((asset) => Number.isFinite(Number(rawBalances[asset])) && Number(rawBalances[asset]) >= 0)
        .map((asset) => [asset, Number(rawBalances[asset])]))
      selectedData.paperWallet = {
        balance: Number.isFinite(Number(data?.balance)) && Number(data.balance) >= 0 ? Number(data.balance) : null,
        spotBalances,
      }
    }
    if (section === 'paperTrading') {
      selectedData.paperTrading = {
        openOrders: safeRows(data, 'openOrders'),
        tradeHistory: safeRows(data, 'tradeHistory'),
        cancelledOrderIds: Array.isArray(data?.cancelledOrderIds)
          ? data.cancelledOrderIds.filter((id) => typeof id === 'string' || typeof id === 'number')
          : [],
      }
    }
    if (section === 'priceAlerts') selectedData.priceAlerts = safeRows(data, 'priceAlerts')
  }

  const exportFile = {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    mode: 'PAPER_DEMO',
    exportedAt,
    selectedSections: sections,
    data: selectedData,
  }
  const origin = safeOrigin(sourceOrigin)
  if (origin) exportFile.sourceOrigin = origin
  return exportFile
}

export const DEMO_EXPORT_SECTIONS = Object.freeze([
  { id: 'transactions', label: 'รายการรายรับ-รายจ่าย' },
  { id: 'portfolio', label: 'สินทรัพย์ในพอร์ต' },
  { id: 'paperWallet', label: 'ยอด Spot Wallet จำลอง' },
  { id: 'paperTrading', label: 'คำสั่งและประวัติเทรดจำลอง' },
  { id: 'priceAlerts', label: 'การแจ้งเตือนราคา' },
])
