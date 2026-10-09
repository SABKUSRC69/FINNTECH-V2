import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTrackerDatabase, checkDatabaseConnection } from '../apps/api/dist/persistence/database.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let database
try {
  let target
  try { target = new URL(process.env.DATABASE_URL) } catch { throw new Error('Refused missing/invalid local Auth target') }
  if (process.env.TRACKER_AUTH_LOCAL_CONFIRM !== 'synthetic-only'
    || !['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1'
    || target.port !== '5436' || target.pathname !== '/finntech_auth_local' || target.username !== 'ui_fixture'
    || !target.password || /placeholder|[<>]/i.test(decodeURIComponent(target.password)) || target.search || target.hash) {
    throw new Error('Refused local Auth target; only the dedicated loopback synthetic database is permitted')
  }
  database = createTrackerDatabase(target.href)
  if (await checkDatabaseConnection(database) !== 'ok') throw new Error('NOT TESTED: local Auth PostgreSQL is unavailable')
  const current = await database.$queryRaw`SELECT current_database() AS name`
  const tables = await database.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  if (current[0]?.name !== 'finntech_auth_local' || tables.length !== 0) {
    throw new Error('Refused nonempty/unexpected local Auth database; no migration/reset/delete performed')
  }
  await database.$disconnect()
  database = undefined
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'),
      'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], {
      cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Driver/CLI messages can include URLs. Report status only.
    child.stdout.resume()
    child.stderr.resume()
    child.once('error', () => reject(new Error('Local Auth migration could not start')))
    child.once('exit', code => resolve(code ?? 1))
  })
  if (exit !== 0) throw new Error('Local Auth migration failed; sensitive details withheld')
  console.log('PASS: four migrations applied to empty synthetic local Auth database; no existing volume changed')
} catch (error) {
  const message = error instanceof Error ? error.message : ''
  console.error(/^(Refused|NOT TESTED:|Local Auth migration)/.test(message) ? message : 'Local Auth preparation failed; details withheld')
  process.exitCode = message.startsWith('NOT TESTED:') ? 2 : 1
} finally { if (database) await database.$disconnect() }
