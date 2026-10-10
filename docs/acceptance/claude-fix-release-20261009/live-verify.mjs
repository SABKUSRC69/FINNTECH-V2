// Owner-run live verification of release 41d2985 on https://finntech-personal.onrender.com/ using
// throwaway synthetic accounts (@example.test, random passwords held only in memory).
// Run from the repository root:  node docs/acceptance/claude-fix-release-20261009/live-verify.mjs
// It never prints cookies or passwords. At the end each synthetic account files a deletion request,
// which blocks it and revokes its sessions; the existing privacy-operator purge removes the rows later.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { valueAssets, valueMixedAssets } from '../../../packages/finance/dist/index.js'

// FINNTECH_VERIFY_ORIGIN lets the same script be rehearsed against a local loopback build first.
const origin = process.env.FINNTECH_VERIFY_ORIGIN ?? 'https://finntech-personal.onrender.com'
const expected = { js: 'index-BDYv7HwH.js', jsSha256: '6bf3a3c6413807405007bd26d9d1a7704462ab6643a675d4ad23debc25298d68', css: 'index-C6G3rOc3.css', cssSha256: 'df60f3f754a0df18f526467d192755a851ae1e73ca97b751ba2d524fa4b0bc4d' }
const out = { at: new Date().toISOString(), origin, checks: {} }
const check = (name, pass, detail) => { out.checks[name] = { pass, ...detail }; console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail)) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

