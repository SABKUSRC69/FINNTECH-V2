import{readFile,writeFile}from'node:fs/promises'
import path from'node:path'
import{GoogleDriveBackups}from'./real-drive-backup-core.mjs'
import{readBackupKey}from'./real-backup-core.mjs'
import{planLocalRetention,applyLocalRetention,planDriveRetention,applyDriveRetention,retentionDigest}from'./real-retention.mjs'
let key
try{
  const file=process.env.FINNTECH_RETENTION_PLAN_FILE??'',scope=process.env.FINNTECH_RETENTION_SCOPE??'local',approval=process.env.FINNTECH_RETENTION_APPROVE_SHA256
  if(!path.isAbsolute(file)||!['local','drive'].includes(scope))throw Error()
  key=await readBackupKey(process.env.FINNTECH_BACKUP_KEY_FILE??'')
  const drive=new GoogleDriveBackups({clientId:process.env.FINNTECH_DRIVE_CLIENT_ID,clientSecret:process.env.FINNTECH_DRIVE_CLIENT_SECRET,refreshToken:process.env.FINNTECH_DRIVE_REFRESH_TOKEN})
  if(scope==='drive')await drive.authenticate()
  if(!approval){
    const days=Number(process.env.FINNTECH_RETENTION_DAYS??'30')
    const plan=scope==='local'?await planLocalRetention(process.env.FINNTECH_BACKUP_DIRECTORY??'',key,days):await planDriveRetention(drive,process.env.FINNTECH_DRIVE_FOLDER_ID??'',key,days)
    await writeFile(file,JSON.stringify(plan,null,2),{flag:'wx',mode:0o600})
    console.log(JSON.stringify({status:'DRY_RUN',expired:plan.entries.length,keep:plan.keep.length,approvalSha256:retentionDigest(plan)}))
  }else{
    const plan=JSON.parse(await readFile(file,'utf8'));if(plan.scope!==scope)throw Error()
    const result=scope==='local'?await applyLocalRetention(plan,key,approval):await applyDriveRetention(drive,plan,key,approval)
    console.log(JSON.stringify({status:'APPLIED_REVIEWED_PLAN',...result}))
  }
  drive.token=undefined
}catch{console.error('FAIL: retention unconfirmed; no sensitive details logged; retry only the original reviewed plan');process.exitCode=1}
finally{key?.fill(0)}
