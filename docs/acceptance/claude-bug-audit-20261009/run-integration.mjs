// Runs PostgreSQL integration suites against the audit's own throwaway containers.
// Passwords come from a file outside the repository and are redacted from every log.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = 'C:/Users/Admin/Downloads/FINNTECH'
const evidence = path.join(root, 'docs/acceptance/claude-bug-audit-20261009')
const secrets = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'claude-audit-20261009/secrets.json'), 'utf8'))
const redact = text => Object.values(secrets).reduce((out, s) => out.replaceAll(s, '[REDACTED]'), text)
const node = process.execPath
const portfolioUrl = `postgresql://portfolio_synthetic:${secrets.portfolio}@127.0.0.1:5448/finntech_portfolio_test`
const f14Url = `postgresql://f14_fixture:${secrets.f14}@127.0.0.1:5434/finntech_tracker_f14_test`

function run(id, args, env) {
  const started = Date.now()
  const r = spawnSync(node, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 64e6 })
  const output = redact((r.stdout ?? '') + (r.stderr ?? ''))
  fs.writeFileSync(path.join(evidence, `integration-${id}.log`), output)
  const counts = output.split('\n').filter(line => /^# (tests|pass|fail|cancelled|skipped)/.test(line)).map(s => s.trim())
  return { id, exitCode: r.status, seconds: Math.round((Date.now() - started) / 1000), counts }
}

const only = process.argv[2]
const results = []
if (!only || only === 'assets') {
  results.push(run('assets-migrate', ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { DATABASE_URL: portfolioUrl }))
  results.push(run('assets', ['node_modules/tsx/dist/cli.mjs', '--test', 'apps/api/db-test/assets.integration.ts'], { DATABASE_URL: portfolioUrl, FINNTECH_PORTFOLIO_TEST: 'synthetic-only' }))
}
if (!only || only === 'f14') {
  results.push(run('f14-db-test', ['scripts/tracker-db-test.mjs'], { TRACKER_TEST_DATABASE_URL: f14Url, TRACKER_DB_TEST_CONFIRM: 'synthetic-only' }))
}
fs.writeFileSync(path.join(evidence, `integration-${only ?? 'all'}.json`), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
