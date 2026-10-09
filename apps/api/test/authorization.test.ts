import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { AuthRuntime } from '../src/auth/runtime.js'
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js'

const origin = 'http://127.0.0.1:4173'
const authUserA = '11111111-1111-4111-8111-111111111111'
const authUserB = '55555555-5555-4555-8555-555555555555'
const ownerA = '22222222-2222-4222-8222-222222222222'
const ownerB = '33333333-3333-4333-8333-333333333333'
const resourceId = '44444444-4444-4444-8444-444444444444'

interface IdentityFixture {
  ownerId: string
  provider: string
  subject: string
  verifiedAt: Date | null
  owner: { identityState: string }
}

function verifiedIdentity(ownerId = ownerA): IdentityFixture {
  return {
    ownerId, provider: 'better-auth', subject: authUserA,
    verifiedAt: new Date('2026-10-01T00:00:00.000Z'),
    owner: { identityState: 'VERIFIED' },
  }
}

// These doubles exercise HTTP authorization decisions, not PostgreSQL constraints or locks.
function harness() {
  const getSession = vi.fn(async () => ({ user: { id: authUserA } }) as { user: { id: string } } | null)
  const findIdentity = vi.fn(async (): Promise<IdentityFixture | null> => verifiedIdentity())
  const categories = vi.fn(async () => [])
  const entries = vi.fn(async () => [])
  const budgets = vi.fn(async () => [])
  const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation({
    financeCategory: { findMany: categories },
    financeTransaction: { findMany: entries },
    budget: { findMany: budgets },
  }))
  const auth = { options: { baseURL: origin }, api: { getSession } } as unknown as AuthRuntime
  const database = {
    demoWorkspace: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
    authIdentity: { findUnique: findIdentity }, $transaction: transaction,
  } as unknown as PrismaClient
  return { app: createApp({ auth, database }), getSession, findIdentity, transaction, categories, entries, budgets }
}

const protectedReads = ['/api/me', '/api/finance?month=2026-10', '/api/crypto', '/api/crypto/market', '/api/stocks/market', '/api/backup']
const protectedWrites = [
  ['POST', '/api/finance/categories'], ['POST', '/api/finance/transactions'],
  ['POST', '/api/finance/budgets'], ['POST', '/api/crypto/portfolios'],
  ['POST', '/api/crypto/trades'], ['POST', '/api/backup/preview'],
  ['POST', '/api/backup/restore'], ['PATCH', `/api/finance/categories/${resourceId}`],
  ['POST', `/api/finance/transactions/${resourceId}/corrections`],
  ['POST', `/api/crypto/trades/${resourceId}/corrections`],
] as const

