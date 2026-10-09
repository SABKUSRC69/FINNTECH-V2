import{test}from'vitest'
import assert from'node:assert/strict'
import{randomBytes}from'node:crypto'
import{encryptDump,sha256}from'./real-backup-core.mjs'
import{planDriveRetention,applyDriveRetention,retentionDigest}from'./real-retention.mjs'
function fixture(){
  const key=randomBytes(32),folder='fixture_private_folder',files=new Map(),now=new Date('2026-10-08T00:00:00Z'),deleted=[]
  for(const [id,date]of [['fixture_old_123','2026-08-01T00:00:00Z'],['fixture_new_123','2026-10-08T00:00:00Z']]){
    const bytes=encryptDump(Buffer.from(`PGDMP${id}`),key)
    files.set(id,{bytes,etag:'etag-1',metadata:{id,name:`${date.replace(/[-:]/g,'').replace('Z','000Z')}-0123456789abcdef.fnb`,ownedByMe:true,shared:false,parents:[folder],mimeType:'application/octet-stream',version:'1',appProperties:{finntechFormat:'FINNTECH-BACKUP-1',keyFingerprint:sha256(key).slice(0,16),encryptedSha256:sha256(bytes),backupCreatedAt:date}}})
  }
  const drive={token:'fixture',checkFolder:async()=>{},listPrivateArtifacts:async()=>[...files.values()].map(f=>f.metadata),artifactMetadata:async id=>files.get(id),download:async id=>files.get(id).bytes,transport:async(url,options)=>{const id=url.split('/').at(-1);assert.equal(options.headers['If-Match'],files.get(id).etag);deleted.push(id);files.delete(id);throw Error('response lost after commit')}}
  return{key,folder,files,now,deleted,drive}
}
test('Drive retention uses private IDs, hashes and conditional deletion; reconciles lost response and preserves current backup',async()=>{
  const f=fixture(),plan=await planDriveRetention(f.drive,f.folder,f.key,30,f.now)
  assert.equal(plan.entries.length,1)
  assert.deepEqual(await applyDriveRetention(f.drive,plan,f.key,retentionDigest(plan),f.now),{removed:1,alreadyRemoved:0})
  assert.deepEqual(await applyDriveRetention(f.drive,plan,f.key,retentionDigest(plan),f.now),{removed:0,alreadyRemoved:1})
  assert.deepEqual(f.deleted,['fixture_old_123']);assert.ok(f.files.has('fixture_new_123'))
})
test('Drive retention refuses replaced/shared files, missing conditional tokens and loss of current verified copy',async()=>{
  for(const change of ['version','shared','etag','current']){
    const f=fixture(),plan=await planDriveRetention(f.drive,f.folder,f.key,30,f.now),old=f.files.get('fixture_old_123')
    if(change==='version')old.metadata.version='2'
    if(change==='shared')old.metadata.shared=true
    if(change==='etag')old.etag=undefined
    if(change==='current')f.files.delete('fixture_new_123')
    await assert.rejects(applyDriveRetention(f.drive,plan,f.key,retentionDigest(plan),f.now));assert.equal(f.deleted.length,0)
  }
})
