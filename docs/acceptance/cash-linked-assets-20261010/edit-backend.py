from pathlib import Path
base=Path(r'C:\Users\Admin\Downloads\FINNTECH\.student-real-20261008.local\release-source')
def read(p): return (base/p).read_text(encoding='utf-8')
def write(p,s): (base/p).parent.mkdir(parents=True,exist_ok=True); (base/p).write_text(s,encoding='utf-8',newline='\n')
def sub(s,a,b,n=1):
 assert s.count(a)==n,(a[:90],s.count(a),n)
 return s.replace(a,b)
p='packages/contracts/src/index.ts';s=read(p)
s=sub(s,'export const financeEntrySchema =',"export const cashSettlementSchema = z.object({ accountId: z.string().uuid(), amountThb: positiveThbAmount }).strict()\nexport const financeEntrySchema =")
s=sub(s,'attachmentId: z.string().uuid().optional(), categoryId:', 'cashAccountId: z.string().uuid().nullable().optional(), attachmentId: z.string().uuid().optional(), categoryId:')
s=sub(s,'attachmentId: z.string().uuid().optional(), portfolioId:', 'cashSettlement: cashSettlementSchema.nullable().optional(), attachmentId: z.string().uuid().optional(), portfolioId:')
s=sub(s,'note: z.string(), categoryId: resourceIdSchema,','note: z.string(), cashAccountId: resourceIdSchema.nullable().optional(), categoryId: resourceIdSchema,')
s=sub(s,"trades: z.array(z.object({ id: resourceIdSchema, portfolioId: resourceIdSchema, asset:","trades: z.array(z.object({ cashSettlement: cashSettlementSchema.nullable().optional(), id: resourceIdSchema, portfolioId: resourceIdSchema, asset:")
# All backup revisions reject dangling links, including V1 which has no cash accounts.
s=sub(s,'const backupV1Schema = backupFields.superRefine(refineBackup)', '''const refineCashLinks=(v:{transactions:{cashAccountId?:string|null}[];trades:{cashSettlement?:z.infer<typeof cashSettlementSchema>|null}[];cashAccounts?:{id:string}[];stockTrades?:{cashSettlement?:z.infer<typeof cashSettlementSchema>|null}[]},c:z.RefinementCtx)=>{
 const ids=new Set((v.cashAccounts??[]).map(row=>row.id))
 for(const row of v.transactions)if(row.cashAccountId&&!ids.has(row.cashAccountId))c.addIssue({code:'custom',message:'Invalid cash account reference'})
 for(const row of [...v.trades,...(v.stockTrades??[])])if(row.cashSettlement&&!ids.has(row.cashSettlement.accountId))c.addIssue({code:'custom',message:'Invalid settlement account reference'})
}
const backupV1Schema = backupFields.superRefine(refineBackup).superRefine(refineCashLinks)''')
s=sub(s,"}).superRefine(refineBackup).superRefine((value, context) => {","}).superRefine(refineBackup).superRefine(refineCashLinks).superRefine((value, context) => {")
s=sub(s,'.superRefine(refineAssetBackup)', '.superRefine(refineAssetBackup).superRefine(refineCashLinks)',2)
write(p,s)
p='apps/api/prisma/schema.prisma';s=read(p)
s=sub(s,'  @@unique([ownerId, name])\n  @@map("cash_accounts")','''  financeEntries FinanceTransaction[]
  cryptoTrades CryptoTrade[]
  stockTrades StockTrade[]
  @@unique([ownerId, id])
  @@unique([ownerId, name])
  @@map("cash_accounts")''')
for name in ['FinanceTransaction','CryptoTrade','StockTrade']:
 start=s.index('model '+name+' {');end=s.index('\n}',start)
 block=s[start:end]
 block=block.replace('  ownerId String @map("owner_id") @db.Uuid','''  ownerId String @map("owner_id") @db.Uuid
  cashAccountId String? @map("cash_account_id") @db.Uuid
  cashAccount CashAccount? @relation(fields: [ownerId, cashAccountId], references: [ownerId, id], onDelete: Restrict, onUpdate: Restrict)''')
 if name!='FinanceTransaction':block=block.replace('  cashAccountId String?', '  cashAmountThb Decimal? @map("cash_amount_thb") @db.Decimal(20, 2)\n  cashAccountId String?')
 s=s[:start]+block+s[end:]
