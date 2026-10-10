import express, { type Express, type Request, type Response } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { toNodeHandler } from 'better-auth/node'
import type { PrismaClient } from './generated/prisma/client.js'
import type { AuthRuntime } from './auth/runtime.js'
import { requireOwner, type OwnerContext } from './auth/authorization.js'
import { checkDatabaseConnection } from './persistence/database.js'
import { trackerRouter } from './tracker/routes.js'
import type { MarketRelay } from './tracker/market.js'
import type { StockMarketRelay } from './tracker/stocks.js'
import type { ReferenceFxRelay } from './tracker/fx.js'
import type { DailyUsdRelay } from './tracker/usd-fx.js'
import type { DailyCloseRelay } from './tracker/daily-close.js'
import type { PersonalDailyCloses } from './tracker/market-keys.js'
import type { RecoveryService } from './auth/recovery.js'
import { authSubjectAllowed } from './auth/authorization.js'
import { betaFor, createBetaAuthGuard } from './auth/beta.js'
import { demoFor, createDemoRequestGuard } from './auth/demo.js'
import { realFor, createRealAuthGuard, realStorageAvailable } from './auth/real.js'
import { deletionRouter } from './auth/deletion.js'
import { authConfigurationFor } from './auth/runtime.js'
import { passwordRegistration } from './auth/password-registration.js'
import { mediaRouter } from './media/routes.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

export interface ApiAppOptions {
  webDistDir?: string
  auth?: AuthRuntime
  database?: PrismaClient
  market?: MarketRelay
  stocks?: StockMarketRelay
  fx?: ReferenceFxRelay
  usdFx?: DailyUsdRelay
  dailyCloses?: DailyCloseRelay
  personalCloses?: PersonalDailyCloses
  recovery?: RecoveryService
}

function sendApiNotFound(_request: Request, response: Response): void {
  response.status(404).json({
    error: {
      code: 'API_NOT_FOUND',
      message: 'ไม่พบ API เส้นทางนี้',
    },
  })
}

