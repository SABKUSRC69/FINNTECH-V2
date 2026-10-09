import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { DecimalInputError, parseCryptoDecimal, parseThbDecimal, type FinanceOperand } from '@finntech/finance'
import { Prisma } from '../src/generated/prisma/client.js'
import {
  cryptoForApi, cryptoInputForStorage, cryptoResultForStorage, prepareCryptoMoney,
  prepareFinanceMoney, readCryptoDecimal, readThbDecimal, thbForApi,
  thbInputForStorage, thbResultForStorage,
} from '../src/persistence/decimal.js'
import { checkDatabaseConnection, createTrackerDatabase } from '../src/persistence/database.js'

describe('Decimal persistence boundary (no database emulation)', () => {
  it('uses the Contracts canonical asset symbol in persistence write fields', () => {
    for (const asset of ['btc', 'BtC', 'BTC']) {
      expect(prepareCryptoMoney({ side: 'buy', asset, quoteCurrency: 'USDT', quantity: '1', price: '1', fee: '0' }).assetSymbol).toBe('BTC')
    }
    expect(() => prepareCryptoMoney({ side: 'buy', asset: 'ß', quoteCurrency: 'USDT', quantity: '1', price: '1', fee: '0' })).toThrow()
  })

  it('reads actual Prisma.Decimal through plain strings and serializes financial JSON strings', () => {
    const thb = new Prisma.Decimal('999999999999999999.99')
    const crypto = new Prisma.Decimal('99999999999999999999.999999999999999999')
    const btc = new Prisma.Decimal('0.00000001')
    expect(thbForApi(thb)).toBe('999999999999999999.99')
    expect(cryptoForApi(crypto)).toBe('99999999999999999999.999999999999999999')
    expect(readThbDecimal(thb).toString()).toBe(thbForApi(thb))
    expect(readCryptoDecimal(btc).toString()).toBe('0.00000001')
    expect(() => parseCryptoDecimal('0').plus(btc as unknown as FinanceOperand))
      .toThrow(DecimalInputError)
    expect(JSON.parse(JSON.stringify({ thb: thbForApi(thb), btc: cryptoForApi(btc) })))
      .toEqual({ thb: '999999999999999999.99', btc: '0.00000001' })
    expect(() => readThbDecimal(new Prisma.Decimal('1.001'))).toThrow(DecimalInputError)
    expect(() => readCryptoDecimal(new Prisma.Decimal('NaN'))).toThrow(DecimalInputError)
  })

  it('rejects invalid inputs before creating Prisma write data', () => {
    expect(prepareFinanceMoney({ type: 'income', currency: 'THB', amount: '1.20' }).amount).toBe('1.2')
    expect(prepareCryptoMoney({ side: 'buy', asset: 'BTC', quoteCurrency: 'USDT', quantity: '0.00000001', price: '1', fee: '0' }).fee).toBe('0')
    for (const amount of [1, '0', '-1', '1.001', '1e3']) {
      expect(() => prepareFinanceMoney({ type: 'income', currency: 'THB', amount })).toThrow()
    }
    expect(() => prepareCryptoMoney({ side: 'buy', asset: 'BTC', quoteCurrency: 'THB', quantity: '1', price: '1', fee: '0' })).toThrow()
    expect(() => prepareCryptoMoney({ side: 'buy', asset: 'BTC', quoteCurrency: 'USDT', quantity: '1', price: '1', fee: '-1' })).toThrow()
    expect(() => thbInputForStorage('1.005')).toThrow(DecimalInputError)
    expect(() => cryptoInputForStorage('0.0000000000000000001')).toThrow(DecimalInputError)
  })

  it('quantizes calculation results and rechecks overflow before writes', () => {
    expect(thbResultForStorage(parseCryptoDecimal('1.005'))).toBe('1')
    expect(thbResultForStorage(parseCryptoDecimal('-1.015'))).toBe('-1.02')
    expect(cryptoResultForStorage(parseCryptoDecimal('1').div('3'))).toBe('0.333333333333333333')
    expect(thbResultForStorage(parseCryptoDecimal('-0.001'))).toBe('0')
    expect(() => thbResultForStorage(parseThbDecimal('999999999999999999.99').plus('0.005'))).toThrow(DecimalInputError)
    expect(() => cryptoResultForStorage(parseCryptoDecimal('99999999999999999999.999999999999999999').plus(parseCryptoDecimal('0.000000000000000001').div('2'))))
      .toThrow(DecimalInputError)
  })

  it('reports a real refused local connection as error, never database readiness ok', async () => {
    const reservation = createServer()
    await new Promise<void>((resolve, reject) => {
      reservation.once('error', reject)
      reservation.listen(0, '127.0.0.1', resolve)
    })
    const address = reservation.address()
    if (!address || typeof address === 'string') throw new Error('Failed to reserve a test port')
    await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
    const database = createTrackerDatabase(`postgresql://fixture:placeholder@127.0.0.1:${address.port}/finntech_tracker_f14_test`)
    try {
      expect(await checkDatabaseConnection(database)).toBe('error')
    } finally {
      await database.$disconnect()
    }
  })
})
