import { parseThbDecimal, serializeThb } from '@finntech/finance'
import type { Prisma } from '../generated/prisma/client.js'
import { thbForApi } from '../persistence/decimal.js'
import { TrackerError } from './service.js'

type Settlement = { accountId: string; amountThb?: string | undefined }
type Change = { accountId: string; amount: string }
export function requireCash(id: string | null | undefined): string {
 if (!id) throw new TrackerError('CASH_ACCOUNT_REQUIRED', 422)
 return id
}
export function settlementData(value: Settlement | null | undefined, legacy = false) {
 if (legacy) {
  if (value) throw new TrackerError('LEGACY_CASH_LINK', 422)
  return { cashAccountId: null, cashAmountThb: null }
 }
 requireCash(value?.accountId)
 if (!value!.amountThb) throw new TrackerError('CASH_AMOUNT_REQUIRED', 422)
 return { cashAccountId: value!.accountId, cashAmountThb: value!.amountThb }
}
export function settlementView(row: {cashAccountId:string|null;cashAmountThb:Prisma.Decimal|null}) {
 return row.cashAccountId && row.cashAmountThb ? {accountId:row.cashAccountId,amountThb:thbForApi(row.cashAmountThb)} : null
}
export function cashChange(accountId:string|null,amount:string,incoming:boolean,reverse=false):Change[] {
 return accountId ? [{accountId,amount:serializeThb(parseThbDecimal(amount).times(incoming!==reverse?'1':'-1'))}] : []
}
/**
 * The account balance was entered as of its opening date (asOf), so a record dated before it is
 * usually already inside that balance. The owner must choose explicitly; a later record always
 * settles. Returns true when the record is kept as history without moving money.
 */
export async function openingBalanceChoice(tx:Prisma.TransactionClient,owner:string,accountId:string,date:string,choice:boolean|undefined):Promise<boolean> {
 const row=await tx.cashAccount.findFirst({where:{id:accountId,ownerId:owner},select:{asOf:true}})
 if(!row)throw new TrackerError('CASH_ACCOUNT_NOT_FOUND',404)
 if(date<row.asOf){if(choice===undefined)throw new TrackerError('CASH_OPENING_CHOICE_REQUIRED',422);return choice}
 if(choice)throw new TrackerError('CASH_OPENING_DATE',422)
 return false
}
/** Same transaction as the source record and holdings. Aggregate corrections before checking funds. */
export async function applyCashChanges(tx:Prisma.TransactionClient,owner:string,changes:Change[]) {
 const totals=new Map<string,ReturnType<typeof parseThbDecimal>>()
 for(const change of changes)totals.set(change.accountId,(totals.get(change.accountId)??parseThbDecimal('0')).plus(change.amount))
 // Stable account order prevents cycles when a correction moves between two cash accounts.
 for(const id of [...totals.keys()].sort()) {
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM cash_accounts WHERE owner_id=${owner}::uuid AND id=${id}::uuid FOR UPDATE`
  if(rows.length!==1)throw new TrackerError('CASH_ACCOUNT_NOT_FOUND',404)
  const row=await tx.cashAccount.findUniqueOrThrow({where:{id}})
  if(row.currency!=='THB')throw new TrackerError('CASH_ACCOUNT_NOT_FOUND',422)
  const balance=parseThbDecimal(thbForApi(row.balance)).plus(totals.get(id)!)
  if(balance.lt('0'))throw new TrackerError('CASH_INSUFFICIENT',422)
  const normalized=serializeThb(balance)
  parseThbDecimal(normalized) // Enforce DECIMAL(20,2) bounds before writing.
  // asOf stays the opening date the owner entered; it is what openingBalanceChoice compares against.
  await tx.cashAccount.update({where:{id},data:{balance:normalized,version:{increment:1}}})
 }
}
