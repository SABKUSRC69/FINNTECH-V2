import{readFile,writeFile,lstat}from'node:fs/promises'
import path from'node:path'
import{GoogleDriveBackups}from'./real-drive-backup-core.mjs'
let drive
try{
  const file=process.env.FINNTECH_DRIVE_SETUP_JOURNAL??'',folder=process.env.FINNTECH_DRIVE_FOLDER_ID??'',privacyFolder=process.env.FINNTECH_PRIVACY_DRIVE_FOLDER_ID??''
  if(!path.isAbsolute(file)||process.env.FINNTECH_DRIVE_SETUP_CONFIRM!=='private-existing-folders-only')throw Error()
  drive=new GoogleDriveBackups({clientId:process.env.FINNTECH_DRIVE_CLIENT_ID,clientSecret:process.env.FINNTECH_DRIVE_CLIENT_SECRET,refreshToken:process.env.FINNTECH_DRIVE_REFRESH_TOKEN})
  await drive.authenticate();await drive.preflight(folder,1048576);await drive.checkFolder(privacyFolder)
  if(folder===privacyFolder)throw Error()
  let journal
  try{if((await lstat(file)).isSymbolicLink())throw Error();journal=JSON.parse(await readFile(file,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error
    journal={folder,privacyFolder,receiptId:await drive.reserveId(),registryId:await drive.reserveId()}
    await writeFile(file,JSON.stringify(journal,null,2),{flag:'wx',mode:0o600})}
  if(journal.folder!==folder||journal.privacyFolder!==privacyFolder)throw Error()
  let current=await drive.artifactMetadata(journal.receiptId)
  if(!current){
    try{await drive.api('files?fields=id',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:journal.receiptId,name:'FINNTECH backup receipt',mimeType:'application/json',parents:[folder]})})}catch{}
    current=await drive.artifactMetadata(journal.receiptId)
  }
  const m=current?.metadata
  if(!m?.ownedByMe||m.shared||m.trashed||m.parents?.length!==1||m.parents[0]!==folder||m.mimeType!=='application/json')throw Error()
  console.log('PASS: private folder/quota checked, receipt created/reconciled, registry ID reserved in private setup journal; no successful backup claimed')
}catch{console.error('FAIL: private Drive setup unconfirmed; retain original setup journal; details withheld');process.exitCode=1}
finally{if(drive)drive.token=undefined}
