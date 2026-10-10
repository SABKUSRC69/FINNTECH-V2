// Starts the compiled production server (apps/api/dist/server.js + apps/web/dist) in the
// email-password real-rehearsal mode on 127.0.0.1:4199 against the audit database only.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { rehearsalEnv, redact } from './rehearsal-env.mjs'

const root = 'C:/Users/Admin/Downloads/FINNTECH'
const log = fs.createWriteStream(path.join(root, 'docs/acceptance/claude-bug-audit-20261009/rehearsal-server.log'))
const env = { ...process.env, ...rehearsalEnv, TRACKER_API_PORT: '4199', WEB_DIST_DIR: 'apps/web/dist' }
delete env.PORT
delete env.HOST
const child = spawn(process.execPath, ['apps/api/dist/server.js'], { cwd: root, env, windowsHide: true })
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => log.write(redact(String(chunk))))
child.on('exit', code => { log.write(`\n[exit ${code}]\n`); process.exit(code ?? 1) })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