export function createApp(options: ApiAppOptions = {}): Express {
  if (Boolean(options.auth) !== Boolean(options.database)) {
    throw new Error('Auth and its database must be configured together')
  }
  if (options.recovery && options.auth !== options.recovery.auth) throw new Error('Recovery app requires its matching scoped Auth runtime')
  const app = express()

  app.disable('x-powered-by')
  app.use((_request, response, next) => {
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    })
    if (options.auth && realFor(options.auth)?.boundary === 'real') response.set('Strict-Transport-Security', 'max-age=31536000')
    next()
  })
  if (options.webDistDir || options.recovery) {
    const socketOrigin = options.auth ? new URL(options.auth.options.baseURL) : undefined
    if (socketOrigin) socketOrigin.protocol = socketOrigin.protocol === 'https:' ? 'wss:' : 'ws:'
    // Use the configured public origin, never Host/forwarded headers, for the WS exception.
    const connectSources = socketOrigin ? `'self' ${socketOrigin.origin}` : "'self'"
    const policy = [
      "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
      "form-action 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:",
      "worker-src 'self'", "font-src 'self'", `connect-src ${connectSources}`, "frame-src https://s.tradingview.com",
    ].join('; ')
    app.use((_request, response, next) => { response.set('Content-Security-Policy', ['/ocr/runner.js','/ocr/worker.min.js'].includes(_request.path)?policy.replace("script-src 'self'","script-src 'self' 'wasm-unsafe-eval'"):policy); next() })
  }
  app.use('/account', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
  app.get('/api/auth-capabilities', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ recovery: !!options.recovery, verification: !!options.recovery })
  })
  if (options.auth && options.database) {
    const beta = betaFor(options.auth)
    const betaGuard = beta ? createBetaAuthGuard(beta, options.auth.options.secret!) : undefined
    const real = realFor(options.auth)
    const realGuard = real ? createRealAuthGuard(options.database, real, options.auth.options.baseURL!, options.auth.options.secret!) : undefined
    const demoGuard = createDemoRequestGuard()
    const configuration = authConfigurationFor(options.auth)
    const registerPassword = configuration?.real?.authenticationMode === 'email-password' ? passwordRegistration(options.database, configuration) : undefined
    const authHandler = toNodeHandler(async (request) => {
      try {
        const denied = await demoGuard(request) ?? await betaGuard?.(request) ?? await realGuard?.(request)
        if (denied) return denied
        let result = await registerPassword?.(request) ?? await options.recovery?.handle(request) ?? await options.auth!.handler(request)
        if (real && new URL(request.url).pathname === '/api/auth/sign-in/email' && result.ok) {
          // Only after Better Auth verified the password: a wrong password stays an ordinary 401, so
          // deletion state is never disclosed to someone who does not hold the credential.
          const signedIn = await result.clone().json() as { user?: { id?: string } } | null
          const userId = signedIn?.user?.id
          if (userId && (await options.database!.authRecoveryEnrollment.findUnique({ where: { userId }, select: { blocked: true } }))?.blocked) {
            await options.database!.authSession.deleteMany({ where: { userId } })
            return globalThis.Response.json({ error: { code: 'ACCOUNT_DELETION_PENDING' } }, { status: 403, headers: { 'cache-control': 'no-store' } })
          }
        }
        if (new URL(request.url).pathname === '/api/auth/get-session' && result.ok) {
          const snapshot = await result.clone().json() as { user?: { id?: string } } | null
          if (snapshot?.user?.id && !await authSubjectAllowed(options.auth!, options.database!, snapshot.user.id)) result = globalThis.Response.json(null)
        }
        if (result.status >= 500) return globalThis.Response.json({ error: { code: 'AUTH_UNAVAILABLE' } }, { status: 503 })
        if (result.headers.get('content-type')?.includes('application/json')) {
          const body = await result.json() as Record<string, unknown> | null
          if (body) {
            delete body.token
            if (body.session && typeof body.session === 'object') delete (body.session as Record<string, unknown>).token
            if (options.recovery && new URL(request.url).pathname === '/api/auth/sign-up/email' && result.ok) body.awaitingVerification = true
          }
          const headers = new Headers(result.headers)
          headers.delete('content-length')
          headers.set('cache-control', 'no-store')
          return globalThis.Response.json(body, { status: result.status, headers })
        }
        return result
      } catch {
        return globalThis.Response.json({ error: { code: 'AUTH_UNAVAILABLE' } }, { status: 503 })
      }
    })
    app.all('/api/auth/{*path}', (request, response) => {
      response.set('Cache-Control', 'no-store')
      const supported = new Set(['/sign-up/email', '/sign-in/email', '/sign-out', '/get-session', '/ok'])
      if (demoFor(options.auth!)) for (const route of ['/demo/prepare', '/demo/enter', '/demo/reset']) supported.add(route)
      if (options.recovery) for (const route of ['/request-password-reset', '/reset-password', '/confirm-email', '/begin-verification']) supported.add(route)
      if (!supported.has(request.path.slice('/api/auth'.length))) { sendApiNotFound(request, response); return }
      if (request.method !== 'GET' && request.headers.origin !== options.auth!.options.baseURL) {
        response.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN' } })
        return
      }
      return authHandler(request, response)
    })
    app.get('/api/me', requireOwner(options.auth, options.database), async (_request, response) => {
      const owner = response.locals.owner as OwnerContext
      response.set('Cache-Control', 'no-store')
      const workspace = await options.database!.demoWorkspace.findFirst({ where: { user: { identity: { ownerId: owner.ownerId } } }, select: { expiresAt: true } })
      response.json({ ownerId: owner.ownerId, ...(workspace ? { demo: true, demoExpiresAt: workspace.expiresAt.toISOString() } : {}) })
    })
  }
  if (options.auth && options.database) {
    app.use('/api/account/deletion', express.json({limit:'16kb'}), deletionRouter(options.auth,options.database))
    app.use('/api/media', mediaRouter(options.auth,options.database))
    app.use('/api', trackerRouter(options.auth, options.database, options.market, options.stocks, options.fx, options.usdFx, options.dailyCloses, options.personalCloses))
  }
  app.use(express.json({ limit: '64kb' }))

  app.get('/api/health', async (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'tracker-api',
      checks: {
        process: 'ok',
        database: options.database ? await checkDatabaseConnection(options.database) : 'not_configured',
        auth: options.auth ? 'not_checked' : 'not_configured',
      },
      ...(options.recovery ? { capabilities: { recovery: true, verification: true } } : {}),
      ...(options.auth && betaFor(options.auth) ? { beta: { dataMode: 'synthetic', access: betaFor(options.auth)!.access, recovery: false } } : {}),
      ...(options.auth && demoFor(options.auth)?.enabled ? { demo: { enabled: true } } : {}),
      ...(options.auth && realFor(options.auth) ? { real: { registrationsOpen: realFor(options.auth)!.registrationsOpen,
        authenticationMode: realFor(options.auth)!.authenticationMode ?? 'verified-email',
        stagingEnrollment: !!realFor(options.auth)!.stagingEmails,
        rehearsal: realFor(options.auth)!.boundary === 'real-rehearsal', supportEmail: realFor(options.auth)!.supportEmail } } : {}),
    })
  })
  let lastReadinessLog = 0
  app.get('/api/ready', async (_request, response) => {
    const started = Date.now()
    let ready = !!options.auth && !!options.database && await checkDatabaseConnection(options.database) === 'ok'
    const databaseReady = ready
    if (ready && options.auth && options.database && realFor(options.auth)) {
      try { ready = await realStorageAvailable(options.database, realFor(options.auth)!) } catch { ready = false }
    }
    if (options.auth && realFor(options.auth)?.boundary === 'real' && Date.now() - lastReadinessLog >= 60000) {
      lastReadinessLog = Date.now()
      // Coarse deployment diagnostics only: never log requests, identities or driver errors.
      console.info(`Readiness: database=${databaseReady ? 'ok' : 'unavailable'} storage=${ready ? 'ok' : 'unavailable'} elapsedMs=${Date.now() - started}`)
    }
    response.set('Cache-Control', 'no-store').status(ready ? 200 : 503).json({ ready })
  })

  // Keep API misses JSON even when production serves the web shell below.
  app.use('/api', (error: unknown, _request: Request, response: Response, _next: import('express').NextFunction) => {
    const status = error !== null && typeof error === 'object' && 'status' in error && error.status === 413 ? 413 : 400
    response.status(status).json({ error: { code: status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST' } })
  })
  app.use('/api', sendApiNotFound)

  const webDistDir = options.webDistDir
    ? path.resolve(currentDirectory, options.webDistDir)
    : undefined

  if (webDistDir) {
    const indexPath = path.join(webDistDir, 'index.html')
    app.use(express.static(webDistDir, { index: false }))
    app.use((request, response, next) => {
      const isAssetPath = request.path === '/assets' || request.path.startsWith('/assets/')
      const hasFileExtension = path.extname(request.path) !== ''

      if (request.method === 'GET' && !isAssetPath && !hasFileExtension && request.accepts('html')) {
        response.sendFile(indexPath, (error) => {
          if (error) next(error)
        })
        return
      }
      next()
    })
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'ไม่พบเส้นทางนี้',
      },
    })
  })

  return app
}
