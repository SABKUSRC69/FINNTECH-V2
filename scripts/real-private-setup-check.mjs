import{readFile,lstat}from'node:fs/promises'
import path from'node:path'
import{readBackupKey,sha256}from'./real-backup-core.mjs'
import{readRealBackupTarget}from'./real-backup-target.mjs'
import{GoogleDriveBackups}from'./real-drive-backup-core.mjs'
import{createTrackerDatabase}from'../apps/api/dist/persistence/database.js'
const mode=process.argv[2]??'inventory'
const groups={mail:['TRACKER_MAIL_API_KEY','TRACKER_MAIL_SENDER','TRACKER_MAIL_SENDER_CONFIRMED','TRACKER_REAL_SUPPORT_EMAIL'],
  backup:['FINNTECH_BACKUP_DATABASE_URL','FINNTECH_BACKUP_DATABASE_ROLE','TRACKER_REAL_DATABASE_HOST','TRACKER_REAL_DATABASE_NAME','TRACKER_REAL_DATABASE_ROLE','TRACKER_ORIGIN','FINNTECH_BACKUP_DIRECTORY','FINNTECH_BACKUP_KEY_FILE','FINNTECH_BACKUP_LAST_RECEIPT_FILE','FINNTECH_BACKUP_ACCEPTANCE_FILE','FINNTECH_DRIVE_CLIENT_ID','FINNTECH_DRIVE_CLIENT_SECRET','FINNTECH_DRIVE_REFRESH_TOKEN','FINNTECH_DRIVE_FOLDER_ID','FINNTECH_DRIVE_RECEIPT_FILE_ID'],
  watchdog:['FINNTECH_DRIVE_CLIENT_ID','FINNTECH_DRIVE_CLIENT_SECRET','FINNTECH_DRIVE_REFRESH_TOKEN','FINNTECH_DRIVE_RECEIPT_FILE_ID','FINNTECH_BACKUP_ALERT_EMAIL','TRACKER_MAIL_SENDER','TRACKER_MAIL_API_KEY']}
let key,db
try{
  if(mode==='inventory'){
    for(const [group,names]of Object.entries(groups))console.log(JSON.stringify({group,missing:names.filter(name=>!process.env[name])}))
    process.exitCode=Object.values(groups).flat().some(name=>!process.env[name])?1:0
  }else{
    if(!groups[mode])throw Error()
    const missing=groups[mode].filter(name=>!process.env[name]);if(missing.length){console.log(JSON.stringify({status:'MISSING_CONFIGURATION',mode,missing}));process.exitCode=1}
    else if(mode==='backup'){
      const target=readRealBackupTarget(process.env),directory=process.env.FINNTECH_BACKUP_DIRECTORY,keyFile=process.env.FINNTECH_BACKUP_KEY_FILE,pointer=process.env.FINNTECH_BACKUP_LAST_RECEIPT_FILE
      if(!path.isAbsolute(directory)||!path.isAbsolute(pointer)||path.dirname(pointer)!==directory||(await lstat(directory)).isSymbolicLink()||path.resolve(keyFile).startsWith(`${path.resolve(directory)}${path.sep}`)||process.env.FINNTECH_BACKUP_PRIVATE_DIRECTORY_CONFIRMED!=='owner-only')throw Error()
      key=await readBackupKey(keyFile)
      const acceptance=JSON.parse(await readFile(process.env.FINNTECH_BACKUP_ACCEPTANCE_FILE,'utf8'))
      if(acceptance.keyFingerprint!==sha256(key).slice(0,16)||acceptance.machineLoss!=='PASS'||acceptance.offDeviceRestore!=='PASS'||acceptance.gmailAlertReceived!=='PASS'||acceptance.independentWatchdog!=='PASS'
        ||!Number.isFinite(Date.parse(acceptance.checkedAt))||Date.now()-Date.parse(acceptance.checkedAt)>7*86400000||Date.parse(acceptance.checkedAt)>Date.now())throw Error()
      db=createTrackerDatabase(target.url.href);const marker=await db.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
      if(marker.mode!=='real'||marker.databaseName!==target.name||marker.databaseRole!==target.appRole||marker.origin!==target.origin)throw Error()
      const drive=new GoogleDriveBackups({clientId:process.env.FINNTECH_DRIVE_CLIENT_ID,clientSecret:process.env.FINNTECH_DRIVE_CLIENT_SECRET,refreshToken:process.env.FINNTECH_DRIVE_REFRESH_TOKEN})
      await drive.authenticate();await drive.preflight(process.env.FINNTECH_DRIVE_FOLDER_ID,134217728)
      const receipt=await drive.artifactMetadata(process.env.FINNTECH_DRIVE_RECEIPT_FILE_ID),metadata=receipt?.metadata
      if(!metadata?.ownedByMe||metadata.shared||metadata.trashed||metadata.parents?.length!==1||metadata.parents[0]!==process.env.FINNTECH_DRIVE_FOLDER_ID||metadata.mimeType!=='application/json')throw Error()
      drive.token=undefined;console.log('VALIDATED: configured backup target, private Drive capacity and reviewed recovery/alert evidence')
    }else{console.log('CONFIGURATION_PRESENT: actual mailbox delivery and independent runtime still require acceptance');process.exitCode=1}
  }
}catch{console.error('FAIL: private setup not validated; values and provider details withheld');process.exitCode=1}
finally{key?.fill(0);await db?.$disconnect()}
