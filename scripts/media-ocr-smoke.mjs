// Actual LSTM engine, fictional images only. Never log recognized banking text.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const require=createRequire(path.resolve('apps/web/package.json')), {createWorker}=require('tesseract.js'),dir='.media-review-20261009.local',results=[]
const start=performance.now(),worker=await createWorker('tha+eng',1,{langPath:path.resolve('apps/web/public/ocr'),gzip:false,cacheMethod:'none',errorHandler:()=>{}})
const startupMs=Math.round(performance.now()-start)
try{
 await worker.setParameters({tessedit_pageseg_mode:'6'})
 for(const language of ['en','th']){const before=performance.now(),data=await fs.readFile(`${dir}/fictional-receipt-${language}.png`),ret=await worker.recognize(data);results.push({language,width:1200,height:800,inputBytes:data.length,durationMs:Math.round(performance.now()-before),engineConfidence:ret.data.confidence,containsAmount:ret.data.text.includes('120.00'),containsDate:ret.data.text.includes(language==='en'?'2026-10-09':'2569'),textSha256:createHash('sha256').update(ret.data.text).digest('hex')});await fs.writeFile(`${dir}/fictional-ocr-${language}.txt`,ret.data.text)}
}finally{await worker.terminate()}
const report={engine:'Tesseract.js 7.0.0 / LSTM only / tessdata_fast tha+eng',startupMs,results,privacy:'fictional images; no external OCR service',status:results.every(r=>r.containsAmount&&r.containsDate)?'PASS':'LIMITED'}
await fs.writeFile(`${dir}/ocr-node.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report))
