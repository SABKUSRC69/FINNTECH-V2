// Independent audit of the deployed cash-linkage code (release-source 22c5e5e) on a THROWAWAY database.
// Synthetic owners and amounts only. Never point DATABASE_URL at a real database.
import { randomUUID } from 'node:crypto'
const R = 'file:///C:/Users/Admin/Downloads/FINNTECH/.student-real-20261008.local/release-source/apps/api/dist/'
const { createTrackerDatabase } = await import(R + 'persistence/database.js')
const svc = await import(R + 'tracker/service.js')
const stock = await import(R + 'tracker/stock-ledger.js')
const cash = await import(R + 'tracker/cash.js')
const backup = await import(R + 'tracker/backup.js')

const url = process.env.AUDIT_DATABASE_URL
if (!url || !/127\.0\.0\.1:5460\/finntech_cash_audit$/.test(url)) throw new Error('refused: throwaway audit DB only')
const db = createTrackerDatabase(url)
const results = []
const check = (id, name, expected, actual) => { const pass = JSON.stringify(expected) === JSON.stringify(actual); results.push({ id, name, pass, expected, actual }) }
const code = async fn => { try { await fn(); return 'OK' } catch (e) { return e?.constructor?.name === 'LedgerError' ? 'LedgerError' : e?.code ?? e?.name ?? String(e) } }
const key = () => randomUUID()
const bal = async id => (await db.cashAccount.findUnique({ where: { id } })).balance.toFixed(2)
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

const A = randomUUID(), B = randomUUID()
await db.trackerUser.createMany({ data: [{ id: A, identityState: 'FIXTURE' }, { id: B, identityState: 'FIXTURE' }] })
const income = (await db.financeCategory.create({ data: { ownerId: A, name: 'เงินเดือน', type: 'INCOME' } })).id
const expense = (await db.financeCategory.create({ data: { ownerId: A, name: 'อาหาร', type: 'EXPENSE' } })).id
const mk = async (owner, name, balance) => (await cash.createCash(db, owner, key(), { name, balance, currency: 'THB', asOf: today })).id
const cashA = await mk(A, 'ธนาคาร', '0.00'), cashA2 = await mk(A, 'กระเป๋า', '100.00'), cashB = await mk(B, 'B-bank', '5000.00')
const entry = (type, amount, cashAccountId, date = today) => ({ type, amount, currency: 'THB', date, note: '', categoryId: type === 'income' ? income : expense, ...(cashAccountId === undefined ? {} : { cashAccountId }) })

