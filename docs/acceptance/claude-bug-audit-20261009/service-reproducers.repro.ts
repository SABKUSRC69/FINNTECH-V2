// Service-level reproducers run against the audit's throwaway PostgreSQL (127.0.0.1:5448).
// Run: node node_modules/tsx/dist/cli.mjs --test docs/acceptance/claude-bug-audit-20261009/service-reproducers.repro.ts
// (named *.repro.ts so the root `npm test` vitest run does not collect it without its database)
// Requires DATABASE_URL for the audit portfolio container and FINNTECH_PORTFOLIO_TEST=synthetic-only.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import sharp from 'sharp'
import { portfolioTestTarget } from '../../../scripts/portfolio-db-target.mjs'
import { createTrackerDatabase } from '../../../apps/api/src/persistence/database.js'
import { createPortfolio, createTrade, correctTrade, createCategory } from '../../../apps/api/src/tracker/service.js'
import { exportBackup, restoreBackup, prepareBackup } from '../../../apps/api/src/tracker/backup.js'
import { stageImage } from '../../../apps/api/src/media/store.js'
import { MarketRelay } from '../../../apps/api/src/tracker/crypto-stream.js'
import { valueAssets, valueMixedAssets } from '@finntech/finance'
import { selectReference } from '../../../apps/web/src/tracker/valuationPolicy.js'

