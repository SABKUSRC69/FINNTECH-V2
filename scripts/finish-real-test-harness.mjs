import{spawn}from'node:child_process'
import{readFile,writeFile,mkdir}from'node:fs/promises'
import{randomBytes}from'node:crypto'
import path from'node:path'
import{saveEncryptedBackup,decryptDump,sha256}from'./real-backup-core.mjs'
const compose=['compose','--env-file','.finish-real-20261008.local/rehearsal.env','-f','compose.finish-real.yaml']
let restoreName='finntech_finish_restore'
async function tool(args,input){return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];let size=0
  const timer=setTimeout(()=>{child.kill();reject(Error('SYNTHETIC_TOOL_TIMEOUT'))},60000)
  child.stdout.on('data',b=>{size+=b.length;if(size>134217728){child.kill();reject(Error('LIMIT'))}else chunks.push(b)})
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('SYNTHETIC_TOOL_FAILED'))})
  child.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks)):reject(Error('SYNTHETIC_TOOL_FAILED'))});child.stdin.end(input)
})}
async function containers(){
  if(process.env.TRACKER_REAL_REHEARSAL_ID!=='finish-20261008')throw Error('ISOLATED_FINISH_REQUIRED')
  const result=[]
  for(const service of ['postgres-finish','postgres-restore']){
    const id=(await tool([...compose,'ps','-q',service])).toString().trim()
    if(!/^[a-f0-9]{12,64}$/.test(id))throw Error('CONTAINER_REQUIRED')
    const detail=JSON.parse((await tool(['inspect',id])).toString())[0]
    if(detail.Config.Labels['com.docker.compose.project']!=='finntech-finish-real-20261008'||detail.Config.Labels['com.docker.compose.service']!==service||detail.HostConfig.PortBindings['5432/tcp'][0].HostIp!=='127.0.0.1')throw Error('ISOLATION_REJECTED')
    result.push(id)
  }return result
}
const sql=(id,name,text)=>tool(['exec','-i',id,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','finish_rehearsal','-d',name],Buffer.from(text))
export async function snapshotAndRestore(){
  const [source,target]=await containers(),root=path.resolve(`.finish-real-20261008.local/restore-${Date.now()}`),start=performance.now()
  const empty=(await sql(target,'finntech_finish_restore',"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'" )).toString().trim()
  if(empty!=='0'){
    restoreName=`finntech_finish_restore_${randomBytes(5).toString('hex')}`
    await sql(target,'finntech_finish_restore',`CREATE DATABASE ${restoreName};`)
    const url=new URL(process.env.FINISH_RESTORE_DATABASE_URL);url.pathname=`/${restoreName}`;process.env.FINISH_RESTORE_DATABASE_URL=url.href
  }
  const evidence=await readFile('scripts/sql/real-restore-evidence.sql','utf8'),before=await sql(source,'finntech_finish_real',evidence)
  const dump=await tool(['exec',source,'pg_dump','-U','finish_rehearsal','-d','finntech_finish_real','--format=custom','--no-owner','--no-acl'])
  const key=randomBytes(32);await mkdir(root,{recursive:true});const backup=await saveEncryptedBackup(root,dump,key)
  const recovered=decryptDump(await readFile(backup.file),key)
  await tool(['exec','-i',target,'pg_restore','-U','finish_rehearsal','-d',restoreName,'--single-transaction','--exit-on-error','--no-owner','--no-acl'],recovered)
  const restored=await sql(target,restoreName,evidence),after=await sql(source,'finntech_finish_real',evidence)
  if(!before.equals(restored)||!before.equals(after))throw Error('FULL_RESTORE_MISMATCH')
  const result={status:'PASS',syntheticOnly:true,allPublicTablesAndConstraintsMatched:true,tableCount:before.toString().split('\n').filter(l=>l.startsWith('TABLE:')).length,evidenceSha256:sha256(before),restoreMs:Math.round(performance.now()-start),machineLoss:'NOT_TESTED',actualDrive:'NOT_TESTED'}
  await writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));await writeFile(path.join(root,'synthetic.key'),key,{flag:'wx',mode:0o600})
  key.fill(0);dump.fill(0);recovered.fill(0);return result
}
export async function syntheticProvisionRestoreRole(role,password){
  const [,target]=await containers()
  if(role!=='finish_privacy'||! /^[a-f0-9]{64}$/.test(password))throw Error('FIXTURE_ROLE_REQUIRED')
  const exists=(await sql(target,restoreName,"SELECT count(*) FROM pg_roles WHERE rolname='finish_privacy'")).toString().trim()
  await sql(target,restoreName,`${exists==='0'?`CREATE ROLE finish_privacy LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;`:''}
    GRANT USAGE ON SCHEMA public TO finish_privacy;
    GRANT SELECT ON runtime_boundaries,account_deletion_cases TO finish_privacy;
    GRANT EXECUTE ON FUNCTION tracker_case_archive(UUID,TEXT,TEXT,TEXT),tracker_purge_owner_case(UUID),tracker_replay_deletion(UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT),tracker_record_restore(UUID,TEXT) TO finish_privacy;`)
}
