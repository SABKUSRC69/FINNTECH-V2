import path from 'node:path'
import { createApp } from './app.js'
import { readAuthConfiguration } from './auth/config.js'
import { createAuthRuntime } from './auth/runtime.js'
import { createTrackerDatabase } from './persistence/database.js'
import { MarketRelay } from './tracker/market.js'
import { attachMarketStream } from './tracker/stream.js'
import { readStockConfiguration, StockMarketRelay, type StockConfiguration } from './tracker/stocks.js'
import { DAILY_CLOSE_ENV, DailyCloseRelay, MemoryDailyCloseStore, TiingoDailyProvider, prismaDailyCloseStore, readDailyCloseConfiguration, type DailyCloseConfiguration } from './tracker/daily-close.js'
import { MarketKeyCipher, PersonalDailyCloses } from './tracker/market-keys.js'
import { RecoveryService } from './auth/recovery.js'
import { LocalSyntheticSink, drainDelivery, drainRealDelivery } from './auth/delivery.js'
import { BrevoDeliverySink } from './auth/mail.js'
import { assertRealBoundary } from './auth/real.js'
import { authSubjectAllowed } from './auth/authorization.js'
import { readListenerConfiguration } from './runtime-config.js'

const { host, port } = readListenerConfiguration(process.env)
const webDistDir = process.env.WEB_DIST_DIR
  ? path.resolve(process.cwd(), process.env.WEB_DIST_DIR)
  : undefined

const authConfig = readAuthConfiguration(process.env)
if ((authConfig?.beta || authConfig?.real?.boundary === 'real') && !webDistDir) throw new Error('Cloud runtime requires compiled WEB_DIST_DIR')
const database = authConfig ? createTrackerDatabase(authConfig.databaseUrl) : undefined
if (database && authConfig?.real) {
  try { await assertRealBoundary(database, authConfig.real, authConfig.origin) }
  catch {
    // Driver errors may contain connection details; never emit the original exception.
    console.error('Real-use startup boundary unavailable or rejected; details withheld')
    await database.$disconnect().catch(() => {})
    process.exit(1)
  }
}
const recovery = database && authConfig?.recovery ? new RecoveryService(database, authConfig) : undefined
const auth = recovery?.auth ?? (database && authConfig ? createAuthRuntime(database, authConfig) : undefined)
const market = authConfig?.recovery?.mode === 'synthetic-3a' || authConfig?.real?.boundary === 'real-rehearsal'
  ? new MarketRelay(async () => { throw new Error('synthetic_provider_disabled') }) : new MarketRelay()
// A partial or invalid Alpaca setup disables only the stock feed (sanitized log), never the whole site.
let stockConfiguration: StockConfiguration | null = null
try { stockConfiguration = readStockConfiguration(process.env) }
catch {
  const present = ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY', 'ALPACA_OWNER_ID', 'ALPACA_PERSONAL_USE'].filter(name => process.env[name])
  console.error(`Alpaca IEX disabled: incomplete or invalid configuration (present: ${present.join(', ') || 'none'}); values withheld`)
}
const stockOwnerId = stockConfiguration?.ownerId
const stocks = new StockMarketRelay(stockConfiguration, fetch, Date.now, undefined,
  database && stockOwnerId ? async () => (await database.stockHolding.findMany({ where: { ownerId: stockOwnerId, quantity: { gt: 0 } }, select: { symbol: true } })).map(row => row.symbol) : null)
if (stockConfiguration) console.info(`Alpaca IEX configured for one owner; ${stockConfiguration.symbols.length} watchlist symbols (feed=iex)`)
// Daily closes: same pattern — misconfiguration disables only this feed, and only variable names are logged.
let dailyConfiguration: DailyCloseConfiguration | null = null
try { dailyConfiguration = readDailyCloseConfiguration(process.env) }
catch {
  const present = DAILY_CLOSE_ENV.filter(name => process.env[name])
  console.error(`Daily close feed disabled: incomplete or invalid configuration (present: ${present.join(', ') || 'none'}); values withheld`)
}
const persistentDailyConfiguration = dailyConfiguration?.license === 'REDISTRIBUTION' ? dailyConfiguration : null
// Only an explicitly licensed shared feed may use durable price storage.
if (database && !persistentDailyConfiguration) {
  const removed = await database.dailyClosePrice.deleteMany({ where: { source: 'Tiingo EOD' } })
  console.info('Transient Tiingo pricing: cleared ' + removed.count + ' legacy provider cache row(s); accounting and keys untouched')
}
const dailyCloses = new DailyCloseRelay(persistentDailyConfiguration, persistentDailyConfiguration ? new TiingoDailyProvider(persistentDailyConfiguration.token) : null,
  database ? prismaDailyCloseStore(database) : new MemoryDailyCloseStore())
