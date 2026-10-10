// Runs PostgreSQL suites against the synthetic fix-release database (real-rehearsal, email-password).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, evidence, rehearsalEnv, redact } from './env.mjs'

const suites = process.argv.slice(2).length ? process.argv.slice(2) : ['audit-fixes', 'password-mode']
const results = []
for (const suite of suites) {
  const r = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', `apps/api/db-test/${suite}.integration.ts`], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64e6,
    env: { ...process.env, ...rehearsalEnv, FINNTECH_FIX_EVIDENCE_FILE: path.join(evidence, `${suite}-evidence.json`) } })
  const output = redact((r.stdout ?? '') + (r.stderr ?? ''))
  fs.writeFileSync(path.join(evidence, `db-${suite}.log`), output)
  results.push({ suite, exitCode: r.status, counts: output.split('\n').filter(l => /^ℹ (tests|pass|fail)/.test(l.trim())).map(l => l.trim()) })
}
fs.writeFileSync(path.join(evidence, 'db-suites.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
