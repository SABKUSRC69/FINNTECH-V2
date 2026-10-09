import { parseCryptoDecimal, quantizeCrypto, serializeCrypto, type FinanceDecimal } from './index.js'

export interface LedgerTrade {
  id: string
  side: 'buy' | 'sell'
  quantity: string
  price: string
  fee: string
}
export interface LedgerResult {
  quantity: string
  totalCost: string
  realizedPnl: string
  averageCost: FinanceDecimal | null
  trades: { id: string; gross: string; costRemoved: string; realizedPnl: string }[]
}
export class LedgerError extends Error {
  constructor(readonly code: 'oversell' | 'invalid_trade' | 'invalid_cost') { super(code) }
}
const stored = (value: FinanceDecimal) => quantizeCrypto(value)

/** Caller supplies one owned portfolio/asset/quote scope in stable chronological order. */
export function replayCryptoTrades(trades: readonly LedgerTrade[]): LedgerResult {
  let quantity = parseCryptoDecimal('0')
  let cost = parseCryptoDecimal('0')
  let realized = parseCryptoDecimal('0')
  const results: LedgerResult['trades'] = []
  for (const trade of trades) {
    const size = parseCryptoDecimal(trade.quantity)
    const price = parseCryptoDecimal(trade.price)
    const fee = parseCryptoDecimal(trade.fee)
    if (!size.gt('0') || !price.gt('0') || fee.lt('0')) throw new LedgerError('invalid_trade')
    const gross = stored(size.times(price))
    let removed = parseCryptoDecimal('0')
    let pnl = parseCryptoDecimal('0')
    if (trade.side === 'buy') {
      quantity = stored(quantity.plus(size))
      cost = stored(cost.plus(stored(gross.plus(fee))))
    } else if (trade.side === 'sell') {
      if (size.gt(quantity)) throw new LedgerError('oversell')
      // A full sale consumes the stored remaining cost, eliminating rounding residue.
      removed = size.eq(quantity) ? cost : stored(size.times(cost.div(quantity)))
      quantity = stored(quantity.minus(size))
      cost = stored(cost.minus(removed))
      pnl = stored(gross.minus(fee).minus(removed))
      realized = stored(realized.plus(pnl))
      if (cost.lt('0') || (quantity.isZero() && !cost.isZero())) throw new LedgerError('invalid_cost')
    } else throw new LedgerError('invalid_trade')
    results.push({ id: trade.id, gross: serializeCrypto(gross), costRemoved: serializeCrypto(removed), realizedPnl: serializeCrypto(pnl) })
  }
  return {
    quantity: serializeCrypto(quantity), totalCost: serializeCrypto(cost), realizedPnl: serializeCrypto(realized),
    // This is an internal precision-80 value, never a rounded storage/display operand.
    averageCost: quantity.isZero() ? null : cost.div(quantity), trades: results,
  }
}
