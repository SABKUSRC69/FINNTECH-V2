import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const root='C:/Users/Admin/Downloads/FINNTECH',cwd=path.join(root,'.student-real-20261008.local/release-source'),evidence=path.join(root,'docs/acceptance/cash-linked-assets-20261010')
const git=args=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:64e6});if(r.status!==0)throw new Error('GIT_FAILED_'+args[0]);return r.stdout.trim()}
if(git(['rev-parse','HEAD'])!=='8687a074a861b183143996179372cba19794b4b7'||git(['remote','get-url','origin'])!=='https://github.com/SABKUSRC69/finntech-beta.git')throw new Error('RELEASE_IDENTITY_REFUSED')
for(const log of ['cash-polish-build.local.log','cash-polish-typecheck.local.log']){const text=await fs.readFile(path.join(cwd,log),'utf8');if(/error TS|error during build|npm error/.test(text))throw new Error('CHECKS_REQUIRED');await fs.writeFile(path.join(evidence,log),text)}
const file='apps/web/src/tracker/Assets.tsx',bytes=await fs.readFile(path.join(cwd,file));if(/postgres(?:ql)?:\/\/|TIINGO_API_KEY\s*=/.test(bytes.toString()))throw new Error('SECRET_FOUND')
git(['add','--',file]);if(git(['diff','--cached','--name-only'])!==file)throw new Error('UNRELATED_STAGED_CHANGE')
const message='Keep asset price labels brief and allow retry after failed reads\n'
const result=spawnSync('git',['commit','-F','-'],{cwd,input:message,encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error('COMMIT_FAILED')
git(['-c','credential.interactive=never','push','origin','HEAD:refs/heads/codex/student-real-use'])
const published={commit:git(['rev-parse','HEAD']),previousCommit:'8687a074a861b183143996179372cba19794b4b7',file,sha256:createHash('sha256').update(bytes).digest('hex')}
await fs.writeFile(path.join(evidence,'polish-published.json'),JSON.stringify(published,null,2));console.log(JSON.stringify(published))
