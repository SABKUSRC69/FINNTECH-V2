import { parseThbDecimal, parseCryptoDecimal, serializeThb, serializeCrypto } from './index.js'

export interface ExpenseRow { categoryId: string; type: 'income' | 'expense'; amount: string; voidedAt: string | null }
/** Percentages use unrounded totals; only presentation percentages are rounded to two places. */
export function expenseBreakdown(rows: readonly ExpenseRow[]) {
  let total = parseThbDecimal('0')
  const groups = new Map<string, ReturnType<typeof parseThbDecimal>>()
  for (const row of rows) {
    if (row.type !== 'expense' || row.voidedAt) continue
    const amount = parseThbDecimal(row.amount)
    if (!amount.gt('0')) throw new RangeError('Expense must be positive')
    total = total.plus(amount)
    groups.set(row.categoryId, (groups.get(row.categoryId) ?? parseThbDecimal('0')).plus(amount))
  }
  return { total: serializeThb(total), categories: [...groups].map(([categoryId, amount]) => ({
    categoryId, amount: serializeThb(amount), percent: serializeThb(amount.div(total).times('100')),
  })).sort((a, b) => parseThbDecimal(a.amount).eq(b.amount) ? a.categoryId.localeCompare(b.categoryId) : parseThbDecimal(a.amount).gt(b.amount) ? -1 : 1) }
}

export interface ValuedHolding { portfolioId: string; asset: string; quantity: string }
/** Currency-neutral Decimal calculation, used only inside one native-currency scope. */
export function valuePosition(quantity:string,cost:string,price:string|null){
 const q=parseCryptoDecimal(quantity),c=parseCryptoDecimal(cost)
 if(q.lt('0')||c.lt('0'))throw new RangeError('Negative holding/cost')
 const averageCost=q.isZero()?null:serializeCrypto(c.div(q))
 if(q.isZero())return {averageCost,value:'0',unrealized:'0',returnPercent:null}
 if(price===null)return {averageCost,value:null,unrealized:null,returnPercent:null}
 const p=parseCryptoDecimal(price);if(!p.gt('0'))throw new RangeError('Invalid reference price')
 const value=q.times(p),pnl=value.minus(c)
 return {averageCost,value:serializeCrypto(value),unrealized:serializeCrypto(pnl),returnPercent:c.isZero()?null:serializeThb(pnl.div(c).times('100'))}
}

/**
 * USD stock/ETF totals across every portfolio. Same-symbol rows in different portfolios share one
 * price. A missing price never becomes a zero or the purchase cost: totals become null and the
 * known (priced) part plus the missing symbols are reported instead.
 */
