import assert from 'node:assert/strict'
import { randomUUID, createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import request from 'supertest'
import { requireRecoveryTarget } from '../../../scripts/recovery-3a-target.mjs'
import { readAuthConfiguration } from '../src/auth/config.js'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { RecoveryService } from '../src/auth/recovery.js'
import { createApp } from '../src/app.js'

test('A09 peer limit is shared by two actual processes despite distinct synthetic account keys', async () => {
  const target = requireRecoveryTarget(process.env), config = readAuthConfiguration(process.env)!
  assert.ok(config.recovery)
  const database = createTrackerDatabase(target.href), service = new RecoveryService(database, config)
  const app = createApp({ auth: service.auth, database, recovery: service })
  const child = spawn(process.execPath, ['--no-strip-types', 'apps/api/dist/server.js'], { env: process.env, stdio: 'pipe', windowsHide: true })
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
  try {
    let ready = false
    for (let n = 0; n < 60; n++) {
      if (child.exitCode !== null) break
      try { if ((await fetch(`${config.origin}/api/health`)).ok) { ready = true; break } } catch {}
      await delay(100)
    }
    assert.ok(ready, 'dedicated child process ready')
    if (Date.now() % 60000 > 55000) await delay(5100)
    const window = new Date(Math.floor(Date.now() / 60000) * 60000)
    const emails = Array.from({ length: 61 }, () => `${randomUUID()}@example.invalid`)
    const statuses = await Promise.all(emails.map(async (email, index) => {
      if (index % 2 === 0) return (await request(app).post('/api/auth/request-password-reset').set('Origin', config.origin).set('Host', new URL(config.origin).host).send({ email })).status
      return (await fetch(`${config.origin}/api/auth/request-password-reset`, { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })).status
    }))
    assert.ok(statuses.every(status => status === 200 || status === 429), 'only generic/limited responses')
    assert.ok(statuses.some(status => status === 429), 'shared peer limit, not account limit, rejects requests')
    const digest = (value: string) => createHmac('sha256', config.recovery!.key).update(value).digest('hex')
    const accounts = await database.authRecoveryRate.findMany({ where: { window, key: { in: emails.map(email => digest(`account:${email}`)) } } })
    assert.equal(accounts.length, 61); assert.ok(accounts.every(row => row.hits === 1), 'distinct account buckets never reach account cap')
    const peer = await database.authRecoveryRate.findUniqueOrThrow({ where: { key_window: { key: digest('peer:loopback'), window } } })
    assert.ok(peer.hits >= 61, 'both OS processes increment the same durable peer bucket')
    await writeFile('.phase3a-20261007.local/rate-summary.json', JSON.stringify({ target: 'synthetic PostgreSQL:5441', processes: 2,
      distinctAccountRequests: 61, generic: statuses.filter(status => status === 200).length, limited: statuses.filter(status => status === 429).length,
      accountBucketHits: 1, peerBucketAtLeast: 61, forwardedPeerRejectedByMainSuite: true }, null, 2))
  } finally {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped }
    await database.$disconnect()
  }
})
