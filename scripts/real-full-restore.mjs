import{spawn}from'node:child_process'
import{readBackupKey,decryptDump,sha256}from'./real-backup-core.mjs'
import{GoogleDriveBackups}from'./real-drive-backup-core.mjs'
import{createTrackerDatabase}from'../apps/api/dist/persistence/database.js'
let db,key,dump
try{
  const url=new URL(process.env.FINNTECH_RESTORE_DATABASE_URL??''),name=process.env.FINNTECH_RESTORE_DATABASE_NAME??'',role=process.env.FINNTECH_RESTORE_DATABASE_ROLE??'',host=process.env.FINNTECH_RESTORE_DATABASE_HOST??''
  if(process.env.FINNTECH_RESTORE_CONFIRM!=='new-isolated-empty-target'||!['postgres:','postgresql:'].includes(url.protocol)||!host.endsWith('.neon.tech')||url.hostname!==host||url.username!==role||!url.password||url.pathname!==`/${name}`||url.searchParams.get('sslmode')!=='verify-full'||!/^[a-z][a-z0-9_]{1,62}$/.test(name)||!/^[a-z][a-z0-9_]{1,62}$/.test(role)||/beta|demo|rehearsal|fixture/i.test(name))throw Error()
  db=createTrackerDatabase(url.href)
  const current=await db.$queryRaw`SELECT current_database() AS name,current_user AS role`
  const objects=await db.$queryRaw`SELECT count(*) AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`
  const types=await db.$queryRaw`SELECT count(*) AS count FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'`
  if(current[0]?.name!==name||current[0]?.role!==role||Number(objects[0]?.count)||Number(types[0]?.count))throw Error()
  const drive=new GoogleDriveBackups({clientId:process.env.FINNTECH_DRIVE_CLIENT_ID,clientSecret:process.env.FINNTECH_DRIVE_CLIENT_SECRET,refreshToken:process.env.FINNTECH_DRIVE_REFRESH_TOKEN})
  await drive.authenticate();const folder=process.env.FINNTECH_DRIVE_FOLDER_ID,id=process.env.FINNTECH_RESTORE_ARCHIVE_ID
  await drive.checkFolder(folder);const metadata=(await drive.artifactMetadata(id))?.metadata
  if(!metadata?.ownedByMe||metadata.shared||metadata.trashed||metadata.parents?.length!==1||metadata.parents[0]!==folder||metadata.appProperties?.finntechFormat!=='FINNTECH-BACKUP-1'||metadata.appProperties.encryptedSha256!==process.env.FINNTECH_RESTORE_ARCHIVE_SHA256)throw Error()
  const bytes=await drive.download(id);drive.token=undefined
  if(sha256(bytes)!==process.env.FINNTECH_RESTORE_ARCHIVE_SHA256)throw Error()
  key=await readBackupKey(process.env.FINNTECH_BACKUP_KEY_FILE??'');dump=decryptDump(bytes,key)
  // Plaintext pg_dump travels in memory/stdin only. Never pass secrets as command arguments.
  await new Promise((resolve,reject)=>{
    const environment={...process.env,PGHOST:host,PGPORT:url.port||'5432',PGDATABASE:name,PGUSER:role,PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'verify-full',PGSSLROOTCERT:'system'}
    const child=spawn('docker',['run','--rm','-i','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','postgres',...['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT'].flatMap(k=>['--env',k]),'postgres:18-alpine','pg_restore','--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname',name],{env:environment,windowsHide:true,stdio:['pipe','ignore','ignore']})
    const timer=setTimeout(()=>{child.kill();reject(Error())},120000)
    child.stdin.on('error',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error())});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error())});child.stdin.end(dump)
  })
  const marker=await db.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
  if(marker.mode!=='real'||marker.databaseName===name)throw Error()
  // pg_restore --no-acl intentionally requires re-provisioning privileges. Restore private function grants now.
  for(const signature of ['tracker_case_delete_allowed(UUID)','tracker_case_archive(UUID,TEXT,TEXT,TEXT)','tracker_purge_owner_case(UUID)','tracker_replay_deletion(UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT)','tracker_record_restore(UUID,TEXT)'])await db.$executeRawUnsafe(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`)
  console.log('RESTORED_OFFLINE: verify full schema/data evidence, provision privacy operator, replay current deletion registry and review staging rebind; runtime must remain stopped')
}catch{console.error('FAIL: restore unconfirmed; target and source retained, runtime must remain stopped; details withheld');process.exitCode=1}
finally{key?.fill(0);dump?.fill(0);await db?.$disconnect()}
