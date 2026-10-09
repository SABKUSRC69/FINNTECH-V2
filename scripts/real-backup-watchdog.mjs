import {GoogleDriveBackups} from './real-drive-backup-core.mjs'
import {checkBackupAndAlert} from './real-watchdog-core.mjs'
try {
const url=new URL(process.env.FINNTECH_BACKUP_RECEIPT_URL??'https://invalid.invalid')
const driveId=process.env.FINNTECH_DRIVE_RECEIPT_FILE_ID
if(!driveId&&(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.hostname==='invalid.invalid'||!process.env.FINNTECH_BACKUP_RECEIPT_READ_TOKEN))throw Error()
const result=await checkBackupAndAlert({identity:driveId??url.origin,readReceipt:async()=>{let receipt
if(driveId){
    const drive = new GoogleDriveBackups({ clientId: process.env.FINNTECH_DRIVE_CLIENT_ID, clientSecret: process.env.FINNTECH_DRIVE_CLIENT_SECRET, refreshToken: process.env.FINNTECH_DRIVE_REFRESH_TOKEN })
    await drive.authenticate()
    try { receipt = JSON.parse((await drive.download(process.env.FINNTECH_DRIVE_RECEIPT_FILE_ID, 4096)).toString('utf8')) }
    finally { drive.token = undefined }

}else{
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${process.env.FINNTECH_BACKUP_RECEIPT_READ_TOKEN}`, 'cache-control': 'no-cache' } })
  if (!response.ok) throw new Error('receipt_unavailable')
  const reader = response.body.getReader(); let bytes = 0; const chunks = []
  try { while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.length; if (bytes > 4096) throw new Error('receipt_limit'); chunks.push(item.value) } }
  finally { void reader.cancel().catch(() => {}) }
  receipt = JSON.parse(Buffer.concat(chunks).toString('utf8'))

}
return receipt},sendAlert:async id=>{
const sender=process.env.TRACKER_MAIL_SENDER??'',recipient=process.env.FINNTECH_BACKUP_ALERT_EMAIL??'',key=process.env.TRACKER_MAIL_API_KEY??''
if(!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(sender)||!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(recipient)||key.length<32)throw Error()
      const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'FINNTECH backup monitor', email: sender }, to: [{ email: recipient }],
          subject: 'FINNTECH — ต้องตรวจสำรองฐานข้อมูล', textContent: 'ไม่พบหลักฐานสำรองเข้ารหัสสำเร็จภายใน 24 ชั่วโมง เครื่องสำรองอาจปิด งานอาจล้มเหลว หรือยังไม่ได้เผยแพร่ receipt กรุณาตรวจด้วยตนเอง ระบบไม่ได้ล้างข้อมูลหรือเปิดรับสมัครแทนคุณ', headers: { 'Idempotency-Key': id } }) })

void response.body?.cancel();return response.status
}})
console.log(JSON.stringify(result));process.exitCode=result.exitCode
}catch{console.error('FAIL: watchdog configuration or alert unconfirmed; private details withheld');process.exitCode=2}
