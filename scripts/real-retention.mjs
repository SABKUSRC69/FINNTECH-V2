import {readdir,readFile,lstat,realpath,unlink} from 'node:fs/promises'
import path from 'node:path'
import {sha256,decryptDump,backupLimits} from './real-backup-core.mjs'

const namePattern=/^\d{8}T\d{9}Z-[a-f0-9]{16}\.fnb$/
export const retentionDigest = plan => sha256(JSON.stringify(plan))
function policy(days,now){if(!Number.isInteger(days)||days<7||days>90||!Number.isFinite(now.getTime()))throw new Error('RETENTION_POLICY_REJECTED');return new Date(now.getTime()-days*86400000).toISOString()}
function acceptedReceipt(receipt,hash,fingerprint){return receipt?.format===backupLimits.format&&receipt.status==='ENCRYPTED_AND_VERIFIED'&&receipt.encryptedSha256===hash&&receipt.keyFingerprint===fingerprint&&Number.isFinite(Date.parse(receipt.createdAt))}
async function rootDirectory(directory){if(!path.isAbsolute(directory)||(await lstat(directory)).isSymbolicLink())throw new Error('RETENTION_PATH_REJECTED');return realpath(directory)}
export async function planLocalRetention(directory,key,days=30,now=new Date()) {
  const root=await rootDirectory(directory),cutoff=policy(days,now),fingerprint=sha256(key).slice(0,16),entries=[],keep=[]
  const names=await readdir(root);if(names.length>10000)throw new Error('RETENTION_INVENTORY_LIMIT')
  for(const name of names.filter(name=>namePattern.test(name))){
    const file=path.join(root,name),sidecar=`${file}.json`
    if((await lstat(file)).isSymbolicLink()||(await lstat(sidecar)).isSymbolicLink())throw new Error('RETENTION_PATH_REJECTED')
    const bytes=await readFile(file),raw=await readFile(sidecar),receipt=JSON.parse(raw.toString('utf8')),hash=sha256(bytes)
    if(!acceptedReceipt(receipt,hash,fingerprint))continue
    const decoded=decryptDump(bytes,key);decoded.fill(0)
    const entry={name,archiveSha256:hash,receiptSha256:sha256(raw),createdAt:receipt.createdAt}
    ;(Date.parse(receipt.createdAt)<Date.parse(cutoff)?entries:keep).push(entry)
  }
  if(entries.length&&!keep.length)throw new Error('RETENTION_REQUIRES_CURRENT_VERIFIED_BACKUP')
  return {format:'FINNTECH-RETENTION-1',scope:'local',root,keyFingerprint:fingerprint,createdAt:now.toISOString(),retentionDays:days,cutoff,entries,keep:keep.map(row=>row.name)}
}
export async function applyLocalRetention(plan,key,approval,now=new Date()) {
  if(retentionDigest(plan)!==approval||plan.format!=='FINNTECH-RETENTION-1'||plan.scope!=='local'||plan.keyFingerprint!==sha256(key).slice(0,16)
    || now.getTime()-Date.parse(plan.createdAt)>86400000||now.getTime()<Date.parse(plan.createdAt)||policy(plan.retentionDays,new Date(plan.createdAt))!==plan.cutoff)throw new Error('RETENTION_APPROVAL_REJECTED')
  const root=await rootDirectory(plan.root);if(root!==plan.root)throw new Error('RETENTION_PATH_REJECTED')
  const refreshed=await planLocalRetention(root,key,plan.retentionDays,new Date(plan.createdAt))
  if(plan.entries.length&&!refreshed.keep.some(name=>plan.keep.includes(name)))throw new Error('RETENTION_REQUIRES_CURRENT_VERIFIED_BACKUP')
  let removed=0,alreadyRemoved=0
  for(const entry of plan.entries){
    if(!namePattern.test(entry.name)||!Number.isFinite(Date.parse(entry.createdAt))||Date.parse(entry.createdAt)>=Date.parse(plan.cutoff))throw new Error('RETENTION_ENTRY_REJECTED')
    const file=path.join(root,entry.name),sidecar=`${file}.json`
    let bytes
    try{if((await lstat(file)).isSymbolicLink())throw new Error('RETENTION_PATH_REJECTED');bytes=await readFile(file)}catch(error){if(error.code!=='ENOENT')throw error}
    let raw
    try{if((await lstat(sidecar)).isSymbolicLink())throw new Error('RETENTION_PATH_REJECTED');raw=await readFile(sidecar)}catch(error){if(error.code!=='ENOENT')throw error}
    if(raw&&sha256(raw)!==entry.receiptSha256)throw new Error('RETENTION_CHANGED_SINCE_REVIEW')
    if(bytes){if(!raw||sha256(bytes)!==entry.archiveSha256)throw new Error('RETENTION_CHANGED_SINCE_REVIEW');const decoded=decryptDump(bytes,key);decoded.fill(0);await unlink(file);removed++}
    else alreadyRemoved++
    if(raw)await unlink(sidecar)
  }
  return {removed,alreadyRemoved}
}
function recognized(file,folder,fingerprint) {
  return file?.ownedByMe&&!file.shared&&!file.trashed&&file.parents?.length===1&&file.parents[0]===folder
    &&file.mimeType==='application/octet-stream'&&namePattern.test(file.name??'')&&file.appProperties?.finntechFormat===backupLimits.format
    &&file.appProperties.keyFingerprint===fingerprint&&/^[a-f0-9]{64}$/.test(file.appProperties.encryptedSha256??'')
    &&Number.isFinite(Date.parse(file.appProperties.backupCreatedAt))
}
export async function planDriveRetention(drive,folder,key,days=30,now=new Date()) {
  const cutoff=policy(days,now),fingerprint=sha256(key).slice(0,16),entries=[],keep=[]
  for(const file of await drive.listPrivateArtifacts(folder,backupLimits.format)) {
    if(!recognized(file,folder,fingerprint))continue
    const entry={id:file.id,name:file.name,archiveSha256:file.appProperties.encryptedSha256,createdAt:file.appProperties.backupCreatedAt,version:file.version}
    if(Date.parse(entry.createdAt)>=Date.parse(cutoff)){keep.push(entry.id);continue}
    if(entries.length>=100)throw new Error('RETENTION_BATCH_LIMIT')
    const bytes=await drive.download(file.id);if(sha256(bytes)!==entry.archiveSha256)throw new Error('RETENTION_ARCHIVE_MISMATCH')
    const decoded=decryptDump(bytes,key);decoded.fill(0);entries.push(entry)
  }
  if(entries.length&&!keep.length)throw new Error('RETENTION_REQUIRES_CURRENT_VERIFIED_BACKUP')
  return {format:'FINNTECH-RETENTION-1',scope:'drive',folder,keyFingerprint:fingerprint,createdAt:now.toISOString(),retentionDays:days,cutoff,entries,keep}
}
export async function applyDriveRetention(drive,plan,key,approval,now=new Date()) {
  if(retentionDigest(plan)!==approval||plan.format!=='FINNTECH-RETENTION-1'||plan.scope!=='drive'||plan.keyFingerprint!==sha256(key).slice(0,16)
    ||now.getTime()<Date.parse(plan.createdAt)||now.getTime()-Date.parse(plan.createdAt)>86400000||policy(plan.retentionDays,new Date(plan.createdAt))!==plan.cutoff)throw new Error('RETENTION_APPROVAL_REJECTED')
  await drive.checkFolder(plan.folder);let removed=0,alreadyRemoved=0
  let verifiedCurrent=false
  for(const id of plan.keep){
    const current=await drive.artifactMetadata(id),file=current?.metadata
    if(!recognized(file,plan.folder,plan.keyFingerprint)||Date.parse(file.appProperties.backupCreatedAt)<Date.parse(plan.cutoff))continue
    const bytes=await drive.download(id)
    if(sha256(bytes)!==file.appProperties.encryptedSha256)throw new Error('RETENTION_ARCHIVE_MISMATCH')
    decryptDump(bytes,key).fill(0);verifiedCurrent=true;break
  }
  if(plan.entries.length&&!verifiedCurrent)throw new Error('RETENTION_REQUIRES_CURRENT_VERIFIED_BACKUP')
  for(const entry of plan.entries){
    if(!/^[A-Za-z0-9_-]{10,200}$/.test(entry.id)||!namePattern.test(entry.name)||!Number.isFinite(Date.parse(entry.createdAt))||Date.parse(entry.createdAt)>=Date.parse(plan.cutoff))throw new Error('RETENTION_ENTRY_REJECTED')
    const current=await drive.artifactMetadata(entry.id)
    if(!current){alreadyRemoved++;continue}
    const file=current.metadata
    if(!recognized(file,plan.folder,plan.keyFingerprint)||file.name!==entry.name||file.version!==entry.version||file.appProperties.encryptedSha256!==entry.archiveSha256||file.appProperties.backupCreatedAt!==entry.createdAt)throw new Error('RETENTION_CHANGED_SINCE_REVIEW')
    const bytes=await drive.download(entry.id);if(sha256(bytes)!==entry.archiveSha256)throw new Error('RETENTION_ARCHIVE_MISMATCH')
    const decoded=decryptDump(bytes,key);decoded.fill(0)
    // Require a provider conditional-write token; unsupported endpoints fail closed.
    if(!current.etag)throw new Error('DRIVE_CONDITIONAL_DELETE_UNAVAILABLE')
    try {
      const response=await drive.transport(`https://www.googleapis.com/drive/v3/files/${entry.id}`,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${drive.token}`,'If-Match':current.etag}})
      void response.body?.cancel();if(response.status!==204&&response.status!==404)throw new Error('DELETE_UNCONFIRMED')
    } catch {if(await drive.artifactMetadata(entry.id))throw new Error('RETENTION_DELETE_UNCONFIRMED')}
    if(await drive.artifactMetadata(entry.id))throw new Error('RETENTION_DELETE_UNCONFIRMED')
    removed++
  }
  return {removed,alreadyRemoved}
}
