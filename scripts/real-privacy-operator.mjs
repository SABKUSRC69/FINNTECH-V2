import{readFile,writeFile}from'node:fs/promises'
import{createTrackerDatabase}from'../apps/api/dist/persistence/database.js'
import{GoogleDriveBackups}from'./real-drive-backup-core.mjs'
import{readBackupKey}from'./real-backup-core.mjs'
import{publishAndPurge,replayOffDeviceDeletions,sealRegistry,verifyPrivacyRegistry}from'./real-privacy-core.mjs'
let db,key
try {
  const url=new URL(process.env.FINNTECH_PRIVACY_DATABASE_URL??''),role=process.env.FINNTECH_PRIVACY_DATABASE_ROLE??''
  const host=process.env.TRACKER_REAL_DATABASE_HOST??'',name=process.env.FINNTECH_PRIVACY_DATABASE_NAME??'',action=process.env.FINNTECH_PRIVACY_ACTION??'inventory'
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.username!==role||!url.password||!host.endsWith('.neon.tech')||url.hostname.replace('-pooler.','.')!==host||url.pathname!==`/${name}`||url.searchParams.get('sslmode')!=='verify-full'
    || !/^[a-z][a-z0-9_]{1,62}$/.test(role)||!/^[a-z][a-z0-9_]{1,62}$/.test(name)||/beta|demo|rehearsal|fixture|test/i.test(`${role}:${name}`)||!['inventory','initialize-registry','publish-purge','restore-replay'].includes(action))throw Error()
  db=createTrackerDatabase(url.href)
  const identity=await db.$queryRaw`SELECT current_database() AS name,current_user AS role`
  const marker=await db.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
  if(identity[0]?.name!==name||identity[0]?.role!==role||marker.mode!=='real'||marker.databaseRole===role)throw Error()
  if(action==='inventory'){
    const rows=await db.accountDeletionCase.groupBy({by:['status'],_count:true})
    console.log(JSON.stringify({status:'INVENTORY_ONLY',cases:rows.map(row=>({status:row.status,count:row._count}))}))
  }else{
    key=await readBackupKey(process.env.FINNTECH_PRIVACY_KEY_FILE??'')
    const drive=new GoogleDriveBackups({clientId:process.env.FINNTECH_DRIVE_CLIENT_ID,clientSecret:process.env.FINNTECH_DRIVE_CLIENT_SECRET,refreshToken:process.env.FINNTECH_DRIVE_REFRESH_TOKEN})
    await drive.authenticate()
    const folder=process.env.FINNTECH_PRIVACY_DRIVE_FOLDER_ID??''
    const anchor=process.env.FINNTECH_PRIVACY_REGISTRY_ID??''
    if(!/^[A-Za-z0-9_-]{10,200}$/.test(anchor))throw Error()
    if(action==='initialize-registry'){
      if(marker.databaseName!==name||await db.accountDeletionCase.count())throw Error()
      const journal=process.env.FINNTECH_PRIVACY_REGISTRY_JOURNAL
      if(!journal)throw Error()
      let bytes
      try{bytes=await readFile(journal)}catch(error){if(error.code!=='ENOENT')throw error
        bytes=sealRegistry({datasetId:marker.datasetId,entries:[]},key)
        await writeFile(journal,bytes,{flag:'wx',mode:0o600})}
      await drive.uploadPrivateArtifact(folder,anchor,`${marker.datasetId}.fnr`,bytes,'FINNTECH-REGISTRY-1',{datasetId:marker.datasetId})
      await verifyPrivacyRegistry(drive,folder,key,marker.datasetId,anchor)
      console.log('REGISTRY_INITIALIZED: retain registry and case artifacts separately from expiring backups')
    }else if(action==='publish-purge'){
      const id=process.env.FINNTECH_PRIVACY_CASE_ID??''
      if(!/^[a-f0-9-]{36}$/i.test(id)||process.env.FINNTECH_PRIVACY_CONFIRM_CASE!==id)throw Error()
      if(marker.databaseName!==name)throw Error()
      const result=await publishAndPurge(db,drive,folder,key,id,anchor);console.log(JSON.stringify({status:result.status,offDeviceReceipt:result.offDeviceReceipt}))
    }else{
      if(process.env.FINNTECH_PRIVACY_RESTORE_CONFIRM!=='isolated-restore-only'||marker.databaseName===name)throw Error()
      console.log(JSON.stringify(await replayOffDeviceDeletions(db,drive,folder,key,anchor)))
    }
    drive.token=undefined
  }
}catch{console.error('FAIL: privacy operation unconfirmed; inspect private setup; no sensitive details logged');process.exitCode=1}
finally{key?.fill(0);await db?.$disconnect()}
