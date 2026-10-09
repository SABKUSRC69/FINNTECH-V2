import { spawn } from 'node:child_process'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
const target = new URL(process.env.DATABASE_URL ?? 'http://invalid')
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '5443' || target.pathname !== '/finntech_demo_test_20261008' || target.username !== 'demo_fixture' || !target.password) throw new Error('Refused unexpected demo test target')
const db = createTrackerDatabase(target.href)
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    child.on('error', () => reject(new Error('Fixture command could not start')))
    child.on('exit', code => {
      output = output.replaceAll(target.href, '[DATABASE_URL_WITHHELD]').replaceAll(target.password, '[PASSWORD_WITHHELD]').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[DATABASE_URL_WITHHELD]')
      process.stdout.write(output); resolve(code ?? 1)
    })
  })
}
try {
  const result = await db.$queryRaw`SELECT current_database() AS name, current_user AS role`
  if (result[0]?.name !== 'finntech_demo_test_20261008' || result[0]?.role !== 'demo_fixture') throw new Error('Refused unexpected database identity')
  // Forward migration only. No fixture/database deletion, including repeated runs.
  await db.$disconnect()
  const migration = await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'])
  process.exitCode = migration || await run(['--no-strip-types', '--import', 'tsx', '--test', 'apps/api/db-test/demo.integration.ts'])
} catch { console.error('NOT TESTED: dedicated demo PostgreSQL unavailable; details withheld'); process.exitCode = 2 }
finally { await db.$disconnect() }
