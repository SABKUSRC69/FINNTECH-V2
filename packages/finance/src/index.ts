import { Decimal } from 'decimal.js'
export { replayCryptoTrades, LedgerError, type LedgerTrade, type LedgerResult } from './ledger.js'
export { expenseBreakdown, valueAssets, valuePosition,valueMixedAssets,summarizeStockHoldings } from './analytics.js'
export * from './market-calendar.js'

export const FINANCE_DECIMAL_PRECISION = 80 as const
export const FINANCE_DECIMAL_ROUNDING = Decimal.ROUND_HALF_EVEN

// clone() keeps the finance configuration separate from decimal.js consumers elsewhere.
const FinanceDecimalConstructor = Decimal.clone({
  precision: FINANCE_DECIMAL_PRECISION,
  rounding: FINANCE_DECIMAL_ROUNDING,
})
const configuredDecimals = new WeakMap<object, Decimal>()

export type DecimalString = string
declare const financeValueBrand: unique symbol
export type FinanceOperand = FinanceDecimal | DecimalString
export interface FinanceDecimal {
  readonly [financeValueBrand]: true
  plus(value: FinanceOperand): FinanceDecimal
  add(value: FinanceOperand): FinanceDecimal
  minus(value: FinanceOperand): FinanceDecimal
  sub(value: FinanceOperand): FinanceDecimal
  times(value: FinanceOperand): FinanceDecimal
  mul(value: FinanceOperand): FinanceDecimal
  multipliedBy(value: FinanceOperand): FinanceDecimal
  div(value: FinanceOperand): FinanceDecimal
  dividedBy(value: FinanceOperand): FinanceDecimal
  abs(): FinanceDecimal
  isZero(): boolean
  isFinite(): boolean
  greaterThan(value: FinanceOperand): boolean
  gt(value: FinanceOperand): boolean
  greaterThanOrEqualTo(value: FinanceOperand): boolean
  gte(value: FinanceOperand): boolean
  lessThan(value: FinanceOperand): boolean
  lt(value: FinanceOperand): boolean
  lessThanOrEqualTo(value: FinanceOperand): boolean
  lte(value: FinanceOperand): boolean
  equals(value: FinanceOperand): boolean
  eq(value: FinanceOperand): boolean
  toString(): DecimalString
  toJSON(): DecimalString
}

export const THB_NUMERIC = Object.freeze({ precision: 20, scale: 2, integerDigits: 18 })
export const CRYPTO_NUMERIC = Object.freeze({ precision: 38, scale: 18, integerDigits: 20 })

export type DecimalInputErrorCode =
  | 'invalid_type'
  | 'invalid_format'
  | 'negative_zero'
  | 'scale'
  | 'range'
  | 'non_finite'
  | 'invalid_decimal_instance'

export class DecimalInputError extends TypeError {
  constructor(readonly code: DecimalInputErrorCode, message: string) {
    super(message)
    this.name = 'DecimalInputError'
  }
}

function wrapConfiguredDecimal(value: Decimal): FinanceDecimal {
  assertFinite(value)
  const plus = (operand: FinanceOperand) => wrapConfiguredDecimal(value.plus(resolveOperand(operand)))
  const minus = (operand: FinanceOperand) => wrapConfiguredDecimal(value.minus(resolveOperand(operand)))
  const times = (operand: FinanceOperand) => wrapConfiguredDecimal(value.times(resolveOperand(operand)))
  const div = (operand: FinanceOperand) => wrapConfiguredDecimal(value.div(resolveOperand(operand)))
  const gt = (operand: FinanceOperand) => value.greaterThan(resolveOperand(operand))
  const gte = (operand: FinanceOperand) => value.greaterThanOrEqualTo(resolveOperand(operand))
  const lt = (operand: FinanceOperand) => value.lessThan(resolveOperand(operand))
  const lte = (operand: FinanceOperand) => value.lessThanOrEqualTo(resolveOperand(operand))
  const eq = (operand: FinanceOperand) => value.equals(resolveOperand(operand))
  // No prototype, raw fields, constructor, or generic method forwarding crosses the boundary.
  const configured = Object.freeze(Object.assign(Object.create(null), {
    plus, add: plus, minus, sub: minus, times, mul: times, multipliedBy: times,
    div, dividedBy: div,
    abs: () => wrapConfiguredDecimal(value.abs()),
    isZero: () => value.isZero(),
    isFinite: () => value.isFinite(),
    greaterThan: gt, gt, greaterThanOrEqualTo: gte, gte,
    lessThan: lt, lt, lessThanOrEqualTo: lte, lte, equals: eq, eq,
    toString: () => canonicalRawString(value),
    toJSON: () => canonicalRawString(value),
  })) as FinanceDecimal
  configuredDecimals.set(configured, value)
  return configured
}

function resolveOperand(value: unknown): Decimal {
  if (typeof value === 'string') return assertConfiguredDecimal(parseCryptoDecimal(value))
  if (value === null || typeof value !== 'object') {
    throw new DecimalInputError('invalid_type', 'Financial operands must be Finance values or decimal strings')
  }
  return assertConfiguredDecimal(value)
}

const decimalInputPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
const thbRangeLimit = new FinanceDecimalConstructor('1000000000000000000')
const cryptoRangeLimit = new FinanceDecimalConstructor('100000000000000000000')

interface NumericDefinition {
  readonly scale: number
  readonly integerDigits: number
  readonly rangeLimit: Decimal
}

const thbDefinition: NumericDefinition = {
  scale: THB_NUMERIC.scale,
  integerDigits: THB_NUMERIC.integerDigits,
  rangeLimit: thbRangeLimit,
}

const cryptoDefinition: NumericDefinition = {
  scale: CRYPTO_NUMERIC.scale,
  integerDigits: CRYPTO_NUMERIC.integerDigits,
  rangeLimit: cryptoRangeLimit,
}

function assertConfiguredDecimal(value: unknown): Decimal {
  const raw = value !== null && typeof value === 'object' ? configuredDecimals.get(value) : undefined
  if (!raw) {
    throw new DecimalInputError(
      'invalid_decimal_instance',
      'Calculation results must use the configured finance Decimal instance',
    )
  }
  assertFinite(raw)
  return raw
}

function assertFinite(value: Decimal): void {
  if (!value.isFinite()) {
    throw new DecimalInputError('non_finite', 'Calculation result must be finite')
  }
}

function assertRange(value: Decimal, definition: NumericDefinition): void {
  if (value.abs().greaterThanOrEqualTo(definition.rangeLimit)) {
    throw new DecimalInputError('range', 'Value exceeds the supported NUMERIC range')
  }
}

function parseInput(value: unknown, definition: NumericDefinition): FinanceDecimal {
  if (typeof value !== 'string') {
    throw new DecimalInputError('invalid_type', 'Financial input must be a decimal string')
  }
  if (!decimalInputPattern.test(value)) {
    throw new DecimalInputError('invalid_format', 'Value must use plain decimal notation without whitespace or exponent')
  }

  const unsigned = value.startsWith('-') ? value.slice(1) : value
  const decimalPoint = unsigned.indexOf('.')
  const integerPart = decimalPoint < 0 ? unsigned : unsigned.slice(0, decimalPoint)
  const inputScale = decimalPoint < 0 ? 0 : unsigned.length - decimalPoint - 1

  if (inputScale > definition.scale) {
    throw new DecimalInputError('scale', 'Value has more fractional digits than the NUMERIC scale')
  }
  if (integerPart.length > definition.integerDigits) {
    throw new DecimalInputError('range', 'Value exceeds the supported NUMERIC range')
  }

  const parsed = new FinanceDecimalConstructor(value)
  if (parsed.isZero() && value.startsWith('-')) {
    throw new DecimalInputError('negative_zero', 'Negative zero is not accepted as input')
  }
  assertRange(parsed, definition)
  return wrapConfiguredDecimal(parsed)
}

function quantizeResult(value: FinanceDecimal, definition: NumericDefinition): FinanceDecimal {
  const raw = assertConfiguredDecimal(value)
  const result = raw.toDecimalPlaces(definition.scale, FINANCE_DECIMAL_ROUNDING)
  // Check after rounding as well: a carry can cross the NUMERIC limit.
  assertRange(result, definition)
  return wrapConfiguredDecimal(result)
}

function canonicalRawString(value: Decimal): string {
  assertFinite(value)
  if (value.isZero()) return '0'

  const fixed = value.toFixed()
  if (!fixed.includes('.')) return fixed
  return fixed.replace(/0+$/, '').replace(/\.$/, '')
}

/** Parse untrusted THB input. Only plain decimal strings up to scale 2 are accepted. */
export function parseThbDecimal(value: unknown): FinanceDecimal {
  return parseInput(value, thbDefinition)
}

/** Parse untrusted crypto quantity, price, quote, fee, or cost input up to scale 18. */
export function parseCryptoDecimal(value: unknown): FinanceDecimal {
  return parseInput(value, cryptoDefinition)
}

/** Quantize an internal calculation result for NUMERIC(20,2), then validate its range. */
export function quantizeThb(value: FinanceDecimal): FinanceDecimal {
  return quantizeResult(value, thbDefinition)
}

/** Quantize an internal calculation result for NUMERIC(38,18), then validate its range. */
export function quantizeCrypto(value: FinanceDecimal): FinanceDecimal {
  return quantizeResult(value, cryptoDefinition)
}

/** Serialize THB as fixed-point canonical decimal text; negative zero becomes `0`. */
export function serializeThb(value: FinanceDecimal): DecimalString {
  return canonicalRawString(assertConfiguredDecimal(quantizeThb(value)))
}

/** Serialize crypto values as fixed-point canonical decimal text; negative zero becomes `0`. */
export function serializeCrypto(value: FinanceDecimal): DecimalString {
  return canonicalRawString(assertConfiguredDecimal(quantizeCrypto(value)))
}
