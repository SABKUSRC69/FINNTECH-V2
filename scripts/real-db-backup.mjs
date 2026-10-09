import { spawn } from 'node:child_process'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { readRealBackupTarget } from './real-backup-target.mjs'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
import { readBackupKey, saveEncryptedBackup, backupLimits } from './real-backup-core.mjs'

// Operator process, never an API route or web-service job. No source mutation.
const config = readRealBackupTarget(process.env)
const directory = process.env.FINNTECH_BACKUP_DIRECTORY ?? '', keyPath = process.env.FINNTECH_BACKUP_KEY_FILE ?? ''
if (!path.isAbsolute(directory) || !path.isAbsolute(keyPath) || path.resolve(keyPath).startsWith(`${path.resolve(directory)}${path.sep}`)
  || process.env.FINNTECH_BACKUP_PRIVATE_DIRECTORY_CONFIRMED !== 'owner-only') throw new Error('BACKUP_REQUIRES_SEPARATE_PRIVATE_KEY_CUSTODY')
const db = createTrackerDatabase(config.url.href)
let key, dump
try {
  const current = await db.$queryRaw`SELECT current_database() AS name,current_user AS role`
  const marker = await db.runtimeBoundary.findUnique({ where: { id: 'singleton' } })
  if (current[0]?.name !== config.name || current[0]?.role !== config.backupRole || marker?.mode !== 'real'
    || marker.databaseName !== config.name || marker.databaseRole !== config.appRole || marker.origin !== config.origin
    || await db.demoWorkspace.count()) throw new Error('BACKUP_DATABASE_BOUNDARY_REJECTED')
  const version = await db.$queryRaw`SELECT current_setting('server_version_num') AS version`
  if (Number(version[0]?.version) < 160000 || Number(version[0]?.version) >= 190000) throw new Error('BACKUP_CLIENT_VERSION_REJECTED')
  key = await readBackupKey(keyPath)
  const url = config.url
  const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: config.name,
    PGUSER: config.backupRole, PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: 'system' }
  const args = ['run', '--rm', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=8m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'postgres',
    ...['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGSSLROOTCERT'].flatMap(name => ['--env', name]),
    'postgres:18-alpine', 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '--lock-wait-timeout=5000']
  dump = await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), chunks = []; let size = 0
    const timer = setTimeout(() => { child.kill(); reject(new Error('BACKUP_TIMEOUT')) }, 120000)
    child.stdout.on('data', chunk => { size += chunk.length; if (size > backupLimits.maximum) { child.kill(); reject(new Error('BACKUP_SIZE_LIMIT')) } else chunks.push(chunk) })
    child.stderr.on('data', () => {}) // Driver output can contain secrets. Never forward it.
    child.on('error', () => { clearTimeout(timer); reject(new Error('BACKUP_TOOL_UNAVAILABLE')) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('BACKUP_DUMP_FAILED')) })
  })
  const result = await saveEncryptedBackup(directory, dump, key)
  const pointer = process.env.FINNTECH_BACKUP_LAST_RECEIPT_FILE
  if (pointer) {
    if (!path.isAbsolute(pointer) || path.dirname(path.resolve(pointer)) !== path.resolve(directory)) throw new Error('BACKUP_PRIVATE_RECEIPT_REQUIRED')
    await writeFile(pointer, JSON.stringify({ archivePath: result.file, createdAt: result.receipt.createdAt, status: result.receipt.status }), { mode: 0o600 })
  }
  console.log(JSON.stringify({ status: result.receipt.status, createdAt: result.receipt.createdAt, bytes: result.receipt.bytes,
    fullRestore: 'NOT_TESTED', offDeviceCopy: 'NOT_CONFIRMED' }))
} catch { console.error('FAIL: encrypted backup unavailable; details withheld; existing archives retained'); process.exitCode = 1 }
finally { key?.fill(0); dump?.fill(0); await db.$disconnect() }
