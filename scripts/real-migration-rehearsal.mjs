import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
import { readAuthConfiguration } from '../apps/api/dist/auth/config.js'

const config = readAuthConfiguration(process.env)
if (config?.real?.boundary !== 'real-rehearsal') throw new Error('REHEARSAL_CONFIGURATION_REQUIRED')
const target = new URL(config.databaseUrl); target.port = '5445'; target.pathname = '/finntech_real_fresh_schema'
const db = createTrackerDatabase(target.href)
try {
  const current = await db.$queryRaw`SELECT current_database() AS name,current_user AS role`
  const tables = await db.$queryRaw`SELECT count(*) AS count FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public'`
  if (current[0]?.name !== 'finntech_real_fresh_schema' || current[0]?.role !== 'real_rehearsal' || Number(tables[0]?.count)) throw new Error('NONEMPTY_TARGET_REFUSED')
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy','--config','apps/api/prisma.config.ts'],
    { env: { ...process.env, DATABASE_URL: target.href }, windowsHide: true, stdio: 'pipe' })
  if (result.status !== 0) throw new Error('FRESH_FORWARD_MIGRATION_FAILED')
  const migrations = await db.$queryRaw`SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  if (Number(migrations[0]?.count) !== (await readdir('apps/api/prisma/migrations',{withFileTypes:true})).filter(entry=>entry.isDirectory()).length) throw new Error('MIGRATION_COUNT_MISMATCH')
  console.log('PASS: all current forward migrations applied to a second fresh PostgreSQL 18 schema; earlier failure retained')
} catch (error) { console.error(`FAIL: ${error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'MIGRATION_UNAVAILABLE'}; values withheld`); process.exitCode = 1 }
finally { await db.$disconnect() }
