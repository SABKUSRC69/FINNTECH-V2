import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import authService from '../services/authService'
import { createDemoDataExport } from '../services/demoDataExport.js'
import legacyPortfolio560fb4f from './fixtures/portfolio-560fb4f.json'

describe('local account data safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('distinguishes an absent account-data key from corrupt or unavailable data', () => {
    const missing = authService.loadUserData('new-user-without-data')

    expect(missing).toMatchObject({ ok: true, status: 'missing' })
    expect(missing.data.balance).toBe(0)
    expect(localStorage.getItem('finntech_user_new-user-without-data_data')).toBeNull()
  })

  it('keeps explicit legacy balance-only and partial wallet totals without adding starter credit', () => {
    const user = authService.register('Legacy Wallet', 'legacy-wallet@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const balanceOnly = { balance: 123 }
    localStorage.setItem(key, JSON.stringify(balanceOnly))

    const loadedBalanceOnly = authService.loadUserData(user.id)
    expect(loadedBalanceOnly).toMatchObject({ ok: true, status: 'loaded' })
    expect(loadedBalanceOnly.data.balance).toBe(123)
    expect(loadedBalanceOnly.data.spotBalances.THB).toBe(123)

    const partialWallet = { balance: 123, spotBalances: { BTC: 0.1 } }
    localStorage.setItem(key, JSON.stringify(partialWallet))
    const loadedPartialWallet = authService.loadUserData(user.id)
    expect(loadedPartialWallet).toMatchObject({ ok: true, status: 'loaded' })
    expect(loadedPartialWallet.data.balance).toBe(123)
    expect(loadedPartialWallet.data.spotBalances.THB).toBe(123)
    expect(loadedPartialWallet.data.spotBalances.BTC).toBe(0.1)
    expect(localStorage.getItem(key)).toBe(JSON.stringify(partialWallet))
  })

  it('loads, saves, and exports the exact legacy portfolio schema without inventing currency', () => {
    const user = authService.register('Legacy Portfolio', 'legacy-portfolio@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const source = {
      balance: 500000,
      spotBalances: { THB: 500000, BTC: 0, ETH: 0, SOL: 0, USDT: 0 },
      transactions: [],
      portfolio: legacyPortfolio560fb4f,
      openOrders: [],
      tradeHistory: [],
      cancelledOrderIds: [],
      priceAlerts: [],
      positions: [],
    }
    localStorage.setItem(key, JSON.stringify(source))

    const loaded = authService.loadUserData(user.id)
    expect(loaded).toMatchObject({ ok: true, status: 'loaded' })
    expect(loaded.data.portfolio).toEqual(legacyPortfolio560fb4f)
    expect(loaded.data.portfolio.every((asset) => !Object.hasOwn(asset, 'currency'))).toBe(true)

    const saved = authService.saveUserData(user.id, { transactions: [] })
    expect(saved).toMatchObject({ ok: true, status: 'saved' })
    const stored = JSON.parse(localStorage.getItem(key))
    expect(stored.portfolio).toEqual(legacyPortfolio560fb4f)
    expect(stored.portfolio.every((asset) => !Object.hasOwn(asset, 'currency'))).toBe(true)

    const exported = createDemoDataExport(loaded.data, ['portfolio'])
    expect(exported.data.portfolio).toEqual(legacyPortfolio560fb4f)
    expect(exported.data.portfolio.every((asset) => !Object.hasOwn(asset, 'currency'))).toBe(true)
  })

  it('rejects a new portfolio row without currency while preserving accepted legacy rows', () => {
    const user = authService.register('Portfolio Currency Guard', 'portfolio-currency-guard@example.test', 'demo-pass')
    const current = authService.getUserData(user.id)
    const result = authService.saveUserData(user.id, {
      portfolio: [{ ...legacyPortfolio560fb4f[0], id: 'new-missing-currency' }],
    })

    expect(result).toMatchObject({ ok: false, status: 'corrupt' })
    expect(authService.getUserData(user.id).portfolio).toEqual(current.portfolio)
  })

  it('treats a present invalid currency as corrupt instead of legacy-missing currency', () => {
    const user = authService.register('Invalid Legacy Currency', 'invalid-legacy-currency@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const source = {
      balance: 10,
      spotBalances: { THB: 10 },
      transactions: [],
      portfolio: [{ ...legacyPortfolio560fb4f[0], currency: null }],
    }
    const raw = JSON.stringify(source)
    localStorage.setItem(key, raw)

    expect(authService.loadUserData(user.id)).toMatchObject({ ok: false, status: 'corrupt' })
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it.each([
    ['null', { balance: null }],
    ['boolean', { balance: true }],
    ['empty string', { balance: '' }],
    ['array coercion', { balance: [] }],
    ['object coercion', { balance: {} }],
    ['empty wallet object', { spotBalances: {} }],
    ['missing wallet fields', {}],
  ])('rejects ambiguous wallet data: %s', (_label, corruptData) => {
    const user = authService.register('Ambiguous Wallet', `ambiguous-${Date.now()}-${Math.random()}@example.test`, 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const original = JSON.stringify(corruptData)
    localStorage.setItem(key, original)

    expect(authService.loadUserData(user.id)).toMatchObject({ ok: false, status: 'corrupt' })
    expect(localStorage.getItem(key)).toBe(original)
  })

  it.each([null, false, '', [], {}])('rejects non-number wallet asset values: %j', (badAmount) => {
    const user = authService.register('Bad Asset Value', `bad-asset-${Date.now()}-${Math.random()}@example.test`, 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const corruptData = { spotBalances: { BTC: badAmount } }
    const original = JSON.stringify(corruptData)
    localStorage.setItem(key, original)

    expect(authService.loadUserData(user.id)).toMatchObject({ ok: false, status: 'corrupt' })
    expect(localStorage.getItem(key)).toBe(original)
  })

  it('preserves malformed account data and refuses to replace it with a default wallet', () => {
    const user = authService.register('Corrupt Data', 'corrupt@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const corruptSource = '{not-json'
    localStorage.setItem(key, corruptSource)

    const loaded = authService.loadUserData(user.id)
    const saved = authService.saveUserData(user.id, { balance: 500000 })

    expect(loaded).toMatchObject({ ok: false, status: 'corrupt' })
    expect(saved).toMatchObject({ ok: false, status: 'corrupt' })
    expect(() => authService.clearUserData(user.id)).toThrow()
    expect(localStorage.getItem(key)).toBe(corruptSource)
  })

  it('does not treat invalid parsed shapes as missing data', () => {
    const user = authService.register('Bad Shape', 'shape@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const corruptSource = JSON.stringify({ balance: 500000, transactions: 'not-an-array' })
    localStorage.setItem(key, corruptSource)

    expect(authService.loadUserData(user.id)).toMatchObject({ ok: false, status: 'corrupt' })
    expect(localStorage.getItem(key)).toBe(corruptSource)
  })

  it.each([
    ['transactions', { id: 'tx-1', date: '2026-09-01', type: 'income', category: 'salary', categoryName: 'Salary', amount: 10 }],
    ['portfolio', { id: 'asset-1', name: 'BTC', symbol: 'BTC', currency: 'THB', type: 'crypto', shares: 0.1, avgBuyPrice: 10, currentPrice: 11 }],
    ['openOrders', { id: 'order-1', symbol: 'BTC/THB', side: 'BUY', orderType: 'LIMIT', status: 'OPEN', price: 10, amount: 1, total: 10 }],
    ['tradeHistory', { id: 'trade-1', orderId: 'order-1', symbol: 'BTC/THB', side: 'BUY', orderType: 'LIMIT', status: 'FILLED', price: 10, amount: 1, total: 10, fee: 0.025 }],
    ['priceAlerts', { id: 'alert-1', symbol: 'BTC/THB', condition: 'GTE', targetPrice: 10 }],
  ])('rejects a malformed member in %s without dropping or saving it', (field, validExample) => {
    const user = authService.register('Bad Row', `bad-row-${field}-${Date.now()}-${Math.random()}@example.test`, 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const corruptData = {
      balance: 123,
      spotBalances: { THB: 123 },
      [field]: [field === 'transactions' ? null : validExample, null],
    }
    const original = JSON.stringify(corruptData)
    localStorage.setItem(key, original)

    expect(authService.loadUserData(user.id)).toMatchObject({ ok: false, status: 'corrupt' })
    expect(authService.saveUserData(user.id, { balance: 456 })).toMatchObject({ ok: false, status: 'corrupt' })
    expect(localStorage.getItem(key)).toBe(original)
  })

  it('reports storage read failures and does not attempt a replacement write', () => {
    const user = authService.register('Blocked Read', 'blocked-read@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const originalGetItem = localStorage.getItem.bind(localStorage)
    const writeSpy = vi.spyOn(localStorage, 'setItem')
    vi.spyOn(localStorage, 'getItem').mockImplementation((requestedKey) => {
      if (requestedKey === key) throw new Error('storage access denied')
      return originalGetItem(requestedKey)
    })

    const loaded = authService.loadUserData(user.id)
    const saved = authService.saveUserData(user.id, { balance: 200 })

    expect(loaded).toMatchObject({ ok: false, status: 'unavailable' })
    expect(saved).toMatchObject({ ok: false, status: 'unavailable' })
    expect(writeSpy).not.toHaveBeenCalledWith(key, expect.any(String))
  })

  it('returns a visible write failure and keeps the prior account snapshot intact', () => {
    const user = authService.register('Blocked Write', 'blocked-write@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const source = localStorage.getItem(key)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((requestedKey, value) => {
      if (requestedKey === key) throw new Error('quota exceeded')
      return originalSetItem(requestedKey, value)
    })

    const saved = authService.saveUserData(user.id, { balance: 123 })

    expect(saved).toMatchObject({ ok: false, status: 'write-failed' })
    expect(localStorage.getItem(key)).toBe(source)
  })

  it('blocks autosave before the requested account has finished loading', () => {
    const user = authService.register('Not Loaded', 'not-loaded@example.test', 'demo-pass')
    const key = `finntech_user_${user.id}_data`
    const source = localStorage.getItem(key)
    const writeSpy = vi.spyOn(localStorage, 'setItem')

    const result = authService.saveUserData(user.id, { balance: 7 }, {
      requireLoadedOwner: true,
      dataLoaded: false,
      loadedOwnerId: user.id,
    })

    expect(result).toMatchObject({ ok: false, status: 'not-ready' })
    expect(writeSpy).not.toHaveBeenCalledWith(key, expect.any(String))
    expect(localStorage.getItem(key)).toBe(source)
  })

  it('blocks a previous account snapshot from being saved during an account switch', () => {
    const first = authService.register('First Account', 'first@example.test', 'demo-pass')
    const second = authService.register('Second Account', 'second@example.test', 'demo-pass')
    const secondKey = `finntech_user_${second.id}_data`
    const secondBefore = localStorage.getItem(secondKey)
    const writeSpy = vi.spyOn(localStorage, 'setItem')

    const result = authService.saveUserData(second.id, {
      balance: 12,
      spotBalances: { ...authService.getUserData(first.id).spotBalances, THB: 12 },
    }, {
      requireLoadedOwner: true,
      dataLoaded: true,
      loadedOwnerId: first.id,
    })

    expect(result).toMatchObject({ ok: false, status: 'owner-mismatch' })
    expect(writeSpy).not.toHaveBeenCalledWith(secondKey, expect.any(String))
    expect(localStorage.getItem(secondKey)).toBe(secondBefore)
  })
})

describe('DEMO export whitelist', () => {
  it('exports only selected whitelisted fields and leaves the source snapshot unchanged', () => {
    const source = {
      userId: 'private-account-id',
      email: 'credential@example.test',
      password: 'plain-password-secret',
      passcodeHash: 'demo-hash-secret',
      accessToken: 'access-token-secret',
      secret: 'private-secret',
      balance: 500,
      spotBalances: { THB: 500, BTC: 0.1, privateAsset: 99 },
      transactions: [{ id: 'tx-1', amount: 20, note: 'coffee', password: 'row-password' }],
      portfolio: [{ id: 'asset-1', symbol: 'BTC', currency: 'THB', shares: 0.1, token: 'row-token' }],
      openOrders: [{ id: 'order-1', status: 'OPEN', amount: 0.01, secret: 'order-secret' }],
      tradeHistory: [{ id: 'trade-1', status: 'SIMULATED', fee: 1, accessToken: 'trade-token' }],
      priceAlerts: [{ id: 'alert-1', symbol: 'BTC/THB', targetPrice: 100, passcodeHash: 'alert-hash' }],
    }
    const before = JSON.stringify(source)

    const result = createDemoDataExport(source, [
      'transactions', 'portfolio', 'paperWallet', 'paperTrading', 'priceAlerts', 'unknown-section',
    ], { exportedAt: '2026-09-29T00:00:00.000Z', sourceOrigin: 'https://old.example.test/path' })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      schema: 'finntech-demo-data-export',
      version: 1,
      mode: 'PAPER_DEMO',
      sourceOrigin: 'https://old.example.test',
    })
    expect(result.data.paperWallet.spotBalances).toEqual({ THB: 500, BTC: 0.1 })
    expect(result.data.transactions[0]).toEqual({ id: 'tx-1', amount: 20, note: 'coffee' })
    for (const privateValue of [
      'private-account-id', 'credential@example.test', 'plain-password-secret',
      'demo-hash-secret', 'access-token-secret', 'private-secret', 'row-password',
      'row-token', 'order-secret', 'trade-token', 'alert-hash',
    ]) {
      expect(serialized).not.toContain(privateValue)
    }
    expect(source).toEqual(JSON.parse(before))
  })
})