write(p,s)
sql='CREATE UNIQUE INDEX cash_accounts_owner_id_id_key ON cash_accounts(owner_id, id);\n'
for table in ['finance_transactions','crypto_trades','stock_trades']:
 sql+=f'ALTER TABLE {table} ADD COLUMN cash_account_id UUID;\n'
 if table!='finance_transactions':sql+=f'''ALTER TABLE {table} ADD COLUMN cash_amount_thb DECIMAL(20,2);
ALTER TABLE {table} ADD CONSTRAINT {table}_cash_settlement_check CHECK ((cash_account_id IS NULL AND cash_amount_thb IS NULL) OR (cash_account_id IS NOT NULL AND cash_amount_thb IS NOT NULL AND cash_amount_thb > 0));
'''
 sql+=f'ALTER TABLE {table} ADD CONSTRAINT {table}_owner_id_cash_account_id_fkey FOREIGN KEY(owner_id,cash_account_id) REFERENCES cash_accounts(owner_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;\n'
write('apps/api/prisma/migrations/20261010040000_link_cash_settlements/migration.sql',sql)
write('apps/api/src/tracker/cash-links.ts','''import { parseThbDecimal, serializeThb } from '@finntech/finance'
import type { Prisma } from '../generated/prisma/client.js'
import { thbForApi } from '../persistence/decimal.js'
import { TrackerError, thaiDay } from './service.js'

type Settlement = { accountId: string; amountThb: string }
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
 return { cashAccountId: value!.accountId, cashAmountThb: value!.amountThb }
}
export function settlementView(row: {cashAccountId:string|null;cashAmountThb:Prisma.Decimal|null}) {
 return row.cashAccountId && row.cashAmountThb ? {accountId:row.cashAccountId,amountThb:thbForApi(row.cashAmountThb)} : null
}
export function cashChange(accountId:string|null,amount:string,incoming:boolean,reverse=false):Change[] {
 return accountId ? [{accountId,amount:serializeThb(parseThbDecimal(amount).times(incoming!==reverse?'1':'-1'))}] : []
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
  await tx.cashAccount.update({where:{id},data:{balance:normalized,version:{increment:1},asOf:thaiDay(new Date())}})
 }
}
''')
p='apps/api/src/tracker/service.ts';s=read(p)
s="import { applyCashChanges, cashChange, requireCash, settlementData, settlementView } from './cash-links.js'\n"+s
s=sub(s,"amount: thbForApi(row.amount), date: thaiDay(row.occurredAt)","cashAccountId: row.cashAccountId, amount: thbForApi(row.amount), date: thaiDay(row.occurredAt)")
s=sub(s,"    const entry = await tx.financeTransaction.create({ data: {", "    const cashAccountId = requireCash(value.cashAccountId)\n    await applyCashChanges(tx, owner, cashChange(cashAccountId, value.amount, type === 'INCOME'))\n    const entry = await tx.financeTransaction.create({ data: {")
s=sub(s,"ownerId: owner, categoryId: value.categoryId, type, amount:","ownerId: owner, cashAccountId, categoryId: value.categoryId, type, amount:")
s=sub(s,"    let replacementId: string | null = null\n    if (value.action === 'replace') {", """    const legacy = !original.cashAccountId
    if (legacy && value.action === 'replace' && value.entry.cashAccountId) throw new TrackerError('LEGACY_CASH_LINK', 422)
    const nextCash = value.action === 'replace' && !legacy ? requireCash(value.entry.cashAccountId) : null
    await applyCashChanges(tx, owner, [...cashChange(original.cashAccountId, thbForApi(original.amount), original.type === 'INCOME', true), ...(value.action === 'replace' ? cashChange(nextCash, value.entry.amount, value.entry.type === 'income') : [])])
    let replacementId: string | null = null
    if (value.action === 'replace') {""",2) if False else s
