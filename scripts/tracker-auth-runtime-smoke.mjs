import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireAuthTestDatabase } from './tracker-auth-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = requireAuthTestDatabase(process.env)
const origin = 'http://127.0.0.1:4194'
const secret = randomBytes(32).toString('hex')
let child

function requireFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', () => reject(new Error('Smoke port 4194 is occupied; no process will be killed')))
    probe.listen(4194, '127.0.0.1', () => probe.close(resolve))
  })
}

try {
  await requireFreePort()
  child = spawn(process.execPath, ['--no-strip-types', 'dist/server.js'], {
    cwd: path.join(root, 'apps/api'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: target.href, BETTER_AUTH_SECRET: secret,
      TRACKER_ORIGIN: origin, TRACKER_API_PORT: '4194', TRACKER_HOST: '127.0.0.1', WEB_DIST_DIR: '../web/dist' },
  })
  // Do not echo child output: session/driver diagnostics may contain sensitive values.
  child.stdout.resume()
  child.stderr.resume()
  const deadline = Date.now() + 15_000
  let ready = false
  while (Date.now() < deadline && child.exitCode === null) {
    try { ready = (await fetch(`${origin}/api/health`)).ok; if (ready) break } catch { /* process is starting */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'compiled server must start with Node type stripping disabled')
  const health = await (await fetch(`${origin}/api/health`)).json()
  assert.equal(health.checks.database, 'ok')
  assert.equal(health.checks.auth, 'not_checked')
  const html = await fetch(origin)
  assert.equal(html.status, 200)
  assert.ok(html.headers.get('content-type')?.includes('text/html'))
  const document = await html.text()
  for (const asset of [...document.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1])) {
    const response = await fetch(`${origin}${asset}`)
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('content-type')?.includes(asset.endsWith('.js') ? 'javascript' : 'text/css'))
    assert.ok(!(await response.text()).includes(secret), 'server secret must not appear in frontend asset')
  }
  assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404)
  const apiMiss = await fetch(`${origin}/api/not-found`)
  assert.equal(apiMiss.status, 404)
  assert.ok(apiMiss.headers.get('content-type')?.includes('json'))
  const signUp = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Synthetic compiled smoke', email: `${randomUUID()}@example.invalid`, password: randomBytes(32).toString('hex') }),
  })
  assert.equal(signUp.status, 200, 'compiled Auth handler must register a synthetic account')
  const cookies = signUp.headers.getSetCookie()
  const session = cookies.find(cookie => cookie.startsWith('finntech.session_token='))
  assert.ok(Boolean(session) && /HttpOnly/i.test(session) && /SameSite=Lax/i.test(session), 'cookie values withheld')
  const body = await signUp.json()
  assert.ok(!('token' in body), 'raw session token must not appear in JSON')
  const cookie = session.split(';')[0]
  assert.equal((await fetch(`${origin}/api/me`, { headers: { cookie } })).status, 200)
  assert.equal((await fetch(`${origin}/api/auth/sign-out`, { method: 'POST', headers: { origin, cookie } })).status, 200)
  assert.equal((await fetch(`${origin}/api/me`, { headers: { cookie } })).status, 401)
  console.log(`PASS: compiled Auth, database cookie/logout, same-origin HTTP and assets at ${origin}; ${new Date().toISOString()}`)
} catch (error) {
  console.error(error instanceof assert.AssertionError ? `FAIL: ${error.message}` : 'FAIL: compiled Auth smoke; runtime details withheld')
  process.exitCode = 1
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 5_000).unref() })
  }
  await requireFreePort()
  console.log('PASS: owned smoke process stopped; port 4194 released')
}