describe('HTTP owner boundary without database runtime', () => {
  it.each(protectedReads)('rejects anonymous reading of %s before looking up owners', async path => {
    const h = harness()
    h.getSession.mockResolvedValue(null)
    const response = await request(h.app).get(path).set('X-Owner-Id', ownerB)
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(h.findIdentity).not.toHaveBeenCalled()
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it.each(protectedWrites)('rejects anonymous %s %s before parsing or writing', async (method, path) => {
    const h = harness()
    h.getSession.mockResolvedValue(null)
    const call = method === 'PATCH' ? request(h.app).patch(path) : request(h.app).post(path)
    const response = await call.set('Origin', origin).set('X-Owner-Id', ownerB).send({ ownerId: ownerB })
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(h.findIdentity).not.toHaveBeenCalled()
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('uses only the authenticated subject even when query and headers claim another owner', async () => {
    const h = harness()
    const response = await request(h.app).get(`/api/me?ownerId=${ownerB}&authUserId=${ownerB}`)
      .set('X-Owner-Id', ownerB).set('X-Auth-User-Id', ownerB)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ownerId: ownerA })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(h.findIdentity).toHaveBeenCalledExactlyOnceWith({ where: { authUserId: authUserA }, include: { owner: true } })
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('passes the server owner to every finance read filter', async () => {
    const h = harness()
    const response = await request(h.app).get(`/api/finance?month=2026-10&ownerId=${ownerB}`).set('X-Owner-Id', ownerB)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ currency: 'THB', income: '0', expense: '0', balance: '0' })
    for (const query of [h.categories, h.entries, h.budgets]) {
      expect(query).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: ownerA }) }))
    }
  })

  it('keeps a second authenticated subject scoped to its own owner', async () => {
    const h = harness()
    h.getSession.mockResolvedValue({ user: { id: authUserB } })
    h.findIdentity.mockResolvedValue({ ...verifiedIdentity(ownerB), subject: authUserB })
    const response = await request(h.app).get(`/api/finance?month=2026-10&ownerId=${ownerA}`).set('X-Owner-Id', ownerA)
    expect(response.status).toBe(200)
    expect(h.findIdentity).toHaveBeenCalledExactlyOnceWith({ where: { authUserId: authUserB }, include: { owner: true } })
    for (const query of [h.categories, h.entries, h.budgets]) {
      expect(query).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: ownerB }) }))
    }
  })

  it('returns a fixed failure when the session lookup throws', async () => {
    const h = harness()
    h.getSession.mockRejectedValue(new Error('private-driver-detail-sentinel'))
    const response = await request(h.app).get('/api/me')
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(response.text).not.toContain('private-driver-detail-sentinel')
    expect(h.findIdentity).not.toHaveBeenCalled()
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it.each([
    { provider: 'fixture' }, { subject: ownerB }, { verifiedAt: null }, { owner: { identityState: 'FIXTURE' } },
  ])('rejects an invalid existing mapping %j', async invalid => {
    const h = harness()
    h.findIdentity.mockResolvedValue({ ...verifiedIdentity(), ...invalid })
    const response = await request(h.app).get('/api/me')
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(response.text).not.toContain(ownerA)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('fails closed when the owner mapping query fails', async () => {
    const h = harness()
    h.findIdentity.mockRejectedValue(new Error('private-query-detail-sentinel'))
    const response = await request(h.app).get('/api/me')
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(response.text).not.toContain('private-query-detail-sentinel')
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('does not retry a non-unique-key failure during first owner creation', async () => {
    const h = harness()
    h.findIdentity.mockResolvedValue(null)
    h.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('synthetic storage failure', { code: 'P1001', clientVersion: 'test' }))
    const response = await request(h.app).get('/api/me')
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(h.findIdentity).toHaveBeenCalledTimes(1)
    expect(h.transaction).toHaveBeenCalledTimes(1)
  })

  it('reuses the winning mapping after a first-request unique-key race', async () => {
    const h = harness()
    h.findIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce(verifiedIdentity())
    h.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('synthetic unique conflict', { code: 'P2002', clientVersion: 'test' }))
    const response = await request(h.app).get('/api/me')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ownerId: ownerA })
    expect(h.findIdentity).toHaveBeenCalledTimes(2)
    expect(h.transaction).toHaveBeenCalledTimes(1)
  })

  it('does not authorize a missing winner after a unique-key conflict', async () => {
    const h = harness()
    h.findIdentity.mockResolvedValue(null)
    h.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('synthetic unique conflict', { code: 'P2002', clientVersion: 'test' }))
    const response = await request(h.app).get('/api/me')
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(h.findIdentity).toHaveBeenCalledTimes(2)
    expect(h.transaction).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'http://untrusted.example.invalid', `${origin}/unexpected-path`])('rejects a missing or non-exact write Origin (%s)', async writeOrigin => {
    const h = harness()
    const call = request(h.app).post('/api/finance/categories')
    if (writeOrigin) call.set('Origin', writeOrigin)
    const response = await call.send({ name: 'Synthetic category', type: 'expense' })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN')
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('rejects an owner property in a write body instead of trusting it', async () => {
    const h = harness()
    const response = await request(h.app).post('/api/finance/categories').set('Origin', origin)
      .set('Idempotency-Key', resourceId)
      .send({ name: 'Synthetic category', type: 'expense', ownerId: ownerB })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('INVALID_INPUT')
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it.each([1, null, true, '', ' 1.00', '1e2', '1.001', '1000000000000000000.00'])('rejects invalid THB input %j before a mutation transaction', async amount => {
    const h = harness()
    const response = await request(h.app).post('/api/finance/transactions').set('Origin', origin)
      .set('Idempotency-Key', resourceId)
      .send({ type: 'expense', amount, currency: 'THB', categoryId: resourceId, date: '2026-10-05', note: '' })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('INVALID_INPUT')
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON without reflecting request content', async () => {
    const h = harness()
    const response = await request(h.app).post('/api/finance/categories').set('Origin', origin)
      .set('Content-Type', 'application/json').send('{"synthetic-invalid-sentinel":')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: { code: 'INVALID_REQUEST' } })
    expect(response.text).not.toContain('synthetic-invalid-sentinel')
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('rejects oversized normal request bodies before mutation', async () => {
    const h = harness()
    const response = await request(h.app).post('/api/finance/categories').set('Origin', origin)
      .send({ name: 'x'.repeat(65 * 1024), type: 'expense' })
    expect(response.status).toBe(413)
    expect(response.body).toEqual({ error: { code: 'BODY_TOO_LARGE' } })
    expect(h.transaction).not.toHaveBeenCalled()
  })
})
