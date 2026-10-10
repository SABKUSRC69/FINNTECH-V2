// Copies the 17 runtime files into the isolated release checkout after proving each release file still
// equals the owner's committed baseline (main HEAD), so no release-only work can be overwritten.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = 'C:/Users/Admin/Downloads/FINNTECH'
const release = path.join(root, '.student-real-20261008.local/release-source')
const evidence = path.join(root, 'docs/acceptance/claude-fix-release-20261009')
const expectedHead = '8058bb7b1d480600035c44f2021f69270cf11a0a'
const git = (cwd, args, encoding = 'utf8') => { const r = spawnSync('git', args, { cwd, encoding, windowsHide: true, maxBuffer: 64e6 }); if (r.status !== 0) throw new Error(`git ${args[0]} failed`); return r.stdout }
if (git(release, ['rev-parse', 'HEAD']).trim() !== expectedHead || git(release, ['status', '--porcelain']).trim() || git(release, ['branch', '--show-current']).trim() !== 'codex/student-real-use'
  || git(release, ['remote', 'get-url', 'origin']).trim() !== 'https://github.com/SABKUSRC69/finntech-beta.git') throw new Error('CLEAN_LATEST_RELEASE_REQUIRED')
const files = ['apps/api/src/app.ts', 'apps/api/src/server.ts', 'apps/api/src/auth/runtime.ts', 'apps/api/src/auth/real.ts', 'apps/api/src/tracker/service.ts',
  'apps/api/src/tracker/stock-ledger.ts', 'apps/api/src/tracker/replay-persist.ts', 'apps/api/src/tracker/backup.ts', 'apps/api/src/tracker/crypto-stream.ts',
  'apps/api/src/tracker/routes.ts', 'apps/web/src/tracker/Dashboard.tsx', 'apps/web/src/tracker/Assets.tsx', 'apps/web/src/tracker/valuationPolicy.ts',
  'apps/web/src/tracker/client.ts', 'apps/web/src/tracker/Backup.tsx', 'apps/web/src/auth/client.ts', 'packages/contracts/src/index.ts']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const normalize = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))
const rows = []
for (const file of files) {
  let current = null
  try { current = await fs.readFile(path.join(release, file)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const baseline = spawnSync('git', ['show', `HEAD:${file}`], { cwd: root, windowsHide: true, maxBuffer: 64e6 })
  const baselineBytes = baseline.status === 0 ? baseline.stdout : null
  if ((current === null) !== (baselineBytes === null) || (current && sha(normalize(current)) !== sha(normalize(baselineBytes)))) throw new Error(`RELEASE_BASELINE_MISMATCH ${file}`)
  const next = normalize(await fs.readFile(path.join(root, file)))
  await fs.mkdir(path.dirname(path.join(release, file)), { recursive: true })
  await fs.writeFile(path.join(release, file), next)
  rows.push({ path: file, sha256: sha(next), baselineSha256: current ? sha(normalize(current)) : null, bytes: next.length })
}
await fs.writeFile(path.join(evidence, 'release-manifest.json'), JSON.stringify({ previousCommit: expectedHead, files: rows }, null, 2))
console.log(JSON.stringify({ prepared: rows.length, new: rows.filter(r => !r.baselineSha256).map(r => r.path) }))
