// Pinned public assets only. Never reads slips, user files, credentials or environment.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
const root=process.cwd(),out=path.join(root,'apps/web/public/ocr'),commit='87416418657359cb625c412a48b6e1d6d41c29bd'
const pinnedHashes={'eng.traineddata':'7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2','tha.traineddata':'294227cc2d1292b0acb28d61d4115c88252b96d466ca90b417cf4cf0c67bf07c','LICENSE':'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'}
for(const name of ['tesseract.js','tesseract.js-core'])if(JSON.parse(await fs.readFile(path.join(root,'node_modules',name,'package.json'),'utf8')).version!=='7.0.0')throw Error('Pinned OCR package version required')
await fs.mkdir(out,{recursive:true})
const manifest={tesseract:'7.0.0',core:'7.0.0',tessdataFastCommit:commit,license:'Apache-2.0',files:[]}
async function copy(src,name){const b=await fs.readFile(src);await fs.writeFile(path.join(out,name),b);manifest.files.push({file:name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})}
for(const [src,name]of [['node_modules/tesseract.js/dist/worker.min.js','worker.min.js'],['node_modules/tesseract.js/dist/tesseract.min.js','tesseract.min.js'],['node_modules/tesseract.js/LICENSE.md','TESSERACT-LICENSE.txt'],['node_modules/tesseract.js-core/LICENSE','CORE-LICENSE.txt']])await copy(path.join(root,src),name)
for(const variant of ['lstm','simd-lstm','relaxedsimd-lstm'])await copy(path.join(root,`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`),`tesseract-core-${variant}.wasm.js`)
for(const name of ['eng.traineddata','tha.traineddata','LICENSE']){
 const target=path.join(out,name==='LICENSE'?'TESSDATA-LICENSE.txt':name)
 if(!process.argv.includes('--offline')){const url=`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/${name}`,res=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!res.ok)throw Error(`OCR asset download failed: ${res.status}`);await fs.writeFile(target,Buffer.from(await res.arrayBuffer()))}
 const bytes=await fs.readFile(target),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==pinnedHashes[name])throw Error('Pinned language asset checksum mismatch');manifest.files.push({file:path.basename(target),bytes:bytes.length,sha256:hash,source:`https://github.com/tesseract-ocr/tessdata_fast/tree/${commit}`})
}
await fs.writeFile(path.join(out,'provenance.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest))
