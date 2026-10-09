import request from 'supertest'
import { describe, it, expect, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { createCash, updateCash } from '../src/tracker/cash.js'
import type { AuthRuntime } from '../src/auth/runtime.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'
const owner = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002', key = '00000000-0000-4000-8000-000000000003'
const input = { name: 'เงินสด', balance: '0.1', currency: 'THB', asOf: '2026-10-05' }
function harness() {
  const session = vi.fn(async () => ({ user: { id } }))
  const updateMany = vi.fn(async () => ({ count: 1 })), create = vi.fn(async () => ({ id })), receipt = vi.fn(async () => null as unknown)
  const tx = { $executeRaw: vi.fn(), $queryRaw: vi.fn(), trackerUser: { findUnique: vi.fn(async () => ({ id: owner })) }, authIdentity: { findFirst: vi.fn(async () => null) }, auditEvent: { create: vi.fn() }, idempotencyKey: { findUnique: receipt, create: vi.fn(async () => ({ id })) }, cashAccount: { create, updateMany } }
  const database = { demoWorkspace: { findUnique: vi.fn(async () => null) }, $transaction: async (operation: (tx: unknown) => unknown) => operation(tx), authIdentity: { findUnique: async () => ({ ownerId: owner, provider: 'better-auth', subject: id, verifiedAt: new Date(), owner: { identityState: 'VERIFIED' } }) }, cashAccount: { findMany: vi.fn(async () => []) } } as unknown as PrismaClient
  const auth = { options: { baseURL: 'http://127.0.0.1:4173' }, api: { getSession: session } } as unknown as AuthRuntime
  return { database, session, updateMany, create, receipt, app: createApp({ auth, database }) }
}
describe('cash ownership and optimistic version boundary (unit doubles)', () => {
  it('requires session and exact origin and filters reads by server owner', async () => {
    const h = harness()
    expect((await request(h.app).get('/api/cash?ownerId=other')).status).toBe(200)
    expect(h.database.cashAccount.findMany).toHaveBeenCalledWith({ where: { ownerId: owner }, orderBy: { name: 'asc' } })
    expect((await request(h.app).post('/api/cash').send(input)).status).toBe(403)
    h.session.mockResolvedValue(null as never)
    expect((await request(h.app).get('/api/cash')).status).toBe(401)
    expect((await request(h.app).get('/api/reference-rate')).status).toBe(401)
  })
  it('validates decimal strings before writing and scopes CAS to owner/id/version', async () => {
    const h = harness()
    await expect(createCash(h.database, owner, key, { ...input, balance: 0.1 })).rejects.toThrow()
    expect(h.create).not.toHaveBeenCalled()
    await updateCash(h.database, owner, id, key, { ...input, expectedVersion: 7 })
    expect(h.updateMany).toHaveBeenCalledWith({ where: { ownerId: owner, id, version: 7 }, data: { ...input, version: { increment: 1 } } })
    h.updateMany.mockResolvedValue({ count: 0 })
    await expect(updateCash(h.database, owner, id, key, { ...input, expectedVersion: 7 })).rejects.toThrow('CASH_VERSION_CONFLICT')
  })
})
