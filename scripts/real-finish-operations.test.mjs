import {test} from 'vitest'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,readFile,writeFile,unlink,rm} from 'node:fs/promises'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {saveEncryptedBackup} from './real-backup-core.mjs'
import {planLocalRetention,applyLocalRetention,retentionDigest} from './real-retention.mjs'
import {runBackupJob} from './real-backup-runner-core.mjs'
import {checkBackupAndAlert} from './real-watchdog-core.mjs'
import {sealDeletion,openDeletion,verifyPrivacyRegistry,sealRegistry} from './real-privacy-core.mjs'
import {GoogleDriveBackups} from './real-drive-backup-core.mjs'

async function temporary(run){const root=await mkdtemp(path.join(tmpdir(),'finntech-finish-unit-'));try{await run(root)}finally{assert.equal(path.dirname(root),tmpdir());assert.ok(path.basename(root).startsWith('finntech-finish-unit-'));await rm(root,{recursive:true})}}
test('retention requires reviewed hashes, preserves unrelated/current files and reconciles repeated apply',()=>temporary(async root=>{
  const key=randomBytes(32),now=new Date('2026-10-08T00:00:00Z')
  const old=await saveEncryptedBackup(root,Buffer.from('PGDMPold'),key,new Date('2026-08-01T00:00:00Z'))
  const fresh=await saveEncryptedBackup(root,Buffer.from('PGDMPnew'),key,now)
  await writeFile(path.join(root,'owner.txt'),'preserve')
  const plan=await planLocalRetention(root,key,30,now);assert.equal(plan.entries.length,1)
  await assert.rejects(applyLocalRetention(plan,key,'wrong',now),/APPROVAL/)
  assert.deepEqual(await applyLocalRetention(plan,key,retentionDigest(plan),now),{removed:1,alreadyRemoved:0})
  assert.deepEqual(await applyLocalRetention(plan,key,retentionDigest(plan),now),{removed:0,alreadyRemoved:1})
  await assert.rejects(readFile(old.file));assert.ok(await readFile(fresh.file));assert.equal(await readFile(path.join(root,'owner.txt'),'utf8'),'preserve')
}))
test('retention rejects archive changes and loss of the current recovery copy',()=>temporary(async root=>{
  const key=randomBytes(32),now=new Date('2026-10-08T00:00:00Z')
  const old=await saveEncryptedBackup(root,Buffer.from('PGDMPold'),key,new Date('2026-08-01T00:00:00Z'))
  const fresh=await saveEncryptedBackup(root,Buffer.from('PGDMPnew'),key,now)
  const plan=await planLocalRetention(root,key,30,now)
  await unlink(fresh.file);await unlink(`${fresh.file}.json`)
  await assert.rejects(applyLocalRetention(plan,key,retentionDigest(plan),now),/CURRENT_VERIFIED/)
  assert.ok(await readFile(old.file))
}))
test('runner retries the original archive after upload failure, resumes after crash, and skips a fresh completed run',()=>temporary(async directory=>{
  const pointer=path.join(directory,'last.json'),now=()=>new Date('2026-10-08T00:00:00Z'),calls=[]
  const archivePath=path.join(directory,'20261008T000000000Z-0123456789abcdef.fnb')
  const run=async(phase,archive)=>{calls.push([phase,archive]);if(phase==='dump'){await writeFile(pointer,JSON.stringify({status:'ENCRYPTED_AND_VERIFIED',createdAt:now().toISOString(),archivePath}));return 0}return 1}
  assert.equal((await runBackupJob({directory,pointer,now,run,sleep:async()=>{}})).status,'FAILED')
  assert.equal(calls.filter(([p])=>p==='dump').length,1)
  assert.deepEqual(calls.filter(([p])=>p==='upload').map(([,a])=>a),[archivePath,archivePath])
  assert.equal((await runBackupJob({directory,pointer,now,run:async(phase,archive)=>{assert.equal(phase,'upload');assert.equal(archive,archivePath);return 0}})).status,'DONE')
  assert.equal((await runBackupJob({directory,pointer,now,run:async()=>{throw Error('must not run')}})).status,'NOT_DUE')
}))
test('watchdog alerts for offline, failed, expired OAuth and missing receipts; acceptance is not mailbox delivery',async()=>{
  const now=new Date('2026-10-08T00:00:00Z'),ids=[]
  for(const readReceipt of [async()=>undefined,async()=>{throw Error('expired OAuth')},async()=>({status:'BACKUP_FAILED',createdAt:now.toISOString()}),async()=>({status:'ENCRYPTED_AND_VERIFIED',createdAt:'2026-10-06T00:00:00Z',offDeviceCopy:'DOWNLOADED_AND_AUTHENTICATED'})]){
    const result=await checkBackupAndAlert({readReceipt,sendAlert:async id=>{ids.push(id);return 201},now,identity:'fixture'})
    assert.equal(result.status,'ALERT_ACCEPTED');assert.equal(result.mailboxDelivery,'NOT_TESTED')
  }
  assert.equal(new Set(ids).size,1)
  assert.equal((await checkBackupAndAlert({readReceipt:async()=>null,sendAlert:async()=>429,now,identity:'fixture'})).exitCode,2)
  assert.equal((await checkBackupAndAlert({readReceipt:async()=>({status:'ENCRYPTED_AND_VERIFIED',createdAt:now.toISOString(),offDeviceCopy:'DOWNLOADED_AND_AUTHENTICATED'}),sendAlert:async()=>{throw Error()},now,identity:'fixture'})).status,'CURRENT')
})
test('deletion tombstones are authenticated and dataset-bound; empty/wrong registry cannot authorize replay',async()=>{
  const key=randomBytes(32),record={caseId:randomUUID(),datasetId:randomUUID(),ownerId:randomUUID(),userId:randomUUID(),requestedAt:new Date().toISOString()},bytes=sealDeletion(record,key)
  assert.deepEqual(openDeletion(bytes,key,record.datasetId),record)
  assert.throws(()=>openDeletion(bytes,key,randomUUID()));assert.throws(()=>openDeletion(bytes,randomBytes(32),record.datasetId))
  const changed=Buffer.from(bytes);changed[40]^=1;assert.throws(()=>openDeletion(changed,key,record.datasetId))
  await assert.rejects(verifyPrivacyRegistry({artifactMetadata:async()=>undefined},'folder',key,record.datasetId,'missing'),/REGISTRY_REQUIRED/)
})
test('registry conditional update sends only authenticated bytes and refuses missing tokens or provider conflicts',async()=>{
  const bytes=sealRegistry({datasetId:randomUUID(),entries:[]},randomBytes(32)),calls=[]
  const client=new GoogleDriveBackups({},async(url,options)=>{calls.push({url,options});return new Response('{}',{status:412})});client.token='synthetic'
  await assert.rejects(client.replaceRegistry('fixture_registry_123',undefined,bytes),/UPDATE_REJECTED/)
  assert.equal(calls.length,0)
  await assert.rejects(client.replaceRegistry('fixture_registry_123','version-1',bytes),/UPDATE_UNCONFIRMED/)
  assert.equal(calls[0].options.headers['If-Match'],'version-1');assert.deepEqual(calls[0].options.body,bytes)
  assert.equal(calls[0].options.redirect,'error')
})
