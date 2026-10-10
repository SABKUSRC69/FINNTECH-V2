import { z } from 'zod'
import {
  DecimalInputError,
  parseCryptoDecimal,
  parseThbDecimal,
  type FinanceDecimal,
} from '@finntech/finance'

const readinessStateSchema = z.enum(['not_configured', 'not_checked', 'ok', 'error'])

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('tracker-api'),
  checks: z.object({
    process: z.literal('ok'),
    database: readinessStateSchema,
    auth: readinessStateSchema,
  }),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const trackerApiPaths = {
  health: '/api/health',
} as const

type DecimalParser = (value: unknown) => FinanceDecimal
type DecimalRequirement = 'positive' | 'non_negative' | 'signed'

function decimalStringField(
  parser: DecimalParser,
  requirement: DecimalRequirement,
  label: string,
) {
  return z.string().superRefine((value, context) => {
    let parsed: FinanceDecimal
    try {
      parsed = parser(value)
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof DecimalInputError ? error.message : `Invalid ${label} decimal string`,
      })
      return
    }

    const meetsRequirement = requirement === 'positive'
      ? parsed.greaterThan('0')
      : requirement === 'non_negative' ? parsed.greaterThanOrEqualTo('0') : true
    if (!meetsRequirement) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: requirement === 'positive' ? `${label} must be greater than zero` : `${label} cannot be negative`,
      })
    }
  })
}

const positiveThbAmount = decimalStringField(parseThbDecimal, 'positive', 'THB amount')
const positiveCryptoAmount = decimalStringField(parseCryptoDecimal, 'positive', 'crypto amount')
const nonNegativeCryptoAmount = decimalStringField(parseCryptoDecimal, 'non_negative', 'crypto fee')

export const financeTransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: positiveThbAmount,
  currency: z.literal('THB'),
}).strict()

export type FinanceTransactionInput = z.infer<typeof financeTransactionInputSchema>

export const cryptoTradeInputSchema = z.object({
  side: z.enum(['buy', 'sell']),
  asset: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).transform((symbol) => symbol.toUpperCase()),
  quantity: positiveCryptoAmount,
  price: positiveCryptoAmount,
  fee: nonNegativeCryptoAmount,
  quoteCurrency: z.literal('USDT'),
}).strict()

export type CryptoTradeInput = z.infer<typeof cryptoTradeInputSchema>

