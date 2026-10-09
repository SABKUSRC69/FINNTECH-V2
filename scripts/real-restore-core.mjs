export async function rebindRestoredDatabase(db,config,dataset,digest){
  if(!config.real||config.real.registrationsOpen||!config.real.stagingEmails?.size||!/^[a-f0-9]{64}$/.test(digest)||!/^[a-f0-9-]{36}$/.test(dataset))throw new Error('RESTORE_APPROVAL_REJECTED')
  await db.$transaction(async tx=>{
    const current=await tx.$queryRaw`SELECT current_database() AS name,current_user AS role`
    const marker=await tx.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
    const receipts=await tx.$queryRaw`SELECT * FROM privacy_restore_receipts WHERE dataset_id=${dataset}::uuid AND ledger_sha256=${digest} AND applied_at>now()-interval '1 hour'`
    if(current[0]?.name!==config.real.databaseName||current[0]?.role!==config.real.databaseRole||marker.databaseName===current[0].name||marker.mode!==config.real.boundary||marker.datasetId!==dataset||receipts.length!==1||await tx.accountDeletionCase.count({where:{status:{not:'PURGED'}}})||await tx.demoWorkspace.count()||await tx.legacyImport.count())throw new Error('RESTORE_BOUNDARY_REJECTED')
    await tx.authSession.deleteMany();await tx.authVerification.deleteMany()
    await tx.authDeliveryJob.updateMany({data:{status:'EXPIRED',envelope:'',reason:'RESTORE_REAUTH_REQUIRED'}})
    await tx.runtimeBoundary.update({where:{id:'singleton'},data:{databaseName:config.real.databaseName,databaseRole:config.real.databaseRole,origin:config.origin}})
  })
}
