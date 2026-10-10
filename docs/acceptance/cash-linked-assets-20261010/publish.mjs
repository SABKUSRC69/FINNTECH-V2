import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const root='C:/Users/Admin/Downloads/FINNTECH',cwd=path.join(root,'.student-real-20261008.local/release-source'),evidence=path.join(root,'docs/acceptance/cash-linked-assets-20261010')
const manifest=JSON.parse(await fs.readFile(path.join(evidence,'release-manifest.json'),'utf8'))
const git=args=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:64e6});if(r.status!==0)throw new Error('GIT_FAILED_'+args[0]);return r.stdout.trim()}
if(git(['rev-parse','HEAD'])!==manifest.previousCommit||git(['branch','--show-current'])!=='codex/student-real-use'||git(['remote','get-url','origin'])!=='https://github.com/SABKUSRC69/finntech-beta.git')throw new Error('RELEASE_IDENTITY_REFUSED')
for(const log of ['release-build.log','release-typecheck.log'])if(/error TS|error during build|npm error/.test(await fs.readFile(path.join(evidence,log),'utf8')))throw new Error('CHECKS_REQUIRED')
const migration=JSON.parse(await fs.readFile(path.join(evidence,'migration-result.json'),'utf8'))
if(migration.migration!=='20261010040000_link_cash_settlements'||!migration.cashUnchanged||migration.constraints!==5)throw new Error('MIGRATION_REQUIRED')
const secrets=[]
for(const file of ['.student-real-20261008.local/cloud.env','.beta-cloud-runtime-20261007.local/runtime.env']){
 let source='';try{source=await fs.readFile(path.join(root,file),'utf8')}catch{continue}
 for(const line of source.split(/\r?\n/)){const [key,...parts]=line.split('='),value=parts.join('=');if(/SECRET|PASSWORD|DATABASE_URL|ACCESS_CODE|API_KEY|OUTBOX_KEY/.test(key)&&value.length>=12){secrets.push(value);try{const u=new URL(value);if(u.password)secrets.push(decodeURIComponent(u.password))}catch{}}}
}
let scanned=0
for(const file of manifest.files){const bytes=Buffer.from((await fs.readFile(path.join(cwd,file.path),'utf8')).replace(/\r\n/g,'\n'));if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('SOURCE_CHANGED');if(secrets.some(s=>bytes.includes(Buffer.from(s))))throw new Error('SECRET_FOUND');scanned++}
for(const file of await fs.readdir(path.join(cwd,'apps/web/dist/assets'))){const bytes=await fs.readFile(path.join(cwd,'apps/web/dist/assets',file));if(secrets.some(s=>bytes.includes(Buffer.from(s))))throw new Error('BUNDLE_SECRET_FOUND');scanned++}
git(['add','--',...manifest.files.map(f=>f.path)])
const staged=git(['diff','--cached','--name-only']).split(/\r?\n/).filter(Boolean)
if(staged.length!==manifest.files.length||staged.some(f=>!manifest.files.some(m=>m.path===f)))throw new Error('UNRELATED_STAGED_CHANGE')
await fs.writeFile(path.join(evidence,'release.patch'),git(['diff','--cached'])+'\n')
const message='Link income and trades to cash accounts and show all held assets\n\nSettle new income, expenses, and stock/crypto trades atomically in selected THB cash accounts. Store actual THB net payment including fees, reverse corrections safely, prevent insufficient funds and cross-owner links, and preserve old balances and unlinked history. Preserve cash links through backup restore without settling twice. Insert the holdings table below the summary cards and compact price controls at the bottom.\n'
const result=spawnSync('git',['commit','-F','-'],{cwd,input:message,encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error('COMMIT_FAILED')
const commit=git(['rev-parse','HEAD']);git(['-c','credential.interactive=never','push','origin','HEAD:refs/heads/codex/student-real-use'])
const published={commit,previousCommit:manifest.previousCommit,branch:'codex/student-real-use',files:staged,secretScan:{status:'PASS',scanned,found:0},rootRepositoryCommitted:false}
await fs.writeFile(path.join(evidence,'published.json'),JSON.stringify(published,null,2));console.log(JSON.stringify(published))