# Only first occurrence here is finance; crypto uses the same let text below.
needle="    let replacementId: string | null = null\n    if (value.action === 'replace') {"
idx=s.index(needle);s=s[:idx]+s[idx:].replace(needle,"""    const legacy = !original.cashAccountId
    if (legacy && value.action === 'replace' && value.entry.cashAccountId) throw new TrackerError('LEGACY_CASH_LINK', 422)
    const nextCash = value.action === 'replace' && !legacy ? requireCash(value.entry.cashAccountId) : null
    await applyCashChanges(tx, owner, [...cashChange(original.cashAccountId, thbForApi(original.amount), original.type === 'INCOME', true), ...(value.action === 'replace' ? cashChange(nextCash, value.entry.amount, value.entry.type === 'income') : [])])
    let replacementId: string | null = null
    if (value.action === 'replace') {""",1)
s=sub(s,'ownerId: owner, categoryId: entry.categoryId, type, amount:', 'ownerId: owner, cashAccountId: nextCash, categoryId: entry.categoryId, type, amount:')
s=sub(s,'    const inserted = await tx.cryptoTrade.create({ data: {','''    const settlement = settlementData(value.cashSettlement)
    await applyCashChanges(tx, owner, cashChange(settlement.cashAccountId, value.cashSettlement!.amountThb, value.side === 'sell'))
    const inserted = await tx.cryptoTrade.create({ data: {
      ...settlement,''')
s=sub(s,"    await tx.cryptoTrade.update({ where: { id: tradeId }, data: { voidedAt:","""    const settlement = value.action === 'replace' ? settlementData(value.entry.cashSettlement, !original.cashAccountId) : null
    await applyCashChanges(tx, owner, [...cashChange(original.cashAccountId, original.cashAmountThb ? thbForApi(original.cashAmountThb) : '0', original.side === 'SELL', true), ...(value.action === 'replace' && settlement?.cashAccountId ? cashChange(settlement.cashAccountId, value.entry.cashSettlement!.amountThb, value.entry.side === 'sell') : [])])
    await tx.cryptoTrade.update({ where: { id: tradeId }, data: { voidedAt:""")
s=sub(s,"ownerId: owner, portfolioId: original.portfolioId, assetId: original.assetId, quoteCurrency:","...settlement!, ownerId: owner, portfolioId: original.portfolioId, assetId: original.assetId, quoteCurrency:")
s=sub(s,'trades: trades.map(t => ({ id: t.id,','trades: trades.map(t => ({ cashSettlement: settlementView(t), id: t.id,')
write(p,s)
p='apps/api/src/tracker/stock-ledger.ts';s=read(p);s="import { applyCashChanges, cashChange, settlementData, settlementView } from './cash-links.js'\nimport { thbForApi } from '../persistence/decimal.js'\n"+s
s=sub(s,'const {date,attachmentId,...entry}=value\n','const {date,attachmentId,cashSettlement,...entry}=value\n  const settlement=settlementData(cashSettlement)\n  await applyCashChanges(tx,owner,cashChange(settlement.cashAccountId,cashSettlement!.amountThb,value.side===\'sell\'))\n')
s=sub(s,'data:{ownerId:owner,...entry,','data:{ownerId:owner,...settlement,...entry,')
s=sub(s,'  await tx.stockTrade.update({where:{id:tradeId},data:{voidedAt:', '''  const settlement=value.action==='replace'?settlementData(value.entry.cashSettlement,!original.cashAccountId):null
  await applyCashChanges(tx,owner,[...cashChange(original.cashAccountId,original.cashAmountThb?thbForApi(original.cashAmountThb):'0',original.side==='SELL',true),...(value.action==='replace'&&settlement?.cashAccountId?cashChange(settlement.cashAccountId,value.entry.cashSettlement!.amountThb,value.entry.side==='sell'):[])])
  await tx.stockTrade.update({where:{id:tradeId},data:{voidedAt:''')
