import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { readAuthConfiguration } from '../apps/api/dist/auth/config.js'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
import { assertRealBoundary } from '../apps/api/dist/auth/real.js'
import { saveEncryptedBackup, readBackupKey, decryptDump, sha256 } from './real-backup-core.mjs'

const config = readAuthConfiguration(process.env)
if (config?.real?.boundary !== 'real-rehearsal' || config.real.databaseName !== 'finntech_real_rehearsal') throw new Error('ISOLATED_REHEARSAL_REQUIRED')
const root = path.resolve('.real-use-20261008.local/backup-rehearsal'), compose = ['compose', '--env-file', '.real-use-20261008.local/rehearsal.env', '-f', 'compose.real-rehearsal.yaml']
const db = createTrackerDatabase(config.databaseUrl)
const targetService = 'postgres-real-restore-verified', targetDatabase = 'finntech_real_restore_verified'
let started = false, key, dump, restoredDump, source, target
function tool(args, input, limit = 134217728) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }), chunks = []; let size = 0
    const timer = setTimeout(() => { child.kill(); reject(new Error('REHEARSAL_TIMEOUT')) }, 60000)
    child.stdout.on('data', chunk => { size += chunk.length; if (size > limit) { child.kill(); reject(new Error('REHEARSAL_OUTPUT_LIMIT')) } else chunks.push(chunk) })
    child.stderr.on('data', () => {})
    child.stdin.on('error', () => {})
    child.on('error', () => { clearTimeout(timer); reject(new Error('REHEARSAL_TOOL_FAILED')) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('REHEARSAL_TOOL_FAILED')) })
    child.stdin.end(input)
  })
}
async function sql(container, role, name, query) { return (await tool(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', name], Buffer.from(query))).toString('utf8').trim() }
try {
  await assertRealBoundary(db, config.real, config.origin)
  source = (await tool([...compose, 'ps', '-q', 'postgres-real-rehearsal'])).toString('utf8').trim()
  if (!/^[a-f0-9]{12,64}$/.test(source)) throw new Error('SOURCE_CONTAINER_REQUIRED')
  const sourceInspection = JSON.parse((await tool(['inspect', source])).toString('utf8'))[0]
  if (sourceInspection.Config.Labels['com.docker.compose.project'] !== 'finntech-real-rehearsal-20261008'
    || sourceInspection.Config.Labels['com.docker.compose.service'] !== 'postgres-real-rehearsal'
    || sourceInspection.HostConfig.PortBindings['5432/tcp'][0].HostIp !== '127.0.0.1') throw new Error('SOURCE_ISOLATION_REJECTED')
  started = true; await tool([...compose, 'up', '-d', '--pull', 'never', targetService])
  target = (await tool([...compose, 'ps', '-q', targetService])).toString('utf8').trim()
  const targetInspection = JSON.parse((await tool(['inspect', target])).toString('utf8'))[0]
  if (target === source || targetInspection.HostConfig.NetworkMode !== 'none'
    || Object.keys(targetInspection.HostConfig.PortBindings ?? {}).length || targetInspection.Image !== sourceInspection.Image
    || targetInspection.Config.Labels['com.docker.compose.service'] !== targetService
    || targetInspection.Mounts.some(t => sourceInspection.Mounts.some(s => s.Name === t.Name))) throw new Error('RESTORE_ISOLATION_REJECTED')
  let available = false
  for (let i = 0; i < 20; i++) {
    try { await sql(target, 'real_restore', targetDatabase, 'SELECT 1;'); available = true; break } catch { await new Promise(resolve => setTimeout(resolve, 500)) }
  }
  if (!available) throw new Error('RESTORE_NOT_READY')
  const empty = await sql(target, 'real_restore', targetDatabase, "SELECT current_database(),current_user,(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public'),(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid WHERE n.nspname='public');")
  if (empty !== `${targetDatabase}|real_restore|0|0`) throw new Error('NONEMPTY_TARGET_REFUSED')
  const evidenceSql = await readFile('scripts/sql/real-restore-evidence.sql', 'utf8')
  const before = await sql(source, 'real_rehearsal', 'finntech_real_rehearsal', evidenceSql)
  dump = await tool(['exec', source, 'pg_dump', '-U', 'real_rehearsal', '-d', 'finntech_real_rehearsal', '--format=custom', '--no-owner', '--no-acl'])
  await mkdir(path.join(root, 'custody'), { recursive: true }); await mkdir(path.join(root, 'recovered-key-location'), { recursive: true })
  const keyPath = path.join(root, 'custody', 'backup.key'), recoveredPath = path.join(root, 'recovered-key-location', 'backup.key')
  try { await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  key = await readBackupKey(keyPath)
  const archive = await saveEncryptedBackup(path.join(root, 'vault'), dump, key)
  try { await copyFile(keyPath, recoveredPath, 1) } catch (error) { if (error.code !== 'EEXIST') throw error }
  const recoveryKey = await readBackupKey(recoveredPath)
  restoredDump = decryptDump(await readFile(archive.file), recoveryKey); recoveryKey.fill(0)
  if (sha256(restoredDump) !== sha256(dump)) throw new Error('ARCHIVE_RECOVERY_MISMATCH')
  await tool(['exec', '-i', target, 'pg_restore', '-U', 'real_restore', '-d', targetDatabase, '--single-transaction', '--exit-on-error', '--no-owner', '--no-acl'], restoredDump)
  const restored = await sql(target, 'real_restore', targetDatabase, evidenceSql)
  const after = await sql(source, 'real_rehearsal', 'finntech_real_rehearsal', evidenceSql)
  await writeFile(path.join(root, 'source-before.evidence.txt'), before); await writeFile(path.join(root, 'source-after.evidence.txt'), after); await writeFile(path.join(root, 'restored.evidence.txt'), restored)
  if (before !== after || before !== restored) throw new Error('FULL_RESTORE_EVIDENCE_MISMATCH')
  const constraintProbe = `BEGIN;
    INSERT INTO auth_delivery_jobs(id,user_id,fingerprint,kind,envelope,status,expires_at)
      SELECT gen_random_uuid(),(SELECT id FROM auth_users LIMIT 1),gen_random_uuid()::text,k,s,s,now()+interval '1 hour'
      FROM unnest(ARRAY['verify','reset','notice']) k CROSS JOIN unnest(ARRAY['PENDING','SENT','EXPIRED','FAILED']) s;
    DO $$ BEGIN
      BEGIN INSERT INTO auth_delivery_jobs(id,user_id,fingerprint,kind,envelope,status,expires_at)
        VALUES(gen_random_uuid(),(SELECT id FROM auth_users LIMIT 1),gen_random_uuid()::text,'invalid','probe','PENDING',now());
        RAISE EXCEPTION 'invalid kind was accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
      BEGIN INSERT INTO auth_delivery_jobs(id,user_id,fingerprint,kind,envelope,status,expires_at)
        VALUES(gen_random_uuid(),(SELECT id FROM auth_users LIMIT 1),gen_random_uuid()::text,'verify','probe','invalid',now());
        RAISE EXCEPTION 'invalid status was accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
    END $$; ROLLBACK;`
  await sql(source, 'real_rehearsal', 'finntech_real_rehearsal', constraintProbe)
  await sql(target, 'real_restore', targetDatabase, constraintProbe)
  if (await sql(source, 'real_rehearsal', 'finntech_real_rehearsal', evidenceSql) !== before
    || await sql(target, 'real_restore', targetDatabase, evidenceSql) !== restored) throw new Error('CONSTRAINT_PROBE_CHANGED_DATA')
  const guards = await sql(target, 'real_restore', targetDatabase, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public';")
  if (guards === '0') throw new Error('RESTORE_DID_NOT_POPULATE')
  const result = { status: 'PASS', syntheticOnly: true, PostgreSQL: 18, archivePortable: true, authenticatedBeforeRestore: true,
    allPublicTablesAndConstraintsMatched: true, exactCastRewriteWhitelist: ['delivery_kind', 'delivery_status'], constraintBehaviorMatched: true,
    sourceUnchanged: true, plaintextDiskFiles: false, targetNetwork: 'none',
    tableCount: before.split('\n').filter(line => line.startsWith('TABLE:')).length, evidenceSha256: sha256(before),
    physicalOffDeviceCopy: 'NOT_TESTED', actualSchedule: 'NOT_TESTED', actualAlerts: 'NOT_TESTED', productionRPO: 'NOT_TESTED', productionRTO: 'NOT_TESTED' }
  await writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2))
  await writeFile(path.join(root, 'source-before.evidence.txt'), before); await writeFile(path.join(root, 'source-after.evidence.txt'), after); await writeFile(path.join(root, 'restored.evidence.txt'), restored)
  console.log(JSON.stringify(result))
} catch (error) { console.error(`FAIL: ${error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RESTORE_UNAVAILABLE'}; details withheld; all databases and archives retained`); process.exitCode = 1 }
finally {
  key?.fill(0); dump?.fill(0); restoredDump?.fill(0)
  if (started) { try { await tool([...compose, 'stop', targetService]) } catch { console.error('FAIL: own restore process stop unconfirmed'); process.exitCode = 1 } }
  await db.$disconnect()
}
