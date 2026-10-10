// Runs the compiled server + web build on 127.0.0.1:4199 (email-password real-rehearsal) against the
// synthetic database. No Alpaca variables are set, so the feed reports NOT_CONFIGURED as on the live site today.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root, rehearsalEnv, redact } from '../claude-fix-release-20261009/env.mjs'

const log = fs.createWriteStream(path.join(root, 'docs/acceptance/claude-alpaca-release-20261009/local-server.log'))
const env = { ...process.env, ...rehearsalEnv, WEB_DIST_DIR: 'apps/web/dist' }
for (const name of Object.keys(env)) if (name.startsWith('ALPACA_')) delete env[name]
const child = spawn(process.execPath, ['apps/api/dist/server.js'], { cwd: root, env, windowsHide: true })
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => log.write(redact(String(chunk))))
child.on('exit', code => { log.write(`\n[exit ${code}]\n`); process.exit(code ?? 1) })
process.on('SIGTERM', () => child.kill('SIGTERM'))