s=sub(s,'const {date,attachmentId,...entry}=value.entry','const {date,attachmentId,cashSettlement:_cash,...entry}=value.entry')
s=sub(s,'data:{ownerId:owner,portfolioId:original.portfolioId,symbol:original.symbol,...entry,','data:{ownerId:owner,...settlement!,portfolioId:original.portfolioId,symbol:original.symbol,...entry,')
s=sub(s,'trades:trades.map(row=>({id:row.id,','trades:trades.map(row=>({cashSettlement:settlementView(row),id:row.id,')
write(p,s)
p='apps/api/src/tracker/backup.ts';s=read(p);s="import { settlementView } from './cash-links.js'\n"+s
s=sub(s,'stockTrades:stockTrades.map(row=>({id:row.id,','stockTrades:stockTrades.map(row=>({cashSettlement:settlementView(row),id:row.id,')
s=sub(s,'transactions: transactions.map(row => ({ id: row.id,','transactions: transactions.map(row => ({ cashAccountId:row.cashAccountId, id: row.id,')
s=sub(s,'trades: trades.map(row => ({ id: row.id,','trades: trades.map(row => ({ cashSettlement:settlementView(row), id: row.id,')
s=sub(s,'    if (backup.version !== 1 && backup.cashAccounts.length)', '    const cashIds = idMap(backup.version !== 1 ? backup.cashAccounts : [])\n    const mappedSettlement = (value: {accountId:string;amountThb:string}|null|undefined) => value ? {cashAccountId:cashIds.get(value.accountId)!,cashAmountThb:value.amountThb} : {cashAccountId:null,cashAmountThb:null}\n    if (backup.version !== 1 && backup.cashAccounts.length)')
s=sub(s,'({ id: randomUUID(), ownerId: owner, ...row }))','({ id: cashIds.get(_sourceId)!, ownerId: owner, ...row }))')
s=sub(s,'({id:stockTrades.get(row.id)!,ownerId:owner,','({...mappedSettlement(row.cashSettlement),id:stockTrades.get(row.id)!,ownerId:owner,')
s=sub(s,'({ id: entries.get(row.id)!, ownerId: owner,','({ cashAccountId:row.cashAccountId ? cashIds.get(row.cashAccountId)! : null, id: entries.get(row.id)!, ownerId: owner,')
s=sub(s,'({ id: trades.get(row.id)!, ownerId: owner,','({ ...mappedSettlement(row.cashSettlement), id: trades.get(row.id)!, ownerId: owner,')
s=sub(s,'    const verified = prepareBackup(stored, stored).summary','''    // Balances in the backup are already settled. Restore links without applying money a second time.
    const verifyLinks=(source:{id:string;cashAccountId?:string|null;cashSettlement?:{accountId:string;amountThb:string}|null}[],target:typeof source,ids:Map<string,string>)=>{
      const targets=new Map(target.map(row=>[row.id,row]))
      for(const row of source){const next=targets.get(ids.get(row.id)!)!
        if((next.cashAccountId??null)!==(row.cashAccountId?cashIds.get(row.cashAccountId):null))throw new TrackerError('BACKUP_VERIFY_FAILED',409)
        const expected=row.cashSettlement?{accountId:cashIds.get(row.cashSettlement.accountId)!,amountThb:serializeThb(parseThbDecimal(row.cashSettlement.amountThb))}:null
        if(JSON.stringify(next.cashSettlement??null)!==JSON.stringify(expected))throw new TrackerError('BACKUP_VERIFY_FAILED',409)
      }
    }
    verifyLinks(backup.transactions,stored.transactions,entries);verifyLinks(backup.trades,stored.trades,trades)
    if((backup.version===3||backup.version===4)&&(stored.version===3||stored.version===4))verifyLinks(backup.stockTrades,stored.stockTrades,stockTrades)
    const verified = prepareBackup(stored, stored).summary''')
write(p,s)
print('Backend cash linkage, owner constraints, and backup mapping updated.')
