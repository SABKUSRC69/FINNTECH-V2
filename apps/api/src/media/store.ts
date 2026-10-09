import { createHash } from 'node:crypto'
import {resourceIdSchema,idempotencyKeySchema} from '@finntech/contracts'
import type {Prisma,PrismaClient} from '../generated/prisma/client.js'
import {ownedMutation,TrackerError} from '../tracker/service.js'
import {MEDIA_LIMITS,normalizeImage} from './image.js'
import {realDatabaseFor} from '../auth/real.js'
type Tx=Prisma.TransactionClient
export type RecordKind='finance'|'crypto'|'stock'
export async function mediaLock(tx:Tx){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('tracker-media-budget',0))::text`}
export async function privateRecord(tx:Tx,owner:string,kind:RecordKind,id:string){
 const where={id,ownerId:owner}
 const row=kind==='finance'?await tx.financeTransaction.findFirst({where}):kind==='crypto'?await tx.cryptoTrade.findFirst({where}):await tx.stockTrade.findFirst({where})
 if(!row)throw new TrackerError('MEDIA_NOT_FOUND',404)
 return row
}
export async function linkReceipt(tx:Tx,owner:string,kind:RecordKind,id:string,mediaId?:string){
 if(!mediaId)return
 await mediaLock(tx)
 const media=await tx.mediaObject.findFirst({where:{id:mediaId,ownerId:owner,purpose:'RECEIPT'}})
 if(!media||!media.stagedExpiresAt||media.stagedExpiresAt<=new Date())throw new TrackerError('MEDIA_NOT_FOUND',404)
 await privateRecord(tx,owner,kind,id)
 await tx.mediaAttachment.create({data:{ownerId:owner,kind,recordId:id,mediaId}})
 await tx.mediaObject.update({where:{id:mediaId},data:{stagedExpiresAt:null}})
}
export async function copyReceipt(tx:Tx,owner:string,kind:RecordKind,source:string,target:string){
 const original=await tx.mediaAttachment.findUnique({where:{ownerId_kind_recordId:{ownerId:owner,kind,recordId:source}}})
 if(original){await privateRecord(tx,owner,kind,target);await tx.mediaAttachment.create({data:{ownerId:owner,kind,recordId:target,mediaId:original.mediaId}})}
}
async function discardUnreferenced(tx:Tx,owner:string,id:string){
 if(!await tx.mediaAttachment.count({where:{ownerId:owner,mediaId:id}})&&!await tx.ownerProfile.count({where:{ownerId:owner,mediaId:id}}))await tx.mediaObject.deleteMany({where:{id,ownerId:owner}})
}
export async function mediaQuota(db:PrismaClient|Tx,owner:string){
 const sum=await db.mediaObject.aggregate({where:{ownerId:owner},_sum:{byteSize:true}}),receipts=await db.mediaObject.count({where:{ownerId:owner,purpose:'RECEIPT'}})
 return {usedBytes:sum._sum.byteSize??0,maxBytes:MEDIA_LIMITS.owner,receiptCount:receipts,maxReceipts:MEDIA_LIMITS.receipts}
}
export async function stageImage(db:PrismaClient,owner:string,key:unknown,input:Buffer,mime:string,purpose:'AVATAR'|'RECEIPT'){
 idempotencyKeySchema.parse(key)
 const digest=createHash('sha256').update(input).digest('hex')
 // Expensive decode before holding database locks; immutable source hash binds retries.
 const normalized=await normalizeImage(input,mime,purpose)
 return ownedMutation(db,owner,'media.stage',key,{digest,mime,purpose},async tx=>{
  await mediaLock(tx)
  const expired=await tx.mediaObject.findMany({where:{ownerId:owner,stagedExpiresAt:{lt:new Date()}},take:20,select:{id:true}})
  for(const row of expired)await discardUnreferenced(tx,owner,row.id)
  const quota=await mediaQuota(tx,owner),global=await tx.mediaObject.aggregate({_sum:{byteSize:true}})
  if(quota.usedBytes+normalized.byteSize>MEDIA_LIMITS.owner||(purpose==='RECEIPT'&&quota.receiptCount>=MEDIA_LIMITS.receipts)||(global._sum.byteSize??0)+normalized.byteSize>MEDIA_LIMITS.global)throw new TrackerError('MEDIA_QUOTA',409)
  if(purpose==='AVATAR'&&await tx.mediaObject.count({where:{ownerId:owner,purpose,stagedExpiresAt:{not:null}}})>=1)throw new TrackerError('MEDIA_STAGED_AVATAR',409)
  const real=realDatabaseFor(db)
  if(real){const size=await tx.$queryRaw<{size:bigint}[]>`SELECT pg_database_size(current_database()) AS size`;if(Number(size[0]!.size)+normalized.byteSize*1.2+16384>real.databaseLimitBytes)throw new TrackerError('STORAGE_PAUSED',503)}
  const row=await tx.mediaObject.create({data:{ownerId:owner,purpose,...normalized,stagedExpiresAt:new Date(Date.now()+24*60*60*1000)}})
  return {id:row.id,byteSize:row.byteSize,width:row.width,height:row.height}
 })
}
export async function setAttachment(db:PrismaClient,owner:string,kind:RecordKind,id:string,key:unknown,body:{mediaId:string|null}){
 resourceIdSchema.parse(id);if(body.mediaId)resourceIdSchema.parse(body.mediaId)
 return ownedMutation(db,owner,'media.attachment',key,{kind,id,...body},async tx=>{
  await mediaLock(tx);await privateRecord(tx,owner,kind,id)
  const scope={ownerId:owner,kind,recordId:id},old=await tx.mediaAttachment.findUnique({where:{ownerId_kind_recordId:scope}})
  await tx.mediaAttachment.deleteMany({where:scope})
  await linkReceipt(tx,owner,kind,id,body.mediaId??undefined)
  if(old)await discardUnreferenced(tx,owner,old.mediaId)
  return {id,mediaId:body.mediaId}
 })
}
export async function setAvatar(db:PrismaClient,owner:string,key:unknown,body:{mediaId:string|null;preset:string|null;expectedVersion:number}){
 return ownedMutation(db,owner,'media.avatar',key,body,async tx=>{
  await mediaLock(tx)
  const old=await tx.ownerProfile.findUnique({where:{ownerId:owner}})
  if((old?.version??0)!==body.expectedVersion)throw new TrackerError('MEDIA_VERSION',409)
  if(body.mediaId){const media=await tx.mediaObject.findFirst({where:{id:body.mediaId,ownerId:owner,purpose:'AVATAR',stagedExpiresAt:{gt:new Date()}}});if(!media)throw new TrackerError('MEDIA_NOT_FOUND',404);await tx.mediaObject.update({where:{id:media.id},data:{stagedExpiresAt:null}})}
  const row=await tx.ownerProfile.upsert({where:{ownerId:owner},create:{ownerId:owner,mediaId:body.mediaId,preset:body.preset},update:{mediaId:body.mediaId,preset:body.preset,version:{increment:1}}})
  if(old?.mediaId&&old.mediaId!==body.mediaId)await discardUnreferenced(tx,owner,old.mediaId)
  return {id:owner,mediaId:row.mediaId,preset:row.preset,version:row.version}
 })
}
export async function discardStage(db:PrismaClient,owner:string,id:string,key:unknown){
 resourceIdSchema.parse(id)
 return ownedMutation(db,owner,'media.discard',key,{id},async tx=>{await mediaLock(tx);const row=await tx.mediaObject.findFirst({where:{id,ownerId:owner,stagedExpiresAt:{not:null}}});if(!row)throw new TrackerError('MEDIA_NOT_FOUND',404);await discardUnreferenced(tx,owner,id);return {id}})
}
