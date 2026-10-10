import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root='C:/Users/Admin/Downloads/FINNTECH', release=path.join(root,'.student-real-20261008.local/release-source')
const evidence=path.join(root,'docs/acceptance/transient-tiingo-20261010')
const expectedHead='b665285f9b6782dd1ee21fa682c3ee74cef45867'
const git=args=>{const r=spawnSync('git',args,{cwd:release,encoding:'utf8',windowsHide:true});if(r.status)throw new Error('GIT_FAILED');return r.stdout.trim()}
if(git(['rev-parse','HEAD'])!==expectedHead||git(['status','--porcelain'])||git(['remote','get-url','origin'])!=='https://github.com/SABKUSRC69/finntech-beta.git')throw new Error('CLEAN_RELEASE_REQUIRED')
const files=['packages/contracts/src/index.ts','apps/api/src/server.ts','apps/api/src/tracker/routes.ts','apps/api/src/tracker/market-keys.ts','apps/api/src/tracker/transient-closes.ts','apps/api/src/tracker/service.ts','apps/api/prisma/migrations/20261010010000_transient_personal_prices/migration.sql','apps/web/src/tracker/useValuationReferences.ts','apps/web/src/tracker/Assets.tsx','apps/web/src/tracker/StockHoldings.tsx','apps/web/src/tracker/MarketKey.tsx','apps/web/src/tracker/useOwnedWrite.ts']
const sha=b=>createHash('sha256').update(b).digest('hex'),rows=[]
for(const file of files){
 let before=null;try{before=await fs.readFile(path.join(release,file),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 let after=(await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n')
 if(file.endsWith('/service.ts')){
  const helper=after.slice(after.indexOf('/**\n * The stored receipt'),after.indexOf('/** Transaction advisory lock'))
  if(!helper.includes('export async function priorReceipt'))throw new Error('HELPER_REQUIRED')
  after=before.replace(/\r\n/g,'\n').replace('/** Transaction advisory lock',helper+'/** Transaction advisory lock')
 }
 if(file.endsWith('/Assets.tsx')){
  // Preserve the deployed connection-label API; the root contains a separate pending UI refactor.
  const label=before.split(/\r?\n/).find(line=>line.startsWith('export const stockConnectionLabel='))
  if(!label)throw new Error('LABEL_REQUIRED')
  after=after.replace('referenceDateLabel,stockConnectionLabels','referenceDateLabel').replace('const stockPosition=',label+'\nconst stockPosition=').replace('stockConnectionLabels[stockPrices.connection]','stockConnectionLabel(stockPrices.connection)')
 }
 await fs.mkdir(path.dirname(path.join(release,file)),{recursive:true});await fs.writeFile(path.join(release,file),after)
 rows.push({path:file,sha256:sha(after),previousSha256:before===null?null:sha(before.replace(/\r\n/g,'\n'))})
}
await fs.writeFile(path.join(evidence,'release-manifest.json'),JSON.stringify({previousCommit:expectedHead,files:rows},null,2))
console.log(JSON.stringify({prepared:rows.length,new:rows.filter(r=>r.previousSha256===null).map(r=>r.path)}))
