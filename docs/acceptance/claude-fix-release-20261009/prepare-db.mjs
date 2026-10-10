// Migrates the empty synthetic fix-release database and writes the real-rehearsal boundary marker.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, evidence, rehearsalEnv, origin, redact } from './env.mjs'

const psql = sql => spawnSync('docker', ['exec', 'claude-fix-pg', 'psql', '-p', '5446', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'finish_rehearsal', '-d', 'finntech_finish_real', '-c', sql], { encoding: 'utf8', windowsHide: true })
if (psql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").stdout.trim() !== '0') throw new Error('expected an empty synthetic database')
const r = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...rehearsalEnv }, windowsHide: true })
fs.writeFileSync(path.join(evidence, 'migrate.log'), redact(r.stdout + r.stderr))
if (r.status !== 0) throw new Error('migration failed')
const marker = psql(`INSERT INTO runtime_boundaries(id,mode,database_name,database_role,origin) VALUES('singleton','real-rehearsal','finntech_finish_real','finish_rehearsal','${origin}')`)
console.log(JSON.stringify({ migrate: r.status, marker: marker.status }))
