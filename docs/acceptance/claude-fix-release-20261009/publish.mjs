// Scans the 17 release files and built assets for known secret values (never printed), stages exactly
// the manifest files, commits and pushes the personal release branch. Mirrors the previous release script.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = 'C:/Users/Admin/Downloads/FINNTECH'
const cwd = path.join(root, '.student-real-20261008.local/release-source')
const evidence = path.join(root, 'docs/acceptance/claude-fix-release-20261009')
const manifest = JSON.parse(await fs.readFile(path.join(evidence, 'release-manifest.json'), 'utf8'))
const git = args => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64e6 }); if (r.status !== 0) throw new Error(`RELEASE_GIT_FAILED ${args[0]}`); return r.stdout.trim() }
if (git(['rev-parse', 'HEAD']) !== manifest.previousCommit || git(['branch', '--show-current']) !== 'codex/student-real-use'
  || git(['remote', 'get-url', 'origin']) !== 'https://github.com/SABKUSRC69/finntech-beta.git') throw new Error('RELEASE_IDENTITY_REFUSED')
for (const log of ['release-build.log', 'release-typecheck.log']) if (/error TS|ERR!/.test(await fs.readFile(path.join(evidence, log), 'utf8'))) throw new Error('CHECKS_REQUIRED')
const secrets = []
for (const file of ['.student-real-20261008.local/cloud.env', '.beta-cloud-runtime-20261007.local/runtime.env']) {
  let text = ''
  try { text = await fs.readFile(path.join(root, file), 'utf8') } catch { continue }
  for (const row of text.split(/\r?\n/)) {
    const [key, ...parts] = row.split('='), value = parts.join('=')
    if (/SECRET|PASSWORD|DATABASE_URL|ACCESS_CODE|API_KEY|OUTBOX_KEY/.test(key) && value.length >= 12) {
      secrets.push(value); try { const u = new URL(value); if (u.password) secrets.push(decodeURIComponent(u.password)) } catch { /* not a URL */ }
    }
  }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
let scanned = 0
for (const entry of manifest.files) {
  const bytes = await fs.readFile(path.join(cwd, entry.path))
  if (sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) !== entry.sha256) throw new Error('SOURCE_CHANGED')
  if (secrets.some(s => bytes.includes(Buffer.from(s)))) throw new Error('SECRET_FOUND')
  scanned++
}
const assets = []
for (const file of await fs.readdir(path.join(cwd, 'apps/web/dist/assets'))) {
  const bytes = await fs.readFile(path.join(cwd, 'apps/web/dist/assets', file))
  if (secrets.some(s => bytes.includes(Buffer.from(s)))) throw new Error('BUNDLE_SECRET_FOUND')
  scanned++; assets.push({ file, sha256: sha(bytes) })
}
git(['add', '--', ...manifest.files.map(f => f.path)])
const staged = git(['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean)
if (staged.length !== manifest.files.length || staged.some(f => !manifest.files.some(m => m.path === f))) throw new Error('UNRELATED_STAGED_CHANGE')
await fs.writeFile(path.join(evidence, 'release.patch'), git(['diff', '--cached']) + '\n')
const message = [
  'Fix audit findings: per-email auth limits, per-owner writes, category setup, backup limits',
  '',
  '- Real mode no longer uses Better Auth\'s IP-less shared limiter (3 sign-ins/10 s site-wide); per-email',
  '  and global budgets apply instead, and sign-out is never budgeted. No client IP header is trusted.',
  '- Write budget is per owner with a higher global ceiling.',
  '- Category setup keeps the transaction draft, selects the new category, explains empty/error states',
  '  and offers an idempotent owner-scoped starter-category action.',
  '- Backup limit 5,000 rows / 5 MiB, measured at 0.1 CPU / 512 MB; counts before loading; no redundant',
  '  schema re-parse; longer export/restore budgets.',
  '- Replay writes only changed accounting rows in bulk; corrections take the media lock first.',
  '- Sign-in after a deletion request is refused only after the password is verified, without a session.',
  '- Truthful stock-feed and loading labels; per-symbol crypto REST failures.',
  '',
  'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
].join('\n')
const commit = spawnSync('git', ['commit', '-F', '-'], { cwd, input: message, encoding: 'utf8', windowsHide: true })
if (commit.status !== 0) throw new Error('RELEASE_COMMIT_FAILED')
const head = git(['rev-parse', 'HEAD'])
git(['-c', 'credential.interactive=never', 'push', 'origin', 'HEAD:refs/heads/codex/student-real-use'])
const result = { commit: head, previousCommit: manifest.previousCommit, branch: 'codex/student-real-use', pushExit: 0, files: staged, assets,
  secretScan: { status: 'PASS', scanned, knownSecretValuesChecked: secrets.length, found: 0 }, ownerWorkingRepositoryCommitted: false }
await fs.writeFile(path.join(evidence, 'published.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
