import { fromNodeHeaders } from 'better-auth/node'
import type { RequestHandler } from 'express'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import type { AuthRuntime } from './runtime.js'
import { betaFor, betaEmailAllowed } from './beta.js'
import { demoSubjectAllowed } from './demo.js'
import { realFor, realEmailAllowed } from './real.js'

export interface OwnerContext { ownerId: string }

export async function authSubjectAllowed(auth: AuthRuntime, database: PrismaClient, authUserId: string): Promise<boolean> {
  if (!await demoSubjectAllowed(auth, database, authUserId)) return false
  const beta = betaFor(auth)
  if (beta?.access === 'invited' && !await database.demoWorkspace.findUnique({ where: { userId: authUserId } })) {
    const user = await database.authUser.findUnique({ where: { id: authUserId }, select: { email: true } })
    if (!user || !betaEmailAllowed(beta, user.email)) return false
  }
  const real = realFor(auth)
  if (!real && !auth.options.emailAndPassword?.requireEmailVerification) return true
  const user = await database.authUser.findUnique({ where: { id: authUserId }, include: { recovery: true } })
  return !!user && (real?.authenticationMode === 'email-password' || user.emailVerified)
    && !!user.recovery && !user.recovery.blocked && (!real || realEmailAllowed(real, user.email))
}

async function resolveOwner(database: PrismaClient, authUserId: string): Promise<OwnerContext> {
  const find = () => database.authIdentity.findUnique({
    where: { authUserId }, include: { owner: true },
  })
  let identity = await find()
  if (!identity) {
    try {
      identity = await database.$transaction(async (transaction) => {
        const owner = await transaction.trackerUser.create({ data: { identityState: 'VERIFIED' } })
        return transaction.authIdentity.create({
          data: { ownerId: owner.id, provider: 'better-auth', subject: authUserId, authUserId, verifiedAt: new Date() },
          include: { owner: true },
        })
      })
    } catch (error) {
      // Concurrent first requests race on the unique Auth user mapping; loser rolls back.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      identity = await find()
    }
  }
  if (!identity || identity.provider !== 'better-auth' || identity.subject !== authUserId
    || !identity.verifiedAt || identity.owner.identityState !== 'VERIFIED') {
    throw new Error('invalid_auth_owner_mapping')
  }
  return { ownerId: identity.ownerId }
}

export function requireOwner(auth: AuthRuntime, database: PrismaClient): RequestHandler {
  return async (request, response, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
      if (!session) {
        response.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบ' } })
        return
      }
      if (!await authSubjectAllowed(auth, database, session.user.id)) {
        response.status(403).json({ error: { code: 'ACCOUNT_NOT_READY', message: 'บัญชียังไม่พร้อมใช้งาน' } })
        return
      }
      response.locals.owner = await resolveOwner(database, session.user.id)
      next()
    } catch {
      response.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'ระบบยืนยันตัวตนยังไม่พร้อม กรุณาลองใหม่' } })
    }
  }
}