class Person {
  constructor(label) { this.label = label; this.email = `finntech-verify-${label}-${randomUUID().slice(0, 8)}@example.test`; this.password = randomUUID() + randomUUID(); this.cookie = '' }
  async call(method, route, body) {
    const response = await fetch(`${origin}/api/${route}`, { method, signal: AbortSignal.timeout(90000),
      headers: { Origin: origin, Cookie: this.cookie, 'Idempotency-Key': randomUUID(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const set = response.headers.getSetCookie().find(s => /(^|__Secure-)finntech\.session_token=/.test(s))
    if (set) this.cookie = set.split(';')[0]
    const text = await response.text()
    let json = null; try { json = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
    return { status: response.status, body: json }
  }
  signUp() { return this.call('POST', 'auth/sign-up/email', { name: `Verify ${this.label}`, email: this.email, password: this.password }) }
  signIn() { return this.call('POST', 'auth/sign-in/email', { email: this.email, password: this.password }) }
}

// 1. Release identity and readiness.
const page = await fetch(origin + '/', { signal: AbortSignal.timeout(120000) }).then(r => r.text())
const hash = async file => createHash('sha256').update(Buffer.from(await (await fetch(`${origin}/assets/${file}`)).arrayBuffer())).digest('hex')
check('release-assets', page.includes(expected.js) && page.includes(expected.css) && await hash(expected.js) === expected.jsSha256 && await hash(expected.css) === expected.cssSha256, { js: expected.js, css: expected.css })
check('ready', (await fetch(origin + '/api/ready').then(r => r.json())).ready === true, {})

// 2. F1: five distinct people sign in within ten seconds.
const people = [0, 1, 2, 3, 4].map(i => new Person(`p${i}`))
for (const person of people) { const r = await person.signUp(); if (r.status !== 200) throw new Error(`sign-up ${person.label}: ${r.status}`) }
for (const person of people) await person.call('POST', 'auth/sign-out', {})
const started = Date.now()
const signIns = await Promise.all(people.map(p => p.signIn().then(r => r.status)))
check('F1-simultaneous-sign-in', signIns.every(s => s === 200) && Date.now() - started < 10000, { statuses: signIns })
const [a, b] = people

// 3. F3: empty categories, starter labels, a saved transaction that survives a fresh session.
const empty = await a.call('GET', 'finance?month=2026-10')
check('F3-new-account-has-no-categories', empty.status === 200 && empty.body.categories.length === 0, { categories: empty.body?.categories?.length })
const starter = await a.call('POST', 'finance/categories/starter', {})
const afterStarter = await a.call('GET', 'finance?month=2026-10')
check('F3-starter-categories', starter.status === 200 && afterStarter.body.categories.length === 13 && afterStarter.body.transactions.length === 0, { created: starter.body?.created, categories: afterStarter.body?.categories?.length })
const food = afterStarter.body.categories.find(c => c.type === 'expense')
const saved = await a.call('POST', 'finance/transactions', { type: 'expense', amount: '250.75', currency: 'THB', categoryId: food.id, date: '2026-10-09', note: 'synthetic live verification' })
await a.call('POST', 'auth/sign-out', {}); await a.signIn()
const reloaded = await a.call('GET', 'finance?month=2026-10')
check('save-and-reload', saved.status === 200 && reloaded.body.expense === '250.75' && reloaded.body.transactions.length === 1, { expense: reloaded.body?.expense })

// 4. Stock reference valuation: 0.5 share x 200 USD x 35 = 3,500 THB; owner B cannot see it.
const portfolio = await a.call('POST', 'stocks/portfolios', { name: 'Verify US', quoteCurrency: 'USD' })
const trade = await a.call('POST', 'stocks/trades', { portfolioId: portfolio.body.id, symbol: 'AAPL', side: 'buy', quantity: '0.5', price: '150', fee: '0', quoteCurrency: 'USD', date: '2026-10-09', note: '' })
const asOf = new Date(Date.now() - 60000).toISOString()
const refPrice = await a.call('POST', 'valuation/references', { symbol: 'AAPL', currency: 'USD', value: '200', asOf, enabled: true, expectedVersion: null })
const refFx = await a.call('POST', 'valuation/references', { symbol: 'USDTHB', currency: 'THB', value: '35', asOf, enabled: true, expectedVersion: null })
const stocks = await a.call('GET', 'stocks'), references = await a.call('GET', 'valuation/references')
const price = references.body.references.find(r => r.symbol === 'AAPL')?.value, fx = references.body.references.find(r => r.symbol === 'USDTHB')?.value
const mixed = valueMixedAssets(valueAssets([], [], new Map(), null), stocks.body.holdings, new Map([['AAPL', price]]), [], null, fx)
const missing = valueMixedAssets(valueAssets([], [], new Map(), null), stocks.body.holdings, new Map(), [], null, fx)
check('stock-reference-valuation', [portfolio.status, trade.status, refPrice.status, refFx.status].every(s => s === 200) && mixed.totalThb === '3500' && missing.totalThb === null, { totalThb: mixed.totalThb, withoutPrice: missing.totalThb })
const foreign = await b.call('GET', 'stocks')
check('owner-isolation', foreign.status === 200 && foreign.body.holdings.length === 0 && foreign.body.portfolios.length === 0, {})

// 5. F2 (optional, 121 small writes on one synthetic account): node live-verify.mjs --write-budget
if (process.argv.includes('--write-budget')) {
  const statuses = {}
  for (let i = 0; i <= 120; i++) { const r = await b.call('POST', 'finance/categories', { name: `Budget ${i}`, type: 'expense' }); statuses[r.status] = (statuses[r.status] ?? 0) + 1 }
  const other = await people[2].call('POST', 'finance/categories', { name: 'Other owner', type: 'income' })
  check('F2-per-owner-write-budget', statuses['429'] >= 1 && other.status === 200, { ownerB: statuses, otherOwner: other.status })
}

// 6. F10 and cleanup: every synthetic account requests deletion; a wrong password must not reveal it.
for (const person of people) {
  const r = await person.call('POST', 'account/deletion/request', { consent: 'DELETE_MY_ACCOUNT', password: person.password, requestKey: randomUUID() })
  out.checks[`cleanup-${person.label}`] = { pass: r.status === 200, status: r.status }
}
await sleep(1000)
const wrong = await new Person('x').call('POST', 'auth/sign-in/email', { email: a.email, password: 'wrong-password-123' })
const right = await a.signIn()
check('F10-deletion-pending-after-password-only', wrong.status === 401 && !JSON.stringify(wrong.body).includes('DELETION') && right.status === 403 && right.body?.error?.code === 'ACCOUNT_DELETION_PENDING', { wrong: wrong.status, right: right.status })
const file = path.join('docs/acceptance/claude-fix-release-20261009', process.env.FINNTECH_VERIFY_ORIGIN ? 'local-rehearsal-verify-result.json' : 'live-verify-result.json')
fs.writeFileSync(file, JSON.stringify(out, null, 2))
console.log(`Saved ${file} (no cookies or passwords). Synthetic emails end with @example.test and are deletion-requested.`)
