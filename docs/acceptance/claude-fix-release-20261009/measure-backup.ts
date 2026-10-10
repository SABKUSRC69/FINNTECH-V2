// Measures export / preview / restore of mixed synthetic datasets against the production image
// running at --cpus 0.1 --memory 512m. Also probes /api/health latency during each restore to show
// the effect on other users. Run from the repository root with tsx.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createTrackerDatabase } from '../../../apps/api/src/persistence/database.js'
import { evidence, origin, databaseUrl } from './env.mjs'

const db = createTrackerDatabase(databaseUrl)
const password = randomUUID() + randomUUID()
const sizes = (process.argv[2] ?? '5000,10000,20000').split(',').map(Number)
type Jar = { cookie: string }
async function call(jar: Jar, method: string, route: string, body?: unknown, timeout = 180000) {
  const started = performance.now()
  const response = await fetch(`${origin}/api/${route}`, { method, signal: AbortSignal.timeout(timeout),
    headers: { Origin: origin, Cookie: jar.cookie, 'Idempotency-Key': randomUUID(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const set = response.headers.getSetCookie().find(s => s.startsWith('finntech.session_token='))
  if (set) jar.cookie = set.split(';')[0]!
  const text = await response.text()
  return { status: response.status, ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(text), body: text ? JSON.parse(text) : null }
}
async function account(label: string) {
  const jar = { cookie: '' }
  const r = await call(jar, 'POST', 'auth/sign-up/email', { name: label, email: `${label}-${randomUUID()}@example.test`, password })
  if (r.status !== 200) throw new Error(`signup ${r.status}`)
  return { jar, ownerId: (await call(jar, 'GET', 'me')).body.ownerId as string }
}
function memorySampler() {
  let peak = 0
  const child = spawn('docker', ['stats', 'claude-fix-app', '--format', '{{.MemUsage}}'], { windowsHide: true })
  child.stdout.on('data', chunk => {
    for (const match of String(chunk).matchAll(/([\d.]+)(MiB|GiB)\s*\//g)) peak = Math.max(peak, Number(match[1]) * (match[2] === 'GiB' ? 1024 : 1))
  })
  return { stop: () => { child.kill(); return Math.round(peak) } }
}
async function healthDuring<T>(work: Promise<T>) {
  let done = false, worst = 0
  const probe = (async () => { while (!done) { const s = performance.now(); try { await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(120000) }) } catch { /* recorded as latency */ } worst = Math.max(worst, performance.now() - s); await new Promise(r => setTimeout(r, 1000)) } })()
  const result = await work; done = true; await probe
  return { result, worstHealthMs: Math.round(worst) }
}

const results: unknown[] = []
for (const size of sizes) {
  const source = await account(`measure-src-${size}`), target = await account(`measure-dst-${size}`)
  const category = (await call(source.jar, 'POST', 'finance/categories', { name: 'Daily', type: 'expense' })).body.id
  const crypto = (await call(source.jar, 'POST', 'crypto/portfolios', { name: 'Main', quoteCurrency: 'USDT' })).body.id
  const stock = (await call(source.jar, 'POST', 'stocks/portfolios', { name: 'US', quoteCurrency: 'USD' })).body.id
  const asset = await db.cryptoAsset.upsert({ where: { symbol: 'BTC' }, create: { symbol: 'BTC' }, update: {} })
  const [txCount, cryptoCount] = [Math.floor(size * 0.6), Math.floor(size * 0.3)]
  const stockCount = size - txCount - cryptoCount - 12
  const at = (i: number) => new Date(Date.UTC(2021, 0, 1) + i * 3 * 3600000)
  await db.financeTransaction.createMany({ data: Array.from({ length: txCount }, (_, i) => ({ ownerId: source.ownerId, categoryId: category, type: 'EXPENSE' as const, amount: `${(i % 900) + 1}.50`, currency: 'THB', occurredAt: at(i), note: i % 4 ? '' : 'synthetic lunch with friends' })) })
  await db.cryptoTrade.createMany({ data: Array.from({ length: cryptoCount }, (_, i) => ({ ownerId: source.ownerId, portfolioId: crypto, assetId: asset.id, quoteCurrency: 'USDT', side: (i % 10 === 9 ? 'SELL' : 'BUY') as 'BUY' | 'SELL', quantity: '0.0001', price: String(30000 + (i % 97)), fee: '0.01', occurredAt: at(i), createdAt: at(i) })) })
  await db.stockTrade.createMany({ data: Array.from({ length: stockCount }, (_, i) => ({ ownerId: source.ownerId, portfolioId: stock, symbol: 'AAPL', quoteCurrency: 'USD', side: (i % 10 === 9 ? 'SELL' : 'BUY') as 'BUY' | 'SELL', quantity: '0.1', price: String(150 + (i % 13)), fee: '0', note: '', gross: '0', costRemoved: '0', realizedPnl: '0', occurredAt: at(i), createdAt: at(i) })) })
  // One normal write per ledger replays the seeded scopes through the production code path.
  const settleCrypto = await call(source.jar, 'POST', 'crypto/trades', { portfolioId: crypto, asset: 'BTC', side: 'buy', quantity: '0.0001', price: '30000', fee: '0', quoteCurrency: 'USDT', date: '2026-10-09' })
  const settleStock = await call(source.jar, 'POST', 'stocks/trades', { portfolioId: stock, symbol: 'AAPL', side: 'buy', quantity: '0.1', price: '150', fee: '0', quoteCurrency: 'USD', date: '2026-10-09', note: '' })
  const appendCrypto = await call(source.jar, 'POST', 'crypto/trades', { portfolioId: crypto, asset: 'BTC', side: 'buy', quantity: '0.0001', price: '30000', fee: '0', quoteCurrency: 'USDT', date: '2026-10-09' })
  const memory = memorySampler()
  const exported = await call(source.jar, 'GET', 'backup')
  const preview = exported.status === 200 ? await call(target.jar, 'POST', 'backup/preview', exported.body) : null
  const restore = preview?.status === 200 ? await healthDuring(call(target.jar, 'POST', 'backup/restore', { backup: exported.body, previewDigest: preview.body.digest, consent: true })) : null
  const peakMiB = memory.stop()
  const row = { size, rows: { transactions: txCount, crypto: cryptoCount + 2, stock: stockCount + 1 },
    firstReplayAfterSeed: { crypto: [settleCrypto.status, settleCrypto.ms], stock: [settleStock.status, settleStock.ms] }, appendTradeMs: [appendCrypto.status, appendCrypto.ms],
    export: [exported.status, exported.ms, exported.bytes], preview: preview && [preview.status, preview.ms],
    restore: restore && [restore.result.status, restore.result.ms, restore.result.body?.error?.code ?? 'ok'], worstHealthDuringRestoreMs: restore?.worstHealthMs, peakContainerMiB: peakMiB }
  results.push(row); console.log(JSON.stringify(row))
  fs.writeFileSync(path.join(evidence, 'backup-measurements.json'), JSON.stringify({ container: { cpus: 0.1, memory: '512m', image: 'finntech-audit-fix:local (Dockerfile.real)' }, database: 'local PostgreSQL 18 (no Neon network latency)', results }, null, 2))
}
await db.$disconnect()
