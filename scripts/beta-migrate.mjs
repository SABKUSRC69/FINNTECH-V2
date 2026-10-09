import { spawnSync } from 'node:child_process'
import pg from 'pg'

export function requireFreshBetaTarget(env) {
  let target
  try { target = new URL(env.DIRECT_DATABASE_URL) } catch { throw new Error('Explicit direct Beta migration target required (values withheld)') }
  if (env.TRACKER_BETA_MIGRATION_CONFIRM !== 'fresh-beta-only' || !env.TRACKER_BETA_DATABASE_HOST
    || target.protocol !== 'postgresql:' || target.hostname !== env.TRACKER_BETA_DATABASE_HOST
    || !target.hostname.endsWith('.neon.tech') || target.hostname.includes('-pooler')
    || target.pathname !== '/finntech_beta' || target.username !== 'beta_app' || !target.password
    || target.hash || target.searchParams.get('sslmode') !== 'verify-full'
    || /placeholder|[<>]/i.test(decodeURIComponent(target.password))) throw new Error('Refused Beta migration target (values withheld)')
  return target
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/beta-migrate.mjs')) {
  let database
  try {
    const target = requireFreshBetaTarget(process.env)
    // Operator preflight is distinct from the app's request/write timeout policy.
    // Verified direct TLS from the owner's machine took 4.5s on the chosen target.
    database = new pg.Pool({ connectionString: target.href, max: 1, connectionTimeoutMillis: 20_000, query_timeout: 5_000 })
    const current = await database.query('SELECT current_database() AS name, current_user AS role')
    const tables = await database.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    if (current.rows[0]?.name !== 'finntech_beta' || current.rows[0]?.role !== 'beta_app' || tables.rows.length) throw new Error('Refused nonempty or unexpected Beta database; no migration performed')
    await database.end(); database = undefined
    const run = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], {
      env: { ...process.env, DATABASE_URL: target.href }, stdio: 'pipe', windowsHide: true,
    })
    if (run.status !== 0) throw new Error('Beta forward migration failed; diagnostics withheld')
    console.log('PASS: forward migrations applied to guarded empty Beta database')
  } catch {
    console.error('Beta migration refused/unavailable; no reset/drop/truncate performed, details withheld')
    process.exitCode = 2
  } finally { if (database) await database.end() }
}
