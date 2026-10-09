import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireAuthTestDatabase } from '../../../scripts/tracker-auth-target.mjs'
import { createTrackerDatabase } from '../src/persistence/database.js'
import { createAuthRuntime } from '../src/auth/runtime.js'
import { requireOwner, type OwnerContext } from '../src/auth/authorization.js'
import { createApp } from '../src/app.js'

// Only the guarded command runs this suite. Assertions never print tokens/passwords.
const target = requireAuthTestDatabase(process.env)
const database = createTrackerDatabase(target.href)
const origin = 'http://127.0.0.1:4173'
const secret = process.env.BETTER_AUTH_SECRET!
const auth = createAuthRuntime(database, { databaseUrl: target.href, secret, origin, secureCookies: false })
const app = createApp({ auth, database })
const password = randomBytes(32).toString('hex')
const emailA = `${randomUUID()}@example.invalid`
const emailB = `${randomUUID()}@example.invalid`
let cookieA: string
let cookieB: string
let ownerA: string
let ownerB: string
let userA: string

function sessionCookie(response: request.Response): string {
  const headers = response.headers['set-cookie'] as unknown as string[]
  const session = headers?.find(value => value.startsWith('finntech.session_token='))
  assert.ok(Boolean(session), 'a session cookie must be issued (value withheld)')
  assert.ok(/HttpOnly/i.test(session!) && /SameSite=Lax/i.test(session!), 'cookie security attributes must be present')
  assert.ok(!/Domain=/i.test(session!), 'cookie must remain host-only')
  return session!.split(';')[0]!
}

before(async () => {
  const signUpA = await request(app).post('/api/auth/sign-up/email').set('Origin', origin).send({ name: 'Synthetic A', email: emailA, password })
  const signUpB = await request(app).post('/api/auth/sign-up/email').set('Origin', origin).send({ name: 'Synthetic B', email: emailB, password })
  assert.equal(signUpA.status, 200, 'synthetic A registration must succeed')
  assert.equal(signUpB.status, 200, 'synthetic B registration must succeed')
  assert.ok(!('token' in signUpA.body), 'HTTP JSON must not expose session token')
  cookieA = sessionCookie(signUpA)
  cookieB = sessionCookie(signUpB)
  userA = signUpA.body.user.id as string
})

after(async () => { await database.$disconnect() })

