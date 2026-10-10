import fs from 'node:fs/promises'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const root='C:/Users/Admin/Downloads/FINNTECH',release=path.join(root,'.student-real-20261008.local/release-source'),evidence=path.join(root,'docs/acceptance/cash-linked-assets-20261010')
const migration='20261010040000_link_cash_settlements'
let db
try {
 process.loadEnvFile(path.join(root,'.student-real-20261008.local/cloud.env'))
 const {readAuthConfiguration}=await import(pathToFileURL(path.join(release,'apps/api/dist/auth/config.js')).href)
 const {createTrackerDatabase}=await import(pathToFileURL(path.join(release,'apps/api/dist/persistence/database.js')).href)
 const {assertRealBoundary}=await import(pathToFileURL(path.join(release,'apps/api/dist/auth/real.js')).href)
 const config=readAuthConfiguration(process.env)
 if(config?.origin!=='https://finntech-personal.onrender.com'||config.real?.boundary!=='real')throw new Error('TARGET_REFUSED')
 db=createTrackerDatabase(config.databaseUrl);await assertRealBoundary(db,config.real,config.origin)
 const counts=async()=>({cash:await db.cashAccount.count(),stockTrades:await db.stockTrade.count(),holdings:await db.stockHolding.count(),cryptoTrades:await db.cryptoTrade.count(),finance:await db.financeTransaction.count(),activeKeys:await db.ownerMarketKey.count({where:{status:'ACTIVE'}}),personalTiingoCaches:await db.dailyClosePrice.count({where:{source:'Tiingo EOD',ownerId:{not:null}}})})
 const cashDigest=async()=>createHash('sha256').update(JSON.stringify(await db.cashAccount.findMany({select:{id:true,balance:true,asOf:true,version:true},orderBy:{id:'asc'}}))).digest('hex')
 const applied=await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
 const names=new Set(applied.map(r=>r.migration_name)),dirs=await fs.readdir(path.join(release,'apps/api/prisma/migrations'),{withFileTypes:true})
 const pending=dirs.filter(r=>r.isDirectory()&&!names.has(r.name)).map(r=>r.name)
 if(pending.some(n=>n!==migration))throw new Error('UNRELATED_PENDING_MIGRATION')
 if(process.argv[2]==='inspect')console.log(JSON.stringify({boundary:'verified',pending,counts:await counts()}))
 else if(process.argv[2]==='apply') {
  const before=await counts(),beforeCash=await cashDigest()
  const cli=spawnSync(process.execPath,[path.join(release,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:path.join(release,'apps/api'),env:process.env,encoding:'utf8',windowsHide:true,timeout:120000})
  if(cli.status!==0)throw new Error('MIGRATION_FAILED')
  const after=await counts(),unchangedCash=beforeCash===await cashDigest()
  if(!unchangedCash||Object.keys(before).some(k=>before[k]!==after[k]))throw new Error('ACCOUNTING_CHANGED')
  const constraints=await db.$queryRaw`SELECT conname FROM pg_constraint WHERE conname IN ('finance_transactions_owner_id_cash_account_id_fkey','crypto_trades_owner_id_cash_account_id_fkey','stock_trades_owner_id_cash_account_id_fkey','crypto_trades_cash_settlement_check','stock_trades_cash_settlement_check')`
  if(constraints.length!==5)throw new Error('CONSTRAINT_MISSING')
  const links=await Promise.all([db.financeTransaction.count({where:{cashAccountId:{not:null}}}),db.cryptoTrade.count({where:{cashAccountId:{not:null}}}),db.stockTrade.count({where:{cashAccountId:{not:null}}})])
  const result={boundary:'verified',migration,before,after,cashUnchanged:unchangedCash,constraints:5,linkedRecords:links}
  await fs.writeFile(path.join(evidence,'migration-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 } else throw new Error('MODE_REQUIRED')
} catch(error) {
 const safe=['TARGET_REFUSED','UNRELATED_PENDING_MIGRATION','MIGRATION_FAILED','ACCOUNTING_CHANGED','CONSTRAINT_MISSING','MODE_REQUIRED']
 console.error('Database operation failed; secrets withheld. '+(safe.includes(error.message)?error.message:'CONNECTION_OR_BOUNDARY_FAILED'));process.exitCode=1
} finally {await db?.$disconnect().catch(()=>{})}
