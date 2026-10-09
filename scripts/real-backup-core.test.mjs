import assert from 'node:assert/strict'
import { test } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { encryptDump, decryptDump, saveEncryptedBackup, readBackupKey, sha256, backupFreshness, pruneExpiredBackups } from './real-backup-core.mjs'

test('portable authenticated encryption rejects tampering/wrong key and contains no plaintext', () => {
  const key = randomBytes(32), dump = Buffer.from('PGDMPsynthetic financial ledger and credential fixture')
  const archive = encryptDump(dump, key)
  assert.ok(!archive.includes(Buffer.from('credential'))); assert.deepEqual(decryptDump(archive, key), dump)
  const altered = Buffer.from(archive); altered[30] ^= 1
  assert.throws(() => decryptDump(altered, key)); assert.throws(() => decryptDump(archive, randomBytes(32)))
  assert.throws(() => encryptDump(Buffer.from('not a pg_dump'), key))
})
test('key recovery on another location does not depend on the old Windows profile; writes never overwrite', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'finntech-backup-unit-'))
  try {
    const keyFile = path.join(directory, 'key'), copy = path.join(directory, 'independent-recovery-key')
    await writeFile(keyFile, randomBytes(32)); await copyFile(keyFile, copy)
    const dump = Buffer.from('PGDMPfixture'), result = await saveEncryptedBackup(directory, dump, await readBackupKey(keyFile))
    assert.equal(sha256(decryptDump(await readFile(result.file), await readBackupKey(copy))), sha256(dump))
    assert.equal(result.receipt.fullRestore, 'NOT_TESTED'); assert.equal(backupFreshness(result.receipt), 'CURRENT')
    assert.equal(backupFreshness(result.receipt, new Date(Date.now() + 90000000)), 'MISSED_OR_FAILED')
    assert.equal(backupFreshness(undefined), 'MISSED_OR_FAILED')
  } finally { assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith('finntech-backup-unit-')); await rm(directory, { recursive: true }) }
})
test('finite retention only removes expired recognized verified archives, preserving unrelated files and other keys', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'finntech-retention-unit-')), key = randomBytes(32)
  try {
    await saveEncryptedBackup(directory, Buffer.from('PGDMPold'), key, new Date('2026-01-01T00:00:00Z'))
    await saveEncryptedBackup(directory, Buffer.from('PGDMPcurrent'), key, new Date('2026-02-01T00:00:00Z'))
    await writeFile(path.join(directory, 'owner.txt'), 'preserve')
    await assert.rejects(pruneExpiredBackups(directory, sha256(key).slice(0, 16), 30, new Date('2026-02-02T00:00:00Z')), /REVIEWED_RETENTION_PLAN_REQUIRED/)
    assert.equal(await readFile(path.join(directory, 'owner.txt'), 'utf8'), 'preserve')
    await assert.rejects(pruneExpiredBackups(directory, sha256(key).slice(0, 16), 0))
  } finally { assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith('finntech-retention-unit-')); await rm(directory, { recursive: true }) }
})
