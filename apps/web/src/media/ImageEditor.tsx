import {useEffect,useRef,useState} from 'react'
import {prepareImage,originalTransform,type Transform} from './image'
export default function ImageEditor({purpose,disabled,onImage}:{purpose:'avatar'|'receipt';disabled:boolean;onImage:(blob:Blob|null)=>void}){
 const [duration,setDuration]=useState<number>()
 const [source,setSource]=useState<File|null>(null),[transform,setTransform]=useState<Transform>(originalTransform),[preview,setPreview]=useState(''),[error,setError]=useState(''),[processing,setProcessing]=useState(false),job=useRef(0),fileInput=useRef<HTMLInputElement>(null)
 useEffect(()=>{const id=++job.current,start=performance.now();let url='';onImage(null);setPreview('');if(!source)return;setProcessing(true);setError('');void prepareImage(source,purpose,transform).then(blob=>{if(id!==job.current)return;url=URL.createObjectURL(blob);setPreview(url);setDuration(Math.round(performance.now()-start));onImage(blob)}).catch(e=>{if(id===job.current)setError(e instanceof Error?e.message:'รูปอ่านไม่ได้')}).finally(()=>{if(id===job.current)setProcessing(false)});return()=>{job.current++;if(url)URL.revokeObjectURL(url)}},[source,transform,purpose])
 return <div data-image-preparation-ms={duration} className="journal-image-editor space-y-3">
  <label className="auth-label">{purpose==='avatar'?'เลือกรูปโปรไฟล์':'แนบรูป / อ่านข้อมูลจากรูป'}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={e=>{setTransform(originalTransform);setSource(e.target.files?.[0]??null)}}/></label>
  {purpose==='receipt'&&<label className="auth-label">ถ่ายรูป (ถ้าอุปกรณ์รองรับ)<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled} onChange={e=>{setTransform(originalTransform);setSource(e.target.files?.[0]??null)}}/></label>}
  <p className="text-xs">JPEG / PNG / WebP ไม่เกิน 5 MiB · กรอกเองและแนบรูปได้โดยไม่อ่าน OCR</p>
  {preview&&<img className={`journal-media-preview ${purpose==='avatar'?'journal-media-square':''}`} src={preview} alt="ตัวอย่างรูปก่อนบันทึก"/>}
  {source&&<><div className="flex flex-wrap gap-2"><button className="auth-secondary" type="button" disabled={disabled||processing} onClick={()=>setTransform(t=>({...t,rotation:(t.rotation+90)%360}))}>หมุนรูป 90°</button><button className="auth-secondary" type="button" disabled={disabled||processing} onClick={()=>setTransform(originalTransform)}>คืนรูปเต็ม</button><button className="auth-secondary" type="button" disabled={disabled} onClick={()=>{setSource(null);onImage(null);if(fileInput.current)fileInput.current.value=''}}>นำรูปออก / เลือกใหม่</button></div>
   {purpose==='avatar'?<>{(['x','y','zoom'] as const).map(key=><label className="auth-label" key={key}>{key==='x'?'ตำแหน่งแนวนอน':key==='y'?'ตำแหน่งแนวตั้ง':'ขยายกรอบสี่เหลี่ยม'}<input type="range" min={key==='zoom'?1:0} max={key==='zoom'?3:100} step={key==='zoom'?.1:1} value={transform[key]} disabled={disabled} onChange={e=>setTransform(t=>({...t,[key]:Number(e.target.value)}))}/></label>)}</>:<label className="auth-label">ครอปขอบแต่ละด้าน (%)<input type="range" min="0" max="25" step="1" value={transform.crop} disabled={disabled} onChange={e=>setTransform(t=>({...t,crop:Number(e.target.value)}))}/></label>}
  </>}
  {processing&&<p role="status">กำลังเตรียมรูป…</p>}{error&&<p role="alert">{error}</p>}
 </div>
}
