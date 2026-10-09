import fs from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const dir='.media-review-20261009.local'
await fs.mkdir(dir,{recursive:true})
let config
try{config=JSON.parse(await fs.readFile(`${dir}/config.private.json`,'utf8'))}catch{const password=randomBytes(24).toString('hex');config={databaseUrl:`postgresql://media_fixture:${password}@127.0.0.1:5449/finntech_media_test`,secret:randomBytes(32).toString('hex'),origin:'http://127.0.0.1:4340',secureCookies:false,real:{authenticationMode:'email-password',databaseHost:'127.0.0.1',databaseName:'finntech_media_test',databaseRole:'media_fixture',boundary:'real-rehearsal',registrationsOpen:true,accountLimit:1000,mailAttemptLimit:10,databaseLimitBytes:268435456,supportEmail:'support@example.test'}};await fs.writeFile(`${dir}/config.private.json`,JSON.stringify(config));await fs.writeFile(`${dir}/database.env`,`MEDIA_TEST_PASSWORD=${password}\n`)}
const target=new URL(config.databaseUrl)
if(target.hostname!=='127.0.0.1'||target.port!=='5449'||target.pathname!=='/finntech_media_test'||target.username!=='media_fixture'||config.origin!=='http://127.0.0.1:4340'||config.real.boundary!=='real-rehearsal')throw Error('Synthetic local target rejected')
const p=spawnSync('docker',['compose','--env-file',`${dir}/database.env`,'-p','finntech-media-20261009','-f','compose.media.test.yaml','up','-d','--wait'],{stdio:'inherit',windowsHide:true});if(p.status!==0)process.exit(p.status??1)
const m=spawnSync(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy'],{cwd:'apps/api',env:{...process.env,DATABASE_URL:config.databaseUrl},stdio:'inherit',windowsHide:true});process.exitCode=m.status??1
