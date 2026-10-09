import { cashInputSchema, cashUpdateSchema, resourceIdSchema } from '@finntech/contracts'
import type { PrismaClient } from '../generated/prisma/client.js'
import { thbForApi } from '../persistence/decimal.js'
import { ownedMutation, TrackerError } from './service.js'

export async function cashOverview(db: PrismaClient, ownerId: string) {
  const rows = await db.cashAccount.findMany({ where: { ownerId }, orderBy: { name: 'asc' } })
  return { accounts: rows.map(row => ({ id: row.id, name: row.name, balance: thbForApi(row.balance), currency: 'THB', asOf: row.asOf, version: row.version })) }
}
export async function createCash(db: PrismaClient, owner: string, key: unknown, input: unknown) {
  const value = cashInputSchema.parse(input)
  return ownedMutation(db, owner, 'cash.create', key, value, async tx => {
    const row = await tx.cashAccount.create({ data: { ownerId: owner, ...value } })
    return { id: row.id }
  })
}
export async function updateCash(db: PrismaClient, owner: string, id: unknown, key: unknown, input: unknown) {
  const accountId = resourceIdSchema.parse(id), value = cashUpdateSchema.parse(input)
  return ownedMutation(db, owner, 'cash.update', key, { accountId, ...value }, async tx => {
    const { expectedVersion, ...data } = value
    const result = await tx.cashAccount.updateMany({ where: { id: accountId, ownerId: owner, version: expectedVersion }, data: { ...data, version: { increment: 1 } } })
    if (result.count !== 1) throw new TrackerError('CASH_VERSION_CONFLICT', 409)
    return { id: accountId }
  })
}
