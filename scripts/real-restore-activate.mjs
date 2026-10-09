import{rebindRestoredDatabase}from'./real-restore-core.mjs'
import{readAuthConfiguration}from'../apps/api/dist/auth/config.js'
import{createTrackerDatabase}from'../apps/api/dist/persistence/database.js'
let db
try{
  const config=readAuthConfiguration(process.env)
  if(config?.real?.boundary!=='real'||config.real.registrationsOpen||!config.real.stagingEmails?.size||process.env.FINNTECH_RESTORE_ACTIVATION_CONFIRM!=='reviewed-staging-only')throw Error()
  const digest=process.env.FINNTECH_RESTORE_LEDGER_SHA256??'',dataset=process.env.FINNTECH_RESTORE_DATASET_ID??''
  if(!/^[a-f0-9]{64}$/.test(digest)||!/^[a-f0-9-]{36}$/.test(dataset))throw Error()
  db=createTrackerDatabase(config.databaseUrl)
  await rebindRestoredDatabase(db,config,dataset,digest)
  console.log('PASS: isolated restored target rebound to closed staging; fresh login required; public activation not authorized')
}catch{console.error('FAIL: restore activation refused; target remains unconfirmed; details withheld');process.exitCode=1}
finally{await db?.$disconnect()}
