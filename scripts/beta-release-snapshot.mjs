import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = process.cwd(), directory = path.resolve('.beta-20261007.local/release-source')
if (!directory.startsWith(path.join(root, '.beta-20261007.local') + path.sep)) throw new Error('Unsafe release directory')
const files = ['package.json', 'package-lock.json', 'tsconfig.tracker.base.json', 'Dockerfile.beta', 'Dockerfile.beta.dockerignore', 'render.beta.yaml',
  'scripts/beta-migrate.mjs', 'scripts/beta-runtime-dependencies.mjs', 'scripts/beta-release-snapshot.mjs', 'scripts/tracker-package-smoke.mjs', 'scripts/tracker-web-dev-smoke.mjs',
  'docs/operations/beta-deploy.md', 'docs/operations/beta-env.example.txt']
const forbidden = /(^|\/)(node_modules|dist|coverage|generated|\.git|[^/]*\.local)(\/|$)|(^|\/)\.env(?:\.|$)|(?:dump|mailbox|backup\.private)/i
async function walk(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = `${folder}/${entry.name}`
    if (forbidden.test(file)) continue
    if (entry.isSymbolicLink()) throw new Error('Release contains an unexpected symlink')
    if (entry.isDirectory()) await walk(file); else files.push(file)
  }
}
for (const folder of ['apps/api', 'apps/web', 'packages/finance', 'packages/contracts']) await walk(folder)
for (const name of ['beta-rehearsal-target', 'recovery-3a-target', 'tracker-auth-target', 'tracker-db-target']) {
  files.push(`scripts/${name}.mjs`, `scripts/${name}.d.mts`)
}
const manifest = []
for (const file of [...new Set(files)].sort()) {
  if (forbidden.test(file) || !path.resolve(file).startsWith(root + path.sep)) throw new Error('Release path refused')
  const data = await fs.readFile(file), destination = path.join(directory, file)
  await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, data)
  manifest.push({ file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
}
const fingerprint = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
await fs.writeFile('.beta-20261007.local/release-filelist.json', JSON.stringify({ fingerprint, sourceCommit: null, reason: 'working-tree snapshot; target Git provider not connected', files: manifest }, null, 2))
console.log(JSON.stringify({ allowlistedFiles: manifest.length, fingerprint, privatePathsIncluded: false }))
