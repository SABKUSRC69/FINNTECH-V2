// Migrates the empty audit rehearsal database, writes its boundary marker, then runs the
// password-mode integration suite. Refuses anything except the audit's own loopback target.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { rehearsalEnv, databaseUrl, origin, redact } from './rehearsal-env.mjs'

const root = 'C:/Users/Admin/Downloads/FINNTECH'
const evidence = path.join(root, 'docs/acceptance/claude-bug-audit-20261009')
const url = new URL(databaseUrl)
if (url.hostname !== '127.0.0.1' || url.port !== '5446') throw new Error('audit target only')
const docker = args => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true })
const inspect = docker(['inspect', '--format', '{{.Name}}', 'claude-audit-rehearsal'])
if (inspect.stdout.trim() !== '/claude-audit-rehearsal') throw new Error('audit container missing')
const psql = sql => docker(['exec', 'claude-audit-rehearsal', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'finish_rehearsal', '-d', 'finntech_finish_real', '-c', sql])

const results = []
function run(id, args, env = {}) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...rehearsalEnv, ...env }, windowsHide: true, maxBuffer: 64e6 })
  const output = redact((r.stdout ?? '') + (r.stderr ?? ''))
  fs.writeFileSync(path.join(evidence, `rehearsal-${id}.log`), output)
  results.push({ id, exitCode: r.status })
  return r.status
}
const tables = psql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").stdout.trim()
if (tables === '0') {
  if (run('migrate', ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts']) !== 0) throw new Error('migration failed')
  const marker = psql(`INSERT INTO runtime_boundaries(id,mode,database_name,database_role,origin) VALUES('singleton','real-rehearsal','finntech_finish_real','finish_rehearsal','${origin}')`)
  results.push({ id: 'boundary-marker', exitCode: marker.status })
}
if (process.argv[2] !== 'prepare-only') run('password-mode', ['node_modules/tsx/dist/cli.mjs', '--test', 'apps/api/db-test/password-mode.integration.ts'])
fs.writeFileSync(path.join(evidence, 'rehearsal-results.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
