export type Transform={rotation:number;crop:number;x:number;y:number;zoom:number}
export const originalTransform:Transform={rotation:0,crop:0,x:50,y:50,zoom:1}
export async function prepareImage(file:Blob,purpose:'avatar'|'receipt',t:Transform=originalTransform):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('รองรับ JPEG, PNG, WebP ไม่เกิน 5 MiB ไม่รองรับ PDF หรือ HEIC')
 const bitmap=await createImageBitmap(file)
 try{
  if(bitmap.width*bitmap.height>12_000_000)throw new Error('รูปเกิน 12 ล้านพิกเซล กรุณาเลือกรูปขนาดเล็กลง')
  const rotated=document.createElement('canvas'),swap=t.rotation%180!==0
  rotated.width=swap?bitmap.height:bitmap.width;rotated.height=swap?bitmap.width:bitmap.height
  const rc=rotated.getContext('2d')!;rc.translate(rotated.width/2,rotated.height/2);rc.rotate(t.rotation*Math.PI/180);rc.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2)
  const edge=t.crop/100,cropWidth=rotated.width*(1-edge*2),cropHeight=rotated.height*(1-edge*2)
  let sx=rotated.width*edge,sy=rotated.height*edge,sw=cropWidth,sh=cropHeight
  if(purpose==='avatar'){sw=sh=Math.min(cropWidth,cropHeight)/t.zoom;sx+=(cropWidth-sw)*t.x/100;sy+=(cropHeight-sh)*t.y/100}
  const scale=purpose==='avatar'?384/sw:Math.min(1,1800/Math.max(sw,sh)),canvas=document.createElement('canvas')
  canvas.width=Math.round(sw*scale);canvas.height=Math.round(sh*scale)
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(rotated,sx,sy,sw,sh,0,0,canvas.width,canvas.height)
  for(const q of [.9,.78,.65]){const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',q));if(blob&&blob.size<=(purpose==='avatar'?96:256)*1024)return blob}
  throw new Error('รูปยังใหญ่เกินโควตา กรุณาครอปให้เหลือส่วนที่จำเป็นหรือใช้รูปเรียบขึ้น')
 }finally{bitmap.close()}
}
