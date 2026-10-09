// Phase 1 read-only diagnostics: compiled code + synthetic fixtures, no DB/env loading.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ReferenceFxRelay } from '../apps/api/dist/tracker/fx.js'
import { backupDocumentSchema } from '../packages/contracts/dist/index.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = { error: 0, result: [{ symbol: 'USDT_THB', base_asset: 'USDT', quote_asset: 'THB', status: 'active' }] }

async function fxAnalysis() {
  const start = Date.parse('2026-10-07T00:00:00Z')
  let now = start, mode = 'valid', calls = 0
  const fetcher = async (url, options) => {
    calls++
    assert(options.signal instanceof AbortSignal)
    if (mode === 'timeout') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
    if (mode === '429') return new Response('{}', { status: 429 })
    return new Response(JSON.stringify(String(url).endsWith('symbols') ? metadata : [{ symbol: 'USDT_THB', last: mode === 'invalid' ? '0' : '33.620000000000000001' }]))
  }
  const relay = new ReferenceFxRelay(fetcher, () => now)
  const observations = []
  function observe(label) { const value = relay.snapshot(); observations.push({ label, elapsedMs: now - start, ...value, calls }); return value }
  assert.equal(observe('cold request returns before refresh').status, 'UNAVAILABLE')
  await relay.refresh()
  assert.equal(observe('after valid refresh').status, 'FRESH')
  mode = '429'; now += 15000
  observe('refresh due'); await relay.refresh()
  now += 15001
  const stale = observe('one failure makes next attempt wait 30s')
  assert.equal(stale.status, 'STALE'); assert.equal(stale.receivedAt, new Date(start).toISOString())
  const count = calls; await relay.refresh(); assert.equal(calls, count)
  mode = 'valid'; now = start + 45000
  assert.equal(observe('recovery request still returns old cache').status, 'STALE')
  await relay.refresh(); assert.equal(observe('recovery completed').status, 'FRESH')
  mode = 'invalid'; now += 15000; await relay.refresh()
  assert.equal(observe('invalid rate does not promote receipt time').receivedAt, new Date(start + 45000).toISOString())
  mode = 'timeout'; now += 30000
  const wall = performance.now()
  // Keep Node alive while testing AbortSignal.timeout's unref timer.
  const keepAlive = setInterval(() => {}, 1000)
  try { await relay.refresh() } finally { clearInterval(keepAlive) }
  const timeoutMs = Math.round(performance.now() - wall)
  assert(timeoutMs >= 4500 && timeoutMs < 8000)
  assert.equal(observe('timeout retains old timestamp').receivedAt, new Date(start + 45000).toISOString())
  console.log(JSON.stringify({ scope: 'synthetic compiled relay; no live-provider claim', timeoutMs, observations }, null, 2))
}

const fixture = backupDocumentSchema.parse({ format: 'FINNTECH_TRACKER_BACKUP', version: 2, provenance: 'USER_ENTERED', exportedAt: '2026-10-07T00:00:00.000Z',
  categories: [], transactions: [], budgets: [], portfolios: [], trades: [],
  cashAccounts: [{ id: '00000000-0000-4000-8000-000000000001', name: 'phase1 synthetic cash', balance: '123.45', currency: 'THB', asOf: '2026-10-07' }] })

if (process.argv[2] === 'fx') await fxAnalysis()
else if (process.argv[2] === 'download-fixture') {
  // Real compiled frontend with synthetic HTTP responses; never connects to owner DB/Auth.
  const dist = path.join(root, 'apps/web/dist')
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname
      let body
      if (pathname === '/api/health') body = { status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' } }
      else if (pathname === '/api/auth/get-session') body = { user: { name: 'PHASE 1 SYNTHETIC FIXTURE' } }
      else if (pathname === '/api/me') body = { ownerId: '00000000-0000-4000-8000-000000000001' }
      else if (pathname === '/api/backup') body = fixture
      else if (pathname === '/api/finance') body = { month: '2026-10', currency: 'THB', income: '0', expense: '0', balance: '0', categories: [], transactions: [], budgets: [] }
      else if (pathname === '/api/crypto') body = { quoteCurrency: 'USDT', portfolios: [], holdings: [], trades: [] }
      else if (pathname === '/api/crypto/market') body = { quotes: [] }
      else if (pathname.startsWith('/api/')) { res.writeHead(405); res.end('{}'); return }
      if (body) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); return }
      const file = pathname === '/' ? 'index.html' : pathname.slice(1)
      const target = path.resolve(dist, file)
      if (!target.startsWith(dist + path.sep)) { res.writeHead(404); res.end(); return }
      const data = await readFile(target)
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(data)
    } catch { res.writeHead(404); res.end() }
  })
  server.on('upgrade', (_request, socket) => socket.destroy())
  server.listen(4293, '127.0.0.1', () => console.log('Synthetic download fixture http://127.0.0.1:4293 (no DB/env; Ctrl+C stops)'))
  process.once('SIGINT', () => server.close())
  process.once('SIGTERM', () => server.close())
} else throw new Error('Use fx or download-fixture after npm run tracker:build')
