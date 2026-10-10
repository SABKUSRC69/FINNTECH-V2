import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const root='C:/Users/Admin/Downloads/FINNTECH',release=path.join(root,'.student-real-20261008.local/release-source')
const evidence=path.join(root,'docs/acceptance/transient-tiingo-20261010')
const migration='20261010010000_transient_personal_prices'
let db
try{
 process.loadEnvFile(path.join(root,'.student-real-20261008.local/cloud.env'))
 const {readAuthConfiguration}=await import(pathToFileURL(path.join(release,'apps/api/dist/auth/config.js')).href)
 const {createTrackerDatabase}=await import(pathToFileURL(path.join(release,'apps/api/dist/persistence/database.js')).href)
 const {assertRealBoundary}=await import(pathToFileURL(path.join(release,'apps/api/dist/auth/real.js')).href)
 const config=readAuthConfiguration(process.env)
 if(config?.origin!=='https://finntech-personal.onrender.com'||config.real?.boundary!=='real')throw new Error('TARGET_REFUSED')
 db=createTrackerDatabase(config.databaseUrl);await assertRealBoundary(db,config.real,config.origin)
 const counts=async()=>({cash:await db.cashAccount.count(),stockTrades:await db.stockTrade.count(),holdings:await db.stockHolding.count(),cryptoTrades:await db.cryptoTrade.count(),finance:await db.financeTransaction.count(),activeKeys:await db.ownerMarketKey.count({where:{status:'ACTIVE'}}),personalTiingoCaches:await db.dailyClosePrice.count({where:{source:'Tiingo EOD',ownerId:{not:null}}})})
 if(process.argv[2]==='inspect'){
  const applied=await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`
  console.log(JSON.stringify({boundary:'verified',applied:applied.map(r=>r.migration_name),counts:await counts()}))
 }else if(process.argv[2]==='apply'){
  const applied=await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  const names=new Set(applied.map(r=>r.migration_name)),dirs=await fs.readdir(path.join(release,'apps/api/prisma/migrations'),{withFileTypes:true})
  const pending=dirs.filter(r=>r.isDirectory()&&!names.has(r.name)).map(r=>r.name)
  if(pending.some(n=>n!==migration))throw new Error('UNRELATED_PENDING_MIGRATION')
  const before=await counts()
  const cli=spawnSync(process.execPath,[path.join(release,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:path.join(release,'apps/api'),env:process.env,encoding:'utf8',windowsHide:true,timeout:120000})
  if(cli.status!==0)throw new Error('MIGRATION_FAILED')
  const after=await counts()
  if(after.personalTiingoCaches!==0||Object.keys(before).some(k=>k!=='personalTiingoCaches'&&before[k]!==after[k]))throw new Error('ACCOUNTING_COUNT_CHANGED')
  const constraint=await db.$queryRaw`SELECT conname FROM pg_constraint WHERE conname='no_persistent_personal_tiingo'`
  if(constraint.length!==1)throw new Error('CONSTRAINT_MISSING')
  const result={boundary:'verified',migration,before,after,constraint:true}
  await fs.writeFile(path.join(evidence,'migration-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 }else throw new Error('MODE_REQUIRED')
}catch(error){console.error('Database operation failed; credentials and upstream errors withheld. '+(['TARGET_REFUSED','UNRELATED_PENDING_MIGRATION','MIGRATION_FAILED','ACCOUNTING_COUNT_CHANGED','CONSTRAINT_MISSING','MODE_REQUIRED'].includes(error.message)?error.message:'CONNECTION_OR_BOUNDARY_FAILED'));process.exitCode=1}
finally{await db?.$disconnect().catch(()=>{})}
