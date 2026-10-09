import fs from 'node:fs/promises'
import path from 'node:path'
import {createTrackerDatabase} from '../apps/api/dist/persistence/database.js'
import {createAuthRuntime} from '../apps/api/dist/auth/runtime.js'
import {createApp} from '../apps/api/dist/app.js'
import {StockMarketRelay} from '../apps/api/dist/tracker/stocks.js'
const config=JSON.parse(await fs.readFile('.media-review-20261009.local/config.private.json','utf8')),url=new URL(config.databaseUrl)
if(url.hostname!=='127.0.0.1'||url.port!=='5449'||url.pathname!=='/finntech_media_test'||config.origin!=='http://127.0.0.1:4340')throw Error('Synthetic preview target rejected')
const db=createTrackerDatabase(config.databaseUrl),auth=createAuthRuntime(db,config),app=createApp({auth,database:db,stocks:new StockMarketRelay(null),webDistDir:path.resolve('apps/web/dist')})
const server=app.listen(4340,'127.0.0.1',()=>console.log('Synthetic media preview: http://127.0.0.1:4340 (no cloud traffic or OCR service)'))
function stop(){server.close(()=>{void db.$disconnect().then(()=>process.exit(0))})}
process.once('SIGINT',stop);process.once('SIGTERM',stop)
