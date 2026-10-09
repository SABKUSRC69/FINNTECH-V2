import { readFile, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { GoogleDriveBackups } from './real-drive-backup-core.mjs'
import { decryptDump, readBackupKey, sha256, backupLimits } from './real-backup-core.mjs'

// Run by the owner outside the web service, after an encrypted local backup succeeds.
const archivePath = process.env.FINNTECH_BACKUP_ARCHIVE ?? '', keyPath = process.env.FINNTECH_BACKUP_KEY_FILE ?? '', folder = process.env.FINNTECH_DRIVE_FOLDER_ID ?? ''
if (!path.isAbsolute(archivePath) || !path.isAbsolute(keyPath) || !(await lstat(archivePath)).isFile() || (await lstat(archivePath)).isSymbolicLink()
  || (await lstat(archivePath)).size > backupLimits.maximum + 64) throw new Error('PRIVATE_ARCHIVE_REQUIRED')
const client = new GoogleDriveBackups({ clientId: process.env.FINNTECH_DRIVE_CLIENT_ID, clientSecret: process.env.FINNTECH_DRIVE_CLIENT_SECRET, refreshToken: process.env.FINNTECH_DRIVE_REFRESH_TOKEN })
let key, dump
try {
  const archive = await readFile(archivePath), receipt = JSON.parse(await readFile(`${archivePath}.json`, 'utf8'))
  if (receipt.format !== backupLimits.format || receipt.status !== 'ENCRYPTED_AND_VERIFIED' || receipt.encryptedSha256 !== sha256(archive)) throw new Error('ARCHIVE_RECEIPT_MISMATCH')
  key = await readBackupKey(keyPath); dump = decryptDump(archive, key)
  if (sha256(dump) !== receipt.dumpSha256) throw new Error('ARCHIVE_AUTHENTICATION_FAILED')
  await client.authenticate(); const quota = await client.preflight(folder, archive.length)
  const journalPath = `${archivePath}.drive.json`
  let journal
  try { journal = JSON.parse(await readFile(journalPath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    journal = { folder, id: await client.reserveId(), encryptedSha256: receipt.encryptedSha256, status: 'RESERVED' }
    // Persist before upload; a timeout reuses this file ID, never creates a replacement.
    await writeFile(journalPath, JSON.stringify(journal), { flag: 'wx', mode: 0o600 })
  }
  if (journal.folder !== folder || journal.encryptedSha256 !== receipt.encryptedSha256) throw new Error('ORIGINAL_UPLOAD_JOURNAL_REQUIRED')
  const result = await client.uploadEncrypted(folder, journal.id, path.basename(archivePath), archive, receipt)
  const downloaded = await client.download(result.id), decoded = decryptDump(downloaded, key)
  if (sha256(decoded) !== receipt.dumpSha256) throw new Error('DRIVE_DECRYPTED_COPY_MISMATCH')
  decoded.fill(0)
  await writeFile(journalPath, JSON.stringify({ ...journal, status: 'DOWNLOADED_AND_AUTHENTICATED', verifiedAt: new Date().toISOString(), remainingBytes: quota.remainingBytes }), { mode: 0o600 })
  if (process.env.FINNTECH_DRIVE_RECEIPT_FILE_ID) await client.publishReceipt(folder, process.env.FINNTECH_DRIVE_RECEIPT_FILE_ID, receipt)
  console.log('PASS: private Drive folder/quota checked, ciphertext uploaded/downloaded and authenticated; full cloud-source restore and schedule still require acceptance')
} catch { console.error('FAIL: Drive backup unconfirmed; original archive and upload journal retained; details withheld'); process.exitCode = 1 }
finally { key?.fill(0); dump?.fill(0); client.token = undefined }
