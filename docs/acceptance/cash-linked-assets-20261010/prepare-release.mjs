import fs from 'node:fs/promises'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const root='C:/Users/Admin/Downloads/FINNTECH',release=path.join(root,'.student-real-20261008.local/release-source'),evidence=path.join(root,'docs/acceptance/cash-linked-assets-20261010')
const files=['packages/contracts/src/index.ts','apps/api/prisma/schema.prisma','apps/api/prisma/migrations/20261010040000_link_cash_settlements/migration.sql','apps/api/src/tracker/cash-links.ts','apps/api/src/tracker/service.ts','apps/api/src/tracker/stock-ledger.ts','apps/api/src/tracker/backup.ts','apps/web/src/tracker/CashSettlementFields.tsx','apps/web/src/tracker/HeldAssets.tsx','apps/web/src/tracker/Dashboard.tsx','apps/web/src/tracker/FinanceHistory.tsx','apps/web/src/tracker/StockHoldings.tsx','apps/web/src/tracker/Assets.tsx','apps/web/src/tracker/ValuationReferences.tsx','apps/web/src/tracker/client.ts','apps/web/src/journal.css']
const git=args=>{const r=spawnSync('git',args,{cwd:release,encoding:'utf8',windowsHide:true,maxBuffer:64e6});if(r.status!==0)throw new Error('GIT_FAILED');return r.stdout}
if(git(['rev-parse','HEAD']).trim()!=='ebc5a148f12209b7372a32c322904c5166f56e09')throw new Error('BASE_CHANGED')
const client=path.join(release,'apps/web/src/tracker/client.ts');await fs.writeFile(client,(await fs.readFile(client,'utf8')).replace(/ +\n/g,'\n'))
for(const [src,dst] of [['cash-typecheck.local.log','release-typecheck.log'],['cash-build.local.log','release-build.log']]){
 const log=await fs.readFile(path.join(release,src),'utf8');if(/error TS|error during build|npm error/.test(log)||!log.includes('@finntech/web'))throw new Error('CHECK_FAILED')
 if(dst==='release-build.log'&&!log.includes('built in'))throw new Error('BUILD_REQUIRED')
 await fs.writeFile(path.join(evidence,dst),log)
}
const results=[],conflicts=[]
for(const file of files){
 const target=path.join(root,file),next=await fs.readFile(path.join(release,file),'utf8')
 let current=null;try{current=await fs.readFile(target,'utf8')}catch{}
 const normalized=t=>t.replace(/\r\n/g,'\n')
 if(current===null){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,next);results.push(file);continue}
 const original=spawnSync('git',['show',`HEAD:${file}`],{cwd:release,encoding:'utf8',windowsHide:true,maxBuffer:64e6})
 if(original.status!==0){if(normalized(current)!==normalized(next)){conflicts.push(file);continue}results.push(file);continue}
 const prefix=path.join(evidence,'merge-'+results.length),a=prefix+'-current.tmp',b=prefix+'-base.tmp',c=prefix+'-next.tmp'
 await fs.writeFile(a,normalized(current));await fs.writeFile(b,normalized(original.stdout));await fs.writeFile(c,normalized(next))
 const merged=spawnSync('git',['merge-file','-p',a,b,c],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:64e6})
 if(merged.status!==0){await fs.writeFile(prefix+'-conflict.txt',merged.stdout);conflicts.push(file);continue}
 await fs.writeFile(target,merged.stdout);results.push(file)
}
await fs.writeFile(path.join(evidence,'mirror-result.json'),JSON.stringify({mirrored:results,conflicts},null,2))
const manifest={previousCommit:'ebc5a148f12209b7372a32c322904c5166f56e09',files:await Promise.all(files.map(async file=>({path:file,sha256:createHash('sha256').update((await fs.readFile(path.join(release,file),'utf8')).replace(/\r\n/g,'\n')).digest('hex')})))}
await fs.writeFile(path.join(evidence,'release-manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({mirrored:results.length,conflicts,releaseFiles:files.length}))