// A. income / expense
await svc.createEntry(db, A, key(), entry('income', '1000.00', cashA)); check('A1', 'income adds cash', '1000.00', await bal(cashA))
const exp1 = await svc.createEntry(db, A, key(), entry('expense', '300.10', cashA)); check('A2', 'expense subtracts cash', '699.90', await bal(cashA))
check('A3', 'expense above balance refused', 'CASH_INSUFFICIENT', await code(() => svc.createEntry(db, A, key(), entry('expense', '700.00', cashA))))
check('A3b', 'refused expense leaves balance and no row', ['699.90', 2], [await bal(cashA), await db.financeTransaction.count({ where: { ownerId: A } })])
check('A4', 'new entry without cash account refused', 'CASH_ACCOUNT_REQUIRED', await code(() => svc.createEntry(db, A, key(), entry('income', '1.00', undefined))))
check('A5', 'other owner cash account refused', 'CASH_ACCOUNT_NOT_FOUND', await code(() => svc.createEntry(db, A, key(), entry('income', '1.00', cashB))))
check('A5b', 'other owner balance untouched', '5000.00', await bal(cashB))
// correction: move expense to other account and change amount
await svc.correctEntry(db, A, exp1.id, key(), { action: 'replace', reason: 'fix', entry: entry('expense', '50.00', cashA2) })
check('A6', 'correction moves expense: A refunded, A2 charged', ['1000.00', '50.00'], [await bal(cashA), await bal(cashA2)])
// income -> expense correction
const inc2 = await svc.createEntry(db, A, key(), entry('income', '200.00', cashA))
await svc.correctEntry(db, A, inc2.id, key(), { action: 'replace', reason: 'type', entry: entry('expense', '200.00', cashA) })
check('A7', 'income corrected to expense swings 400', '800.00', await bal(cashA))
// idempotent replay
const k = key(); await svc.createEntry(db, A, k, entry('income', '10.00', cashA)); await svc.createEntry(db, A, k, entry('income', '10.00', cashA))
check('A8', 'same idempotency key applies once', '810.00', await bal(cashA))
check('A8b', 'same key different body conflicts', 'IDEMPOTENCY_CONFLICT', await code(() => svc.createEntry(db, A, k, entry('income', '11.00', cashA))))
// concurrency: two expenses that fit alone but not together
const both = await Promise.allSettled([svc.createEntry(db, A, key(), entry('expense', '500.00', cashA)), svc.createEntry(db, A, key(), entry('expense', '500.00', cashA))])
check('A9', 'concurrent expenses: exactly one succeeds, no negative', [1, '310.00'], [both.filter(r => r.status === 'fulfilled').length, await bal(cashA)])
// manual cash edit with stale version after a linked entry
const acct = await db.cashAccount.findUnique({ where: { id: cashA } })
await svc.createEntry(db, A, key(), entry('income', '90.00', cashA))
check('A10', 'manual edit with stale version refused', 'CASH_VERSION_CONFLICT', await code(() => cash.updateCash(db, A, cashA, key(), { name: 'ธนาคาร', balance: '999.00', currency: 'THB', asOf: today, expectedVersion: acct.version })))
check('A10b', 'balance not overwritten', '400.00', await bal(cashA))
// legacy entry (pre-link) correction must not touch cash
const legacy = await db.financeTransaction.create({ data: { ownerId: A, categoryId: expense, type: 'EXPENSE', amount: '123.00', currency: 'THB', occurredAt: new Date('2026-01-05T00:00:00+07:00'), note: '' } })
await svc.correctEntry(db, A, legacy.id, key(), { action: 'replace', reason: 'legacy', entry: entry('expense', '999.00', undefined, '2026-01-05') })
await svc.correctEntry(db, A, (await db.financeTransaction.findFirst({ where: { ownerId: A, amount: '999.00' } })).id, key(), { action: 'void', reason: 'legacy void' })
check('A11', 'legacy correction and void do not change cash', '400.00', await bal(cashA))
check('A11b', 'legacy correction attaching cash refused', 'LEGACY_CASH_LINK', await code(async () => {
  const l2 = await db.financeTransaction.create({ data: { ownerId: A, categoryId: expense, type: 'EXPENSE', amount: '5.00', currency: 'THB', occurredAt: new Date(), note: '' } })
  await svc.correctEntry(db, A, l2.id, key(), { action: 'replace', reason: 'x', entry: entry('expense', '5.00', cashA) })
}))
// backdated expense: applied to today's balance; asOf moves to today
await db.cashAccount.update({ where: { id: cashA2 }, data: { asOf: '2026-01-01' } })
check('A12', 'backdated entry without choice refused', 'CASH_OPENING_CHOICE_REQUIRED', await code(() => svc.createEntry(db, A, key(), entry('expense', '1.00', cashA2, '2025-12-01'))))
await svc.createEntry(db, A, key(), { ...entry('expense', '1.00', cashA2, '2025-12-01'), inOpeningBalance: false })
check('A12b', 'backdated entry applied on request; asOf stays the opening date', ['49.00', '2026-01-01'], [await bal(cashA2), (await db.cashAccount.findUnique({ where: { id: cashA2 } })).asOf])

