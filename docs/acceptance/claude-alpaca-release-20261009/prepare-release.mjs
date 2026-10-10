// Copies the 11 Alpaca runtime files into the clean release checkout at 41d2985. A pre-copy diff of all
// runtime directories proved these are the only files that differ, so no release-only work is overwritten.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = 'C:/Users/Admin/Downloads/FINNTECH'
const release = path.join(root, '.student-real-20261008.local/release-source')
const evidence = path.join(root, 'docs/acceptance/claude-alpaca-release-20261009')
const expectedHead = '41d2985ea872e244d369073120ac51461f06b608'
const git = args => { const r = spawnSync('git', args, { cwd: release, encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw new Error(`git ${args[0]} failed`); return r.stdout.trim() }
if (git(['rev-parse', 'HEAD']) !== expectedHead || git(['status', '--porcelain']) || git(['branch', '--show-current']) !== 'codex/student-real-use'
  || git(['remote', 'get-url', 'origin']) !== 'https://github.com/SABKUSRC69/finntech-beta.git') throw new Error('CLEAN_LATEST_RELEASE_REQUIRED')
const files = ['packages/contracts/src/index.ts', 'apps/api/src/server.ts', 'apps/api/src/tracker/routes.ts', 'apps/api/src/tracker/stocks.ts', 'apps/api/src/tracker/stream.ts',
  'apps/web/src/tracker/Assets.tsx', 'apps/web/src/tracker/client.ts', 'apps/web/src/tracker/StockHoldings.tsx', 'apps/web/src/tracker/stockMarket.ts',
  'apps/web/src/tracker/StockPrices.tsx', 'apps/web/src/tracker/valuationPolicy.ts']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const rows = []
for (const file of files) {
  let previous = null
  try { previous = await fs.readFile(path.join(release, file)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const next = Buffer.from((await fs.readFile(path.join(root, file))).toString('utf8').replace(/\r\n/g, '\n'))
  await fs.mkdir(path.dirname(path.join(release, file)), { recursive: true })
  await fs.writeFile(path.join(release, file), next)
  rows.push({ path: file, sha256: sha(next), previousSha256: previous ? sha(previous) : null })
}
await fs.writeFile(path.join(evidence, 'release-manifest.json'), JSON.stringify({ previousCommit: expectedHead, files: rows }, null, 2))
console.log(JSON.stringify({ prepared: rows.length, new: rows.filter(r => !r.previousSha256).map(r => r.path) }))
