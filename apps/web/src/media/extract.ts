import {calendarDateSchema} from '@finntech/contracts'
export type ReceiptKind='finance'|'crypto'|'stock'
export type DraftFields=Partial<Record<'amount'|'date'|'note'|'asset'|'symbol'|'side'|'quantity'|'price'|'fee',string>>
export type Extraction={fields:DraftFields;amounts:string[];warnings:string[];currency:string|null}
const thaiDigits='๐๑๒๓๔๕๖๗๘๙'
export function decimalCandidate(raw:string):string|null{
 let text=raw.replace(/[๐-๙]/g,c=>String(thaiDigits.indexOf(c)))
 if(text.includes(',')){if(!/^\d{1,3}(,\d{3})+\.\d{1,18}$/.test(text))return null;text=text.replaceAll(',','')}
 if(!/^\d+(?:\.\d{1,18})?$/.test(text)||text.length>38)return null
 text=text.replace(/^0+(?=\d)/,'');return text
}
function unique(v:string[]){return [...new Set(v)]}
export function extractReceipt(raw:string,kind:ReceiptKind):Extraction{
 // OCR commonly emits decomposed Thai sara-am (nikhahit + sara-aa).
 const text=raw.slice(0,12000).normalize('NFC').replace(/\u0e4d\u0e32/g,'ำ').replace(/[๐-๙]/g,c=>String(thaiDigits.indexOf(c))),lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
 const fields:DraftFields={},warnings:string[]=[],expected=kind==='finance'?'THB':kind==='stock'?'USD':'USDT'
 const currencies=unique([...text.matchAll(/\b(THB|USDT|USD)\b|บาท|฿/gi)].map(m=>m[1]?.toUpperCase()??'THB'))
 const currency=currencies.length===1?currencies[0]!:null
 if(currency!==expected)warnings.push(`ต้องตรวจสกุลเงิน ${expected} ด้วยตนเอง ไม่ใช้ยอดจากสกุลเงินอื่น`)
 const dates:string[]=[]
 const addDate=(y:number,m:number,d:number)=>{if(y>=2400)y-=543;const value=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(calendarDateSchema.safeParse(value).success)dates.push(value)}
 for(const match of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g))addDate(+match[1]!,+match[2]!,+match[3]!)
 for(const match of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)){
  const a=+match[1]!,b=+match[2]!,year=+match[3]!
  if(year<2400&&a<=12&&b<=12&&a!==b){warnings.push('วันที่ตัวเลขกำกวมระหว่างวัน/เดือน ตรวจจากรูปก่อนกรอก');continue}
  if(year<2400&&b>12&&a<=12)addDate(year,a,b);else addDate(year,b,a)
 }
 const months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
 const eng=['January','February','March','April','May','June','July','August','September','October','November','December']
 for(const match of text.matchAll(/(\d{1,2})\s+([A-Za-zก-๙]+)\s+(\d{4})/g)){const month=months.indexOf(match[2]!)+1||eng.findIndex(v=>v.toLowerCase().startsWith(match[2]!.toLowerCase()))+1;if(month)addDate(+match[3]!,month,+match[1]!)}
 const calendar=unique(dates);if(calendar.length===1)fields.date=calendar[0]!;else if(calendar.length>1)warnings.push('พบหลายวันที่ เลือกวันที่จริงจากรูป')
 const candidates:Record<string,string[]>={amount:[],quantity:[],price:[],fee:[]}
 for(const line of lines){
  if(/(?:order\s*(?:id|no)|account|reference|เลข(?:ที่|บัญชี)|อ้างอิง)/i.test(line))continue
  const label=/^(?:total|amount|ยอด(?:รวม|เงิน)?|จำนวนเงิน)\s*[:：]?\s*/i.test(line)?'amount':/^(?:fee|commission|ค่าธรรมเนียม)\s*[:：]?\s*/i.test(line)?'fee':/^(?:quantity|qty|จำนวน(?:หุ้น)?|ปริมาณ)\s*[:：]?\s*/i.test(line)?'quantity':/^(?:price|ราคาต่อ(?:หุ้น|หน่วย)|ราคา)\s*[:：]?\s*/i.test(line)?'price':null
  if(!label)continue
  const nums=[...line.matchAll(/(?:^|[\s:฿])([0-9][0-9,.]*)(?=$|[\sบาท])/g)].map(m=>decimalCandidate(m[1]!)).filter((n):n is string=>n!==null)
  if(nums.length===1)candidates[label]!.push(nums[0]!);else warnings.push('ตัวเลขหรือเครื่องหมายคั่นกำกวม ตรวจจากรูปก่อนกรอก')
 }
 const amounts=currency===expected?unique(candidates.amount!):[]
 if(kind==='finance'){
  const valid=amounts.filter(v=>/^\d+(?:\.\d{1,2})?$/.test(v)&&!/^0(?:\.0+)?$/.test(v))
  if(valid.length===1)fields.amount=valid[0]!;else if(valid.length>1)warnings.push('พบหลายยอดเงิน ไม่เลือกยอดให้อัตโนมัติ')
  const note=lines.find(v=>/^(?:note|merchant|payee|ร้านค้า|ผู้รับ|หมายเหตุ)\s*[:：]/i.test(v))
  if(note)fields.note=note.slice(0,500)
  warnings.push('เลือกเงินเข้า/ออกและหมวดหมู่เอง สลิปโอนไม่บอกวัตถุประสงค์หรือยืนยันการชำระเงิน')
 }else if(currency===expected){
  for(const key of ['quantity','price','fee'] as const){const values=unique(candidates[key]!);if(values.length===1)fields[key]=values[0]!;else if(values.length>1)warnings.push(`พบหลายค่า ${key} ให้ตรวจด้วยตนเอง`)}
  const symbols=unique(lines.flatMap(line=>[...line.matchAll(/^(?:symbol|asset|หลักทรัพย์|สินทรัพย์)\s*[:：]\s*([A-Z]{2,10})(?:\/(?:USD|USDT))?\s*$/gi)].map(m=>m[1]!.toUpperCase())))
  if(symbols.length===1)fields[kind==='stock'?'symbol':'asset']=symbols[0]!
  const sides=unique(lines.flatMap(line=>[...line.matchAll(/^(?:(?:side|ประเภท)\s*[:：]\s*)?(BUY|SELL|ซื้อ|ขาย)\s*$/gi)].map(m=>/^(buy|ซื้อ)$/i.test(m[1]!)?'buy':'sell')))
  if(sides.length===1)fields.side=sides[0]!;else warnings.push('ยังสรุปซื้อหรือขายไม่ได้ เลือกชนิดประวัติเอง')
 }
 return {fields,amounts,warnings:unique(warnings),currency}
}
