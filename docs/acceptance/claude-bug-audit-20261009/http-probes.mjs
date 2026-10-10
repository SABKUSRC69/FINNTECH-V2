// HTTP probes against the audit's rehearsal server (127.0.0.1:4199, email-password mode, synthetic DB).
// Usage: node http-probes.mjs <probe>. Cookies and passwords never leave this process.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { origin } from './rehearsal-env.mjs'

const evidence = 'C:/Users/Admin/Downloads/FINNTECH/docs/acceptance/claude-bug-audit-20261009'
const psql = sql => spawnSync('docker', ['exec', 'claude-audit-rehearsal', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'finish_rehearsal', '-d', 'finntech_finish_real', '-c', sql], { encoding: 'utf8', windowsHide: true })

class Client {
  constructor(label) { this.label = label; this.cookie = ''; this.email = `audit-${label}-${randomUUID().slice(0, 8)}@example.test`; this.password = randomUUID() + randomUUID() }
  async call(method, route, body, { key = randomUUID(), contentType = 'application/json', raw } = {}) {
    const headers = { Origin: origin, Cookie: this.cookie, 'Idempotency-Key': key }
    if (body !== undefined || raw) headers['Content-Type'] = contentType
    const response = await fetch(`${origin}/api/${route}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
    const set = response.headers.getSetCookie().find(s => s.startsWith('finntech.session_token='))
    if (set) this.cookie = set.split(';')[0]
    let json = null
    try { json = await response.json() } catch { /* non-JSON */ }
    return { status: response.status, body: json }
  }
  async signUp() { return this.call('POST', 'auth/sign-up/email', { name: `Audit ${this.label}`, email: this.email, password: this.password }) }
  async signIn() { return this.call('POST', 'auth/sign-in/email', { email: this.email, password: this.password }) }
}
const out = {}
const record = (name, value) => { out[name] = value; console.log(name, JSON.stringify(value)) }

async function writeBudget() {
  // One account's ordinary writes exhaust the single global write budget for every other account.
  const a = new Client('budget-a'), b = new Client('budget-b')
  // Space signups beyond Better Auth's shared 3-per-10s sign-up bucket so only the write budget is measured.
  const first = (await a.signUp()).status
  await new Promise(resolve => setTimeout(resolve, 11000))
  record('signup', [first, (await b.signUp()).status])
  const statuses = {}
  for (let i = 0; i < 125; i++) {
    const r = await a.call('POST', 'finance/categories', { name: `A category ${i}`, type: 'expense' })
    statuses[r.status] = (statuses[r.status] ?? 0) + 1
  }
  record('accountA_125_writes_status_counts', statuses)
  const other = await b.call('POST', 'finance/categories', { name: 'B first category', type: 'income' })
  record('accountB_first_write', { status: other.status, code: other.body?.error?.code })
}

async function authBudget() {
  // Failed sign-ins for unrelated identities exhaust the shared auth budget for a different user.
  const victim = new Client('auth-victim')
  record('victim_signup', (await victim.signUp()).status)
  await victim.call('POST', 'auth/sign-out', {})
  const statuses = {}
  for (let i = 0; i < 62; i++) {
    const r = await fetch(`${origin}/api/auth/sign-in/email`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `nobody-${i}-${randomUUID()}@example.test`, password: 'wrong-password-123' }) })
    statuses[r.status] = (statuses[r.status] ?? 0) + 1
  }
  record('unrelated_failed_signins_status_counts', statuses)
  const login = await victim.signIn()
  record('victim_correct_signin', { status: login.status, code: login.body?.error?.code })
}

async function isolationAndIdempotency() {
  const a = new Client('iso-a'), b = new Client('iso-b')
  record('signup', [(await a.signUp()).status, (await b.signUp()).status])
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ccddee' } }).png().toBuffer()
  const staged = await a.call('POST', 'media/stage/receipt', undefined, { raw: png, contentType: 'image/png' })
  record('a_stage_receipt', { status: staged.status, byteSize: staged.body?.byteSize })
  const category = await a.call('POST', 'finance/categories', { name: 'Food', type: 'expense' })
  const entryBody = { type: 'expense', amount: '120.50', currency: 'THB', categoryId: category.body.id, date: '2026-10-09', note: 'audit', attachmentId: staged.body.id }
  const key = randomUUID()
  const first = await a.call('POST', 'finance/transactions', entryBody, { key })
  const retry = await a.call('POST', 'finance/transactions', entryBody, { key })
  const changed = await a.call('POST', 'finance/transactions', { ...entryBody, amount: '999.00', attachmentId: undefined }, { key })
  record('idempotency', { first: first.status, retrySameReceipt: retry.body?.id === first.body?.id, changedPayload: [changed.status, changed.body?.error?.code] })
  const month = await a.call('GET', 'finance?month=2026-10')
  record('a_month', { expense: month.body?.expense, transactions: month.body?.transactions?.length })
  const crossObject = await b.call('GET', `media/objects/${staged.body.id}`)
  const crossAttachment = await b.call('GET', `media/attachments/finance/${first.body.id}`)
  const crossCorrect = await b.call('POST', `finance/transactions/${first.body.id}/corrections`, { action: 'void', reason: 'attack' })
  const crossFinance = await b.call('GET', 'finance?month=2026-10')
  record('cross_owner', { object: crossObject.status, attachment: crossAttachment.status, correction: [crossCorrect.status, crossCorrect.body?.error?.code], bTransactions: crossFinance.body?.transactions?.length })
  const anonymous = await new Client('anon').call('GET', `media/objects/${staged.body.id}`)
  const foreignOrigin = await fetch(`${origin}/api/finance/categories`, { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: a.cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ name: 'csrf', type: 'expense' }) })
  record('anonymous_and_csrf', { anonymousMedia: anonymous.status, foreignOriginWrite: foreignOrigin.status })
  // Session expiry: expire A's session server-side, then use the same cookie.
  const user = psql(`SELECT id FROM auth_users WHERE email='${a.email}'`).stdout.trim()
  psql(`UPDATE auth_sessions SET expires_at=now()-interval '1 minute' WHERE user_id='${user}'`)
  const expired = await a.call('GET', 'finance?month=2026-10')
  record('expired_session', { status: expired.status, code: expired.body?.error?.code })
}

async function sharedSigninBucket() {
  // Four different people sign in correctly within ten seconds; no one made a mistake.
  const people = [0, 1, 2, 3].map(i => new Client(`shared-${i}`))
  for (const person of people) {
    const created = await person.signUp()
    await person.call('POST', 'auth/sign-out', {})
    record(`signup_${person.label}`, created.status)
    await new Promise(resolve => setTimeout(resolve, 11000))
  }
  const results = []
  for (const person of people) {
    const r = await person.signIn()
    results.push({ person: person.label, status: r.status, code: r.body?.error?.code ?? r.body?.code ?? null })
  }
  record('four_distinct_correct_signins_within_10s', results)
}

async function deletion() {
  // Owner deletion request: sessions revoked, writes refused, no silent re-entry or re-registration.
  const c = new Client('delete')
  record('signup', (await c.signUp()).status)
  record('write_before', (await c.call('POST', 'finance/categories', { name: 'Before deletion', type: 'expense' })).status)
  const requestKey = randomUUID()
  const wrong = await c.call('POST', 'account/deletion/request', { consent: 'DELETE_MY_ACCOUNT', password: 'wrong-password-123', requestKey: randomUUID() })
  const requested = await c.call('POST', 'account/deletion/request', { consent: 'DELETE_MY_ACCOUNT', password: c.password, requestKey })
  record('request', { wrongPassword: wrong.status, accepted: requested.status, status: requested.body?.status })
  record('after_old_session', { finance: (await c.call('GET', 'finance?month=2026-10')).status })
  await new Promise(resolve => setTimeout(resolve, 11000))
  const again = await c.signIn()
  const session = await c.call('GET', 'auth/get-session')
  const write = await c.call('POST', 'finance/categories', { name: 'After deletion', type: 'expense' })
  record('sign_in_after_request', { signIn: again.status, sessionBody: session.body === null ? null : 'present', write: [write.status, write.body?.error?.code] })
  await new Promise(resolve => setTimeout(resolve, 11000))
  const reRegister = await new Client('delete').call('POST', 'auth/sign-up/email', { name: 'Again', email: c.email, password: c.password })
  record('re_register_same_email', { status: reRegister.status, code: reRegister.body?.code ?? reRegister.body?.error?.code })
  record('status_lookup', (await new Client('anon').call('POST', 'account/deletion/status', { requestKey })).body)
}

const probes = { writeBudget, authBudget, isolationAndIdempotency, sharedSigninBucket, deletion }
const name = process.argv[2]
await probes[name]()
fs.writeFileSync(path.join(evidence, `probe-${name}.json`), JSON.stringify({ at: new Date().toISOString(), ...out }, null, 2))