// Crypto
const pf = (await svc.createPortfolio(db, A, key(), { name: 'P1', quoteCurrency: 'USDT' })).id
const trade = (side, quantity, amountThb, accountId = cashA, date = today, extra = {}) => ({ portfolioId: pf, asset: 'BTC', side, quantity, price: '100', fee: '0', quoteCurrency: 'USDT', date, ...(amountThb === undefined ? {} : { cashSettlement: { accountId, amountThb } }), ...extra })
const buy = await svc.createTrade(db, A, key(), trade('buy', '2', '300.00'))
check('C1', 'crypto buy subtracts THB paid', '100.00', await bal(cashA))
check('C2', 'crypto buy above cash refused', 'CASH_INSUFFICIENT', await code(() => svc.createTrade(db, A, key(), trade('buy', '1', '100.01'))))
check('C3', 'oversell refused, cash unchanged', ['LedgerError', '100.00'], [await code(() => svc.createTrade(db, A, key(), trade('sell', '3', '50.00'))), await bal(cashA)])
check('C4', 'trade without settlement refused', 'CASH_ACCOUNT_REQUIRED', await code(() => svc.createTrade(db, A, key(), trade('buy', '1', undefined))))
await svc.createTrade(db, A, key(), trade('sell', '1', '160.00'))
check('C5', 'crypto sell adds THB received', '260.00', await bal(cashA))
const hold = async () => (await db.portfolioHolding.findFirst({ where: { ownerId: A, portfolioId: pf } })).quantity.toString()
check('C6', 'holding quantity after buy 2 sell 1', '1', await hold())
await svc.correctTrade(db, A, buy.id, key(), { action: 'replace', reason: 'was sell', entry: { side: 'buy', quantity: '2', price: '100', fee: '0', quoteCurrency: 'USDT', date: today, cashSettlement: { accountId: cashA2, amountThb: '40.00' } } })
check('C7', 'buy corrected to other account and amount', ['560.00', '9.00'], [await bal(cashA), await bal(cashA2)])
check('C8', 'void of buy that later sell depends on is refused and rolled back', ['LedgerError', '560.00', '9.00'], [await code(async () => {
  const live = await db.cryptoTrade.findFirst({ where: { ownerId: A, side: 'BUY', voidedAt: null } }); await svc.correctTrade(db, A, live.id, key(), { action: 'void', reason: 'v' })
}), await bal(cashA), await bal(cashA2)])
// backdated buy is valid; backdated sell before any buy is refused
check('C9', 'backdated sell before first buy refused', 'LedgerError', await code(() => svc.createTrade(db, A, key(), trade('sell', '1', '1.00', cashA, '2020-01-01', { inOpeningBalance: false }))))
// void a linked sell after spending the cash
const sell2 = await svc.createTrade(db, A, key(), trade('sell', '1', '500.00'))
await svc.createEntry(db, A, key(), entry('expense', '1000.00', cashA))
check('C10', 'void sell after spending proceeds', 'CASH_INSUFFICIENT', await code(() => svc.correctTrade(db, A, sell2.id, key(), { action: 'void', reason: 'mistake' })))

// Stocks
const spf = (await stock.createStockPortfolio(db, A, key(), { name: 'US', quoteCurrency: 'USD' })).id
await svc.createEntry(db, A, key(), entry('income', '10000.00', cashA))
const sTrade = (side, quantity, amountThb) => ({ portfolioId: spf, symbol: 'AAPL', side, quantity, price: '200', fee: '1', quoteCurrency: 'USD', date: today, note: '', ...(amountThb ? { cashSettlement: { accountId: cashA, amountThb } } : {}) })
const before = await bal(cashA)
const sb = await code(() => stock.createStockTrade(db, A, key(), sTrade('buy', '3', '21000.00')))
check('S1', 'stock buy larger than cash refused', 'CASH_INSUFFICIENT', sb)
await stock.createStockTrade(db, A, key(), sTrade('buy', '1', '7100.00'))
check('S2', 'stock buy subtracts THB paid incl fee', (Number(before) - 7100).toFixed(2), await bal(cashA))
await stock.createStockTrade(db, A, key(), sTrade('sell', '1', '6900.00'))
check('S3', 'stock sell adds THB after fee; zero holding', [(Number(before) - 200).toFixed(2), '0'], [await bal(cashA), (await db.stockHolding.findFirst({ where: { ownerId: A, portfolioId: spf } })).quantity.toString()])
check('S4', 'stock oversell refused and rolled back', ['LedgerError', (Number(before) - 200).toFixed(2)], [await code(() => stock.createStockTrade(db, A, key(), sTrade('sell', '1', '1.00'))), await bal(cashA)])

