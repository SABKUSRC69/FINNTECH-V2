// Runs PostgreSQL suites for the Alpaca release on the synthetic real-rehearsal database and the
// existing assets/F1.4 throwaway targets. Secrets come from %TEMP% and are redacted from every log.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, rehearsalEnv, secrets, redact } from '../claude-fix-release-20261009/env.mjs'

const evidence = path.join(root, 'docs/acceptance/claude-alpaca-release-20261009')
const portfolioUrl = `postgresql://portfolio_synthetic:${secrets.portfolio}@127.0.0.1:5448/finntech_portfolio_test`
const f14Url = `postgresql://f14_fixture:${secrets.f14}@127.0.0.1:5434/finntech_tracker_f14_test`
const tsx = suite => ['node_modules/tsx/dist/cli.mjs', '--test', `apps/api/db-test/${suite}.integration.ts`]
const runs = {
  'alpaca-relay': [tsx('alpaca-relay'), { ...rehearsalEnv, FINNTECH_ALPACA_EVIDENCE_FILE: path.join(evidence, 'alpaca-relay-evidence.json') }],
  'audit-fixes': [tsx('audit-fixes'), rehearsalEnv],
  'password-mode': [tsx('password-mode'), rehearsalEnv],
  'assets-migrate': [['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { DATABASE_URL: portfolioUrl }],
  assets: [tsx('assets'), { DATABASE_URL: portfolioUrl, FINNTECH_PORTFOLIO_TEST: 'synthetic-only' }],
  f14: [['scripts/tracker-db-test.mjs'], { TRACKER_TEST_DATABASE_URL: f14Url, TRACKER_DB_TEST_CONFIRM: 'synthetic-only' }],
}
const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(runs)
const results = []
for (const id of selected) {
  const [args, env] = runs[id]
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 64e6 })
  const output = redact((r.stdout ?? '') + (r.stderr ?? ''))
  fs.writeFileSync(path.join(evidence, `db-${id}.log`), output)
  results.push({ id, exitCode: r.status, counts: output.split('\n').filter(l => /^ℹ (tests|pass|fail)/.test(l.trim())).map(l => l.trim()) })
}
fs.writeFileSync(path.join(evidence, `db-suites-${selected.join('-').slice(0, 60)}.json`), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
