import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireSyntheticDatabase } from './tracker-db-target.mjs'
import { createTrackerDatabase, checkDatabaseConnection } from '../apps/api/dist/persistence/database.js'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function runChild(args, target, showOutput = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: target.href, TRACKER_TEST_DATABASE_URL: target.href },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.once('error', () => reject(new Error('Failed to start local database verification process')))
    child.once('exit', (code) => {
      if (showOutput) {
        for (const secret of [target.href, target.username, target.password, decodeURIComponent(target.password)]) {
          if (secret) output = output.replaceAll(secret, '[REDACTED]')
        }
        process.stdout.write(output)
      }
      resolve(code ?? 1)
    })
  })
}

let database
try {
  const target = requireSyntheticDatabase(process.env)
  database = createTrackerDatabase(target.href)
  if (await checkDatabaseConnection(database) !== 'ok') {
    console.error('NOT TESTED: isolated PostgreSQL is unavailable; no migration or fixture writes were performed')
    process.exitCode = 2
  } else {
    const current = await database.$queryRaw`SELECT current_database() AS name`
    const tables = await database.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    if (current[0]?.name !== 'finntech_tracker_f14_test' || tables.length !== 0) {
      throw new Error('Refused nonempty or unexpected database; no reset, delete, or migration was performed')
    }
    await database.$disconnect()
    database = undefined
    const migrationExit = await runChild([
      path.join(repositoryRoot, 'node_modules/prisma/build/index.js'),
      'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts',
    ], target)
    if (migrationExit !== 0) throw new Error('PostgreSQL migration failed; no readiness claim is made')
    console.log('PASS: migration applied to an empty isolated PostgreSQL test database')
    process.exitCode = await runChild([
      '--no-strip-types', '--import', 'tsx', '--test', 'apps/api/db-test/postgres.integration.ts',
    ], target, true)
  }
} catch (error) {
  // Only errors created by this runner are emitted; driver errors are never echoed.
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('NOT TESTED:') || message.startsWith('Refused') || message.startsWith('Rejected')
    || message.startsWith('PostgreSQL migration') || message.startsWith('Failed to start local')) {
    console.error(message)
  } else {
    console.error('Database verification failed; connection/driver details have been withheld')
  }
  process.exitCode = message.startsWith('NOT TESTED:') ? 2 : 1
} finally {
  if (database) await database.$disconnect()
}
