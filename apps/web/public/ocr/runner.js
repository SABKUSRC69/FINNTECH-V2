/* Original FINNTECH wrapper: terminating this parent also terminates its nested OCR worker. */
importScripts('/ocr/tesseract.min.js');
self.onmessage=async({data})=>{
 let worker;
 try{
  worker=await Tesseract.createWorker('tha+eng',1,{workerPath:'/ocr/worker.min.js',workerBlobURL:false,corePath:'/ocr',langPath:'/ocr',gzip:false,cachePath:'finntech-ocr-fast-8741641',cacheMethod:'write',logger:message=>self.postMessage({progress:Math.round(message.progress*100),status:message.status}),errorHandler:()=>{}});
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  const result=await worker.recognize(data.image);
  self.postMessage({text:result.data.text.slice(0,12000),confidence:result.data.confidence});
 }catch{self.postMessage({error:'OCR_FAILED'})}
 finally{await worker?.terminate()}
};