if (dailyConfiguration) console.info(`Daily close feed configured (Tiingo EOD, ${dailyConfiguration.license === 'REDISTRIBUTION' ? 'all signed-in accounts' : 'one owner only'}; ${dailyConfiguration.symbols.length} symbols; budget ${dailyConfiguration.maxRequestsPerHour}/h ${dailyConfiguration.maxRequestsPerDay}/day)`)
market.start()
dailyCloses.start()
// Personal keys are encrypted with a key derived from the existing auth secret (no extra secret).
const personalCloses = database && authConfig ? new PersonalDailyCloses(database, new MarketKeyCipher(authConfig.secret), undefined, undefined, undefined, undefined,
  dailyConfiguration?.license === 'PERSONAL' ? dailyConfiguration : null) : undefined
const app = createApp({ market, stocks, dailyCloses, ...(personalCloses ? { personalCloses } : {}), ...(recovery ? { recovery } : {}), ...(webDistDir ? { webDistDir } : {}), ...(database && auth ? { database, auth } : {}) })
const server = app.listen(port, host, () => {
  console.log(`FINNTECH tracker API listening at http://${host}:${port}`)
  // One authentication probe per process start so operators can confirm entitlement in the logs; the
  // relay disconnects again after 60 s without an owner request (no keepalive traffic).
  if (stockConfiguration) void stocks.snapshot()
})
const stopMarket = auth && database ? attachMarketStream(server, auth, market, stocks, async authUserId => {
  const identity = await database.authIdentity.findUnique({ where: { authUserId }, include: { owner: true } })
  return identity && identity.provider === 'better-auth' && identity.subject === authUserId
    && identity.verifiedAt && identity.owner.identityState === 'VERIFIED' ? identity.ownerId : null
}, authUserId => authSubjectAllowed(auth, database, authUserId)) : undefined
let draining = false
let lastDeliveryWarning = 0
const recoverySettings = authConfig?.recovery
const sink = recoverySettings ? (recoverySettings.mode === 'synthetic-3a' ? new LocalSyntheticSink(recoverySettings.sinkDirectory)
  : new BrevoDeliverySink(recoverySettings.mail, recoverySettings.key, authConfig!.origin)) : undefined
const deliveryTimer = database && authConfig?.recovery ? setInterval(() => {
  if (draining) return
  draining = true
  if (authConfig.real?.boundary === 'real-rehearsal') { draining = false; return }
  void (authConfig.real ? drainRealDelivery(database, sink!, authConfig.real) : drainDelivery(database, sink!))
    .then(result => { if (['FAILED', 'QUOTA_PAUSED'].includes(result) && Date.now() - lastDeliveryWarning >= 60000) {
      lastDeliveryWarning = Date.now(); console.error('Recovery delivery paused or unconfirmed; operator action required; details withheld')
    } })
    .catch(() => { console.error('Recovery delivery unavailable: details withheld') })
    .finally(() => { draining = false })
}, 1000) : undefined
deliveryTimer?.unref()
// Long enough to receive a maximum-size backup upload on a slow connection; headers stay bounded.
server.requestTimeout = 60000
server.headersTimeout = 10000
server.keepAliveTimeout = 5000

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Tracker API port ${port} is already in use`)
  } else {
    console.error(`Tracker API failed to listen: ${error.code ?? 'unknown error'}`)
  }
  process.exitCode = 1
})

function shutdown(signal: string): void {
  stopMarket?.()
  if (deliveryTimer) clearInterval(deliveryTimer)
  stocks.stop()
  dailyCloses.stop()
  market.stop()
  console.log(`Received ${signal}; stopping tracker API`)
  server.close(() => { void (database?.$disconnect() ?? Promise.resolve()).finally(() => process.exit(0)) })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
