import { TRADING_PAIRS } from '../data/tradingData.js'
import { calculateLockedBalances } from '../services/spotTradingService.js'

const CURRENCY_TO_THB = Object.freeze({ THB: 1 })

function normalizeCurrency(currency) {
  return typeof currency === 'string' ? currency.trim().toUpperCase() : ''
}

function getOptionalFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getAssetSymbol(item) {
  const rawSymbol = String(item?.baseAsset || item?.symbol || '').trim().toUpperCase()
  return rawSymbol.split('/')[0].split(' ')[0]
}

function isLiveTicker(marketSnapshot, symbol) {
  const ticker = marketSnapshot?.tickers?.[symbol]
  const status = marketSnapshot?.symbolStatuses?.[symbol]?.status ?? ticker?.status
  const price = getOptionalFiniteNumber(ticker?.last ?? marketSnapshot?.prices?.[symbol])
  return status === 'LIVE' && price !== null && price > 0 ? price : null
}

export function getMarketSpotPriceTHB(asset, marketSnapshot) {
  const symbol = String(asset || '').trim().toUpperCase()
  if (!symbol) return null
  const pair = TRADING_PAIRS.find((candidate) => candidate.baseAsset === symbol && candidate.quoteAsset === 'THB')
  return pair ? isLiveTicker(marketSnapshot, pair.symbol) : null
}

export function getCurrencyRateToTHB(currency, marketSnapshot) {
  const normalized = normalizeCurrency(currency)
  if (CURRENCY_TO_THB[normalized]) return CURRENCY_TO_THB[normalized]
  const pair = TRADING_PAIRS.find((candidate) => candidate.baseAsset === normalized && candidate.quoteAsset === 'THB')
  return pair ? isLiveTicker(marketSnapshot, pair.symbol) : null
}

export function calculateAssetValuationTHB(item = {}, marketSnapshot) {
  const quantity = getOptionalFiniteNumber(item.shares)
  const currency = normalizeCurrency(item.currency)
  const assetSymbol = getAssetSymbol(item)
  const knownCryptoPair = TRADING_PAIRS.find((pair) => pair.baseAsset === assetSymbol && pair.quoteAsset === currency) || null
  const marketPrice = knownCryptoPair ? isLiveTicker(marketSnapshot, knownCryptoPair.symbol) : null
  const unitPrice = knownCryptoPair ? marketPrice : getOptionalFiniteNumber(item.currentPrice)
  const rateToTHB = getCurrencyRateToTHB(currency, marketSnapshot)
  const unitCost = getOptionalFiniteNumber(item.avgBuyPrice)
  const validQuantity = quantity !== null && quantity >= 0
  const validPrice = unitPrice !== null && unitPrice > 0
  const validCost = unitCost !== null && unitCost >= 0
  const canConvert = Boolean(currency) && rateToTHB !== null
  const currentValueTHB = validQuantity && validPrice && canConvert ? quantity * unitPrice * rateToTHB : null
  const costValueTHB = validQuantity && validCost && canConvert ? quantity * unitCost * rateToTHB : null
  const profitLossTHB = currentValueTHB !== null && costValueTHB !== null ? currentValueTHB - costValueTHB : null
  const priceSource = knownCryptoPair ? (marketPrice === null ? 'UNAVAILABLE' : 'LIVE') : 'USER'
  const priceSourceText = knownCryptoPair
    ? `${knownCryptoPair.symbol} ${marketPrice === null ? 'UNAVAILABLE' : 'LIVE'}`
    : currency ? 'ราคาที่ผู้ใช้บันทึก' : 'ไม่ระบุสกุลเงิน'

  return {
    currency: currency || null,
    unitPrice,
    unitCost,
    rateToTHB,
    priceSource,
    priceSourceText,
    currentValueTHB: Number.isFinite(currentValueTHB) ? currentValueTHB : null,
    costValueTHB: Number.isFinite(costValueTHB) ? costValueTHB : null,
    profitLossTHB: Number.isFinite(profitLossTHB) ? profitLossTHB : null,
    profitLossPercent: costValueTHB > 0 && profitLossTHB !== null ? (profitLossTHB / costValueTHB) * 100 : null,
  }
}

