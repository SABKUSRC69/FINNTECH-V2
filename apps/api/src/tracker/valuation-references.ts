import { valuationReferenceInputSchema } from '@finntech/contracts'
import type { PrismaClient } from '../generated/prisma/client.js'
import { cryptoForApi } from '../persistence/decimal.js'
import { ownedMutation, TrackerError } from './service.js'
export async function valuationReferences(db: PrismaClient, ownerId: string) {
  const rows = await db.valuationReference.findMany({where:{ownerId},orderBy:{symbol:'asc'}})
  return rows.map(({ownerId:_owner,...r})=>({...r,value:cryptoForApi(r.value),asOf:r.asOf.toISOString(),updatedAt:r.updatedAt.toISOString()}))
}
export async function saveValuationReference(db: PrismaClient, ownerId: string, key: unknown, body: unknown) {
  const input=valuationReferenceInputSchema.parse(body)
  return ownedMutation(db,ownerId,'valuation.reference',key,input,async tx=>{
    if(Date.parse(input.asOf)>Date.now())throw new TrackerError('REFERENCE_IN_FUTURE',422)
    const old=await tx.valuationReference.findUnique({where:{ownerId_symbol:{ownerId,symbol:input.symbol}}})
    if((old?.version??null)!==input.expectedVersion)throw new TrackerError('REFERENCE_CHANGED',409)
    const {expectedVersion:_version,...fields}=input
    const data={...fields,source:'MANUAL',asOf:new Date(input.asOf),updatedAt:new Date()}
    const row=old?await tx.valuationReference.update({where:{id:old.id},data:{...data,version:{increment:1}}}):await tx.valuationReference.create({data:{ownerId,...data}})
    return {id:row.id}
  })
}