// Dates describe the user's Thai calendar day; timezone conversion happens on the server.
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`)
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= '1900-01-01' && value <= '9999-12-31'
}, 'Invalid calendar date')
export const calendarMonthSchema = z.string().regex(/^\d{4}-\d{2}$/)
  .refine(value => calendarDateSchema.safeParse(`${value}-01`).success)
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(100), type: z.enum(['income', 'expense']),
}).strict()
export const categoryRenameSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict()
/** Category labels only: the starter action never creates amounts, transactions, budgets or trades. */
export const STARTER_CATEGORIES = {
  expense: ['อาหารและเครื่องดื่ม', 'เดินทาง', 'ที่พัก', 'ค่าน้ำไฟและอินเทอร์เน็ต', 'สุขภาพ', 'การศึกษา', 'ซื้อของ', 'อื่น ๆ'],
  // No 'investment income' label: sale proceeds already reach cash through the trade itself.
  income: ['เงินเดือน', 'งานเสริม', 'ปันผล / ดอกเบี้ย', 'ของขวัญ', 'อื่น ๆ'],
} as const
export const starterCategoriesInputSchema = z.object({}).strict()
export const cashSettlementSchema = z.object({ accountId: z.string().uuid(), amountThb: positiveThbAmount }).strict()
// Input form: the THB amount is omitted only for a record already included in the opening balance.
export const cashSettlementInputSchema = z.object({ accountId: z.string().uuid(), amountThb: positiveThbAmount.optional() }).strict()
/** true: dated before the account's opening date and already in that balance (no cash change). */
const openingBalanceField = { inOpeningBalance: z.boolean().optional() }
export const financeEntrySchema = financeTransactionInputSchema.extend({
  ...openingBalanceField, cashAccountId: z.string().uuid().nullable().optional(), attachmentId: z.string().uuid().optional(), categoryId: z.string().uuid(), date: calendarDateSchema, note: z.string().trim().max(500).default(''),
}).strict()
export const budgetInputSchema = z.object({
  categoryId: z.string().uuid(), month: calendarMonthSchema, amount: positiveThbAmount,
  currency: z.literal('THB'),
}).strict()
export const portfolioInputSchema = z.object({ name: z.string().trim().min(1).max(100), quoteCurrency: z.literal('USDT') }).strict()
export const tradeEntrySchema = cryptoTradeInputSchema.extend({
  ...openingBalanceField, cashSettlement: cashSettlementInputSchema.nullable().optional(), attachmentId: z.string().uuid().optional(), portfolioId: z.string().uuid(), date: calendarDateSchema,
}).strict()
const correctionReasonSchema = z.string().trim().min(1).max(500)
export const financeCorrectionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('replace'), reason: correctionReasonSchema, entry: financeEntrySchema }).strict(),
  z.object({ action: z.literal('void'), reason: correctionReasonSchema }).strict(),
])
// A correction stays in its original portfolio/asset; there is no transfer operation.
export const tradeCorrectionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('replace'), reason: correctionReasonSchema,
    entry: tradeEntrySchema.omit({ portfolioId: true, asset: true }).strict(),
  }).strict(),
  z.object({ action: z.literal('void'), reason: correctionReasonSchema }).strict(),
])
export const resourceIdSchema = z.string().uuid()
export const idempotencyKeySchema = z.string().uuid()

export const categoryViewSchema = z.object({ id: resourceIdSchema, name: z.string(), type: z.enum(['income', 'expense']) })
const correctionViewFields = {
  voidedAt: z.string().datetime().nullable().default(null),
  voidReason: z.string().nullable().default(null),
}
export const financeOverviewSchema = z.object({
  month: calendarMonthSchema, currency: z.literal('THB'),
  income: z.string(), expense: z.string(), balance: z.string(),
  categories: z.array(categoryViewSchema),
  transactions: z.array(z.object({ id: resourceIdSchema, type: z.enum(['income', 'expense']), amount: z.string(), date: calendarDateSchema, note: z.string(), cashAccountId: resourceIdSchema.nullable().optional(), ...openingBalanceField, categoryId: resourceIdSchema, ...correctionViewFields })),
  budgets: z.array(z.object({ id: resourceIdSchema, categoryId: resourceIdSchema, amount: z.string(), spent: z.string(), remaining: z.string() })),
})
export type FinanceOverview = z.infer<typeof financeOverviewSchema>
export type FinanceEntry = z.infer<typeof financeEntrySchema>
export const cryptoOverviewSchema = z.object({
  quoteCurrency: z.literal('USDT'), portfolios: z.array(z.object({ id: resourceIdSchema, name: z.string() })),
  holdings: z.array(z.object({ portfolioId: resourceIdSchema, asset: z.string(), quantity: z.string(), totalCost: z.string().nullable(), realizedPnl: z.string().nullable() })),
  trades: z.array(z.object({ ...openingBalanceField, cashSettlement: cashSettlementSchema.nullable().optional(), id: resourceIdSchema, portfolioId: resourceIdSchema, asset: z.string(), side: z.enum(['buy', 'sell']), quantity: z.string(), price: z.string(), fee: z.string(), realizedPnl: z.string().nullable(), date: calendarDateSchema, ...correctionViewFields })),
})
export type CryptoOverview = z.infer<typeof cryptoOverviewSchema>
export const providerMetadataSchema = z.object({ symbols: z.array(z.object({ symbol: z.string(), baseAsset: z.string(), quoteAsset: z.string(), status: z.string(),isSpotTradingAllowed:z.boolean().optional() })) })
export const providerPriceSchema = z.object({ symbol: z.string(), price: positiveCryptoAmount })
export const marketSnapshotSchema = z.object({ quotes: z.array(z.object({
  asset: z.string().regex(/^[A-Z0-9]{1,20}$/), price: positiveCryptoAmount.nullable(),
  status: z.enum(['LIVE', 'STALE', 'UNAVAILABLE']), receivedAt: z.string().datetime().nullable(), source: z.literal('Binance public'),
  observedAt: z.string().datetime().nullable().optional(), kind: z.enum(['TRADE', 'REST_SNAPSHOT']).optional(), quoteCurrency: z.literal('USDT').optional(),
})).max(7), catalog: z.array(z.object({asset:z.string(),symbol:z.string(),quoteCurrency:z.literal('USDT'),available:z.boolean()})).max(7).optional() })
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>

// USD price observations are separate from the USDT ledger; this is a watchlist, not ownership.
export const stockSymbolSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,14}$/)
  .transform(symbol => symbol.toUpperCase())
// Last-trade valuation only (never bid/ask/midpoint). AUTH_FAILED / NOT_ENTITLED / CONNECTION_LIMIT are
// provider answers, distinct from NOT_CONFIGURED (no server keys) and from a closed market session.
export const stockMarketSnapshotSchema = z.object({
  source: z.literal('Alpaca IEX'), currency: z.literal('USD'),
  connection: z.enum(['NOT_CONFIGURED', 'CONNECTING', 'STREAMING', 'UNAVAILABLE', 'AUTH_FAILED', 'NOT_ENTITLED', 'CONNECTION_LIMIT']),
  session: z.enum(['REGULAR', 'CLOSED']).optional(),
  excluded: z.array(stockSymbolSchema).max(200).optional(),
  quotes: z.array(z.object({
    symbol: stockSymbolSchema, price: positiveCryptoAmount.nullable(),
    status: z.enum(['LIVE', 'STALE', 'CLOSED', 'UNAVAILABLE']),
    observedAt: z.string().nullable(), receivedAt: z.string().datetime().nullable(),
  })).max(30),
})
export type StockMarketSnapshot = z.infer<typeof stockMarketSnapshotSchema>

export const cashInputSchema = z.object({ name: z.string().trim().min(1).max(100),
  balance: decimalStringField(parseThbDecimal, 'non_negative', 'cash balance'), currency: z.literal('THB'), asOf: calendarDateSchema }).strict()
export const cashUpdateSchema = cashInputSchema.extend({ expectedVersion: z.number().int().positive().max(2147483646) }).strict()
export const cashOverviewSchema = z.object({ accounts: z.array(cashInputSchema.extend({ id: resourceIdSchema, version: z.number().int().positive() })) })
export type CashOverview = z.infer<typeof cashOverviewSchema>
export const referenceRateSchema = z.object({ base: z.literal('USDT'), quote: z.literal('THB'),
  rate: positiveCryptoAmount.nullable(), receivedAt: z.string().datetime().nullable(), status: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
  source: z.literal('Bitkub public'), kind: z.literal('LAST_PRICE_SNAPSHOT'),
})
export type ReferenceRate = z.infer<typeof referenceRateSchema>

// Bounded US instrument identity catalog, separate from following a market price.
export const STOCK_INSTRUMENTS = [
  { symbol:'AAPL', name:'Apple Inc.', kind:'STOCK' }, { symbol:'MSFT', name:'Microsoft Corporation', kind:'STOCK' },
  { symbol:'NVDA', name:'NVIDIA Corporation', kind:'STOCK' }, { symbol:'AMZN', name:'Amazon.com Inc.', kind:'STOCK' },
  { symbol:'GOOGL', name:'Alphabet Class A', kind:'STOCK' }, { symbol:'TSLA', name:'Tesla Inc.', kind:'STOCK' },
  { symbol:'SPY', name:'SPDR S&P 500 ETF Trust', kind:'ETF' }, { symbol:'QQQ', name:'Invesco QQQ Trust', kind:'ETF' },
] as const
export const stockPortfolioInputSchema = portfolioInputSchema.omit({quoteCurrency:true}).extend({quoteCurrency:z.literal('USD')}).strict()
export const stockTradeEntrySchema = tradeEntrySchema.omit({quoteCurrency:true,asset:true}).extend({
  quoteCurrency:z.literal('USD'), symbol:stockSymbolSchema.refine(symbol=>STOCK_INSTRUMENTS.some(row=>row.symbol===symbol),'Unsupported instrument identity'), note:z.string().trim().max(500).default(''),
}).strict()
export const stockCorrectionSchema = z.discriminatedUnion('action',[
 z.object({action:z.literal('replace'),reason:correctionReasonSchema,entry:stockTradeEntrySchema.omit({portfolioId:true,symbol:true}).strict()}).strict(),
 z.object({action:z.literal('void'),reason:correctionReasonSchema}).strict(),
])
export const stockOverviewSchema = z.object({quoteCurrency:z.literal('USD'),portfolios:z.array(z.object({id:resourceIdSchema,name:z.string()})),
 holdings:z.array(z.object({portfolioId:resourceIdSchema,symbol:stockSymbolSchema,quantity:z.string(),totalCost:z.string(),realizedPnl:z.string()})),
 trades:z.array(stockTradeEntrySchema.extend({cashSettlement:cashSettlementSchema.nullable().optional(),id:resourceIdSchema,realizedPnl:z.string(),...correctionViewFields})),
})
export type StockOverview = z.infer<typeof stockOverviewSchema>
const manualAssetFields = z.object({name:z.string().trim().min(1).max(100),type:z.enum(['GOLD','PROPERTY','OTHER']),currency:z.enum(['THB','USD','USDT']),
 quantity:nonNegativeCryptoAmount.nullable(),unit:z.string().trim().max(32),cost:nonNegativeCryptoAmount.nullable(),value:nonNegativeCryptoAmount,date:calendarDateSchema,note:z.string().trim().max(500).default(''),
}).strict()
const refineManualAsset=(v:z.infer<typeof manualAssetFields>,c:z.RefinementCtx)=>{if(v.quantity!==null&&!v.unit)c.addIssue({code:'custom',message:'Quantity needs a unit'});if(v.currency==='THB'){for(const value of [v.value,v.cost])if(value!==null&&!decimalStringField(parseThbDecimal,'non_negative','THB').safeParse(value).success)c.addIssue({code:'custom',message:'THB scale exceeded'})}}
export const manualAssetInputSchema=manualAssetFields.superRefine(refineManualAsset)
export const manualAssetUpdateSchema = z.object({asset:manualAssetInputSchema,expectedVersion:z.number().int().positive().max(2147483646)}).strict()
export const manualAssetStatusSchema = z.object({archived:z.boolean(),expectedVersion:z.number().int().positive().max(2147483646)}).strict()
export const manualAssetOverviewSchema = z.object({assets:z.array(manualAssetFields.extend({id:resourceIdSchema,version:z.number().int().positive(),archived:z.boolean().default(false)}).superRefine(refineManualAsset))})
export type ManualAssetOverview = z.infer<typeof manualAssetOverviewSchema>

// USDTHB is a rate (THB per USD); instrument prices are USD per share.
const referenceSymbolSchema=z.enum(['USDTHB',...STOCK_INSTRUMENTS.map(r=>r.symbol)] as ['USDTHB', ...string[]])
const referenceTimeSchema=z.string().datetime().refine(v=>{try{return new Date(v).toISOString()===v}catch{return false}},'Use canonical UTC milliseconds')
const referenceFields=z.object({symbol:referenceSymbolSchema,currency:z.enum(['USD','THB']),value:positiveCryptoAmount,
 source:z.literal('MANUAL'),asOf:referenceTimeSchema,updatedAt:referenceTimeSchema,enabled:z.boolean()}).strict()
const referenceCurrency=(v:{symbol:string;currency:string})=>v.currency===(v.symbol==='USDTHB'?'THB':'USD')
export const valuationReferenceInputSchema=referenceFields.omit({source:true,updatedAt:true}).extend({expectedVersion:z.number().int().positive().max(2147483646).nullable()}).strict().refine(referenceCurrency,'Reference currency mismatch')
export const valuationReferenceSchema=referenceFields.extend({id:resourceIdSchema,version:z.number().int().positive()}).refine(referenceCurrency)
export type ValuationReference=z.infer<typeof valuationReferenceSchema>
export const dailyUsdRateSchema=z.object({source:z.literal('ECB'),kind:z.literal('DAILY'),status:z.enum(['DAILY','STALE','MISSING','ERROR']),rate:positiveCryptoAmount.nullable(),asOf:z.string().datetime().nullable(),receivedAt:z.string().datetime().nullable()})
export type DailyUsdRate=z.infer<typeof dailyUsdRateSchema>
// Shared end-of-day closes fetched by the server (never by the browser, never with a browser key).
// `close` is the unadjusted official close per share for `tradingDate` (New York). Freshness is
// judged in trading sessions by @finntech/finance assessDailyClose, never by the 30 s live rule.
// provider: NOT_CONFIGURED = no server key/licence; NOT_LICENSED = licence does not cover this account.
export const dailyCloseQuoteSchema=z.object({symbol:stockSymbolSchema,currency:z.literal('USD'),priceType:z.literal('CLOSE'),
 close:positiveCryptoAmount.nullable(),tradingDate:calendarDateSchema.nullable(),fetchedAt:z.string().datetime().nullable(),
 status:z.enum(['CURRENT','DELAYED','STALE','MISSING','ERROR']),
 problem:z.enum(['AUTH_FAILED','RATE_LIMITED','NOT_FOUND','UNAVAILABLE','INVALID_DATA','NOT_YET_PUBLISHED','BUDGET_EXHAUSTED']).nullable()}).strict()
export const dailyCloseSnapshotSchema=z.object({provider:z.enum(['NOT_CONFIGURED','READY','NOT_LICENSED']),
 source:z.string().max(64).nullable(),license:z.enum(['REDISTRIBUTION','PERSONAL']).nullable(),expectedSession:calendarDateSchema,
 attribution:z.object({label:z.string().max(64),url:z.string().url().max(200)}).nullable(),
 // SERVER: shared licensed key. ACCOUNT: this account's own personal key (data never shown to others).
 keySource:z.enum(['SERVER','ACCOUNT']).optional(),
 // Free personal data is request-scoped on the server and held only by the active browser view.
 retention:z.enum(['TRANSIENT','PERSISTENT']).optional(),keyVersion:z.number().int().positive().nullable().optional(),
 quotes:z.array(dailyCloseQuoteSchema).max(STOCK_INSTRUMENTS.length)}).strict()
// A personal provider key: sent once over HTTPS to this server, stored encrypted, never returned.
export const marketKeyInputSchema=z.object({provider:z.literal('TIINGO'),token:z.string().trim().regex(/^[A-Za-z0-9]{20,128}$/),
 confirmPersonalUse:z.literal(true),expectedVersion:z.number().int().positive().max(2147483646).nullable()}).strict()
export const marketKeyRemoveSchema=z.object({expectedVersion:z.number().int().positive().max(2147483646)}).strict()
export const marketKeyStatusSchema=z.object({available:z.boolean(),provider:z.literal('TIINGO'),status:z.enum(['NONE','ACTIVE','REMOVED']),
 hint:z.string().regex(/^[A-Za-z0-9]{4}$/).nullable(),updatedAt:z.string().datetime().nullable(),version:z.number().int().positive().nullable()}).strict()
export type MarketKeyStatus=z.infer<typeof marketKeyStatusSchema>
export type DailyCloseSnapshot=z.infer<typeof dailyCloseSnapshotSchema>
export type DailyCloseQuote=z.infer<typeof dailyCloseQuoteSchema>
export const valuationOverviewSchema=z.object({references:z.array(valuationReferenceSchema).max(STOCK_INSTRUMENTS.length+1),usdThb:dailyUsdRateSchema,dailyCloses:dailyCloseSnapshotSchema.optional()})
export type ValuationOverview=z.infer<typeof valuationOverviewSchema>

// Chosen from measurements on a 0.1 CPU / 512 MB container (Render Free): at 5,000 mixed rows export
// took ~19 s, restore ~47 s and peak memory ~285 MiB; 20,000 rows was not safe on that CPU budget.
// See docs/acceptance/claude-fix-release-20261009.md before raising either value.
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024
export const BACKUP_MAX_ROWS = 5000
const backupTimestamp = z.string().datetime().refine(value => {
  try { return new Date(value).toISOString() === value } catch { return false }
}, 'Timestamp must use canonical UTC milliseconds')
const backupId = resourceIdSchema.refine(value => value === value.toLowerCase(), 'ID must be lowercase')
const backupCancellation = { voidedAt: backupTimestamp.nullable(), voidReason: correctionReasonSchema.nullable() }
const pairedCancellation = (value: { voidedAt: string | null; voidReason: string | null }) => (value.voidedAt === null) === (value.voidReason === null)
const backupFields = z.object({
  format: z.literal('FINNTECH_TRACKER_BACKUP'), version: z.literal(1), provenance: z.literal('USER_ENTERED'), exportedAt: backupTimestamp,
  categories: z.array(categoryInputSchema.extend({ id: backupId }).strict()).max(BACKUP_MAX_ROWS),
  transactions: z.array(financeEntrySchema.omit({attachmentId:true}).extend({ id: backupId, createdAt: backupTimestamp, ...backupCancellation }).strict().refine(pairedCancellation)).max(BACKUP_MAX_ROWS),
  budgets: z.array(budgetInputSchema.extend({ id: backupId }).strict()).max(BACKUP_MAX_ROWS),
  portfolios: z.array(portfolioInputSchema.extend({ id: backupId }).strict()).max(BACKUP_MAX_ROWS),
  trades: z.array(tradeEntrySchema.omit({attachmentId:true}).extend({ cashSettlement: cashSettlementSchema.nullable().optional(), id: backupId, createdAt: backupTimestamp, ...backupCancellation,
    accounting: z.object({ gross: nonNegativeCryptoAmount.nullable(), costRemoved: nonNegativeCryptoAmount.nullable(), realizedPnl: decimalStringField(parseCryptoDecimal, 'signed', 'crypto P&L').nullable() }).strict(),
  }).strict().refine(pairedCancellation)).max(BACKUP_MAX_ROWS),
}).strict()
const refineBackup = (value: Omit<z.infer<typeof backupFields>, "version">, context: z.RefinementCtx) => {
  const groups = [value.categories, value.transactions, value.budgets, value.portfolios, value.trades]
  if (groups.reduce((sum, rows) => sum + rows.length, 0) > BACKUP_MAX_ROWS) context.addIssue({ code: 'custom', message: 'Backup row limit exceeded' })
  for (const rows of groups) if (new Set(rows.map(row => row.id)).size !== rows.length) context.addIssue({ code: 'custom', message: 'Duplicate source row ID' })
  const categories = new Map(value.categories.map(row => [row.id, row]))
  const portfolios = new Set(value.portfolios.map(row => row.id))
  for (const row of value.transactions) if (categories.get(row.categoryId)?.type !== row.type) context.addIssue({ code: 'custom', message: 'Invalid category reference/type' })
  for (const row of value.budgets) if (categories.get(row.categoryId)?.type !== 'expense') context.addIssue({ code: 'custom', message: 'Budget requires an expense category' })
  for (const row of value.trades) if (!portfolios.has(row.portfolioId)) context.addIssue({ code: 'custom', message: 'Invalid portfolio reference' })
  for (const names of [value.categories.map(row => `${row.type}\0${row.name}`), value.portfolios.map(row => row.name), value.budgets.map(row => `${row.categoryId}\0${row.month}`)]) {
    if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', message: 'Conflicting unique names or budgets' })
  }
  if (new Set(value.trades.map(row => row.asset)).size > 128) context.addIssue({ code: 'custom', message: 'Asset limit exceeded' })
}
const refineCashLinks=(v:{transactions:{cashAccountId?:string|null|undefined;inOpeningBalance?:boolean|undefined}[];trades:{cashSettlement?:z.infer<typeof cashSettlementSchema>|null|undefined;inOpeningBalance?:boolean|undefined}[];cashAccounts?:{id:string}[];stockTrades?:{cashSettlement?:z.infer<typeof cashSettlementSchema>|null|undefined;inOpeningBalance?:boolean|undefined}[]},c:z.RefinementCtx)=>{
 const ids=new Set((v.cashAccounts??[]).map(row=>row.id))
 // A record already in an opening balance moved no money, so it never carries a cash link.
 for(const row of v.transactions)if(row.inOpeningBalance&&row.cashAccountId)c.addIssue({code:'custom',message:'Opening-balance record cannot be linked'})
 for(const row of [...v.trades,...(v.stockTrades??[])])if(row.inOpeningBalance&&row.cashSettlement)c.addIssue({code:'custom',message:'Opening-balance trade cannot be settled'})
 for(const row of v.transactions)if(row.cashAccountId&&!ids.has(row.cashAccountId))c.addIssue({code:'custom',message:'Invalid cash account reference'})
 for(const row of [...v.trades,...(v.stockTrades??[])])if(row.cashSettlement&&!ids.has(row.cashSettlement.accountId))c.addIssue({code:'custom',message:'Invalid settlement account reference'})
}
const backupV1Schema = backupFields.superRefine(refineBackup).superRefine(refineCashLinks)
const backupV2Schema = backupFields.omit({ version: true }).extend({ version: z.literal(2), cashAccounts: z.array(cashInputSchema.extend({ id: backupId }).strict()).max(BACKUP_MAX_ROWS) }).superRefine(refineBackup).superRefine(refineCashLinks).superRefine((value, context) => {
  if (value.cashAccounts.length + value.categories.length + value.transactions.length + value.budgets.length + value.portfolios.length + value.trades.length > BACKUP_MAX_ROWS) context.addIssue({ code: 'custom', message: 'Backup row limit exceeded' })
  if (new Set(value.cashAccounts.map(row => row.id)).size !== value.cashAccounts.length || new Set(value.cashAccounts.map(row => row.name)).size !== value.cashAccounts.length) context.addIssue({ code: 'custom', message: 'Duplicate cash accounts' })
})
const stockBackupTradeSchema = stockTradeEntrySchema.omit({attachmentId:true}).extend({cashSettlement:cashSettlementSchema.nullable().optional(),id:backupId,createdAt:backupTimestamp,...backupCancellation,
 accounting:z.object({gross:nonNegativeCryptoAmount,costRemoved:nonNegativeCryptoAmount,realizedPnl:decimalStringField(parseCryptoDecimal,'signed','USD P&L')}).strict(),
}).strict().refine(pairedCancellation)
const backupAssetFields = backupFields.omit({version:true}).extend({
 cashAccounts:z.array(cashInputSchema.extend({id:backupId}).strict()).max(BACKUP_MAX_ROWS),
 stockPortfolios:z.array(stockPortfolioInputSchema.extend({id:backupId}).strict()).max(BACKUP_MAX_ROWS),
 stockTrades:z.array(stockBackupTradeSchema).max(BACKUP_MAX_ROWS),
 manualAssets:z.array(z.object({id:backupId,asset:manualAssetInputSchema,archived:z.boolean().default(false)}).strict()).max(BACKUP_MAX_ROWS),
})
const refineAssetBackup=(v:z.infer<typeof backupAssetFields>,c:z.RefinementCtx)=>{
 const groups=[v.categories,v.transactions,v.budgets,v.portfolios,v.trades,v.cashAccounts,v.stockPortfolios,v.stockTrades,v.manualAssets]
 if(groups.reduce((n,rows)=>n+rows.length,0)>BACKUP_MAX_ROWS)c.addIssue({code:'custom',message:'Backup row limit exceeded'})
 for(const rows of groups)if(new Set(rows.map(row=>row.id)).size!==rows.length)c.addIssue({code:'custom',message:'Duplicate ID'})
 for(const names of [v.cashAccounts.map(row=>row.name),v.stockPortfolios.map(row=>row.name),v.manualAssets.map(row=>row.asset.name)])if(new Set(names).size!==names.length)c.addIssue({code:'custom',message:'Duplicate name'})
 const portfolios=new Set(v.stockPortfolios.map(row=>row.id));for(const row of v.stockTrades)if(!portfolios.has(row.portfolioId))c.addIssue({code:'custom',message:'Invalid USD portfolio reference'})
}
const backupV3Schema=backupAssetFields.extend({version:z.literal(3)}).superRefine(refineBackup).superRefine(refineAssetBackup).superRefine(refineCashLinks)
const backupV4Schema=backupAssetFields.extend({version:z.literal(4),valuationReferences:z.array(referenceFields.extend({id:backupId}).refine(referenceCurrency)).max(STOCK_INSTRUMENTS.length+1)}).superRefine(refineBackup).superRefine(refineAssetBackup).superRefine(refineCashLinks).superRefine((v,c)=>{
 const refs=v.valuationReferences
 if(new Set(refs.map(r=>r.id)).size!==refs.length||new Set(refs.map(r=>r.symbol)).size!==refs.length)c.addIssue({code:'custom',message:'Duplicate reference'})
 if([v.categories,v.transactions,v.budgets,v.portfolios,v.trades,v.cashAccounts,v.stockPortfolios,v.stockTrades,v.manualAssets,refs].reduce((n,r)=>n+r.length,0)>BACKUP_MAX_ROWS)c.addIssue({code:'custom',message:'Backup row limit exceeded'})
})
export const backupDocumentSchema = z.union([backupV1Schema, backupV2Schema,backupV3Schema,backupV4Schema])
export type BackupDocument = z.infer<typeof backupDocumentSchema>
export const backupSummarySchema = z.object({
  counts: z.object({ categories: z.number().int(), transactions: z.number().int(), cancelledTransactions: z.number().int(), budgets: z.number().int(), portfolios: z.number().int(), trades: z.number().int(), cancelledTrades: z.number().int() }),
  months: z.array(z.object({ month: calendarMonthSchema, income: z.string(), expense: z.string(), balance: z.string() })),
  holdings: z.array(z.object({ portfolioId: resourceIdSchema, asset: z.string(), quantity: z.string(), totalCost: z.string(), realizedPnl: z.string() })),
  cash: z.array(cashInputSchema).default([]),
  stockCounts:z.object({portfolios:z.number().int(),trades:z.number().int(),cancelledTrades:z.number().int(),manualAssets:z.number().int()}).default({portfolios:0,trades:0,cancelledTrades:0,manualAssets:0}),
  stockHoldings:z.array(z.object({portfolioId:resourceIdSchema,symbol:stockSymbolSchema,quantity:z.string(),totalCost:z.string(),realizedPnl:z.string()})).default([]),
  manual:z.array(manualAssetInputSchema).default([]),
  references:z.array(referenceFields.refine(referenceCurrency)).default([]),
})
export const backupPreviewSchema = z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), canRestore: z.boolean(), summary: backupSummarySchema })
export const backupRestoreSchema = z.object({ backup: backupDocumentSchema, previewDigest: z.string().regex(/^[0-9a-f]{64}$/), consent: z.literal(true) }).strict()
export type BackupSummary = z.infer<typeof backupSummarySchema>
export type BackupPreview = z.infer<typeof backupPreviewSchema>
export const mediaReferenceSchema = z.object({mediaId:resourceIdSchema.nullable()}).strict()
export const avatarWriteSchema = mediaReferenceSchema.extend({preset:z.enum(['leaf','moon','book']).nullable(),expectedVersion:z.number().int().min(0)}).strict().refine(v=>!(v.mediaId&&v.preset))
export const mediaDiscardSchema = z.object({}).strict()