test('all five migrations are applied without replacing prior migrations', async () => {
  const rows = await database.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`
  assert.deepEqual(rows.map(row => row.migration_name), [
    '20261001000000_tracker_foundation', '20261001000001_tracker_invariants',
    '20261001000002_category_type_restrict', '20261004000000_database_auth',
    '20261004000001_history_corrections',
  ])
})

test('registration stores hashed credentials and database sessions, never plaintext passwords', async () => {
  const account = await database.authAccount.findFirst({ where: { userId: userA } })
  assert.ok(Boolean(account?.password) && account?.password !== password, 'credential hash must differ from input (values withheld)')
  assert.equal(account?.providerId, 'credential')
  assert.equal(await database.authSession.count({ where: { userId: userA } }), 1)
})

test('anonymous requests and client-supplied fixture owner IDs cannot authenticate', async () => {
  const fixture = await database.trackerUser.create({ data: { identityState: 'FIXTURE' } })
  const response = await request(app).get('/api/me').set('X-Owner-Id', fixture.id).query({ ownerId: fixture.id })
  assert.equal(response.status, 401)
  assert.equal(await database.authIdentity.count({ where: { ownerId: fixture.id } }), 0)
})

test('concurrent first session requests create one owner and one mapping atomically', async () => {
  const before = await database.trackerUser.count()
  const responses = await Promise.all(Array.from({ length: 4 }, () => request(app).get('/api/me').set('Cookie', cookieA)))
  assert.ok(responses.every(response => response.status === 200), 'concurrent authenticated requests must succeed')
  ownerA = responses[0]!.body.ownerId as string
  assert.ok(responses.every(response => response.body.ownerId === ownerA), 'all requests must resolve the same owner')
  assert.equal(await database.trackerUser.count(), before + 1)
  assert.equal(await database.authIdentity.count({ where: { authUserId: userA } }), 1)
  const user = await database.trackerUser.findUniqueOrThrow({ where: { id: ownerA } })
  assert.equal(user.identityState, 'VERIFIED')
})

test('server owner context isolates portfolios A/B and ignores requested owner overrides', async () => {
  const meB = await request(app).get('/api/me').set('Cookie', cookieB).set('X-Owner-Id', ownerA)
  assert.equal(meB.status, 200)
  ownerB = meB.body.ownerId as string
  assert.ok(ownerA !== ownerB)
  const portfolio = await database.cryptoPortfolio.create({ data: { ownerId: ownerA, name: 'Synthetic owned portfolio' } })
  // Test-only route exercises the middleware + scoped query without opening business endpoints.
  const boundary = express()
  boundary.use(requireOwner(auth, database))
  boundary.get('/owned/:id', async (req, res) => {
    const owner = res.locals.owner as OwnerContext
    const row = await database.cryptoPortfolio.findFirst({ where: { id: req.params.id, ownerId: owner.ownerId } })
    res.status(row ? 200 : 404).json({ found: Boolean(row) })
  })
  assert.equal((await request(boundary).get(`/owned/${portfolio.id}`).set('Cookie', cookieA)).status, 200)
  assert.equal((await request(boundary).get(`/owned/${portfolio.id}`).set('Cookie', cookieB).query({ ownerId: ownerA })).status, 404)
})

test('email sign-in rejects wrong password and retains the same business owner after fresh login', async () => {
  const wrong = await request(app).post('/api/auth/sign-in/email').set('Origin', origin).send({ email: emailA, password: randomBytes(32).toString('hex') })
  assert.equal(wrong.status, 401)
  const signed = await request(app).post('/api/auth/sign-in/email').set('Origin', origin).send({ email: emailA, password })
  assert.equal(signed.status, 200)
  const response = await request(app).get('/api/me').set('Cookie', sessionCookie(signed))
  assert.equal(response.body.ownerId, ownerA)
})

test('unsafe cross-origin and missing-origin requests are rejected before Auth mutations', async () => {
  for (const suppliedOrigin of [undefined, 'https://untrusted.example.invalid']) {
    let operation = request(app).post('/api/auth/sign-out').set('Cookie', cookieA)
    if (suppliedOrigin) operation = operation.set('Origin', suppliedOrigin)
    assert.equal((await operation).status, 403)
  }
  assert.equal((await request(app).get('/api/me').set('Cookie', cookieA)).status, 200)
})

test('tampered cookies cannot authenticate', async () => {
  const response = await request(app).get('/api/me').set('Cookie', `${cookieA}tampered`)
  assert.equal(response.status, 401)
})

test('get-session response is uncached and does not expose the raw token', async () => {
  const response = await request(app).get('/api/auth/get-session').set('Cookie', cookieA)
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.ok(response.body.session && !('token' in response.body.session), 'session JSON must omit token')
})

test('expired database sessions are rejected with no cookie-cache bypass', async () => {
  await database.authSession.updateMany({ where: { userId: userA }, data: { expiresAt: new Date('2020-01-01T00:00:00Z') } })
  assert.equal((await request(app).get('/api/me').set('Cookie', cookieA)).status, 401)
})

test('logout revokes the database session and replaying the old cookie is rejected', async () => {
  const signedOut = await request(app).post('/api/auth/sign-out').set('Origin', origin).set('Cookie', cookieB)
  assert.equal(signedOut.status, 200)
  assert.equal((await request(app).get('/api/me').set('Cookie', cookieB)).status, 401)
})

test('health does not claim Auth readiness and unsupported auth/business paths remain JSON 404', async () => {
  const health = await request(app).get('/api/health')
  assert.equal(health.body.checks.database, 'ok')
  assert.equal(health.body.checks.auth, 'not_checked')
  for (const path of ['/api/finance', '/api/auth/delete-user', '/api/auth/reset-password']) {
    const response = await request(app).post(path).send({})
    assert.equal(response.status, 404)
    assert.ok(response.headers['content-type']?.includes('json'))
  }
})
