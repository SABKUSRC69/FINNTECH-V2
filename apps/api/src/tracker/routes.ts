import { Router, json } from 'express'
import { DecimalInputError, LedgerError } from '@finntech/finance'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { AuthRuntime } from '../auth/runtime.js'
import { requireOwner, type OwnerContext } from '../auth/authorization.js'
import { createCategory, addStarterCategories, renameCategory, createEntry, correctEntry, setBudget, createPortfolio, createTrade, correctTrade, financeOverview, cryptoOverview, TrackerError } from './service.js'
import { MarketRelay } from './market.js'
import type { StockMarketRelay } from './stocks.js'
import { BACKUP_MAX_BYTES } from '@finntech/contracts'
import { exportBackup, previewBackup, restoreBackup } from './backup.js'
import { cashOverview, createCash, updateCash } from './cash.js'
import { ReferenceFxRelay } from './fx.js'
import { createStockPortfolio,createStockTrade,correctStockTrade,stockOverview } from './stock-ledger.js'
import { manualAssets,createManualAsset,updateManualAsset,setManualAssetStatus } from './manual-assets.js'
import { valuationReferences,saveValuationReference } from './valuation-references.js'
import { DailyUsdRelay } from './usd-fx.js'
import { DailyCloseRelay, MemoryDailyCloseStore } from './daily-close.js'
import type { PersonalDailyCloses } from './market-keys.js'
import { demoFor } from '../auth/demo.js'

