import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const root='C:/Users/Admin/Downloads/FINNTECH',release=path.join(root,'.student-real-20261008.local/release-source'),evidence=path.join(root,'docs/acceptance/transient-tiingo-20261010/fx-followup')
const previousCommit='afbc953e0ad5a2424e7aa29df8e4be2f539b3bd4'
const git=args=>{const r=spawnSync('git',args,{cwd:release,encoding:'utf8',windowsHide:true});if(r.status)throw new Error('GIT_FAILED');return r.stdout.trim()}
if(git(['rev-parse','HEAD'])!==previousCommit||git(['status','--porcelain'])||git(['remote','get-url','origin'])!=='https://github.com/SABKUSRC69/finntech-beta.git')throw new Error('CLEAN_RELEASE_REQUIRED')
const sha=b=>createHash('sha256').update(b).digest('hex'),files=[]
await fs.mkdir(evidence,{recursive:true})
for(const file of ['apps/api/src/tracker/fx.ts','apps/api/src/tracker/routes.ts','apps/web/src/tracker/Assets.tsx']){
 const before=(await fs.readFile(path.join(release,file),'utf8')).replace(/\r\n/g,'\n')
 let after=(await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n')
 if(file.endsWith('/Assets.tsx')){
  const label=before.split('\n').find(line=>line.startsWith('export const stockConnectionLabel='));if(!label)throw new Error('LABEL_REQUIRED')
  after=after.replace('referenceDateLabel,stockConnectionLabels','referenceDateLabel').replace('const stockPosition=',label+'\nconst stockPosition=').replace('stockConnectionLabels[stockPrices.connection]','stockConnectionLabel(stockPrices.connection)')
 }
 await fs.writeFile(path.join(release,file),after);files.push({path:file,sha256:sha(after),previousSha256:sha(before)})
}
await fs.writeFile(path.join(evidence,'release-manifest.json'),JSON.stringify({previousCommit,files},null,2));console.log('Prepared 3 FX timing files')
