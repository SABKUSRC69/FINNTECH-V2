// Shared synthetic environment for the fix-release tests (127.0.0.1:5446 database, 4199 app).
// Secrets live outside the repository and are redacted from every saved log.
import fs from 'node:fs'
import path from 'node:path'

export const root = 'C:/Users/Admin/Downloads/FINNTECH'
export const evidence = path.join(root, 'docs/acceptance/claude-fix-release-20261009')
export const secrets = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'claude-fix-20261009/secrets.json'), 'utf8'))
export const databaseUrl = `postgresql://finish_rehearsal:${secrets.db}@127.0.0.1:5446/finntech_finish_real`
export const origin = 'http://127.0.0.1:4199'
export const rehearsalEnv = {
  NODE_ENV: 'test', TRACKER_RUNTIME_MODE: 'real-rehearsal', TRACKER_REAL_REHEARSAL_ID: 'finish-20261008',
  TRACKER_DATA_MODE: 'real-rehearsal', TRACKER_REAL_AUTH_MODE: 'email-password', TRACKER_RECOVERY_MODE: 'off',
  TRACKER_REAL_REGISTRATIONS_OPEN: 'true', TRACKER_REAL_DATABASE_HOST: '127.0.0.1',
  TRACKER_REAL_DATABASE_NAME: 'finntech_finish_real', TRACKER_REAL_DATABASE_ROLE: 'finish_rehearsal',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: secrets.secret, TRACKER_ORIGIN: origin, TRACKER_API_PORT: '4199',
}
export const redact = text => Object.values(secrets).reduce((out, s) => out.replaceAll(s, '[REDACTED]'), text)
