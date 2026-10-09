import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import type { AuthRuntime } from '../src/auth/runtime.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'

const app = createApp()
let staticRoot: string
let staticApp: ReturnType<typeof createApp>

beforeAll(async () => {
  staticRoot = await mkdtemp(path.join(os.tmpdir(), 'finntech-tracker-web-'))
  const assetsRoot = path.join(staticRoot, 'assets')
  await mkdir(assetsRoot)
  await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><html><body>tracker shell</body></html>')
  await writeFile(path.join(assetsRoot, 'app.js'), 'export const ready = true;')
  await writeFile(path.join(assetsRoot, 'app.css'), 'body { color: #123; }')
  staticApp = createApp({ webDistDir: staticRoot })
})

afterAll(async () => {
  if (staticRoot) await rm(staticRoot, { recursive: true, force: true })
})

describe('tracker API smoke checks', () => {
  it('reports process health without claiming database or auth readiness', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'ok',
      service: 'tracker-api',
      checks: {
        process: 'ok',
        database: 'not_configured',
        auth: 'not_configured',
      },
    })
  })

  it('returns JSON 404 for unknown API paths', async () => {
    const response = await request(app).get('/api/unknown-path')

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/json/)
    expect(response.text).not.toContain('<!doctype html>')
  })

  it('sets defensive headers on API responses and misses without adding a dev CSP', async () => {
    for (const route of ['/api/health', '/api/missing', '/missing']) {
      const response = await request(app).get(route)
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['x-frame-options']).toBe('DENY')
      expect(response.headers['referrer-policy']).toBe('no-referrer')
      expect(response.headers['x-powered-by']).toBeUndefined()
      expect(response.headers['content-security-policy']).toBeUndefined()
    }
  })

  it('restricts built pages, assets and errors to a self-contained CSP without unsafe script/style exceptions', async () => {
    for (const route of ['/', '/portfolio', '/assets/app.js', '/assets/app.css', '/assets/missing.js', '/api/missing']) {
      const response = await request(staticApp).get(route).set('Accept', 'text/html')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['x-frame-options']).toBe('DENY')
      expect(response.headers['referrer-policy']).toBe('no-referrer')
      const policy = response.headers['content-security-policy'] as string
      expect(policy).toContain("script-src 'self'")
      expect(policy).toContain("style-src 'self'")
      expect(policy).toContain("frame-ancestors 'none'")
      expect(policy).toContain("object-src 'none'")
      expect(policy).toContain("base-uri 'none'")
      expect(policy).toContain("form-action 'self'")
      expect(policy).toContain("connect-src 'self'")
      expect(policy).toContain('frame-src https://s.tradingview.com')
      expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|https:\s|wss:\s|\*/)
    }
  })

  it.each([
    ['http://127.0.0.1:4197', 'ws://127.0.0.1:4197'],
    ['https://tracker.example.invalid', 'wss://tracker.example.invalid'],
  ])('allows only the configured WebSocket origin %s, regardless of request Host/forwarded headers', async (origin, socketOrigin) => {
    const configuredApp = createApp({ webDistDir: staticRoot,
      auth: { options: { baseURL: origin } } as AuthRuntime, database: {} as PrismaClient })
    const response = await request(configuredApp).get('/').set('Host', 'attacker.invalid')
      .set('X-Forwarded-Host', 'attacker.invalid').set('X-Forwarded-Proto', 'https')
    expect(response.status).toBe(200)
    expect(response.headers['content-security-policy']).toContain(`connect-src 'self' ${socketOrigin}`)
    expect(response.headers['content-security-policy']).not.toContain('attacker.invalid')
  })

  it('serves real static files with their content types and falls back for navigation routes only', async () => {
    const index = await readFile(path.join(staticRoot, 'index.html'), 'utf8')
    const htmlResponse = await request(staticApp).get('/').set('Accept', 'text/html')
    const jsResponse = await request(staticApp).get('/assets/app.js')
    const cssResponse = await request(staticApp).get('/assets/app.css')
    const routeResponse = await request(staticApp).get('/portfolio').set('Accept', 'text/html')

    expect(htmlResponse.status).toBe(200)
    expect(htmlResponse.headers['content-type']).toMatch(/text\/html/)
    expect(jsResponse.status).toBe(200)
    expect(jsResponse.headers['content-type']).toMatch(/javascript/)
    expect(cssResponse.status).toBe(200)
    expect(cssResponse.headers['content-type']).toMatch(/text\/css/)
    expect(routeResponse.status).toBe(200)
    expect(routeResponse.text).toBe(index)
  })

  it('does not return the SPA shell for missing assets or unknown API routes', async () => {
    const missingAsset = await request(staticApp)
      .get('/assets/missing.js')
      .set('Accept', 'text/html')
    const missingFile = await request(staticApp)
      .get('/missing.js')
      .set('Accept', 'text/html')
    const unknownApi = await request(staticApp)
      .get('/api/missing')
      .set('Accept', 'text/html')

    for (const response of [missingAsset, missingFile]) {
      expect(response.status).toBe(404)
      expect(response.text).not.toContain('<!doctype html>')
    }
    expect(unknownApi.status).toBe(404)
    expect(unknownApi.headers['content-type']).toMatch(/json/)
    expect(unknownApi.text).not.toContain('<!doctype html>')
  })
})