// Backup round trip: links preserved, money not applied twice
const doc = await backup.exportBackup(db, A)
const C = randomUUID(); await db.trackerUser.create({ data: { id: C, identityState: 'FIXTURE' } })
const preview = await backup.previewBackup(db, C, doc)
const restored = await backup.restoreBackup(db, C, key(), { backup: doc, previewDigest: preview.digest, consent: true }).then(() => 'OK', e => e.code ?? String(e))
check('B1', 'restore succeeds', 'OK', restored)
const srcCash = (await db.cashAccount.findMany({ where: { ownerId: A }, orderBy: { name: 'asc' } })).map(r => [r.name, r.balance.toFixed(2)])
const dstCash = (await db.cashAccount.findMany({ where: { ownerId: C }, orderBy: { name: 'asc' } })).map(r => [r.name, r.balance.toFixed(2)])
check('B2', 'restored balances equal source (no double settle)', srcCash, dstCash)
check('B3', 'restored links counts equal', [await db.financeTransaction.count({ where: { ownerId: A, cashAccountId: { not: null } } }), await db.cryptoTrade.count({ where: { ownerId: A, cashAccountId: { not: null } } }), await db.stockTrade.count({ where: { ownerId: A, cashAccountId: { not: null } } })],
  [await db.financeTransaction.count({ where: { ownerId: C, cashAccountId: { not: null } } }), await db.cryptoTrade.count({ where: { ownerId: C, cashAccountId: { not: null } } }), await db.stockTrade.count({ where: { ownerId: C, cashAccountId: { not: null } } })])
check('B4', 'restored links point to restored owner accounts', 0, await db.$queryRaw`SELECT count(*)::int AS n FROM finance_transactions t JOIN cash_accounts c ON c.id=t.cash_account_id WHERE t.owner_id=${C}::uuid AND c.owner_id<>${C}::uuid`.then(r => r[0].n))
const legacyDoc = JSON.parse(JSON.stringify(doc)); for (const r of legacyDoc.transactions) delete r.cashAccountId; for (const r of [...legacyDoc.trades, ...legacyDoc.stockTrades]) delete r.cashSettlement
const D = randomUUID(); await db.trackerUser.create({ data: { id: D, identityState: 'FIXTURE' } })
const lp = await backup.previewBackup(db, D, legacyDoc).then(p => p, e => ({ error: e.code ?? String(e) }))
check('B5', 'pre-link backup (no cash fields) still previews and restores', 'OK', lp.error ?? await backup.restoreBackup(db, D, key(), { backup: legacyDoc, previewDigest: lp.digest, consent: true }).then(() => 'OK', e => e.code ?? String(e)))
// Export bytes contain no secrets-like fields
check('B6', 'backup has no market key / ciphertext fields', false, /ciphertext|token|keyHint|password/i.test(JSON.stringify(doc)))

