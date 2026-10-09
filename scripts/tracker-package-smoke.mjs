import Decimal from 'decimal.js'

const contractsUrl = import.meta.resolve('@finntech/contracts')
const financeUrl = import.meta.resolve('@finntech/finance')

if (!contractsUrl.endsWith('/packages/contracts/dist/index.js')) {
  throw new Error(`Contracts runtime export did not resolve to compiled dist JavaScript: ${contractsUrl}`)
}
if (!financeUrl.endsWith('/packages/finance/dist/index.js')) {
  throw new Error(`Finance runtime export did not resolve to compiled dist JavaScript: ${financeUrl}`)
}

const [contracts, finance] = await Promise.all([
  import('@finntech/contracts'),
  import('@finntech/finance'),
])

if (typeof contracts.healthResponseSchema?.safeParse !== 'function') {
  throw new Error('Contracts package did not expose its compiled health response schema')
}
if (finance.FINANCE_DECIMAL_PRECISION !== 80 || finance.FINANCE_DECIMAL_ROUNDING !== 6) {
  throw new Error('Finance package did not expose the isolated precision 80 / ROUND_HALF_EVEN configuration')
}
if (typeof contracts.financeTransactionInputSchema?.safeParse !== 'function'
  || typeof contracts.cryptoTradeInputSchema?.safeParse !== 'function') {
  throw new Error('Contracts package did not expose the finance and crypto validation schemas')
}

const exactSum = finance.parseThbDecimal('0.1').plus(finance.parseThbDecimal('0.2'))
if (finance.serializeThb(exactSum) !== '0.3') {
  throw new Error('Compiled Decimal package did not preserve exact decimal arithmetic')
}
const financeThird = finance.parseCryptoDecimal('1').dividedBy('3')
if (finance.serializeCrypto(financeThird) !== '0.333333333333333333') {
  throw new Error('Compiled Decimal package did not use its configured precision for arithmetic')
}

const foreignConstructors = [Decimal, Decimal.clone({ precision: 2, rounding: Decimal.ROUND_DOWN })]
const guardedOperations = [
  finance.quantizeThb,
  finance.quantizeCrypto,
  finance.serializeThb,
  finance.serializeCrypto,
]
for (const ForeignDecimal of foreignConstructors) {
  const foreignValue = new ForeignDecimal('1').dividedBy('3')
  for (const operation of guardedOperations) {
    try {
      operation(foreignValue)
      throw new Error('Compiled Decimal package accepted an instance from another constructor')
    } catch (error) {
      if (error?.code !== 'invalid_decimal_instance') throw error
    }
  }
}

const foreignOperand = new foreignConstructors[1]('1').div('3')
try {
  finance.parseCryptoDecimal('0').plus(foreignOperand)
  throw new Error('Compiled Finance arithmetic accepted a foreign operand')
} catch (error) {
  if (error?.code !== 'invalid_decimal_instance') throw error
}
const publicValue = finance.parseCryptoDecimal('1')
if (publicValue.constructor !== undefined || !Object.isFrozen(publicValue)) {
  throw new Error('Compiled Finance value exposed a mutable constructor/configuration boundary')
}
try {
  publicValue.constructor.set({ precision: 2 })
  throw new Error('Compiled Finance value allowed public configuration changes')
} catch (error) {
  if (!(error instanceof TypeError)) throw error
}
if (finance.serializeCrypto(publicValue.div('3')) !== '0.333333333333333333') {
  throw new Error('Compiled Finance arithmetic lost its configured precision')
}

if (!contracts.financeTransactionInputSchema.safeParse({ type: 'income', amount: '0.3', currency: 'THB' }).success) {
  throw new Error('Compiled contracts package did not validate a decimal-string THB entry')
}
if (contracts.financeTransactionInputSchema.safeParse({ type: 'income', amount: 0.3, currency: 'THB' }).success) {
  throw new Error('Compiled contracts package accepted a JSON number for a financial amount')
}

const ledger = finance.replayCryptoTrades([
  { id: 'a', side: 'buy', quantity: '3', price: '1', fee: '1' },
  { id: 'b', side: 'sell', quantity: '1', price: '2', fee: '0.1' },
  { id: 'c', side: 'sell', quantity: '2', price: '2', fee: '0' },
])
if (ledger.quantity !== '0' || ledger.totalCost !== '0' || ledger.realizedPnl !== '1.9'
  || ledger.trades[1].costRemoved !== '1.333333333333333333') throw new Error('Compiled ledger accounting failed')
console.log('Compiled finance/contracts imports, Decimal configuration, foreign-instance rejection, exact arithmetic, decimal-string validation and ledger accounting passed with Node type stripping disabled')
