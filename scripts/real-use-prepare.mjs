import { spawnSync } from 'node:child_process'
import { readAuthConfiguration } from '../apps/api/dist/auth/config.js'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'

// Explicit fresh-schema initialization only. Never migrate an existing Beta/owner database.
const config = readAuthConfiguration(process.env)
if (!config?.real || config.real.registrationsOpen && config.real.boundary === 'real') throw new Error('Real prepare requires explicit closed-registration configuration')
const database = createTrackerDatabase(config.databaseUrl)
try {
  const current = await database.$queryRaw`SELECT current_database() AS name, current_user AS role`
  const objects = await database.$queryRaw`SELECT COUNT(*) AS count FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public'`
  const types = await database.$queryRaw`SELECT COUNT(*) AS count FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid WHERE n.nspname='public'`
  if (current[0]?.name !== config.real.databaseName || current[0]?.role !== config.real.databaseRole || Number(objects[0]?.count) || Number(types[0]?.count)) throw new Error('Nonempty or unexpected target refused')
  await database.$disconnect()
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { env: process.env, stdio: 'pipe', windowsHide: true })
  if (migration.status !== 0) throw new Error('Forward migration failed; details withheld')
  await database.runtimeBoundary.create({ data: { id: 'singleton', mode: config.real.boundary, databaseName: config.real.databaseName, databaseRole: config.real.databaseRole, origin: config.origin } })
  console.log('PASS: explicit empty target initialized and immutable boundary recorded; no accounts promoted')
} catch { console.error('Real preparation failed; target not reset, details withheld'); process.exitCode = 1 }
finally { await database.$disconnect() }