export function trackerRouter(auth: AuthRuntime, database: PrismaClient, market = new MarketRelay(), stocks?: StockMarketRelay, fx = new ReferenceFxRelay(), usd = new DailyUsdRelay(), daily = new DailyCloseRelay(null, null, new MemoryDailyCloseStore()), personal?: PersonalDailyCloses): Router {
  const router = Router()
  const normalJson = json({ limit: '64kb' }), backupJson = json({ limit: BACKUP_MAX_BYTES + 1024 })
  router.use((req, _res, next) => {
    const readable = req.method === 'GET' && ['/finance', '/crypto', '/crypto/market', '/stocks/market', '/backup', '/cash', '/reference-rate'].includes(req.path)
    const writable = req.method === 'POST' && ['/finance/categories', '/finance/categories/starter', '/finance/transactions', '/finance/budgets', '/crypto/portfolios', '/crypto/trades', '/backup/preview', '/backup/restore', '/cash'].includes(req.path)
    const rename = req.method === 'PATCH' && /^\/finance\/categories\/[^/]+$/.test(req.path)
    const correction = req.method === 'POST' && /^\/(finance\/transactions|crypto\/trades)\/[^/]+\/corrections$/.test(req.path)
    const assetRead=req.method==='GET'&&['/stocks','/assets/manual','/valuation/references','/valuation/daily-close','/market-key'].includes(req.path)
    const assetWrite=req.method==='POST'&&['/stocks/portfolios','/stocks/trades','/assets/manual','/valuation/references','/market-key','/market-key/remove'].includes(req.path)
    const stockCorrection=req.method==='POST'&&/^\/stocks\/trades\/[^/]+\/corrections$/.test(req.path)
    const manualUpdate=req.method==='PATCH'&&/^\/assets\/manual\/[^/]+(?:\/status)?$/.test(req.path)
    if (readable || writable || rename || correction || assetRead||assetWrite||stockCorrection||manualUpdate||(req.method === 'PATCH' && /^\/cash\/[^/]+$/.test(req.path))) next()
    else next('router')
  })
  router.use(requireOwner(auth, database))
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (request.method !== 'GET' && request.headers.origin !== auth.options.baseURL) {
      response.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN' } }); return
    }
    next()
  })
  router.use((req, res, next) => (req.path === '/backup/preview' || req.path === '/backup/restore' ? backupJson : normalJson)(req, res, next))
  router.get('/backup', async (_req, res) => {
    res.set('Content-Disposition', 'attachment; filename="finntech-tracker-backup.json"')
    res.json(await exportBackup(database, (res.locals.owner as OwnerContext).ownerId))
  })
  router.post('/backup/preview', async (req, res) => { res.json(await previewBackup(database, (res.locals.owner as OwnerContext).ownerId, req.body)) })
  router.post('/backup/restore', async (req, res) => { res.json(await restoreBackup(database, (res.locals.owner as OwnerContext).ownerId, req.headers['idempotency-key'], req.body)) })
  router.get('/finance', async (req, res) => { res.json(await financeOverview(database, (res.locals.owner as OwnerContext).ownerId, req.query.month)) })
  router.get('/crypto', async (_req, res) => { res.json(await cryptoOverview(database, (res.locals.owner as OwnerContext).ownerId)) })
  router.get('/crypto/market', async (_req, res) => { res.json(await market.snapshot()) })
  router.get('/cash', async (_req, res) => { res.json(await cashOverview(database, (res.locals.owner as OwnerContext).ownerId)) })
  router.get('/stocks',async(_req,res)=>{res.json(await stockOverview(database,(res.locals.owner as OwnerContext).ownerId))})
  router.get('/assets/manual',async(_req,res)=>{res.json(await manualAssets(database,(res.locals.owner as OwnerContext).ownerId))})
  // Personal provider keys are never stored for demo workspaces (as with media uploads).
  const keys=()=>demoFor(auth)?undefined:personal
  // Shared daily closes are filtered per account by the provider licence, never by client input.
  router.get('/valuation/references',async(_req,res)=>{const owner=(res.locals.owner as OwnerContext).ownerId;res.set('Cache-Control','no-store');res.json({references:await valuationReferences(database,owner),usdThb:usd.snapshot(),dailyCloses:(await keys()?.describe(owner))??await daily.snapshotFor(owner)})})
  // Explicit read operation. Its prices are not persisted or retained by the personal provider.
  router.get('/valuation/daily-close',async(_req,res)=>{const owner=(res.locals.owner as OwnerContext).ownerId;res.set('Cache-Control','no-store');res.json((await keys()?.snapshotFor(owner))??await daily.snapshotFor(owner))})
  // Personal provider key: write-only. Responses carry only status and the last four characters.
  router.get('/market-key',async(_req,res)=>{const owner=(res.locals.owner as OwnerContext).ownerId,store=keys();res.json(store?await store.status(owner):{available:false,provider:'TIINGO',status:'NONE',hint:null,updatedAt:null,version:null})})
  router.post('/market-key',async(req,res)=>{const store=keys();if(!store)throw new TrackerError('MARKET_KEY_UNAVAILABLE',422);res.json(await store.save((res.locals.owner as OwnerContext).ownerId,req.headers['idempotency-key'],req.body))})
  router.post('/market-key/remove',async(req,res)=>{const store=keys();if(!store)throw new TrackerError('MARKET_KEY_UNAVAILABLE',422);res.json(await store.remove((res.locals.owner as OwnerContext).ownerId,req.headers['idempotency-key'],req.body))})
  router.post('/valuation/references',async(req,res)=>{res.json(await saveValuationReference(database,(res.locals.owner as OwnerContext).ownerId,req.headers['idempotency-key'],req.body))})
  router.post('/assets/manual',async(req,res)=>{res.json(await createManualAsset(database,(res.locals.owner as OwnerContext).ownerId,req.headers['idempotency-key'],req.body))})
  router.patch('/assets/manual/:id',async(req,res)=>{res.json(await updateManualAsset(database,(res.locals.owner as OwnerContext).ownerId,req.params.id,req.headers['idempotency-key'],req.body))})
  router.patch('/assets/manual/:id/status',async(req,res)=>{res.json(await setManualAssetStatus(database,(res.locals.owner as OwnerContext).ownerId,req.params.id,req.headers['idempotency-key'],req.body))})
  router.post('/stocks/trades/:id/corrections',async(req,res)=>{const owner=(res.locals.owner as OwnerContext).ownerId;res.json(await correctStockTrade(database,owner,req.params.id,req.headers['idempotency-key'],req.body));stocks?.holdingsChanged(owner)})
  router.post('/cash', async (req, res) => { res.json(await createCash(database, (res.locals.owner as OwnerContext).ownerId, req.headers['idempotency-key'], req.body)) })
  router.patch('/cash/:id', async (req, res) => { res.json(await updateCash(database, (res.locals.owner as OwnerContext).ownerId, req.params.id, req.headers['idempotency-key'], req.body)) })
  router.get('/reference-rate', async (_req, res) => { res.set('Cache-Control','no-store'); res.json(await fx.current()) })
  router.get('/stocks/market', async (_req, res) => {
    if (!stocks) { res.status(503).json({ error: { code: 'STOCK_NOT_CONFIGURED' } }); return }
    if (!stocks.allowsOwner((res.locals.owner as OwnerContext).ownerId)) {
      res.status(403).json({ error: { code: 'STOCK_ACCESS_REQUIRED' } }); return
    }
    res.json(await stocks.snapshot())
  })
  for (const [path, operation] of [
    ['/finance/categories', createCategory], ['/finance/categories/starter', addStarterCategories], ['/finance/transactions', createEntry], ['/finance/budgets', setBudget],
    ['/crypto/portfolios', createPortfolio], ['/crypto/trades', createTrade],
    ['/stocks/portfolios',createStockPortfolio],['/stocks/trades',createStockTrade],
  ] as const) {
    router.post(path, async (req, res) => {
      const owner = (res.locals.owner as OwnerContext).ownerId
      res.json(await operation(database, owner, req.headers['idempotency-key'], req.body))
      // A newly held symbol is subscribed on the next relay request instead of after the 60 s refresh.
      if (path === '/stocks/trades') stocks?.holdingsChanged(owner)
    })
  }
  router.patch('/finance/categories/:id', async (req, res) => { res.json(await renameCategory(database, (res.locals.owner as OwnerContext).ownerId, req.params.id, req.headers['idempotency-key'], req.body)) })
  router.post('/finance/transactions/:id/corrections', async (req, res) => { res.json(await correctEntry(database, (res.locals.owner as OwnerContext).ownerId, req.params.id, req.headers['idempotency-key'], req.body)) })
  router.post('/crypto/trades/:id/corrections', async (req, res) => { res.json(await correctTrade(database, (res.locals.owner as OwnerContext).ownerId, req.params.id, req.headers['idempotency-key'], req.body)) })
  router.use((error: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
    const parseStatus = error !== null && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (!(error instanceof TrackerError) && (parseStatus === 413 || parseStatus === 400)) { res.status(parseStatus).json({ error: { code: parseStatus === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST' } }); return }
    if (error instanceof TrackerError) { res.status(error.status).json({ error: { code: error.code } }); return }
    if (error instanceof LedgerError) { res.status(422).json({ error: { code: error.code === 'oversell' ? 'OVERSELL' : 'INVALID_TRADE' } }); return }
    if (error instanceof DecimalInputError || (error instanceof Error && error.name === 'ZodError')) { res.status(422).json({ error: { code: 'INVALID_INPUT' } }); return }
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'P2002') { res.status(409).json({ error: { code: 'NAME_CONFLICT' } }); return }
    // Lock/connection/timeouts have unknown commit outcomes: retry the same key.
    res.status(503).json({ error: { code: 'STORAGE_UNAVAILABLE' } })
  })
  return router
}
