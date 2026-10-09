import { spawnSync } from 'node:child_process'
import { requireRecoveryTarget } from './recovery-3a-target.mjs'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
const target = requireRecoveryTarget(process.env), db = createTrackerDatabase(target.href)
try {
  const current = await db.$queryRaw`SELECT current_database() AS name, current_user AS role`
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`
  if (current[0]?.name !== 'finntech_recovery_3a_20261007' || current[0]?.role !== 'recovery_fixture' || tables.length) throw new Error('Refused nonempty/unexpected recovery target')
  await db.$disconnect()
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { env: process.env, stdio: 'pipe', windowsHide: true })
  if (result.status !== 0) throw new Error('Recovery forward migration failed; details withheld')
  console.log('PASS: empty exact synthetic PostgreSQL target guarded; forward migrations applied')
} catch (error) { console.error(error instanceof Error && /^(Refused|Recovery)/.test(error.message) ? error.message : 'NOT TESTED: recovery target unavailable (details withheld)'); process.exitCode = 2 }
finally { await db.$disconnect() }
