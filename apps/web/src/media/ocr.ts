export function readImageText(image:Blob,progress:(percent:number)=>void,signal:AbortSignal):Promise<{text:string;confidence:number}>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new Error('ยกเลิกการอ่านรูปแล้ว'));return}
  const worker=new Worker('/ocr/runner.js')
  const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.terminate()}
  const fail=(message:string)=>{stop();reject(new Error(message))}
  const cancel=()=>fail('ยกเลิกการอ่านรูปแล้ว')
  const timer=setTimeout(()=>fail('อ่านรูปเกิน 90 วินาที ลองครอปให้เหลือข้อความหรือกรอกเองได้'),90000)
  signal.addEventListener('abort',cancel,{once:true})
  worker.onerror=()=>fail('อ่านรูปไม่ได้ ลองใหม่หรือกรอกข้อมูลเองได้')
  worker.onmessage=({data})=>{if(typeof data.text==='string'){stop();resolve({text:data.text,confidence:data.confidence})}else if(data.error)fail('อ่านรูปไม่ได้ ลองใหม่หรือกรอกเองได้');else if(typeof data.progress==='number')progress(data.progress)}
  worker.postMessage({image})
 })
}