export function summarizeStockHoldings(holdings:readonly {symbol:string;quantity:string;totalCost:string}[],prices:ReadonlyMap<string,string>){
 const zero=()=>parseCryptoDecimal('0')
 let value=zero(),cost=zero(),pricedCost=zero();const missing=new Set<string>()
 for(const row of holdings){
  const q=parseCryptoDecimal(row.quantity),c=parseCryptoDecimal(row.totalCost)
  if(q.lt('0')||c.lt('0'))throw new RangeError('Negative holding/cost')
  cost=cost.plus(c)
  if(q.isZero()){pricedCost=pricedCost.plus(c);continue}
  const p=prices.get(row.symbol)
  if(p===undefined){missing.add(row.symbol);continue}
  const price=parseCryptoDecimal(p);if(!price.gt('0'))throw new RangeError('Invalid stock price')
  value=value.plus(q.times(price));pricedCost=pricedCost.plus(c)
 }
 const complete=missing.size===0
 return {complete,missing:[...missing].sort(),costUsd:serializeCrypto(cost),
  valueUsd:complete?serializeCrypto(value):null,unrealizedUsd:complete?serializeCrypto(value.minus(cost)):null,
  knownValueUsd:serializeCrypto(value),knownCostUsd:serializeCrypto(pricedCost),knownUnrealizedUsd:serializeCrypto(value.minus(pricedCost))}
}
/** Manual amounts are dated total valuations, not a second market-priced quantity or cash debit. */
export function valueMixedAssets(base:ReturnType<typeof valueAssets>,stocks:readonly {quantity:string;symbol:string}[],stockPrices:ReadonlyMap<string,string>,
 manual:readonly {currency:'THB'|'USD'|'USDT';value:string}[],usdtThb:string|null,usdThb:string|null){
 if(base.knownThb===null)throw new RangeError('Unrepresentable base valuation')
 let known=parseCryptoDecimal(base.knownThb??'0'),complete=base.complete
 const totals={THB:parseCryptoDecimal(base.cashThb),USD:parseCryptoDecimal('0'),USDT:parseCryptoDecimal('0')}
 let usdComplete=true,usdtComplete=base.holdings.every(row=>row.usdt!==null)
 for(const row of base.holdings)if(row.usdt!==null)totals.USDT=totals.USDT.plus(row.usdt)
 const stockRows=stocks.map(row=>{const q=parseCryptoDecimal(row.quantity);if(q.lt('0'))throw new RangeError('Negative quantity');const p=stockPrices.get(row.symbol);if(q.isZero())return {...row,value:'0'};if(p===undefined){usdComplete=false;complete=false;return {...row,value:null}};const price=parseCryptoDecimal(p);if(!price.gt('0'))throw new RangeError('Invalid stock price');const value=serializeCrypto(q.times(price));totals.USD=totals.USD.plus(value);return {...row,value}})
 let extraUsdt=parseCryptoDecimal('0')
 for(const row of manual){const amount=parseCryptoDecimal(row.value);if(amount.lt('0'))throw new RangeError('Negative valuation');totals[row.currency]=totals[row.currency].plus(amount);if(row.currency==='THB')known=known.plus(amount);if(row.currency==='USDT')extraUsdt=extraUsdt.plus(amount)}
 for(const [amount,rate] of [[extraUsdt,usdtThb],[totals.USD,usdThb]] as const){if(amount.isZero())continue;if(rate===null){complete=false;continue};const r=parseCryptoDecimal(rate);if(!r.gt('0'))throw new RangeError('Invalid FX rate');known=known.plus(amount.times(r))}
 return {knownThb:serializeThb(known),totalThb:complete?serializeThb(known):null,complete,stockRows,native:{THB:serializeThb(totals.THB),USD:usdComplete?serializeCrypto(totals.USD):null,USDT:usdtComplete?serializeCrypto(totals.USDT):null},knownNative:{USD:serializeCrypto(totals.USD),USDT:serializeCrypto(totals.USDT)}}
}
/** Caller supplies only fresh validated quotes/rates. Missing data never becomes a zero valuation. */
export function valueAssets(cash: readonly string[], holdings: readonly ValuedHolding[], prices: ReadonlyMap<string, string>, usdtThb: string | null) {
  let cashTotal = parseThbDecimal('0'), known = parseThbDecimal('0')
  for (const balance of cash) {
    const value = parseThbDecimal(balance)
    if (value.lt('0')) throw new RangeError('Cash must be nonnegative')
    cashTotal = cashTotal.plus(value)
  }
  const cashThb = serializeThb(cashTotal)
  known = cashTotal
  const rate = usdtThb === null ? null : parseCryptoDecimal(usdtThb)
  if (rate && !rate.gt('0')) throw new RangeError('Rate must be positive')
  const seen = new Set<string>()
  const rows = holdings.map(row => {
    const scope = `${row.portfolioId}|${row.asset}`
    if (seen.has(scope)) throw new RangeError('Duplicate holding scope')
    seen.add(scope)
    const quantity = parseCryptoDecimal(row.quantity), price = prices.get(row.asset)
    if (quantity.lt('0')) throw new RangeError('Quantity must be nonnegative')
    let usdt: string | null = null, thb: string | null = null
    try {
      if (quantity.isZero()) { usdt = '0'; thb = '0' }
      else if (price !== undefined) {
        const parsedPrice = parseCryptoDecimal(price)
        if (!parsedPrice.gt('0')) throw new RangeError('Price must be positive')
        const raw = quantity.times(parsedPrice)
        usdt = serializeCrypto(raw)
        if (rate) thb = serializeThb(raw.times(rate))
      }
    } catch { /* Unrepresentable valuations remain N/A; original ledger data is untouched. */ }
    if (thb !== null) known = known.plus(thb)
    return { ...row, usdt, thb }
  })
  let knownThb: string | null = null
  try { knownThb = serializeThb(known) } catch { /* Aggregate overflow is not a valid total. */ }
  const complete = knownThb !== null && rows.every(row => row.thb !== null)
  return { cashThb, knownThb, totalThb: complete ? knownThb : null, complete, holdings: rows }
}
