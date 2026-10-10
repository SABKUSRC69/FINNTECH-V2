from pathlib import Path
base=Path(r'C:\Users\Admin\Downloads\FINNTECH\.student-real-20261008.local\release-source')
def read(p): return (base/p).read_text(encoding='utf-8')
def write(p,s): (base/p).parent.mkdir(parents=True,exist_ok=True); (base/p).write_text(s,encoding='utf-8',newline='\n')
def sub(s,a,b,n=1):
 assert s.count(a)==n,(a[:90],s.count(a),n)
 return s.replace(a,b)
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

