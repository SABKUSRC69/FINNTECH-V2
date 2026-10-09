import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root = process.cwd(), local = '.demo-20261008.local', source = `${local}/release-source`, previous = '.beta-20261007.local/release-source'
const added = ['apps/api/src/auth/demo.ts', 'apps/api/test/demo.test.ts', 'apps/api/test/stream.test.ts', 'apps/api/db-test/demo.integration.ts',
  'apps/api/prisma/migrations/20261008000000_demo_workspaces/migration.sql', 'apps/web/src/auth/DemoEntry.tsx', 'apps/web/src/auth/DemoEntry.test.tsx',
  'compose.demo-test.yaml', 'scripts/demo-test-prepare.mjs', 'scripts/demo-test.mjs', 'scripts/demo-release-prepare.mjs', 'docs/operations/demo-access.md']
async function filesIn(folder) {
  const files = []
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = `${folder}/${entry.name}`
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'generated') continue
    if (entry.isSymbolicLink()) throw new Error('Unexpected release symlink')
    if (entry.isDirectory()) files.push(...await filesIn(file)); else files.push(file)
  }
  return files
}
const before = `${local}/before`, modified = []
for (const file of await filesIn(before)) {
  const relative = file.slice(before.length + 1)
  if (!Buffer.from(await fs.readFile(file)).equals(await fs.readFile(relative))) modified.push(relative)
}
// The baseline must match the actual prior release for every modified deployed file.
for (const file of modified) {
  try {
    const bytes = await fs.readFile(`${previous}/${file}`)
    if (!bytes.equals(await fs.readFile(`${before}/${file}`))) throw new Error(`Baseline differs from deployed release: ${file}`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const actualCommit = spawnSync('git', ['-C', previous, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true })
if (actualCommit.status !== 0 || actualCommit.stdout.trim() !== '2def6a6d4bb690ce28107c8bb3710390930edba9') throw new Error('Unexpected deployed release base')
await fs.mkdir(source, { recursive: true })
for (const file of await filesIn(previous)) {
  const relative = file.slice(previous.length + 1), destination = `${source}/${relative}`
  await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(file, destination)
}
const releaseOnly = file => file.startsWith('apps/') || file === 'package-lock.json' || file === 'docs/operations/demo-access.md'
for (const file of [...modified, ...added].filter(releaseOnly)) {
  await fs.mkdir(path.dirname(`${source}/${file}`), { recursive: true }); await fs.copyFile(file, `${source}/${file}`)
}
const changes = [...modified, ...added].sort(), diffs = []
for (const file of changes) {
  const old = added.includes(file) ? 'NUL' : `${before}/${file}`
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--', old, file], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 1) throw new Error(`Could not produce incremental diff: ${file}`)
  const lines = result.stdout.split('\n')
  lines[0] = `diff --git a/${file} b/${file}`
  diffs.push(lines.map(line => line.startsWith('--- ') ? (added.includes(file) ? '--- /dev/null' : `--- a/${file}`) : line.startsWith('+++ ') ? `+++ b/${file}` : line).join('\n'))
}
await fs.mkdir('docs/acceptance', { recursive: true })
await fs.writeFile('docs/acceptance/demo-shared-access-20261008.patch', diffs.join('\n'))
const forbidden = /(^|\/)(\.git|node_modules|dist|coverage|generated|[^/]*\.local)(\/|$)|(^|\/)\.env(?:\.|$)|(?:dump|mailbox|backup\.private)/i
const manifest = []
for (const file of (await filesIn(source)).sort()) {
  const relative = file.slice(source.length + 1)
  if (forbidden.test(relative)) throw new Error('Private file in release')
  const data = await fs.readFile(file)
  manifest.push({ file: relative, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
}
await fs.writeFile(`${local}/release-manifest.json`, JSON.stringify({ baselineCommit: actualCommit.stdout.trim(), sourceCommit: null, changes, files: manifest }, null, 2))
console.log(JSON.stringify({ changedFiles: changes.length, releaseFiles: manifest.length, baselineVerified: true, releaseHasGitOrPrivatePaths: false }))
