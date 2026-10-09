import type { PrismaClient } from '../generated/prisma/client.js'
import type { AuthConfiguration } from './config.js'
import { createAuthRuntime } from './runtime.js'
import { assertRealBoundary, boundedAuthBody, realSignupAllowed, realStorageAvailable } from './real.js'

class RegistrationRejected extends Error {
  constructor(readonly response: Response) { super('registration_rejected') }
}

/** The existing Better Auth adapter creates user, password hash, lifecycle and session atomically. */
export function passwordRegistration(database: PrismaClient, config: AuthConfiguration) {
  return async (request: Request): Promise<Response | undefined> => {
    const real = config.real
    if (real?.authenticationMode !== 'email-password' || new URL(request.url).pathname !== '/api/auth/sign-up/email') return undefined
    if (request.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405 })
    if (request.headers.get('origin') !== config.origin) return Response.json({ error: { code: 'UNTRUSTED_ORIGIN' } }, { status: 403 })
    const body = await boundedAuthBody(request)
    if (!body || Object.keys(body).some(key => !['name', 'email', 'password'].includes(key))
      || typeof body.email !== 'string' || body.email.length > 254
      || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(body.email)) return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 })
    if (!realSignupAllowed(real, body.email)) return Response.json({ error: { code: 'REGISTRATION_CLOSED' } }, { status: 403 })
    try {
      await assertRealBoundary(database, real, config.origin)
      return await database.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(734032)`
        if (await tx.authUser.count() >= real.accountLimit || !await realStorageAvailable(tx, real)) {
          throw new RegistrationRejected(Response.json({ error: { code: 'REGISTRATION_PAUSED' } }, { status: 403 }))
        }
        const runtime = createAuthRuntime(tx as PrismaClient, config, undefined, false)
        const result = await runtime.handler(new Request(request.url, { method: 'POST', headers: request.headers,
          body: JSON.stringify({ ...body, email: body.email!.toString().toLowerCase() }) }))
        if (!result.ok) throw new RegistrationRejected(result)
        return result
      }, { maxWait: 3000, timeout: 15000 })
    } catch (error) {
      return error instanceof RegistrationRejected ? error.response : Response.json({ error: { code: 'AUTH_UNAVAILABLE' } }, { status: 503 })
    }
  }
}
