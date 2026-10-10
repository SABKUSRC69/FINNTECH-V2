// Runs the existing assets and F1.4 PostgreSQL suites on the fix-release throwaway containers.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, evidence, secrets, redact } from './env.mjs'

const portfolioUrl = `postgresql://portfolio_synthetic:${secrets.portfolio}@127.0.0.1:5448/finntech_portfolio_test`
const f14Url = `postgresql://f14_fixture:${secrets.f14}@127.0.0.1:5434/finntech_tracker_f14_test`
const results = []
function run(id, args, env) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 64e6 })
  const output = redact((r.stdout ?? '') + (r.stderr ?? ''))
  fs.writeFileSync(path.join(evidence, `db-${id}.log`), output)
  results.push({ id, exitCode: r.status, counts: output.split('\n').filter(l => /^ℹ (tests|pass|fail)/.test(l.trim())).map(l => l.trim()) })
}
run('assets-migrate', ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { DATABASE_URL: portfolioUrl })
run('assets', ['node_modules/tsx/dist/cli.mjs', '--test', 'apps/api/db-test/assets.integration.ts'], { DATABASE_URL: portfolioUrl, FINNTECH_PORTFOLIO_TEST: 'synthetic-only' })
run('f14', ['scripts/tracker-db-test.mjs'], { TRACKER_TEST_DATABASE_URL: f14Url, TRACKER_DB_TEST_CONFIRM: 'synthetic-only' })
fs.writeFileSync(path.join(evidence, 'db-other-suites.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