// ---- Opening balance (records dated before the account's opening date) ----
const E = randomUUID(); await db.trackerUser.create({ data: { id: E, identityState: 'FIXTURE' } })
const eIncome = (await db.financeCategory.create({ data: { ownerId: E, name: 'เงินเดือน', type: 'INCOME' } })).id
const eExpense = (await db.financeCategory.create({ data: { ownerId: E, name: 'อาหาร', type: 'EXPENSE' } })).id
const cashE = (await cash.createCash(db, E, key(), { name: 'ธนาคาร E', balance: '9000.00', currency: 'THB', asOf: '2026-10-01' })).id
const eEntry = (type, amount, date, extra = {}) => ({ type, amount, currency: 'THB', date, note: '', categoryId: type === 'income' ? eIncome : eExpense, cashAccountId: cashE, ...extra })
check('O1', 'expense dated before opening date needs a choice', 'CASH_OPENING_CHOICE_REQUIRED', await code(() => svc.createEntry(db, E, key(), eEntry('expense', '1000.00', '2026-09-30'))))
const kept = await svc.createEntry(db, E, key(), eEntry('expense', '1000.00', '2026-09-30', { inOpeningBalance: true }))
const keptRow = await db.financeTransaction.findUnique({ where: { id: kept.id } })
check('O2', 'included in opening balance: history kept, cash unchanged, unlinked', ['9000.00', null, true], [await bal(cashE), keptRow.cashAccountId, keptRow.cashInOpeningBalance])
await svc.createEntry(db, E, key(), eEntry('expense', '500.00', '2026-09-30', { inOpeningBalance: false }))
check('O3', 'not included: applied to cash', '8500.00', await bal(cashE))
check('O4', 'opening flag on a record after the opening date refused', 'CASH_OPENING_DATE', await code(() => svc.createEntry(db, E, key(), eEntry('expense', '1.00', '2026-10-02', { inOpeningBalance: true }))))
await svc.createEntry(db, E, key(), eEntry('expense', '100.00', '2026-10-01'))
check('O5', 'same-day record applies without asking; asOf stays opening date', ['8400.00', '2026-10-01'], [await bal(cashE), (await db.cashAccount.findUnique({ where: { id: cashE } })).asOf])
await svc.correctEntry(db, E, kept.id, key(), { action: 'replace', reason: 'fix', entry: { type: 'expense', amount: '1200.00', currency: 'THB', date: '2026-09-29', note: '', categoryId: eExpense } })
const replaced = await db.financeTransaction.findFirst({ where: { ownerId: E, amount: '1200.00' } })
check('O6', 'correcting an opening-balance record keeps the flag and moves no cash', ['8400.00', true, null], [await bal(cashE), replaced.cashInOpeningBalance, replaced.cashAccountId])
const ePf = (await svc.createPortfolio(db, E, key(), { name: 'EP', quoteCurrency: 'USDT' })).id
await svc.createTrade(db, E, key(), { portfolioId: ePf, asset: 'ETH', side: 'buy', quantity: '1', price: '100', fee: '0', quoteCurrency: 'USDT', date: '2026-09-01', cashSettlement: { accountId: cashE }, inOpeningBalance: true })
check('O7', 'crypto buy in opening balance: no THB amount needed, holding added, cash unchanged', ['8400.00', '1'], [await bal(cashE), (await db.portfolioHolding.findFirst({ where: { ownerId: E, portfolioId: ePf } })).quantity.toString()])
check('O8', 'applied trade without THB amount refused', 'CASH_AMOUNT_REQUIRED', await code(() => svc.createTrade(db, E, key(), { portfolioId: ePf, asset: 'ETH', side: 'buy', quantity: '1', price: '100', fee: '0', quoteCurrency: 'USDT', date: today, cashSettlement: { accountId: cashE } })))
const eSpf = (await stock.createStockPortfolio(db, E, key(), { name: 'ES', quoteCurrency: 'USD' })).id
await stock.createStockTrade(db, E, key(), { portfolioId: eSpf, symbol: 'SPY', side: 'buy', quantity: '2', price: '500', fee: '0', quoteCurrency: 'USD', date: '2026-09-15', note: '', cashSettlement: { accountId: cashE }, inOpeningBalance: true })
const eStock = await db.stockTrade.findFirst({ where: { ownerId: E } })
check('O9', 'stock buy in opening balance: holding added, cash unchanged, flagged', ['8400.00', '2', true], [await bal(cashE), (await db.stockHolding.findFirst({ where: { ownerId: E } })).quantity.toString(), eStock.cashInOpeningBalance])
const eDoc = await backup.exportBackup(db, E)
check('O10', 'backup marks opening-balance records', [1 + 1, 1, 1], [eDoc.transactions.filter(r => r.inOpeningBalance).length, eDoc.trades.filter(r => r.inOpeningBalance).length, eDoc.stockTrades.filter(r => r.inOpeningBalance).length])
const F = randomUUID(); await db.trackerUser.create({ data: { id: F, identityState: 'FIXTURE' } })
const fPreview = await backup.previewBackup(db, F, eDoc)
check('O11', 'restore keeps flags and balances without applying money', ['OK', '8400.00', 2, 1, 1], [await backup.restoreBackup(db, F, key(), { backup: eDoc, previewDigest: fPreview.digest, consent: true }).then(() => 'OK', e => e.code ?? String(e)),
  (await db.cashAccount.findFirst({ where: { ownerId: F } })).balance.toFixed(2), await db.financeTransaction.count({ where: { ownerId: F, cashInOpeningBalance: true } }), await db.cryptoTrade.count({ where: { ownerId: F, cashInOpeningBalance: true } }), await db.stockTrade.count({ where: { ownerId: F, cashInOpeningBalance: true } })])
