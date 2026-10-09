import {it,expect} from 'vitest'
import sharp from 'sharp'
import {normalizeImage,MEDIA_LIMITS} from '../src/media/image.js'
it('decodes and re-encodes JPEG PNG WebP, strips metadata and bounds avatar dimensions',async()=>{
 for(const format of ['jpeg','png','webp'] as const){const image=await sharp({create:{width:700,height:400,channels:3,background:'#eedddd'}})[format]().withMetadata({exif:{IFD0:{Artist:'FICTIONAL TEST ONLY'}}}).toBuffer();const normalized=await normalizeImage(image,`image/${format}`,'AVATAR');const meta=await sharp(normalized.bytes).metadata();expect(meta.format).toBe('jpeg');expect(meta.width).toBe(384);expect(meta.height).toBe(384);expect(meta.exif).toBeUndefined();expect(normalized.byteSize).toBe(normalized.bytes.length);expect(normalized.byteSize).toBeLessThanOrEqual(MEDIA_LIMITS.avatar)}
})
it('rejects SVG HTML malformed bytes MIME spoofing oversize and excess decoded pixels',async()=>{
 const png=await sharp({create:{width:12,height:12,channels:3,background:'white'}}).png().toBuffer()
 for(const [image,mime]of [[Buffer.from('<svg/>'),'image/svg+xml'],[Buffer.from('<html/>'),'image/png'],[png,'image/jpeg'],[Buffer.from([255,216,255,0]),'image/jpeg'],[Buffer.alloc(MEDIA_LIMITS.input+1),'image/png']] as const)await expect(normalizeImage(image,mime,'RECEIPT')).rejects.toHaveProperty('code')
 const large=await sharp({create:{width:4000,height:4000,channels:3,background:'white'}}).png().toBuffer();await expect(normalizeImage(large,'image/png','RECEIPT')).rejects.toHaveProperty('code','MEDIA_INVALID')
})
