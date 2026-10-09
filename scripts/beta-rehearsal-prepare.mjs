import { spawnSync } from 'node:child_process'
import { requireBetaRehearsalTarget } from './beta-rehearsal-target.mjs'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
let database
try {
  const target = requireBetaRehearsalTarget(process.env)
  database = createTrackerDatabase(target.href)
  const current = await database.$queryRaw`SELECT current_database() AS name, current_user AS role`
  const tables = await database.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`
  if (current[0]?.name !== 'finntech_beta_rehearsal_20261007' || current[0]?.role !== 'beta_fixture' || tables.length) throw new Error('refuse')
  await database.$disconnect(); database = undefined
  const run = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { env: process.env, stdio: 'pipe', windowsHide: true })
  if (run.status !== 0) throw new Error('migration')
  console.log('PASS: exact empty Beta rehearsal target; forward migrations applied')
} catch { console.error('Refused/unavailable rehearsal target; no reset/delete; diagnostics withheld'); process.exitCode = 2 }
finally { if (database) await database.$disconnect() }