const target = portfolioTestTarget(process.env)
const db = createTrackerDatabase(target.href), blocker = createTrackerDatabase(target.href)
const evidence: Record<string, unknown> = {}
after(async () => {
  fs.writeFileSync('docs/acceptance/claude-bug-audit-20261009/service-reproducers.json', JSON.stringify(evidence, null, 2))
  await db.$disconnect(); await blocker.$disconnect()
})
const owner = async () => (await db.trackerUser.create({ data: { identityState: 'VERIFIED' } })).id
const trade = (portfolioId: string, side: 'buy' | 'sell', quantity: string, extra: object = {}) =>
  ({ portfolioId, asset: 'BTC', side, quantity, price: '100', fee: '0', quoteCurrency: 'USDT', date: '2026-10-01', ...extra })
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('R1 lock-order inversion: correction with a new receipt vs. new trade in the same portfolio', async () => {
  const me = await owner()
  const portfolio = (await createPortfolio(db, me, randomUUID(), { name: 'Deadlock', quoteCurrency: 'USDT' })).id as string
  const original = (await createTrade(db, me, randomUUID(), trade(portfolio, 'buy', '1'))).id as string
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#abcdef' } }).png().toBuffer()
  const media = (await stageImage(db, me, randomUUID(), png, 'image/png', 'RECEIPT')).id as string
  // A third session briefly holds the original trade row so T1 owns the portfolio lock before T2 starts.
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const holder = blocker.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM crypto_trades WHERE id = ${original}::uuid FOR UPDATE`
    await held
  }, { timeout: 20000 })
  await sleep(300)
  const t1 = correctTrade(db, me, original, randomUUID(), { action: 'replace', reason: 'fix price', entry: { side: 'buy', quantity: '1', price: '101', fee: '0', quoteCurrency: 'USDT', date: '2026-10-01', attachmentId: media } })
  await sleep(500)
  const t2 = createTrade(db, me, randomUUID(), trade(portfolio, 'buy', '0.1'))
  await sleep(500)
  release(); await holder
  const results = await Promise.allSettled([t1, t2])
  const summary = results.map(r => r.status === 'fulfilled' ? 'ok' : `${(r.reason as { code?: string }).code ?? ''} ${String((r.reason as Error).message).match(/deadlock|lock timeout|40P01|55P03/i)?.[0] ?? (r.reason as Error).name}`)
  evidence.R1 = summary
  assert.ok(results.some(r => r.status === 'rejected'), `expected one transaction aborted by lock inversion, got ${JSON.stringify(summary)}`)
})

test('R2 backup hard cap: 2,001 ordinary rows make export impossible', async () => {
  const me = await owner()
  const category = (await createCategory(db, me, randomUUID(), { name: 'Daily', type: 'expense' })).id as string
  await db.financeTransaction.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ ownerId: me, categoryId: category, type: 'EXPENSE' as const, amount: '10.00', currency: 'THB', occurredAt: new Date(Date.UTC(2025, 0, 1) + i * 4 * 3600000), note: '' })) })
  // 1 category + 2,000 entries ≈ 400 days at five entries/day.
  const outcome = await exportBackup(db, me).then(() => 'exported', (error: { code?: string; status?: number }) => `${error.status} ${error.code}`)
  evidence.R2 = { rows: 2001, outcome }
  assert.equal(outcome, '413 BACKUP_TOO_LARGE')
})

test('R3 per-write replay cost grows with history; large restore timing', async () => {
  const me = await owner()
  const portfolio = (await createPortfolio(db, me, randomUUID(), { name: 'DCA', quoteCurrency: 'USDT' })).id as string
  const asset = await db.cryptoAsset.upsert({ where: { symbol: 'BTC' }, create: { symbol: 'BTC' }, update: {} })
  const timings: Record<string, number> = {}
  let seeded = 0
  for (const size of [10, 300, 1000, 1990]) {
    const add = size - seeded
    await db.cryptoTrade.createMany({ data: Array.from({ length: add }, (_, i) => ({ ownerId: me, portfolioId: portfolio, assetId: asset.id, quoteCurrency: 'USDT', side: 'BUY' as const, quantity: '0.001', price: '100', fee: '0', occurredAt: new Date(Date.UTC(2024, 0, 1) + (seeded + i) * 3600000), createdAt: new Date(Date.UTC(2024, 0, 1) + (seeded + i) * 3600000) })) })
    seeded = size
    const started = performance.now()
    await createTrade(db, me, randomUUID(), trade(portfolio, 'buy', '0.001', { date: '2026-10-09' }))
    seeded += 1
    timings[`createTrade_with_${size}_prior`] = Math.round(performance.now() - started)
  }
  const exported = await exportBackup(db, me)
  const plan = prepareBackup(exported)
  const fresh = await owner()
  const started = performance.now()
  const restored = await restoreBackup(db, fresh, randomUUID(), { backup: exported, previewDigest: plan.digest, consent: true }).then(() => 'restored', (e: Error & { code?: string }) => `${e.code ?? e.name}: ${e.message.slice(0, 80)}`)
  timings.restore_ms = Math.round(performance.now() - started)
  const rtt: number[] = []
  for (let i = 0; i < 20; i++) { const s = performance.now(); await db.$queryRaw`SELECT 1`; rtt.push(performance.now() - s) }
  evidence.R3 = { timings, restored, localRoundTripMs: Number((rtt.sort((a, b) => a - b)[10]!).toFixed(2)), tradesInScope: seeded }
})

test('R4 one failing crypto REST ticker prevents later symbols from receiving REST prices', async () => {
  const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA'].map(a => `${a}USDT`)
  const fetcher = (async (url: string) => {
    if (url.includes('exchangeInfo')) return new Response(JSON.stringify({ symbols: symbols.map(symbol => ({ symbol, baseAsset: symbol.slice(0, -4), quoteAsset: 'USDT', status: 'TRADING' })) }))
    if (url.includes('symbol=BTCUSDT')) return new Response('{}', { status: 500 })
    const symbol = new URL(url).searchParams.get('symbol')!
    return new Response(JSON.stringify({ symbol, price: '1.5' }))
  }) as typeof fetch
  const relay = new MarketRelay(fetcher)
  await relay.snapshot(); await sleep(50)
  const snapshot = await relay.snapshot()
  const priced = snapshot.quotes.filter(q => q.price !== null).map(q => q.asset)
  evidence.R4 = { priced, unavailable: snapshot.quotes.filter(q => q.price === null).map(q => q.asset) }
  assert.deepEqual(priced, [], 'only BTC failed, yet no other symbol received a REST price')
})

test('R5 deterministic valuation: 0.5 share × 200 USD × 35 = 3,500 THB; missing inputs keep total unavailable', () => {
  const now = Date.parse('2026-10-09T12:00:00.000Z'), asOf = '2026-10-09T11:00:00.000Z'
  const ref = (symbol: string, currency: string, value: string) => ({ id: randomUUID(), symbol, currency, source: 'MANUAL', value, asOf, updatedAt: asOf, enabled: true, version: 1 })
  const missingFx = { source: 'ECB', kind: 'DAILY', status: 'MISSING', rate: null, asOf: null, receivedAt: null } as const
  const base = valueAssets([], [], new Map(), null)
  const run = (references: ReturnType<typeof ref>[]) => {
    const overview = { references, usdThb: missingFx } as never
    const price = selectReference('AAPL', overview, null, now), fx = selectReference('USDTHB', overview, null, now)
    const prices = new Map(price.value === null ? [] : [['AAPL', price.value] as [string, string]])
    const result = valueMixedAssets(base, [{ quantity: '0.5', symbol: 'AAPL' }], prices, [], null, fx.value)
    return { totalThb: result.totalThb, knownThb: result.knownThb, usd: result.knownNative.USD, priceState: price.state, fxState: fx.state }
  }
  const complete = run([ref('AAPL', 'USD', '200'), ref('USDTHB', 'THB', '35')])
  const noPrice = run([ref('USDTHB', 'THB', '35')])
  const noFx = run([ref('AAPL', 'USD', '200')])
  evidence.R5 = { complete, noPrice, noFx }
  assert.equal(complete.totalThb, '3500')
  assert.equal(noPrice.totalThb, null); assert.equal(noPrice.priceState, 'MISSING')
  assert.equal(noFx.totalThb, null); assert.equal(noFx.usd, '100'); assert.equal(noFx.fxState, 'MISSING')
})
