import {Router,json,raw} from 'express'
import type {PrismaClient} from '../generated/prisma/client.js'
import type {AuthRuntime} from '../auth/runtime.js'
import {requireOwner,type OwnerContext} from '../auth/authorization.js'
import {demoFor} from '../auth/demo.js'
import {consumeRealBudget} from '../auth/real.js'
import {resourceIdSchema,mediaReferenceSchema as reference,avatarWriteSchema as avatar,mediaDiscardSchema} from '@finntech/contracts'
import {TrackerError} from '../tracker/service.js'
import {ImageError,MEDIA_LIMITS} from './image.js'
import {mediaQuota,stageImage,setAvatar,setAttachment,discardStage,privateRecord,type RecordKind} from './store.js'
const kinds=new Set(['finance','crypto','stock'])
export function mediaRouter(auth:AuthRuntime,db:PrismaClient){
 const router=Router()
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');if(demoFor(auth)){res.status(404).json({error:{code:'MEDIA_DISABLED'}});return}next()})
 router.use(requireOwner(auth,db))
 router.use((req,res,next)=>{if(req.method!=='GET'&&req.headers.origin!==auth.options.baseURL){res.status(403).json({error:{code:'UNTRUSTED_ORIGIN'}});return}next()})
 const owner=(res:import('express').Response)=>(res.locals.owner as OwnerContext).ownerId
 router.get('/staged',async(_req,res)=>res.json({images:await db.mediaObject.findMany({where:{ownerId:owner(res),stagedExpiresAt:{not:null}},select:{id:true,purpose:true,byteSize:true,stagedExpiresAt:true},take:12,orderBy:{createdAt:'desc'}})}))
 router.get('/profile',async(_req,res)=>{const id=owner(res),profile=await db.ownerProfile.findUnique({where:{ownerId:id}});res.json({mediaId:profile?.mediaId??null,preset:profile?.preset??null,version:profile?.version??0,quota:await mediaQuota(db,id)})})
 router.get('/objects/:id',async(req,res)=>{
  const id=resourceIdSchema.parse(req.params.id),row=await db.mediaObject.findFirst({where:{id,ownerId:owner(res)}})
  if(!row||(row.stagedExpiresAt&&row.stagedExpiresAt<=new Date()))throw new TrackerError('MEDIA_NOT_FOUND',404)
  res.set({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Content-Disposition':`${req.query.download==='1'?'attachment':'inline'}; filename="finntech-image.jpg"`}).send(Buffer.from(row.bytes))
 })
 router.post('/stage/:purpose',raw({type:['image/jpeg','image/png','image/webp'],limit:MEDIA_LIMITS.input}),async(req,res)=>{
  if(!['avatar','receipt'].includes(String(req.params.purpose))||!Buffer.isBuffer(req.body))throw new ImageError('MEDIA_FORMAT')
  if(!await db.$transaction(tx=>consumeRealBudget(tx,`media-upload:${owner(res)}`,8,60)))throw new TrackerError('MEDIA_BUSY',429)
  res.json(await stageImage(db,owner(res),req.headers['idempotency-key'],req.body,req.headers['content-type']??'',req.params.purpose==='avatar'?'AVATAR':'RECEIPT'))
 })
 router.use(json({limit:'4kb'}))
 router.post('/avatar',async(req,res)=>res.json(await setAvatar(db,owner(res),req.headers['idempotency-key'],avatar.parse(req.body))))
 router.post('/objects/:id/discard',async(req,res)=>{mediaDiscardSchema.parse(req.body);res.json(await discardStage(db,owner(res),String(req.params.id),req.headers['idempotency-key']))})
 router.get('/attachments/:kind/:id',async(req,res)=>{
  const kind=String(req.params.kind);if(!kinds.has(kind))throw new TrackerError('MEDIA_NOT_FOUND',404)
  const id=resourceIdSchema.parse(req.params.id),own=owner(res)
  await privateRecord(db,own,kind as RecordKind,id)
  const row=await db.mediaAttachment.findUnique({where:{ownerId_kind_recordId:{ownerId:own,kind,recordId:id}}})
  res.json({mediaId:row?.mediaId??null})
 })
 router.post('/attachments/:kind/:id',async(req,res)=>{const kind=String(req.params.kind);if(!kinds.has(kind))throw new TrackerError('MEDIA_NOT_FOUND',404);res.json(await setAttachment(db,owner(res),kind as RecordKind,String(req.params.id),req.headers['idempotency-key'],reference.parse(req.body)))})
 router.use((error:unknown,_req:import('express').Request,res:import('express').Response,_next:import('express').NextFunction)=>{
  if(error instanceof TrackerError||error instanceof ImageError){res.status(error.status).json({error:{code:error.code}});return}
  if(error instanceof Error&&error.name==='ZodError'){res.status(422).json({error:{code:'INVALID_INPUT'}});return}
  if(error&&typeof error==='object'&&'status'in error&&error.status===413){res.status(413).json({error:{code:'MEDIA_SIZE'}});return}
  res.status(503).json({error:{code:'STORAGE_UNAVAILABLE'}})
 })
 return router
}
