import { sha256, backupLimits } from './real-backup-core.mjs'

const fileId = /^[A-Za-z0-9_-]{10,200}$/
export class GoogleDriveBackups {
  constructor(settings, transport = fetch) { this.settings = settings; this.transport = transport; this.token = undefined }
  async responseBytes(response, maximum = 32768) {
    const reader = response.body?.getReader(); if (!reader) throw new Error('DRIVE_RESPONSE_REJECTED')
    const chunks = []; let size = 0
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > maximum) throw new Error('DRIVE_RESPONSE_LIMIT'); chunks.push(chunk.value) } }
    finally { void reader.cancel().catch(() => {}) }
    return Buffer.concat(chunks)
  }
  async authenticate() {
    const { clientId, clientSecret, refreshToken } = this.settings
    if (!clientId || !clientSecret || !refreshToken) throw new Error('DRIVE_OWNER_AUTHORIZATION_REQUIRED')
    try {
      const response = await this.transport('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString() })
      if (!response.ok) throw new Error('refresh_failed')
      const result = JSON.parse((await this.responseBytes(response)).toString('utf8'))
      if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('refresh_failed')
      this.token = result.access_token
    } catch { throw new Error('DRIVE_OWNER_AUTHORIZATION_REQUIRED') }
  }
  async api(endpoint, options = {}) {
    if (!this.token) throw new Error('DRIVE_OWNER_AUTHORIZATION_REQUIRED')
    const response = await this.transport(`https://www.googleapis.com/drive/v3/${endpoint}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { ...options.headers, authorization: `Bearer ${this.token}` } })
    if (!response.ok) { void response.body?.cancel(); throw new Error('DRIVE_REQUEST_UNCONFIRMED') }
    return JSON.parse((await this.responseBytes(response)).toString('utf8'))
  }
  async checkFolder(folder) {
    if (!fileId.test(folder)) throw new Error('DRIVE_TARGET_REJECTED')
    const info = await this.api(`files/${folder}?fields=id,mimeType,trashed,ownedByMe,shared,capabilities(canAddChildren)`)
    if (info.id !== folder || info.mimeType !== 'application/vnd.google-apps.folder' || info.trashed || !info.ownedByMe || info.shared || !info.capabilities?.canAddChildren) throw new Error('DRIVE_PRIVATE_FOLDER_REQUIRED')
  }
  async preflight(folder, bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > backupLimits.maximum + 64) throw new Error('DRIVE_TARGET_REJECTED')
    await this.checkFolder(folder)
    const about = await this.api('about?fields=storageQuota')
    const quota = about.storageQuota
    if (!/^\d+$/.test(quota?.limit ?? '') || !/^\d+$/.test(quota?.usage ?? '') || BigInt(quota.limit) - BigInt(quota.usage) < BigInt(bytes) + 1048576n) throw new Error('DRIVE_QUOTA_UNCONFIRMED_OR_FULL')
    return { remainingBytes: (BigInt(quota.limit) - BigInt(quota.usage)).toString(), privateFolder: true }
  }
  async reserveId() {
    const response = await this.api('files/generateIds?count=1&space=drive&type=files')
    const id = response.ids?.[0]; if (typeof id !== 'string' || !fileId.test(id)) throw new Error('DRIVE_RESERVATION_FAILED')
    return id
  }
  async download(id, maximum = backupLimits.maximum + 64) {
    if (!this.token || !fileId.test(id)) throw new Error('DRIVE_TARGET_REJECTED')
    const response = await this.transport(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { redirect: 'error', signal: AbortSignal.timeout(120000), headers: { authorization: `Bearer ${this.token}` } })
    if (!response.ok) { void response.body?.cancel(); throw new Error('DRIVE_DOWNLOAD_UNCONFIRMED') }
    return this.responseBytes(response, maximum)
  }
  async publishReceipt(folder, id, receipt) {
    if (!fileId.test(id) || !fileId.test(folder) || !['ENCRYPTED_AND_VERIFIED','BACKUP_FAILED'].includes(receipt.status) || !receipt.createdAt) throw new Error('DRIVE_RECEIPT_REJECTED')
    const metadata = await this.api(`files/${id}?fields=id,parents,ownedByMe,shared,trashed,mimeType`)
    if (metadata.id !== id || !metadata.ownedByMe || metadata.shared || metadata.trashed || metadata.mimeType !== 'application/json'
      || metadata.parents?.length !== 1 || metadata.parents[0] !== folder) throw new Error('DRIVE_PRIVATE_RECEIPT_REQUIRED')
    const bytes = Buffer.from(JSON.stringify({ status: receipt.status, createdAt: receipt.createdAt, encryptedSha256: receipt.encryptedSha256, offDeviceCopy: receipt.status==='BACKUP_FAILED'?'NOT_CONFIRMED':'DOWNLOADED_AND_AUTHENTICATED', fullRestore: receipt.fullRestore }))
    const response = await this.transport(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: bytes })
    void response.body?.cancel()
    if (!response.ok || !bytes.equals(await this.download(id, 4096))) throw new Error('DRIVE_RECEIPT_UNCONFIRMED')
  }
  async uploadEncrypted(folder, id, name, archive, receipt = {}) {
    const properties = receipt.createdAt && receipt.keyFingerprint ? { backupCreatedAt:receipt.createdAt, keyFingerprint:receipt.keyFingerprint } : {}
    return this.uploadPrivateArtifact(folder,id,name,archive,'FINNTECH-BACKUP-1',properties)
  }
  async uploadPrivateArtifact(folder,id,name,archive,format,properties={}) {
    const magic = Buffer.from(`${format}\n`)
    const accepted = format==='FINNTECH-BACKUP-1' ? /^[A-Za-z0-9TZ._-]+\.fnb$/.test(name)
      : format==='FINNTECH-DELETION-1' && /^[a-f0-9-]{36}\.fnd$/.test(name)
        || format==='FINNTECH-REGISTRY-1' && /^[a-f0-9-]{36}\.fnr$/.test(name)
    if (!fileId.test(id) || !accepted || !archive.subarray(0, magic.length).equals(magic)) throw new Error('DRIVE_ENCRYPTED_ARCHIVE_REQUIRED')
    if(Object.keys(properties).some(key=>!['backupCreatedAt','keyFingerprint','datasetId'].includes(key)))throw new Error('DRIVE_METADATA_REJECTED')
    await this.preflight(folder, archive.length)
    const hash = sha256(archive)
    try {
      const response = await this.transport('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(archive.length) },
        body: JSON.stringify({ id, name, mimeType: 'application/octet-stream', parents: [folder], appProperties: { ...properties, finntechFormat: format, encryptedSha256: hash } }) })
      if (!response.ok) throw new Error('upload_unconfirmed')
      const location = new URL(response.headers.get('location'))
      void response.body?.cancel()
      if (location.origin !== 'https://www.googleapis.com' || !location.pathname.startsWith('/upload/drive/v3/files')) throw new Error('upload_redirect_rejected')
      const upload = await this.transport(location.href, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/octet-stream' }, body: archive })
      void upload.body?.cancel(); if (!upload.ok) throw new Error('upload_unconfirmed')
    } catch {
      // A lost upload response may still have committed. Check the reserved SAME file ID.
      // The caller journals the ID before upload; reruns never invent another ID.
    }
    const metadata = await this.api(`files/${id}?fields=id,name,mimeType,parents,ownedByMe,shared,trashed,appProperties`)
    if (metadata.id !== id || !metadata.ownedByMe || metadata.shared || metadata.trashed || metadata.parents?.length !== 1 || metadata.parents[0] !== folder || metadata.appProperties?.encryptedSha256 !== hash) throw new Error('DRIVE_UPLOAD_UNCONFIRMED')
    if(metadata.name!==name||metadata.mimeType!=='application/octet-stream'||metadata.appProperties.finntechFormat!==format
      ||Object.entries(properties).some(([key,value])=>metadata.appProperties[key]!==value))throw new Error('DRIVE_METADATA_MISMATCH')
    const downloaded = await this.download(id)
    if (sha256(downloaded) !== hash) throw new Error('DRIVE_ROUND_TRIP_MISMATCH')
    return { id, encryptedSha256: hash, downloadedBytes: downloaded.length }
  }
  async listPrivateArtifacts(folder,format) {
    await this.checkFolder(folder)
    if(!['FINNTECH-BACKUP-1','FINNTECH-DELETION-1'].includes(format))throw new Error('DRIVE_FORMAT_REJECTED')
    const files=[];let pageToken
    for(let page=0;page<100;page++) {
      const query=new URLSearchParams({q:`'${folder}' in parents and trashed = false and appProperties has { key='finntechFormat' and value='${format}' }`,pageSize:'100',fields:'nextPageToken,files(id,name,parents,ownedByMe,shared,trashed,mimeType,appProperties,version,createdTime)'})
      if(pageToken)query.set('pageToken',pageToken)
      const response=await this.api(`files?${query}`)
      if(!Array.isArray(response.files))throw new Error('DRIVE_INVENTORY_REJECTED')
      files.push(...response.files);pageToken=response.nextPageToken
      if(!pageToken)return files
    }
    throw new Error('DRIVE_INVENTORY_LIMIT')
  }
  async replaceRegistry(id,etag,bytes){
    if(!fileId.test(id)||!etag||!bytes.subarray(0,Buffer.byteLength('FINNTECH-REGISTRY-1\n')).equals(Buffer.from('FINNTECH-REGISTRY-1\n'))||bytes.length>1048576)throw new Error('REGISTRY_UPDATE_REJECTED')
    const response=await this.transport(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,{method:'PATCH',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${this.token}`,'content-type':'application/octet-stream','If-Match':etag},body:bytes})
    void response.body?.cancel();if(!response.ok)throw new Error('REGISTRY_UPDATE_UNCONFIRMED')
  }
  async artifactMetadata(id) {
    if(!this.token || !fileId.test(id))throw new Error('DRIVE_TARGET_REJECTED')
    const response=await this.transport(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,parents,ownedByMe,shared,trashed,mimeType,appProperties,version`,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${this.token}`}})
    if(response.status===404){void response.body?.cancel();return undefined}
    if(!response.ok){void response.body?.cancel();throw new Error('DRIVE_METADATA_UNCONFIRMED')}
    return {metadata:JSON.parse((await this.responseBytes(response)).toString('utf8')),etag:response.headers.get('etag')}
  }
}
