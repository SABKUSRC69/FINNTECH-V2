import {spawn} from 'node:child_process'
import{runBackupJob}from'./real-backup-runner-core.mjs'
try{
  if(process.env.FINNTECH_BACKUP_MUTEX_HELD!=='true')throw Error()
  const run=(phase,archive)=>new Promise(resolve=>{
    const file=phase==='dump'?'scripts/real-db-backup.mjs':phase==='upload'?'scripts/real-drive-backup.mjs':'scripts/real-backup-failure.mjs'
    const child=spawn(process.execPath,['--no-strip-types',file],{env:{...process.env,...(archive?{FINNTECH_BACKUP_ARCHIVE:archive}:{})},windowsHide:true,stdio:'ignore'})
    const timeout=setTimeout(()=>{child.kill();resolve(1)},180000)
    child.on('error',()=>{clearTimeout(timeout);resolve(1)});child.on('close',code=>{clearTimeout(timeout);resolve(code??1)})
  })
  const result=await runBackupJob({directory:process.env.FINNTECH_BACKUP_DIRECTORY??'',pointer:process.env.FINNTECH_BACKUP_LAST_RECEIPT_FILE??'',run})
  console.log(JSON.stringify(result));if(result.status==='FAILED')process.exitCode=1
}catch{console.error('FAIL: backup runner unconfirmed; private details withheld');process.exitCode=1}
