import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {sha256} from './real-backup-core.mjs'
const magic=Buffer.from('FINNTECH-DELETION-1\n'), uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function validate(record) {
  if(!record || Object.keys(record).sort().join(',')!=='caseId,datasetId,ownerId,requestedAt,userId'
    || !['caseId','datasetId','ownerId','userId'].every(key=>uuid.test(record[key]))
    || !Number.isFinite(Date.parse(record.requestedAt)))throw new Error('DELETION_RECORD_REJECTED')
  return record
}
export function sealDeletion(record,key) {
  validate(record);if(key.length!==32)throw new Error('DELETION_KEY_REJECTED')
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic)
  return Buffer.concat([magic,iv,cipher.update(JSON.stringify(record)),cipher.final(),cipher.getAuthTag()])
}
export function openDeletion(bytes,key,datasetId) {
  try {
    if(bytes.length>8192||!bytes.subarray(0,magic.length).equals(magic)||key.length!==32)throw Error()
    const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(magic.length,magic.length+12));cipher.setAAD(magic);cipher.setAuthTag(bytes.subarray(-16))
    const value=validate(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(magic.length+12,-16)),cipher.final()]).toString('utf8')))
    if(value.datasetId!==datasetId)throw Error();return value
  } catch {throw new Error('DELETION_ARCHIVE_AUTHENTICATION_FAILED')}
}
const registryMagic=Buffer.from('FINNTECH-REGISTRY-1\n')
export function sealRegistry(record,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(registryMagic)
  return Buffer.concat([registryMagic,iv,cipher.update(JSON.stringify(record)),cipher.final(),cipher.getAuthTag()])
}
function openRegistry(bytes,key,datasetId){
  try{
    if(bytes.length>1048576||!bytes.subarray(0,registryMagic.length).equals(registryMagic))throw Error()
    const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(registryMagic.length,registryMagic.length+12));cipher.setAAD(registryMagic);cipher.setAuthTag(bytes.subarray(-16))
    const record=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(registryMagic.length+12,-16)),cipher.final()]).toString())
    if(record.datasetId!==datasetId||!Array.isArray(record.entries)||record.entries.length>10000||new Set(record.entries.map(row=>row.id)).size!==record.entries.length
      ||record.entries.some(row=>!/^[A-Za-z0-9_-]{10,200}$/.test(row.id)||!/^[a-f0-9]{64}$/.test(row.hash)))throw Error()
    return record
  }catch{throw new Error('PRIVACY_REGISTRY_AUTHENTICATION_FAILED')}
}
export async function verifyPrivacyRegistry(drive,folder,key,datasetId,anchorId) {
  const current=await drive.artifactMetadata(anchorId)
  const file=current?.metadata
  if(!file||!file.ownedByMe||file.shared||file.trashed||file.parents?.length!==1||file.parents[0]!==folder
    ||file.name!==`${datasetId}.fnr`||file.appProperties?.finntechFormat!=='FINNTECH-REGISTRY-1')throw new Error('PRIVACY_REGISTRY_REQUIRED')
  const bytes=await drive.download(anchorId,1048576)
  return {record:openRegistry(bytes,key,datasetId),etag:current.etag}
}
async function appendRegistry(drive,folder,key,datasetId,anchorId,entry){
  for(let attempt=0;attempt<3;attempt++){
    const {record,etag}=await verifyPrivacyRegistry(drive,folder,key,datasetId,anchorId)
    const existing=record.entries.find(row=>row.id===entry.id)
    if(existing){if(existing.hash!==entry.hash)throw new Error('REGISTRY_ORIGINAL_BYTES_REQUIRED');return}
    if(!etag)throw new Error('REGISTRY_CONDITIONAL_UPDATE_REQUIRED')
    try{await drive.replaceRegistry(anchorId,etag,sealRegistry({...record,entries:[...record.entries,entry]},key))}catch{}
    const updated=await verifyPrivacyRegistry(drive,folder,key,datasetId,anchorId)
    if(updated.record.entries.some(row=>row.id===entry.id&&row.hash===entry.hash))return
  }
  throw new Error('REGISTRY_APPEND_UNCONFIRMED')
}
export async function publishAndPurge(db,drive,folder,key,caseId,anchorId) {
  const boundary=await db.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
  await verifyPrivacyRegistry(drive,folder,key,boundary.datasetId,anchorId)
  // Serialize operator runs without holding a transaction across the external upload.
  // The original file ID AND random ciphertext are durable before the first send.
  const reserved=await db.$transaction(async tx=>{
    const lock=`privacy-case:${caseId}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))::text`
    const marker=await tx.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
    const row=await tx.accountDeletionCase.findUniqueOrThrow({where:{id:caseId}})
    const record={caseId:row.id,datasetId:marker.datasetId,ownerId:row.ownerId,userId:row.userId,requestedAt:row.requestedAt.toISOString()}
    if(!row.archiveId){const fileId=await drive.reserveId(),envelope=sealDeletion(record,key).toString('base64')
      await tx.$executeRaw`SELECT tracker_case_archive(${row.id}::uuid,${fileId}::text,NULL::text,${envelope}::text)`
      return {fileId,bytes:Buffer.from(envelope,'base64'),record}
    }
    if(!row.archiveEnvelope)throw new Error('ORIGINAL_DELETION_ENVELOPE_REQUIRED')
    return {fileId:row.archiveId,bytes:Buffer.from(row.archiveEnvelope,'base64'),record}
  },{timeout:15000})
  if(JSON.stringify(openDeletion(reserved.bytes,key,reserved.record.datasetId))!==JSON.stringify(reserved.record))throw new Error('DELETION_CASE_MISMATCH')
  const result=await drive.uploadPrivateArtifact(folder,reserved.fileId,`${caseId}.fnd`,reserved.bytes,'FINNTECH-DELETION-1',{datasetId:reserved.record.datasetId})
  const downloaded=await drive.download(result.id,8192)
  if(sha256(downloaded)!==sha256(reserved.bytes))throw new Error('DELETION_ARCHIVE_UNCONFIRMED')
  openDeletion(downloaded,key,reserved.record.datasetId)
  // The independently stored authenticated index must include the case before purge.
  await appendRegistry(drive,folder,key,reserved.record.datasetId,anchorId,{id:result.id,hash:sha256(downloaded)})
  await db.$executeRaw`SELECT tracker_case_archive(${caseId}::uuid,${result.id}::text,${result.encryptedSha256}::text,NULL::text)`
  const rows=await db.$queryRaw`SELECT tracker_purge_owner_case(${caseId}::uuid) AS status`
  if(rows[0]?.status!=='PURGED')throw new Error('PURGE_UNCONFIRMED')
  return {status:'PURGED',caseId,offDeviceReceipt:'DOWNLOADED_AND_AUTHENTICATED'}
}
export async function replayOffDeviceDeletions(db,drive,folder,key,anchorId) {
  const marker=await db.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
  const current=await db.$queryRaw`SELECT current_database() AS name`
  if(current[0]?.name===marker.databaseName)throw new Error('FRESH_ISOLATED_RESTORE_REQUIRED')
  const registry=await verifyPrivacyRegistry(drive,folder,key,marker.datasetId,anchorId)
  const files=await drive.listPrivateArtifacts(folder,'FINNTECH-DELETION-1'), hashes=[]
  // Validate the entire inventory before mutating anything. Unknown/corrupt files fail closed.
  const records=[]
  for(const file of files){
    if(file.appProperties?.datasetId!==marker.datasetId)continue
    if(!file.ownedByMe||file.shared||file.trashed||file.parents?.length!==1||file.parents[0]!==folder||file.mimeType!=='application/octet-stream')throw new Error('PRIVATE_DELETION_ARCHIVE_REQUIRED')
    const bytes=await drive.download(file.id,8192),hash=sha256(bytes),record=openDeletion(bytes,key,marker.datasetId)
    if(file.name!==`${record.caseId}.fnd`||file.appProperties.encryptedSha256!==hash)throw new Error('DELETION_ARCHIVE_MISMATCH')
    hashes.push(`${file.id}:${hash}`);records.push({record,id:file.id,hash})
  }
  const ledgerHash=sha256(hashes.sort().join('\n'))
  if(sha256(registry.record.entries.map(row=>`${row.id}:${row.hash}`).sort().join('\n'))!==ledgerHash)throw new Error('INCOMPLETE_DELETION_INVENTORY')
  const latest=await verifyPrivacyRegistry(drive,folder,key,marker.datasetId,anchorId)
  if(JSON.stringify(latest.record)!==JSON.stringify(registry.record))throw new Error('DELETION_REGISTRY_CHANGED_RETRY')
  await db.$transaction(async tx=>{
    for(const {record:r,id,hash} of records)await tx.$queryRaw`SELECT tracker_replay_deletion(${r.caseId}::uuid,${r.ownerId}::uuid,${r.userId}::uuid,${new Date(r.requestedAt)}::timestamptz,${id}::text,${hash}::text)`
    await tx.$executeRaw`SELECT tracker_record_restore(${marker.datasetId}::uuid,${ledgerHash}::text)`
  },{timeout:60000})
  return {status:'REPLAYED',cases:records.length,ledgerSha256:ledgerHash,publicActivation:'NOT_AUTHORIZED'}
}
