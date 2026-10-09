import {createHash} from 'node:crypto'
import {backupFreshness} from './real-backup-core.mjs'

export async function checkBackupAndAlert({readReceipt,sendAlert,now=new Date(),identity}) {
  let receipt
  try {receipt=await readReceipt()}catch{}
  if(backupFreshness(receipt,now)==='CURRENT'&&receipt.offDeviceCopy==='DOWNLOADED_AND_AUTHENTICATED')return {status:'CURRENT',exitCode:0}
  // One stable provider deduplication key per six-hour monitoring window.
  const id=createHash('sha256').update(`${identity}:${Math.floor(now.getTime()/21600000)}`).digest('hex').slice(0,32)
  try {
    if(await sendAlert(id)!==201)throw Error()
    return {status:'ALERT_ACCEPTED',mailboxDelivery:'NOT_TESTED',exitCode:1}
  }catch{return {status:'ALERT_UNCONFIRMED',exitCode:2}}
}
