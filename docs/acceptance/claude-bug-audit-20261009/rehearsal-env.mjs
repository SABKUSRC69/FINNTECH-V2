// Shared environment for the audit's real-rehearsal (email-password) target on 127.0.0.1:5446/4199.
// Mirrors the production authentication mode with synthetic data only. Secrets stay outside the repository.
import fs from 'node:fs'
import path from 'node:path'

export const secrets = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'claude-audit-20261009/secrets.json'), 'utf8'))
export const databaseUrl = `postgresql://finish_rehearsal:${secrets.rehearsal}@127.0.0.1:5446/finntech_finish_real`
export const origin = 'http://127.0.0.1:4199'
export const rehearsalEnv = {
  NODE_ENV: 'test',
  TRACKER_RUNTIME_MODE: 'real-rehearsal',
  TRACKER_REAL_REHEARSAL_ID: 'finish-20261008',
  TRACKER_DATA_MODE: 'real-rehearsal',
  TRACKER_REAL_AUTH_MODE: 'email-password',
  TRACKER_RECOVERY_MODE: 'off',
  TRACKER_REAL_REGISTRATIONS_OPEN: 'true',
  TRACKER_REAL_DATABASE_HOST: '127.0.0.1',
  TRACKER_REAL_DATABASE_NAME: 'finntech_finish_real',
  TRACKER_REAL_DATABASE_ROLE: 'finish_rehearsal',
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: secrets.secret,
  TRACKER_ORIGIN: origin,
  PORT: '4199',
  HOST: '127.0.0.1',
}
export const redact = text => Object.values(secrets).reduce((out, s) => out.replaceAll(s, '[REDACTED]'), text)
