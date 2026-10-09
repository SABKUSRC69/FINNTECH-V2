import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readRealBackupTarget } from './real-backup-target.mjs'
const fixture = {
  FINNTECH_BACKUP_DATABASE_URL: 'postgresql://backup_reader:synthetic-only@ep-fixture.us-east-2.aws.neon.tech/finance_personal?sslmode=verify-full',
  FINNTECH_BACKUP_DATABASE_ROLE: 'backup_reader', TRACKER_REAL_DATABASE_HOST: 'ep-fixture.us-east-2.aws.neon.tech',
  TRACKER_REAL_DATABASE_NAME: 'finance_personal', TRACKER_REAL_DATABASE_ROLE: 'finance_app', TRACKER_ORIGIN: 'https://finance.example.test',
}
test('backup target uses a distinct read-only credential identity and exact selected HTTPS/TLS database', () => {
  assert.equal(readRealBackupTarget(fixture).backupRole, 'backup_reader')
  for (const changed of [{ TRACKER_REAL_DATABASE_ROLE: 'backup_reader' }, { TRACKER_ORIGIN: 'secret-input' },
    { TRACKER_REAL_DATABASE_NAME: 'finntech_beta' }, { TRACKER_REAL_DATABASE_HOST: 'other.neon.tech' },
    { FINNTECH_BACKUP_DATABASE_URL: fixture.FINNTECH_BACKUP_DATABASE_URL.replace('verify-full', 'require') }]) {
    assert.throws(() => readRealBackupTarget({ ...fixture, ...changed }), /^Error: BACKUP_TARGET_REJECTED$/)
  }
})
