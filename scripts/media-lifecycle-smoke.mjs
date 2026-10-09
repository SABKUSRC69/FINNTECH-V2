// Isolated fictional database only; creates new databases, never resets a database.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createTrackerDatabase} from '../apps/api/dist/persistence/database.js'
import {provisionPrivacyRole} from './real-privacy-provision.mjs'
const dir='.media-review-20261009.local',config=JSON.parse(await fs.readFile(`${dir}/config.private.json`,'utf8')),url=new URL(config.databaseUrl)
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5449');assert.equal(url.pathname,'/finntech_media_test');assert.equal(config.origin,'http://127.0.0.1:4340')
const container='finntech-media-20261009-postgres-1',suffix=randomBytes(5).toString('hex'),fresh=`finntech_media_fresh_${suffix}`,restore=`finntech_media_restore_${suffix}`,operator=`media_privacy_${suffix}`,password=randomBytes(24).toString('hex'),db=createTrackerDatabase(url.href),passes=[]
function run(bin,args,opts={}){const r=spawnSync(bin,args,{windowsHide:true,maxBuffer:64*1024*1024,...opts});if(r.status!==0)throw new Error(`LOCAL_COMMAND_FAILED:${bin}:${r.status}`);return r.stdout}
function docker(args,opts){return run('docker',['exec',...(opts?.input?['-i']:[]),container,...args],opts)}
let op,restored,restoreOp
try{
 for(const name of [fresh,restore])docker(['psql','-U','media_fixture','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE ${name}`])
 const freshUrl=new URL(url);freshUrl.pathname=`/${fresh}`
 const result=run(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy'],{cwd:'apps/api',env:{...process.env,DATABASE_URL:freshUrl.href}})
 await fs.writeFile(`${dir}/fresh-migration.log`,result);passes.push('All forward migrations deploy successfully to a new empty PostgreSQL 18 database')
 const target=JSON.parse(await fs.readFile(`${dir}/purge-fixture.private.json`,'utf8')),control=await db.mediaObject.findFirstOrThrow({where:{ownerId:{not:target.ownerId},stagedExpiresAt:null}}),prior=await db.accountDeletionCase.findUnique({where:{userId:target.userId}}),caseId=prior?.id??randomUUID(),hash=prior?.archiveSha256??createHash('sha256').update(`Fictional archive receipt; not an external backup; ${target.ownerId}`).digest('hex'),archiveId=prior?.archiveId??`synthetic_media_${suffix}`
 assert.ok(await db.mediaObject.findUnique({where:{id:target.mediaId}}))
 await provisionPrivacyRole(db,operator,password)
 const opUrl=new URL(url);opUrl.username=operator;opUrl.password=password;op=createTrackerDatabase(opUrl.href)
 if(!prior)await db.accountDeletionCase.create({data:{id:caseId,userId:target.userId,ownerId:target.ownerId,requestHash:hash}})
 const deletion=await db.accountDeletionCase.findUniqueOrThrow({where:{id:caseId}})
 await op.$queryRaw`SELECT tracker_case_archive(${caseId}::uuid,${archiveId},${hash},${'Fictional encrypted receipt envelope '.repeat(3)})::text`
 const evidenceSql=await fs.readFile('scripts/sql/real-restore-evidence.sql'),sourceEvidence=docker(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','media_fixture','-d','finntech_media_test'],{input:evidenceSql})
 const dump=docker(['pg_dump','-U','media_fixture','-d','finntech_media_test','--format=custom'])
 docker(['pg_restore','-U','media_fixture','-d',restore,'--single-transaction','--exit-on-error','--no-owner','--no-acl'],{input:dump})
 const restoredEvidence=docker(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','media_fixture','-d',restore],{input:evidenceSql})
 await fs.writeFile(`${dir}/restore-source-evidence.txt`,sourceEvidence);await fs.writeFile(`${dir}/restore-target-evidence.txt`,restoredEvidence)
 assert.equal(createHash('sha256').update(sourceEvidence).digest('hex'),createHash('sha256').update(restoredEvidence).digest('hex'));passes.push('Existing dynamic restore evidence matches every table (including media), rows, constraints, functions, triggers, indexes and sequences before deletion replay')
 const negativeSql=Buffer.from('BEGIN; ALTER TABLE owner_profiles ADD CONSTRAINT media_review_negative_check CHECK (version>0) NOT VALID;\n'+evidenceSql.toString().replace('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;','').replace(/COMMIT;\s*$/,'ROLLBACK;'))
 const negativeEvidence=docker(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','media_fixture','-d',restore],{input:negativeSql})
 assert.notEqual(createHash('sha256').update(sourceEvidence).digest('hex'),createHash('sha256').update(negativeEvidence).digest('hex'));passes.push('An unexpected stricter media constraint fails aggregate comparison; test DDL is rolled back')
 assert.equal((await op.$queryRaw`SELECT tracker_purge_owner_case(${caseId}::uuid) AS status`)[0].status,'PURGED')
 assert.equal(await db.mediaObject.count({where:{ownerId:target.ownerId}}),0);assert.equal(await db.ownerProfile.count({where:{ownerId:target.ownerId}}),0);assert.equal(await db.mediaAttachment.count({where:{ownerId:target.ownerId}}),0);passes.push('Restricted operator purge removes only the blocked fictional owner and all media')
 const restoredUrl=new URL(url);restoredUrl.pathname=`/${restore}`;restored=createTrackerDatabase(restoredUrl.href)
 assert.ok(await restored.mediaObject.findUnique({where:{id:target.mediaId}}))
 for(const signature of ['tracker_case_archive(UUID,TEXT,TEXT,TEXT)','tracker_purge_owner_case(UUID)','tracker_replay_deletion(UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT)','tracker_record_restore(UUID,TEXT)']){
  await restored.$executeRawUnsafe(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`)
  await restored.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION ${signature} TO "${operator}"`)
 }
 await restored.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${operator}"`)
 const restoredOpUrl=new URL(opUrl);restoredOpUrl.pathname=`/${restore}`;restoreOp=createTrackerDatabase(restoredOpUrl.href)
 assert.equal((await restoreOp.$queryRaw`SELECT tracker_replay_deletion(${caseId}::uuid,${target.ownerId}::uuid,${target.userId}::uuid,${deletion.requestedAt}::timestamptz,${archiveId},${hash}) AS status`)[0].status,'PURGED')
 assert.equal(await restored.mediaObject.count({where:{ownerId:target.ownerId}}),0);assert.equal(await restored.authUser.count({where:{id:target.userId}}),0);assert.equal((await restored.mediaObject.findUniqueOrThrow({where:{id:control.id}})).sha256,control.sha256);passes.push('Actual pg_dump/pg_restore contains media; replaying deletion suppresses restored private bytes and preserves another owner')
 await db.$disconnect();await op.$disconnect();await restored.$disconnect();await restoreOp.$disconnect()
 docker(['pg_ctl','--version'])
 run('docker',['restart',container]);
 let connected=false
 for(let i=0;i<20;i++){const probe=spawnSync('docker',['exec',container,'pg_isready','-U','media_fixture','-d','finntech_media_test'],{windowsHide:true});if(probe.status===0){connected=true;break}await new Promise(resolve=>setTimeout(resolve,500))}
 assert.ok(connected);const reopened=createTrackerDatabase(url.href);try{assert.equal((await reopened.mediaObject.findUniqueOrThrow({where:{id:control.id}})).sha256,control.sha256)}finally{await reopened.$disconnect()}
 passes.push('PostgreSQL container restart retains confirmed normalized image bytes')
 await fs.writeFile(`${dir}/lifecycle.json`,JSON.stringify({status:'PASS',passes,fixturesOnly:true,externalArchiveUsed:false,liveDatabaseTouched:false,newDatabases:[fresh,restore]},null,2));console.log('MEDIA_LIFECYCLE_PASS',passes.length)
}catch(e){await fs.writeFile(`${dir}/lifecycle-failure.private.txt`,String(e));console.error('MEDIA_LIFECYCLE_FAILED',e?.code??e?.name??'details withheld');process.exitCode=1}finally{await Promise.allSettled([db.$disconnect(),op?.$disconnect(),restored?.$disconnect(),restoreOp?.$disconnect()])}
