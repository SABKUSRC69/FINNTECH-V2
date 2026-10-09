import{GoogleDriveBackups}from'./real-drive-backup-core.mjs'
try{
 const drive=new GoogleDriveBackups({clientId:process.env.FINNTECH_DRIVE_CLIENT_ID,clientSecret:process.env.FINNTECH_DRIVE_CLIENT_SECRET,refreshToken:process.env.FINNTECH_DRIVE_REFRESH_TOKEN})
 await drive.authenticate();await drive.publishReceipt(process.env.FINNTECH_DRIVE_FOLDER_ID??'',process.env.FINNTECH_DRIVE_RECEIPT_FILE_ID??'',{status:'BACKUP_FAILED',createdAt:new Date().toISOString(),fullRestore:'NOT_TESTED'});drive.token=undefined
 console.log('BACKUP_FAILURE_RECEIPT_PUBLISHED')
}catch{console.error('FAILURE_RECEIPT_UNCONFIRMED; independent watchdog must detect missing receipt');process.exitCode=1}
