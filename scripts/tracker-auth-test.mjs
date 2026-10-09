import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireAuthTestDatabase } from './tracker-auth-target.mjs'
import { createTrackerDatabase, checkDatabaseConnection } from '../apps/api/dist/persistence/database.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const secret = randomBytes(32).toString('hex')

async function run(args, target, outputEnabled) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: target.href, BETTER_AUTH_SECRET: secret },
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.once('error', () => reject(new Error('Failed to start Auth verification process')))
    child.once('exit', code => {
      if (outputEnabled) {
        for (const value of [target.href, target.password, decodeURIComponent(target.password), secret]) {
          output = output.replaceAll(value, '[REDACTED]')
        }
        output = output.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
        process.stdout.write(output)
      }
      resolve(code ?? 1)
    })
  })
}

let database
try {
  const target = requireAuthTestDatabase(process.env)
  database = createTrackerDatabase(target.href)
  if (await checkDatabaseConnection(database) !== 'ok') throw new Error('NOT TESTED: isolated Auth PostgreSQL is unavailable')
  const current = await database.$queryRaw`SELECT current_database() AS name`
  const tables = await database.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  if (current[0]?.name !== 'finntech_auth_test' || tables.length !== 0) {
    throw new Error('Refused nonempty or unexpected Auth database; no migration/reset/delete performed')
  }
  await database.$disconnect()
  database = undefined
  const migrationExit = await run([
    path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts',
  ], target, false)
  if (migrationExit !== 0) throw new Error('Auth migration failed; details withheld')
  console.log('PASS: forward Auth migration and prior migrations applied to empty synthetic PostgreSQL')
  process.exitCode = await run(['--no-strip-types', '--import', 'tsx', '--test', 'apps/api/db-test/auth.integration.ts'], target, true)
} catch (error) {
  const message = error instanceof Error ? error.message : ''
  console.error(/^(NOT TESTED:|Refused|Failed to start|Auth migration)/.test(message) ? message : 'Auth database verification failed; details withheld')
  process.exitCode = message.startsWith('NOT TESTED:') ? 2 : 1
} finally {
  if (database) await database.$disconnect()
}
