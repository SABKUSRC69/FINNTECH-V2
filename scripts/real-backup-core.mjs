import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { readFile, stat, writeFile, lstat, mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'

const magic = Buffer.from('FINNTECH-BACKUP-1\n'), maximum = 134217728
export const backupLimits = { maximum, format: 'FINNTECH-BACKUP-1', algorithm: 'AES-256-GCM' }
export const sha256 = value => createHash('sha256').update(value).digest('hex')
export function encryptDump(dump, key) {
  if (!Buffer.isBuffer(dump) || dump.length > maximum || !dump.subarray(0, 5).equals(Buffer.from('PGDMP')) || key.length !== 32) throw new Error('BACKUP_INPUT_REJECTED')
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(magic)
  return Buffer.concat([magic, iv, cipher.update(dump), cipher.final(), cipher.getAuthTag()])
}
export function decryptDump(archive, key) {
  if (archive.length > maximum + magic.length + 28 || archive.length < magic.length + 33 || !archive.subarray(0, magic.length).equals(magic) || key.length !== 32) throw new Error('BACKUP_ARCHIVE_REJECTED')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, archive.subarray(magic.length, magic.length + 12)); decipher.setAAD(magic)
    decipher.setAuthTag(archive.subarray(-16))
    const dump = Buffer.concat([decipher.update(archive.subarray(magic.length + 12, -16)), decipher.final()])
    if (!dump.subarray(0, 5).equals(Buffer.from('PGDMP'))) throw new Error('invalid_dump')
    return dump
  } catch { throw new Error('BACKUP_AUTHENTICATION_FAILED') }
}
export async function readBackupKey(file) {
  if (!path.isAbsolute(file) || (await lstat(file)).isSymbolicLink() || (await stat(file)).size !== 32) throw new Error('BACKUP_KEY_REJECTED')
  return readFile(file)
}
export async function saveEncryptedBackup(directory, dump, key, now = new Date()) {
  if (!path.isAbsolute(directory)) throw new Error('BACKUP_DESTINATION_REJECTED')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('BACKUP_DESTINATION_REJECTED')
  const id = `${now.toISOString().replace(/[-:.]/g, '')}-${randomBytes(8).toString('hex')}`
  const archive = encryptDump(dump, key), file = path.join(directory, `${id}.fnb`)
  await writeFile(file, archive, { flag: 'wx', mode: 0o600 })
  const saved = await readFile(file)
  if (sha256(decryptDump(saved, key)) !== sha256(dump)) throw new Error('BACKUP_VERIFY_FAILED')
  const receipt = { format: backupLimits.format, createdAt: now.toISOString(), keyFingerprint: sha256(key).slice(0, 16), encryptedSha256: sha256(saved),
    dumpSha256: sha256(dump), bytes: saved.length, status: 'ENCRYPTED_AND_VERIFIED', fullRestore: 'NOT_TESTED' }
  await writeFile(`${file}.json`, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 })
  return { file, receipt }
}
export async function pruneExpiredBackups() {
  throw new Error('REVIEWED_RETENTION_PLAN_REQUIRED_USE_REAL_RETENTION_CLI')
}
export function backupFreshness(receipt, now = new Date(), hours = 24) {
  const age = receipt?.createdAt ? now.getTime() - Date.parse(receipt.createdAt) : Infinity
  return Number.isFinite(age) && age >= 0 && age <= hours * 3600000 && receipt?.status === 'ENCRYPTED_AND_VERIFIED' ? 'CURRENT' : 'MISSED_OR_FAILED'
}
