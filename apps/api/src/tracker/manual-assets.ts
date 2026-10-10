import { manualAssetInputSchema,manualAssetUpdateSchema,manualAssetStatusSchema,resourceIdSchema } from '@finntech/contracts'
import type { PrismaClient } from '../generated/prisma/client.js'
import { cryptoForApi } from '../persistence/decimal.js'
import { ownedMutation,TrackerError } from './service.js'
export async function manualAssets(db:PrismaClient,ownerId:string){
 const assets=await db.manualAsset.findMany({where:{ownerId},orderBy:{name:'asc'}})
 return {assets:assets.map(({ownerId:_owner,...row})=>({...row,quantity:row.quantity===null?null:cryptoForApi(row.quantity),cost:row.cost===null?null:cryptoForApi(row.cost),value:cryptoForApi(row.value)}))}
}
export async function createManualAsset(db:PrismaClient,ownerId:string,key:unknown,body:unknown){
 const value=manualAssetInputSchema.parse(body)
 return ownedMutation(db,ownerId,'assets.manual.create',key,value,async tx=>({id:(await tx.manualAsset.create({data:{ownerId,...value}})).id}))
}
export async function updateManualAsset(db:PrismaClient,ownerId:string,id:unknown,key:unknown,body:unknown){
 const assetId=resourceIdSchema.parse(id),value=manualAssetUpdateSchema.parse(body)
 return ownedMutation(db,ownerId,'assets.manual.update',key,{assetId,...value},async tx=>{
  const result=await tx.manualAsset.updateMany({where:{ownerId,id:assetId,version:value.expectedVersion,archived:false},data:{...value.asset,version:{increment:1}}})
  if(result.count!==1)throw new TrackerError('ASSET_CHANGED_OR_NOT_FOUND',409)
  return {id:assetId}
 })
}
export async function setManualAssetStatus(db:PrismaClient,ownerId:string,id:unknown,key:unknown,body:unknown){
 const assetId=resourceIdSchema.parse(id),value=manualAssetStatusSchema.parse(body)
 return ownedMutation(db,ownerId,'assets.manual.status',key,{assetId,...value},async tx=>{
  const result=await tx.manualAsset.updateMany({where:{ownerId,id:assetId,version:value.expectedVersion,archived:!value.archived},data:{archived:value.archived,version:{increment:1}}})
  if(result.count!==1)throw new TrackerError('ASSET_CHANGED_OR_NOT_FOUND',409)
  return {id:assetId,archived:value.archived}
 })
}
