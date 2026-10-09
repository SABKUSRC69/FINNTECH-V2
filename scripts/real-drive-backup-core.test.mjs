import { test } from 'vitest'
import assert from 'node:assert/strict'
import { GoogleDriveBackups } from './real-drive-backup-core.mjs'
import { encryptDump, sha256 } from './real-backup-core.mjs'
import { randomBytes } from 'node:crypto'

const folder = 'owner_folder_123', id = 'reserved_file_123', settings = { clientId: 'fixture', clientSecret: 'fixture-secret', refreshToken: 'fixture-refresh' }
const json = value => new Response(JSON.stringify(value))
function transport(archive, options = {}) {
  const calls = []
  const fetcher = async (url, request) => {
    calls.push({ url, request })
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'fixture-access' })
    if (url.includes(`files/${folder}?`)) return json({ id: folder, mimeType: 'application/vnd.google-apps.folder', ownedByMe: true, shared: !!options.shared, capabilities: { canAddChildren: true } })
    if (url.includes('about?')) return json({ storageQuota: { limit: options.full ? '100' : '10000000', usage: '99' } })
    if (url.includes('uploadType=resumable')) return new Response('{}', { headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture' } })
    if (url.includes('upload_id=')) { if (options.lost) throw new Error('fixture lost response'); return json({ id }) }
    if (url.includes(`files/${id}?alt=media`)) return new Response(options.corrupt ? Buffer.from('corrupt') : archive)
    if (url.includes(`files/${id}?fields`)) return json({ id, name:'20261008-test.fnb', mimeType:'application/octet-stream', parents: [folder], ownedByMe: true, shared: false, appProperties: { finntechFormat:'FINNTECH-BACKUP-1', encryptedSha256: sha256(archive) } })
    throw new Error('unexpected fixture request')
  }
  return { fetcher, calls }
}
test('Drive backup refreshes owner authorization, checks actual quota/private folder and verifies downloaded ciphertext', async () => {
  const archive = encryptDump(Buffer.from('PGDMPsynthetic-only'), randomBytes(32)), fixture = transport(archive), client = new GoogleDriveBackups(settings, fixture.fetcher)
  await client.authenticate(); const result = await client.uploadEncrypted(folder, id, '20261008-test.fnb', archive)
  assert.equal(result.id, id); assert.equal(result.encryptedSha256, sha256(archive))
  const upload = fixture.calls.find(call => call.request?.method === 'PUT'); assert.deepEqual(upload.request.body, archive)
  assert.ok(!upload.request.body.includes(Buffer.from('synthetic-only')))
})
test('lost upload response reconciles the same reserved file, without duplicate create or raw data upload', async () => {
  const archive = encryptDump(Buffer.from('PGDMPfixture'), randomBytes(32)), fixture = transport(archive, { lost: true }), client = new GoogleDriveBackups(settings, fixture.fetcher)
  await client.authenticate(); assert.equal((await client.uploadEncrypted(folder, id, '20261008-test.fnb', archive)).id, id)
  assert.equal(fixture.calls.filter(call => call.url.includes('uploadType=resumable')).length, 1)
  assert.equal(JSON.parse(fixture.calls.find(call => call.url.includes('uploadType=resumable')).request.body).id, id)
})
test('shared folder/quota and corrupted download never pass cloud backup verification', async () => {
  for (const options of [{ shared: true }, { full: true }, { corrupt: true }]) {
    const archive = encryptDump(Buffer.from('PGDMPfixture'), randomBytes(32)), fixture = transport(archive, options), client = new GoogleDriveBackups(settings, fixture.fetcher)
    await client.authenticate(); await assert.rejects(client.uploadEncrypted(folder, id, '20261008-test.fnb', archive), new RegExp(options.shared ? 'DRIVE_PRIVATE_FOLDER_REQUIRED' : options.full ? 'DRIVE_QUOTA_UNCONFIRMED_OR_FULL' : 'DRIVE_ROUND_TRIP_MISMATCH'))
  }
})

test('off-device receipt publication checks private ownership and round-trips only coarse evidence', async () => {
  let stored
  const receipt = { status: 'ENCRYPTED_AND_VERIFIED', createdAt: new Date().toISOString(), encryptedSha256: 'a'.repeat(64), fullRestore: 'NOT_TESTED', privateField: 'must-not-publish' }
  const requests = []
  const client = new GoogleDriveBackups(settings, async (url, request) => {
    requests.push({ url, request })
    if (url.includes('?fields=')) return json({ id, parents: [folder], ownedByMe: true, shared: false, mimeType: 'application/json' })
    if (request.method === 'PATCH') { stored = request.body; return json({ id }) }
    if (url.includes('alt=media')) return new Response(stored)
    throw new Error('unexpected fixture request')
  })
  client.token = 'fixture-access'
  await client.publishReceipt(folder, id, receipt)
  assert.equal(JSON.parse(stored).offDeviceCopy, 'DOWNLOADED_AND_AUTHENTICATED')
  assert.ok(!stored.includes(Buffer.from(receipt.privateField)))
  assert.equal(requests.filter(call => call.request.method === 'PATCH').length, 1)
  const denied = new GoogleDriveBackups(settings, async () => json({ id, parents: [folder], ownedByMe: true, shared: true, mimeType: 'application/json' }))
  denied.token = 'fixture-access'
  await assert.rejects(denied.publishReceipt(folder, id, receipt), /DRIVE_PRIVATE_RECEIPT_REQUIRED/)
})
