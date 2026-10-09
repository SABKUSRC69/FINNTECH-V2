import { createHmac, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { AuthRuntime } from './runtime.js'
import { authSubjectAllowed } from './authorization.js'
import { realFor, consumeRealBudget } from './real.js'

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
export function deletionRouter(auth: AuthRuntime, db: PrismaClient): Router {
  const router = Router()
  router.use((req,res,next) => {
    res.set('Cache-Control','no-store')
    if (!realFor(auth)) { res.status(404).json({error:{code:'DELETION_REJECTED'}}); return }
    if (req.method !== 'POST' || req.headers.origin !== auth.options.baseURL) { res.status(403).json({error:{code:'UNTRUSTED_ORIGIN'}}); return }
    next()
  })
  const requestHash = (key: string) => createHmac('sha256',auth.options.secret!).update(`delete:${key}`).digest('hex')
  router.post('/status', async (req,res) => {
    try {
      if (typeof req.body?.requestKey !== 'string' || !uuid.test(req.body.requestKey) || Object.keys(req.body).length !== 1) { res.status(400).json({error:{code:'DELETION_REJECTED'}}); return }
      if (!await db.$transaction(tx=>consumeRealBudget(tx,'deletion:status',60,60))) { res.status(429).json({error:{code:'DELETION_REJECTED'}}); return }
      const row=await db.accountDeletionCase.findUnique({where:{requestHash:requestHash(req.body.requestKey)}})
      // The original random request key is a receipt capability, never a login/purge credential.
      res.json(row ? {status:row.status,caseId:row.id,requestedAt:row.requestedAt.toISOString()} : {status:'NOT_FOUND'})
    } catch { res.status(503).json({error:{code:'DELETION_STATUS_UNKNOWN'}}) }
  })
  router.post('/request', async (req,res) => {
    try {
      const body=req.body
      if (!body || Object.keys(body).sort().join(',')!=='consent,password,requestKey' || body.consent!=='DELETE_MY_ACCOUNT'
        || typeof body.password!=='string' || body.password.length<12 || body.password.length>128
        || typeof body.requestKey!=='string' || !uuid.test(body.requestKey)) { res.status(400).json({error:{code:'DELETION_REJECTED'}}); return }
      if (!await db.$transaction(tx=>consumeRealBudget(tx,'deletion:requests',10,60))) { res.status(429).json({error:{code:'DELETION_REJECTED'}}); return }
      const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)})
      if (!session || !await authSubjectAllowed(auth,db,session.user.id)) { res.status(401).json({error:{code:'DELETION_REJECTED'}}); return }
      const context=await auth.$context
      const result=await db.$transaction(async tx=>{
        await tx.$executeRaw`SET LOCAL lock_timeout='3000ms'`
        await tx.$queryRaw`SELECT id FROM auth_users WHERE id=${session.user.id}::uuid FOR UPDATE`
        const identity=await tx.authIdentity.findUnique({where:{authUserId:session.user.id}})
        const account=await tx.authAccount.findFirst({where:{userId:session.user.id,providerId:'credential'}})
        const enrollment=await tx.authRecoveryEnrollment.findUnique({where:{userId:session.user.id}})
        const currentSession=await tx.authSession.findUnique({where:{id:session.session.id}})
        if (!identity || !enrollment || enrollment.blocked || !currentSession || currentSession.expiresAt<=new Date()
          || !account?.password || !await context.password.verify({password:body.password,hash:account.password})) throw new Error('REAUTH_REQUIRED')
        // Wait for writes already holding the shared dataset lock; later writes observe blocked enrollment.
        const dataset=`tracker-dataset:${identity.ownerId}`
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dataset},0))::text`
        const row=await tx.accountDeletionCase.create({data:{id:randomUUID(),userId:session.user.id,ownerId:identity.ownerId,requestHash:requestHash(body.requestKey)}})
        await tx.authRecoveryEnrollment.update({where:{userId:session.user.id},data:{blocked:true}})
        await tx.authSession.deleteMany({where:{userId:session.user.id}})
        await tx.authVerification.deleteMany({where:{value:session.user.id}})
        await tx.authDeliveryJob.updateMany({where:{userId:session.user.id},data:{status:'EXPIRED',envelope:'',reason:'OWNER_DELETION_REQUESTED'}})
        return {status:row.status,caseId:row.id,requestedAt:row.requestedAt.toISOString()}
      },{timeout:15000})
      res.json(result)
    } catch (error) { res.status(error instanceof Error && error.message==='REAUTH_REQUIRED'?401:503).json({error:{code:'DELETION_UNCONFIRMED'}}) }
  })
  return router
}
