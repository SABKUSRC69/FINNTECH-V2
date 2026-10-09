import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../generated/prisma/client.js'

export function createTrackerDatabase(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 4,
    // Neon TLS/cold-start connections can exceed one second. Bound establishment
    // separately from the unchanged query timeout; a write timeout remains unknown.
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  })
  return new PrismaClient({ adapter, log: [] })
}

export async function checkDatabaseConnection(database: PrismaClient): Promise<'ok' | 'error'> {
  try {
    await database.$queryRaw`SELECT 1`
    return 'ok'
  } catch {
    // Do not emit connection strings, driver errors, or credentials to HTTP/logs.
    return 'error'
  }
}

// Internal trusted-owner boundary only; there is no public write endpoint or Auth here.
export async function inOwnedPortfolioTransaction<T>(
  database: PrismaClient,
  ownerId: string,
  portfolioId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET LOCAL lock_timeout = '1000ms'`
    const owned = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM crypto_portfolios
      WHERE owner_id = ${ownerId}::uuid AND id = ${portfolioId}::uuid FOR UPDATE
    `
    if (owned.length !== 1) throw new Error('portfolio_not_found')
    return operation(transaction)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 })
}
