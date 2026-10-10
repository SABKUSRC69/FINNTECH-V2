import { Prisma } from '../generated/prisma/client.js'
import { cryptoForApi } from '../persistence/decimal.js'

type StoredAccounting = { id: string; gross: Prisma.Decimal | null; costRemoved: Prisma.Decimal | null; realizedPnl: Prisma.Decimal | null }
type ReplayedAccounting = { id: string; gross: string; costRemoved: string; realizedPnl: string }
const tables = { crypto: Prisma.raw('crypto_trades'), stock: Prisma.raw('stock_trades') } as const
const CHUNK = 500

const unchanged = (stored: Prisma.Decimal | null, value: string) => stored !== null && cryptoForApi(stored) === value

/**
 * Writes replayed accounting only for rows whose stored values differ, in bounded bulk statements.
 * Appending a trade at the end of history therefore updates one row instead of the whole scope.
 */
export async function persistReplay(tx: Prisma.TransactionClient, kind: keyof typeof tables, owner: string,
  stored: readonly StoredAccounting[], replayed: readonly ReplayedAccounting[]): Promise<number> {
  const byId = new Map(stored.map(row => [row.id, row]))
  const changed = replayed.filter(row => {
    const current = byId.get(row.id)
    return !current || !(unchanged(current.gross, row.gross) && unchanged(current.costRemoved, row.costRemoved) && unchanged(current.realizedPnl, row.realizedPnl))
  })
  for (let start = 0; start < changed.length; start += CHUNK) {
    const values = Prisma.join(changed.slice(start, start + CHUNK).map(row =>
      Prisma.sql`(${row.id}::uuid, ${row.gross}::numeric, ${row.costRemoved}::numeric, ${row.realizedPnl}::numeric)`))
    await tx.$executeRaw`UPDATE ${tables[kind]} AS t SET gross = v.gross, cost_removed = v.cost_removed, realized_pnl = v.realized_pnl
      FROM (VALUES ${values}) AS v(id, gross, cost_removed, realized_pnl)
      WHERE t.id = v.id AND t.owner_id = ${owner}::uuid`
  }
  return changed.length
}
