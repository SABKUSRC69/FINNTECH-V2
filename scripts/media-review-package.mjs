// Review patch against the task's captured baseline, never Git HEAD or a commit.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const root=process.cwd(),privateDir=path.join(root,'.media-review-20261009.local'),out=path.join(root,'docs/acceptance'),baseline=JSON.parse(await fs.readFile(path.join(privateDir,'baseline.json'),'utf8')),after=path.join(privateDir,'after'),check=path.join(privateDir,'patch-check'),files=new Set(Object.keys(baseline)),sha=b=>createHash('sha256').update(b).digest('hex')
async function walk(rel,all=false){for(const e of await fs.readdir(path.join(root,rel),{withFileTypes:true})){if(['node_modules','dist','generated','.git'].includes(e.name))continue;const p=`${rel}/${e.name}`;if(e.isDirectory())await walk(p,all);else if(!e.name.includes('private')&&(all||/\.(ts|tsx|css|json|sql|prisma|mjs|ps1|md)$/.test(p)))files.add(p)}}
for(const dir of ['apps/api/src','apps/api/test','apps/api/prisma','apps/web/src','packages/contracts','scripts','docs/operations'])await walk(dir)
await walk('apps/web/public/ocr',true);await walk('docs/acceptance/media-evidence-20261009',true)
files.add('docs/acceptance/media-review-20261009.md');files.add('docs/acceptance/media-review-measurements.json');files.add('docs/operations/private-media.md');files.add('compose.media.test.yaml')
const changed=[]
for(const name of [...files].sort()){
 if(/(?:\.env|\.private\.(?:json|txt|env)|\.local(?:\/|$)|node_modules|\/dist\/|\/generated\/)/.test(name))throw Error(`Private/generated path rejected: ${name}`)
 let bytes;try{bytes=await fs.readFile(path.join(root,name))}catch(e){if(e.code!=='ENOENT')throw e}
 if(bytes&&baseline[name]?.sha256===sha(bytes))continue
 if(!bytes&&!baseline[name])continue
 changed.push({path:name,status:!bytes?'deleted':baseline[name]?'modified':'new',bytes:bytes?.length??0,sha256:bytes?sha(bytes):null,baselineSha256:baseline[name]?.sha256??null})
 if(bytes){await fs.mkdir(path.dirname(path.join(after,name)),{recursive:true});await fs.writeFile(path.join(after,name),bytes)}
}
let patch=''
for(const item of changed){
 const args=['-c','core.autocrlf=false','diff','--no-index','--binary','--',item.status==='new'?'/dev/null':`before/${item.path}`,item.status==='deleted'?'/dev/null':`after/${item.path}`]
 const r=spawnSync('git',args,{cwd:privateDir,windowsHide:true,maxBuffer:64*1024*1024,encoding:'utf8'});if(![0,1].includes(r.status))throw Error(`Diff failed: ${item.path}`)
 patch+=r.stdout.replaceAll('a/before/','a/').replaceAll('b/before/','b/').replaceAll('a/after/','a/').replaceAll('b/after/','b/')
}
const patchPath=path.join(out,'media-review-20261009.patch')
await fs.writeFile(patchPath,patch);await fs.writeFile(path.join(out,'media-review-changed-files.json'),JSON.stringify({baseline:'task start 2026-10-09, before this increment; no HEAD comparison',changed,deliveryArtifacts:['media-review-changed-files.json','media-review-artifacts.json','media-review-20261009.patch']},null,2))
// New isolated repository used only to prove patch applicability; no staging/commit.
await fs.mkdir(check,{recursive:true});await fs.cp(path.join(privateDir,'before'),check,{recursive:true})
const init=spawnSync('git',['init','--quiet'],{cwd:check,windowsHide:true});if(init.status!==0)throw Error('Patch fixture init failed')
const apply=spawnSync('git',['-c','core.autocrlf=false','apply','--check',patchPath],{cwd:check,windowsHide:true,encoding:'utf8'})
const whitespace=spawnSync('git',['-c','core.autocrlf=false','apply','--check','--whitespace=error-all','--exclude=apps/web/public/ocr/CORE-LICENSE.txt',patchPath],{cwd:check,windowsHide:true,encoding:'utf8'})
const results=JSON.parse(await fs.readFile(path.join(privateDir,'delivery-checks.json'),'utf8'))
await fs.writeFile(path.join(out,'media-review-artifacts.json'),JSON.stringify({changedFiles:changed.length,patchBytes:Buffer.byteLength(patch),patchSha256:sha(Buffer.from(patch)),patchAppliesToBaselineExit:apply.status,patchWhitespaceExit:whitespace.status,whitespaceException:'CORE-LICENSE.txt is an unchanged copy of the upstream license, including its final blank line',commands:results,secretFilesIncluded:false,commitCreated:false,liveMigration:false,deployment:false},null,2))
if(apply.status!==0||whitespace.status!==0){await fs.writeFile(path.join(privateDir,'patch-failure.txt'),`${apply.stderr}\n${whitespace.stderr}`);throw Error('Patch validation failed; details in private fixture')}
console.log(`MEDIA_REVIEW_PATCH_PASS: ${changed.length} changed files, ${Buffer.byteLength(patch)} bytes; no commit/staging/deployment`)