const badDoc = JSON.parse(JSON.stringify(eDoc)); const linked = badDoc.transactions.find(r => r.cashAccountId); linked.inOpeningBalance = true
check('O12', 'backup with an opening-balance record that is also linked is rejected', 'ZodError', await code(() => backup.previewBackup(db, randomUUID(), badDoc)))

// ---- Real mode: a long restore-style mutation must not block another owner's write ----
const { registerRealDatabase } = await import(R + 'auth/real.js')
const enroll = async owner => { const user = await db.authUser.create({ data: { name: 'Synthetic', email: `${randomUUID()}@example.test` } }); await db.authIdentity.create({ data: { ownerId: owner, provider: 'better-auth', subject: user.id, authUserId: user.id, verifiedAt: new Date() } }); await db.authRecoveryEnrollment.create({ data: { userId: user.id } }) }
await enroll(A); await enroll(E)
registerRealDatabase(db, { databaseLimitBytes: 536870912 })
const long = svc.ownedMutation(db, A, 'audit.long', key(), {}, async () => { await new Promise(r => setTimeout(r, 6000)); return { id: randomUUID() } }, 'exclusive', 20000)
await new Promise(r => setTimeout(r, 300))
const t0 = Date.now(), other = await code(() => svc.createEntry(db, E, key(), eEntry('income', '1.00', today)))
check('L1', 'other owner writes during a 6 s exclusive mutation', ['OK', true], [other, Date.now() - t0 < 2500])
await long

// ---- Tiingo reader: concurrent reads for one owner share one provider read ----
const { TransientCloseReader } = await import(R + 'tracker/transient-closes.js')
const reader = new TransientCloseReader(), calls = []
const provider = { source: 'x', attribution: { label: 'x', url: 'https://example.test' }, latestClose: async symbol => { calls.push(symbol); await new Promise(r => setTimeout(r, 200)); return { tradingDate: '2026-10-09', close: '100' } } }
const description = { provider: 'READY', source: 'Tiingo EOD', license: 'PERSONAL', keySource: 'ACCOUNT', retention: 'TRANSIENT', keyVersion: 1, expectedSession: '2026-10-09', attribution: null, quotes: ['AAPL', 'SPY'].map(symbol => ({ symbol, currency: 'USD', priceType: 'CLOSE', close: null, tradingDate: null, fetchedAt: null, status: 'MISSING', problem: null })) }
const [r1, r2] = await Promise.all([reader.read(A, description, provider), reader.read(A, description, provider)])
check('T1', 'two concurrent reads: one provider call per symbol, both get prices', [2, '100', '100'], [calls.length, r1.quotes[0].close, r2.quotes[1].close])
await reader.read(A, description, provider)
check('T2', 'nothing is retained after the read settles (next read calls again)', 4, calls.length)

console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results }, null, 1))
await db.$disconnect()
