import sharp from 'sharp'
import { createHash } from 'node:crypto'

export const MEDIA_LIMITS={input:5*1024*1024,pixels:12_000_000,avatar:96*1024,receipt:256*1024,owner:3*1024*1024,global:64*1024*1024,receipts:10} as const
export class ImageError extends Error { constructor(readonly code:string,readonly status=422){super(code)} }
let decoding=0
sharp.cache(false)
sharp.concurrency(1)
/** Header, decoder and metadata checks are independent of browser preprocessing. */
export async function normalizeImage(input:Buffer,mime:string,purpose:'AVATAR'|'RECEIPT'){
 if(input.length===0||input.length>MEDIA_LIMITS.input)throw new ImageError('MEDIA_SIZE',413)
 const actual=input.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpeg':input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP'?'webp':null
 if(!actual||mime!==`image/${actual}`)throw new ImageError('MEDIA_FORMAT')
 if(decoding>=2)throw new ImageError('MEDIA_BUSY',429)
 decoding++
 try{
  const options={limitInputPixels:MEDIA_LIMITS.pixels,failOn:'warning' as const,animated:false}
  const meta=await sharp(input,options).metadata()
  if(meta.format!==actual||!meta.width||!meta.height||meta.width*meta.height>MEDIA_LIMITS.pixels||(meta.pages??1)!==1)throw new ImageError('MEDIA_FORMAT')
  const max=purpose==='AVATAR'?MEDIA_LIMITS.avatar:MEDIA_LIMITS.receipt
  for(const quality of [86,72,58]){
   const image=sharp(input,options).rotate().flatten({background:'#fff'}).resize(purpose==='AVATAR'?{width:384,height:384,fit:'cover'}:{width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality,mozjpeg:true})
   const {data,info}=await image.toBuffer({resolveWithObject:true})
   if(data.length<=max)return {bytes:new Uint8Array(data),byteSize:data.length,width:info.width,height:info.height,sha256:createHash('sha256').update(data).digest('hex')}
  }
  throw new ImageError('MEDIA_SIZE')
 }catch(error){if(error instanceof ImageError)throw error;throw new ImageError('MEDIA_INVALID')}
 finally{decoding--}
}