export function calculatePortfolioValuation(portfolio = [], marketSnapshot) {
  const assets = (Array.isArray(portfolio) ? portfolio : []).map((item) => ({
    ...item,
    valuation: calculateAssetValuationTHB(item, marketSnapshot),
  }))
  const canValueAllAssets = assets.every((item) => item.valuation.currentValueTHB !== null)
  const canValueAllCosts = assets.every((item) => item.valuation.costValueTHB !== null)
  const totalValueTHB = canValueAllAssets ? assets.reduce((sum, item) => sum + item.valuation.currentValueTHB, 0) : null
  const totalCostTHB = canValueAllCosts ? assets.reduce((sum, item) => sum + item.valuation.costValueTHB, 0) : null
  const profitLossTHB = totalValueTHB !== null && totalCostTHB !== null ? totalValueTHB - totalCostTHB : null

  return {
    assets,
    totalValueTHB: Number.isFinite(totalValueTHB) ? totalValueTHB : null,
    totalCostTHB: Number.isFinite(totalCostTHB) ? totalCostTHB : null,
    profitLossTHB: Number.isFinite(profitLossTHB) ? profitLossTHB : null,
    profitLossPercent: totalCostTHB > 0 && profitLossTHB !== null ? (profitLossTHB / totalCostTHB) * 100 : null,
  }
}

export function calculateSpotWalletValuation(spotBalances = {}, openOrders = [], marketSnapshot) {
  if (!spotBalances || typeof spotBalances !== 'object' || Array.isArray(spotBalances)) {
    return { rows: [], availableValueTHB: null, lockedValueTHB: null, totalValueTHB: null }
  }

  const lockedBalances = calculateLockedBalances(openOrders)
  const assets = new Set([...Object.keys(spotBalances), ...Object.keys(lockedBalances)])
  const rows = [...assets].map((asset) => {
    const rawAvailable = getOptionalFiniteNumber(spotBalances[asset])
    const rawLocked = getOptionalFiniteNumber(lockedBalances[asset] ?? 0)
    const validAvailable = rawAvailable !== null && rawAvailable >= 0
    const validLocked = rawLocked !== null && rawLocked >= 0
    const available = rawAvailable ?? 0
    const locked = rawLocked ?? 0
    const total = available + locked
    const unitPriceTHB = asset === 'THB' ? 1 : getMarketSpotPriceTHB(asset, marketSnapshot)
    const valueTHB = validAvailable && validLocked && unitPriceTHB !== null && Number.isFinite(total) ? total * unitPriceTHB : null
    const availableValueTHB = validAvailable && (available === 0 || unitPriceTHB !== null)
      ? available * (unitPriceTHB ?? 1)
      : null
    const lockedValueTHB = validLocked && (locked === 0 || unitPriceTHB !== null)
      ? locked * (unitPriceTHB ?? 1)
      : null

    return { asset, available, locked, total, unitPriceTHB, valueTHB, availableValueTHB, lockedValueTHB }
  }).filter((row) => row.total !== 0 || row.asset === 'THB')

  const sumIfComplete = (key) => rows.every((row) => row[key] !== null)
    ? rows.reduce((sum, row) => sum + row[key], 0)
    : null
  const totalValueTHB = sumIfComplete('valueTHB')
  const availableValueTHB = sumIfComplete('availableValueTHB')
  const lockedValueTHB = sumIfComplete('lockedValueTHB')

  return {
    rows,
    availableValueTHB: Number.isFinite(availableValueTHB) ? availableValueTHB : null,
    lockedValueTHB: Number.isFinite(lockedValueTHB) ? lockedValueTHB : null,
    totalValueTHB: Number.isFinite(totalValueTHB) ? totalValueTHB : null,
  }
}
