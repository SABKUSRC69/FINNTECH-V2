// Build-time dependency closure from the existing installed lock. No package updates/downloads.
// Serve a compiled SPA: root frontend dependencies, CLI/dev and optional peers are not server roots.
import fs from 'node:fs/promises'
import path from 'node:path'
const root = process.cwd(), output = path.join(root, 'beta-runtime-deps')
const visited = new Set(), records = []
async function locate(name, importer) {
  let parent = importer
  while (parent.startsWith(root)) {
    const candidate = path.join(parent, 'node_modules', name)
    try { const json = JSON.parse(await fs.readFile(path.join(candidate, 'package.json'), 'utf8')); if (json.name === name) return { candidate, json } } catch {}
    if (parent === root) break
    parent = path.dirname(parent)
  }
  throw new Error(`Required runtime package missing: ${name}`)
}
async function visit(name, importer) {
  const { candidate, json } = await locate(name, importer), relative = path.relative(root, candidate)
  if (visited.has(relative)) return
  visited.add(relative); records.push({ path: relative.replaceAll(path.sep, '/'), name: json.name, version: json.version })
  const destination = path.join(output, relative)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  const stat = await fs.lstat(candidate)
  if (stat.isSymbolicLink()) {
    const link = await fs.readlink(candidate), resolved = path.resolve(path.dirname(candidate), link)
    if (!resolved.startsWith(root + path.sep)) throw new Error('Runtime workspace link escapes root')
    await fs.symlink(link, destination)
  } else {
    await fs.cp(candidate, destination, { recursive: true, filter: file => !path.relative(candidate, file).split(path.sep).includes('node_modules') })
  }
  const dependencies = { ...json.dependencies }
  for (const [peer, version] of Object.entries(json.peerDependencies ?? {})) {
    if (!json.peerDependenciesMeta?.[peer]?.optional) dependencies[peer] = version
  }
  for (const dependency of Object.keys(dependencies)) await visit(dependency, candidate)
  // Sharp native platform packages are optional dependencies selected by npm ci.
  for (const dependency of Object.keys(json.optionalDependencies ?? {})) {
    try { await locate(dependency,candidate) } catch { continue }
    await visit(dependency,candidate)
  }
}
const api = JSON.parse(await fs.readFile('apps/api/package.json', 'utf8'))
for (const dependency of Object.keys(api.dependencies)) await visit(dependency, path.join(root, 'apps/api'))
await fs.mkdir(path.join(output, 'apps/api/node_modules'), { recursive: true })
await fs.writeFile(path.join(output, 'inventory.json'), JSON.stringify(records.sort((a, b) => a.path.localeCompare(b.path)), null, 2))
console.log(`Compiled server runtime closure: ${records.length} packages; optional peers/dev/root UI omitted`)
