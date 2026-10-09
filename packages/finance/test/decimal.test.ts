import { Decimal } from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  CRYPTO_NUMERIC,
  DecimalInputError,
  FINANCE_DECIMAL_PRECISION,
  FINANCE_DECIMAL_ROUNDING,
  THB_NUMERIC,
  parseCryptoDecimal,
  parseThbDecimal,
  quantizeCrypto,
  quantizeThb,
  serializeCrypto,
  serializeThb,
  type FinanceDecimal,
  type FinanceOperand,
} from '../src/index.js'

const decimalDefaults = { precision: Decimal.precision, rounding: Decimal.rounding }

describe('Decimal foundation', () => {
  it('uses isolated precision 80 and ROUND_HALF_EVEN configuration', () => {
    expect(FINANCE_DECIMAL_PRECISION).toBe(80)
    expect(FINANCE_DECIMAL_ROUNDING).toBe(Decimal.ROUND_HALF_EVEN)
    expect(Decimal.precision).toBe(decimalDefaults.precision)
    expect(Decimal.rounding).toBe(decimalDefaults.rounding)
  })

  it('adds decimal strings exactly and preserves the smallest BTC quantity', () => {
    const sum = parseThbDecimal('0.1').plus(parseThbDecimal('0.2'))

    expect(serializeThb(sum)).toBe('0.3')
    expect(serializeCrypto(parseCryptoDecimal('0.00000001'))).toBe('0.00000001')
  })

  it('rejects Decimal instances from the default constructor and other clones on every guarded path', () => {
    const otherClone = Decimal.clone({ precision: 2, rounding: Decimal.ROUND_DOWN })
    const foreignInstances = [
      new Decimal('1').dividedBy('3'),
      new otherClone('1').dividedBy('3'),
    ]
    const spoofedForeign = new otherClone('1').dividedBy('3')
    Object.defineProperty(spoofedForeign, 'constructor', { value: Decimal })
    foreignInstances.push(spoofedForeign)
    const guardedOperations = [
      (value: Decimal) => quantizeThb(value as unknown as FinanceDecimal),
      (value: Decimal) => quantizeCrypto(value as unknown as FinanceDecimal),
      (value: Decimal) => serializeThb(value as unknown as FinanceDecimal),
      (value: Decimal) => serializeCrypto(value as unknown as FinanceDecimal),
    ]

    for (const value of foreignInstances) {
      for (const operation of guardedOperations) {
        try {
          operation(value)
          throw new Error('Expected a foreign Decimal instance to be rejected')
        } catch (error) {
          expect(error).toBeInstanceOf(DecimalInputError)
          expect(error).toMatchObject({ code: 'invalid_decimal_instance' })
        }
      }
    }
  })

  it('validates financial operands before all supported arithmetic and comparison aliases', () => {
    const methods = [
      'plus', 'add', 'minus', 'sub', 'times', 'mul', 'multipliedBy', 'div', 'dividedBy',
      'greaterThan', 'gt', 'greaterThanOrEqualTo', 'gte', 'lessThan', 'lt',
      'lessThanOrEqualTo', 'lte', 'equals', 'eq',
    ] as const
    const Foreign = Decimal.clone({ precision: 2 })
    const spoofedForeign = new Foreign('1').div('3')
    Object.defineProperty(spoofedForeign, 'constructor', { value: Decimal })
    const value = parseCryptoDecimal('1')
    const invalidOperands: unknown[] = [
      new Decimal('1'), new Foreign('1').div('3'), spoofedForeign, { ...value },
      1, null, true, [], {}, '', ' ', '1e2', 'NaN', 'Infinity', '-0',
      '0.0000000000000000001', '100000000000000000000',
    ]
    for (const method of methods) {
      for (const operand of invalidOperands) {
        expect(() => value[method](operand as FinanceOperand)).toThrow(DecimalInputError)
      }
      for (const foreign of [new Decimal('1'), spoofedForeign]) {
        try {
          value[method](foreign as unknown as FinanceOperand)
          throw new Error('Foreign operand was accepted')
        } catch (error) {
          expect(error).toMatchObject({ code: 'invalid_decimal_instance' })
        }
      }
      expect(() => value[method]('2')).not.toThrow()
      expect(() => value[method](parseCryptoDecimal('2'))).not.toThrow()
    }
    expect(serializeCrypto(value.add('2').sub('1').mul('3').div('2'))).toBe('3')
  })

  it('exposes an immutable facade without a Decimal constructor or raw internals', () => {
    const value = parseCryptoDecimal('1')
    expect(Object.getPrototypeOf(value)).toBeNull()
    expect(Object.isFrozen(value)).toBe(true)
    for (const property of ['constructor', 'set', 'config', 'clone', 's', 'e', 'd', 'toNumber', 'toDecimalPlaces']) {
      expect(Reflect.get(value, property)).toBeUndefined()
    }
    expect(() => Reflect.get(value, 'constructor').set({ precision: 2 })).toThrow(TypeError)
    expect(Reflect.set(value, 'constructor', Decimal)).toBe(false)
    expect(Reflect.set(value, 'precision', 2)).toBe(false)
    expect(() => Object.defineProperty(value, 'constructor', { value: Decimal })).toThrow(TypeError)
    expect(serializeCrypto(value.div('3'))).toBe('0.333333333333333333')
    expect(JSON.parse(JSON.stringify({ value }))).toEqual({ value: '1' })
    expect(() => value.div('0')).toThrow(DecimalInputError)
  })

  it('keeps Finance Decimal parsing and arithmetic at precision 80 with half-even rounding', () => {
    const originalDefaultConfiguration = {
      precision: Decimal.precision,
      rounding: Decimal.rounding,
    }
    const externalClone = Decimal.clone({ precision: 7, rounding: Decimal.ROUND_HALF_UP })
    const originalCloneConfiguration = {
      precision: externalClone.precision,
      rounding: externalClone.rounding,
    }

    try {
      Decimal.set({ precision: 2, rounding: Decimal.ROUND_DOWN })
      externalClone.set({ precision: 3, rounding: Decimal.ROUND_UP })

      const financeThird = parseCryptoDecimal('1').dividedBy('3')
      expect(serializeCrypto(financeThird)).toBe('0.333333333333333333')
      expect(serializeThb(parseCryptoDecimal('1.005'))).toBe('1')
      expect(serializeThb(parseCryptoDecimal('1.015'))).toBe('1.02')
      expect(FINANCE_DECIMAL_PRECISION).toBe(80)
      expect(FINANCE_DECIMAL_ROUNDING).toBe(Decimal.ROUND_HALF_EVEN)
    } finally {
      Decimal.set(originalDefaultConfiguration)
      externalClone.set(originalCloneConfiguration)
    }
  })

  it('enforces NUMERIC scale and accepts each maximum value', () => {
    expect(THB_NUMERIC).toEqual({ precision: 20, scale: 2, integerDigits: 18 })
    expect(CRYPTO_NUMERIC).toEqual({ precision: 38, scale: 18, integerDigits: 20 })
    expect(serializeThb(parseThbDecimal('999999999999999999.99'))).toBe('999999999999999999.99')
    expect(serializeCrypto(parseCryptoDecimal('99999999999999999999.999999999999999999')))
      .toBe('99999999999999999999.999999999999999999')

    expect(() => parseThbDecimal('1.234')).toThrow(DecimalInputError)
    expect(() => parseCryptoDecimal('0.0000000000000000001')).toThrow(DecimalInputError)
    expect(() => parseThbDecimal('1000000000000000000')).toThrow(DecimalInputError)
    expect(() => parseCryptoDecimal('100000000000000000000')).toThrow(DecimalInputError)
  })

  it('uses half-even for positive and negative values and handles rounding carry', () => {
    expect(serializeThb(quantizeThb(parseCryptoDecimal('1.005')))).toBe('1')
    expect(serializeThb(quantizeThb(parseCryptoDecimal('1.015')))).toBe('1.02')
    expect(serializeThb(quantizeThb(parseCryptoDecimal('-1.005')))).toBe('-1')
    expect(serializeThb(quantizeThb(parseCryptoDecimal('-1.015')))).toBe('-1.02')
    expect(serializeThb(quantizeThb(parseCryptoDecimal('9.995')))).toBe('10')

    const cryptoEvenTie = parseCryptoDecimal('1.000000000000000000')
      .plus(parseCryptoDecimal('0.000000000000000001').dividedBy('2'))
    const cryptoOddTie = parseCryptoDecimal('1.000000000000000001')
      .plus(parseCryptoDecimal('0.000000000000000001').dividedBy('2'))
    expect(serializeCrypto(quantizeCrypto(cryptoEvenTie))).toBe('1')
    expect(serializeCrypto(quantizeCrypto(cryptoOddTie))).toBe('1.000000000000000002')
  })

  it('rejects overflow created by quantization carry', () => {
    const thbOverflow = parseThbDecimal('999999999999999999.99')
      .plus(parseCryptoDecimal('0.005'))
    const cryptoHalfQuantum = parseCryptoDecimal('0.000000000000000001').dividedBy('2')
    const cryptoOverflow = parseCryptoDecimal('99999999999999999999.999999999999999999')
      .plus(cryptoHalfQuantum)

    expect(() => quantizeThb(thbOverflow)).toThrow(DecimalInputError)
    expect(() => quantizeCrypto(cryptoOverflow)).toThrow(DecimalInputError)
  })

  it('rejects coercible, malformed, non-finite, and negative-zero input', () => {
    const invalid: unknown[] = [
      null,
      true,
      false,
      0,
      1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      [],
      {},
      '',
      ' ',
      ' 1',
      '1 ',
      '1e2',
      '1E2',
      'NaN',
      'Infinity',
      '-Infinity',
      '+1',
      '01',
      '.1',
      '1.',
      '-0',
      '-0.00',
    ]

    for (const value of invalid) {
      expect(() => parseThbDecimal(value)).toThrow(DecimalInputError)
      expect(() => parseCryptoDecimal(value)).toThrow(DecimalInputError)
    }
  })

  it('serializes fixed-point canonical strings and normalizes computed negative zero', () => {
    expect(serializeCrypto(parseCryptoDecimal('0'))).toBe('0')
    expect(serializeCrypto(parseCryptoDecimal('1.230000000000000000'))).toBe('1.23')
    expect(serializeCrypto(parseCryptoDecimal('0.000000000000000001'))).toBe('0.000000000000000001')
    const negativeValueRoundedToZero = parseCryptoDecimal('-0.001').plus(parseCryptoDecimal('0.0001'))
    expect(serializeThb(negativeValueRoundedToZero)).toBe('0')
  })
})
