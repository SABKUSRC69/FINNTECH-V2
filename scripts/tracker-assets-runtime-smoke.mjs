import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createTrackerDatabase } from '../apps/api/dist/persistence/database.js'
import { createCash, updateCash, cashOverview } from '../apps/api/dist/tracker/cash.js'
import { exportBackup, previewBackup, restoreBackup, prepareBackup } from '../apps/api/dist/tracker/backup.js'
import { ReferenceFxRelay } from '../apps/api/dist/tracker/fx.js'

let db
const result = { checkedAt: new Date().toISOString(), checks: [] }
const pass = name => { result.checks.push({ name, result: 'PASS' }); console.log(`PASS: ${name}`) }
try {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (process.env.TRACKER_AUTH_LOCAL_CONFIRM !== 'synthetic-only' || !['postgres:', 'postgresql:'].includes(target.protocol)
    || target.hostname !== '127.0.0.1' || target.port !== '5436' || target.pathname !== '/finntech_auth_local'
    || target.username !== 'ui_fixture' || !target.password || target.search || target.hash) throw new Error('Refused synthetic target')
  db = createTrackerDatabase(target.href)
  const identity = await db.$queryRaw`SELECT current_database() AS name, current_user AS role, version() AS version`
  assert.equal(identity[0].name, 'finntech_auth_local'); assert.equal(identity[0].role, 'ui_fixture')
  result.postgresql = identity[0].version; pass('verified dedicated synthetic target')
  // Apply only the reviewed forward migration. Never reset, truncate, or remove data/volumes.
  const migrations = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`
  const root = new URL('../apps/api/prisma/migrations/', import.meta.url)
  const names = (await fs.readdir(root)).filter(name => /^\d/.test(name)).sort()
  const forward = '20261005000000_cash_accounts'
  assert.equal(names.at(-1), forward)
  for (const name of names.filter(name => name !== forward)) {
    const applied = migrations.filter(row => row.migration_name === name)
    assert.equal(applied.length, 1); assert.ok(applied[0].finished_at); assert.equal(applied[0].rolled_back_at, null)
    assert.equal(applied[0].checksum, createHash('sha256').update(await fs.readFile(new URL(`${name}/migration.sql`, root))).digest('hex'))
  }
  assert.ok(migrations.every(row => names.includes(row.migration_name) && row.finished_at && !row.rolled_back_at))
  const status = await new Promise(resolve => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.resume(); child.stderr.resume(); child.once('error', () => resolve(1)); child.once('exit', code => resolve(code))
  })
  assert.equal(status, 0)
  result.migrations = (await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`).map(row => row.migration_name)
  assert.deepEqual(result.migrations, names); pass('six migrations including forward cash migration; prior checksums unchanged')
  const [ownerA, ownerB, ownerC] = await Promise.all([1, 2, 3].map(() => db.trackerUser.create({ data: { identityState: 'FIXTURE' } })))
  const input = { name: `synthetic-cash-${randomUUID()}`, balance: '0.1', currency: 'THB', asOf: '2026-10-05' }, key = randomUUID()
  const first = await createCash(db, ownerA.id, key, input), retry = await createCash(db, ownerA.id, key, input)
  assert.deepEqual(first, retry); assert.equal(await db.cashAccount.count({ where: { ownerId: ownerA.id } }), 1)
  await assert.rejects(createCash(db, ownerA.id, key, { ...input, balance: '0.2' }), /IDEMPOTENCY_CONFLICT/)
  assert.equal((await cashOverview(db, ownerA.id)).accounts[0].balance, '0.1'); pass('decimal round-trip and lost-response retry returns original receipt')
  await assert.rejects(updateCash(db, ownerB.id, first.id, randomUUID(), { ...input, expectedVersion: 1 }), /CASH_VERSION_CONFLICT/)
  assert.equal((await cashOverview(db, ownerB.id)).accounts.length, 0); pass('cross-owner cash access denied')
  const race = await Promise.allSettled(['0.2', '0.3'].map(balance => updateCash(db, ownerA.id, first.id, randomUUID(), { ...input, balance, expectedVersion: 1 })))
  assert.equal(race.filter(row => row.status === 'fulfilled').length, 1)
  assert.match(String(race.find(row => row.status === 'rejected').reason), /CASH_VERSION_CONFLICT/)
  assert.equal((await cashOverview(db, ownerA.id)).accounts[0].version, 2); pass('concurrent compare-and-swap allows exactly one update')
  const maximum = await createCash(db, ownerA.id, randomUUID(), { ...input, name: `max-${randomUUID()}`, balance: '999999999999999999.99' })
  assert.equal((await cashOverview(db, ownerA.id)).accounts.find(row => row.id === maximum.id).balance, '999999999999999999.99')
  await assert.rejects(db.cashAccount.create({ data: { ownerId: ownerA.id, name: randomUUID(), balance: '-1', asOf: '2026-10-05' } }))
  await assert.rejects(db.cashAccount.update({ where: { id: first.id }, data: { ownerId: ownerB.id } }))
  await assert.rejects(db.$transaction(async tx => { await tx.cashAccount.create({ data: { ownerId: ownerB.id, name: randomUUID(), balance: '1', asOf: '2026-10-05' } }); throw new Error('synthetic rollback') }), /synthetic rollback/)
  assert.equal(await db.cashAccount.count({ where: { ownerId: ownerB.id } }), 0); pass('maximum NUMERIC, nonnegative/immutable-owner constraints and rollback')
  const backup = await exportBackup(db, ownerA.id), preview = await previewBackup(db, ownerB.id, backup)
  assert.equal(backup.version, 2); assert.equal(preview.summary.cash.length, 2); assert.equal(preview.canRestore, true)
  const restoreKey = randomUUID(), body = { backup, previewDigest: preview.digest, consent: true }
  const restored = await restoreBackup(db, ownerB.id, restoreKey, body)
  assert.deepEqual(restored, await restoreBackup(db, ownerB.id, restoreKey, body))
  assert.deepEqual(prepareBackup(await exportBackup(db, ownerB.id)).summary, preview.summary)
  assert.equal((await previewBackup(db, ownerB.id, backup)).canRestore, false); pass('v2 cash backup/restore and duplicate receipt verification')
  const v1 = { ...backup, version: 1 }; delete v1.cashAccounts
  const old = await previewBackup(db, ownerC.id, v1)
  await restoreBackup(db, ownerC.id, randomUUID(), { backup: v1, previewDigest: old.digest, consent: true })
  assert.equal((await cashOverview(db, ownerC.id)).accounts.length, 0); pass('v1 restore compatibility without invented cash')
  const relay = new ReferenceFxRelay(); await relay.refresh()
  const quote = relay.snapshot()
  result.referenceRate = quote
  assert.equal(quote.status, 'FRESH'); assert.ok(quote.rate); pass('actual public USDT_THB metadata and ticker')
  result.result = 'PASS'
} catch (error) {
  result.result = 'FAIL'
  // Never expose driver messages, credentials, connection strings or owner fixture identifiers.
  result.error = { name: error?.name ?? 'Error', code: typeof error?.code === 'string' ? error.code : 'WITHHELD' }
  console.error('FAIL: assets runtime check; sanitized error name/code saved, no reset performed')
  process.exitCode = 1
} finally {
  if (db) await db.$disconnect()
  const evidence = process.env.TRACKER_ASSETS_EVIDENCE_DIR
  if (evidence && path.resolve(evidence) === path.resolve('.assets-review-20261005.local')) await fs.writeFile(path.join(evidence, 'runtime.json'), JSON.stringify(result, null, 2))
}
