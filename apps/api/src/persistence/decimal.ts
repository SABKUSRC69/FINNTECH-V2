import {
  parseCryptoDecimal, parseThbDecimal, quantizeCrypto, quantizeThb,
  serializeCrypto, serializeThb, type FinanceDecimal,
} from '@finntech/finance'
import { cryptoTradeInputSchema, financeTransactionInputSchema } from '@finntech/contracts'
import type { Prisma } from '../generated/prisma/client.js'

// This explicit database boundary converts persisted values, never arithmetic operands.
export function readThbDecimal(value: Prisma.Decimal): FinanceDecimal {
  return parseThbDecimal(value.toFixed())
}

export function readCryptoDecimal(value: Prisma.Decimal): FinanceDecimal {
  return parseCryptoDecimal(value.toFixed())
}

export function thbInputForStorage(value: unknown): string {
  return serializeThb(parseThbDecimal(value))
}

export function cryptoInputForStorage(value: unknown): string {
  return serializeCrypto(parseCryptoDecimal(value))
}

export function thbResultForStorage(value: FinanceDecimal): string {
  return serializeThb(quantizeThb(value))
}

export function cryptoResultForStorage(value: FinanceDecimal): string {
  return serializeCrypto(quantizeCrypto(value))
}

export function prepareFinanceMoney(input: unknown): {
  type: 'INCOME' | 'EXPENSE'; amount: string; currency: 'THB'
} {
  const validated = financeTransactionInputSchema.parse(input)
  return {
    type: validated.type === 'income' ? 'INCOME' : 'EXPENSE',
    amount: thbInputForStorage(validated.amount),
    currency: 'THB',
  }
}

export function prepareCryptoMoney(input: unknown): {
  assetSymbol: string; side: 'BUY' | 'SELL'; quoteCurrency: 'USDT'
  quantity: string; price: string; fee: string
} {
  const validated = cryptoTradeInputSchema.parse(input)
  return {
    assetSymbol: validated.asset,
    side: validated.side === 'buy' ? 'BUY' : 'SELL',
    quoteCurrency: 'USDT',
    quantity: cryptoInputForStorage(validated.quantity),
    price: cryptoInputForStorage(validated.price),
    fee: cryptoInputForStorage(validated.fee),
  }
}

export function thbForApi(value: Prisma.Decimal): string {
  return serializeThb(readThbDecimal(value))
}

export function cryptoForApi(value: Prisma.Decimal): string {
  return serializeCrypto(readCryptoDecimal(value))
}
