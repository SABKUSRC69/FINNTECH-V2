import {useState,useEffect,useRef} from 'react'
import {STOCK_INSTRUMENTS,valuationReferenceInputSchema,type ValuationOverview} from '@finntech/contracts'
import {useOwnedWrite} from './useOwnedWrite'
import {usePresentation} from '../presentation'
import {displayDecimal} from './client'
const localTime=(iso=new Date().toISOString())=>{const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export default function ValuationReferences({data,loading,blocked,lock,expired,refresh,target}:{data:ValuationOverview|null;loading:boolean;blocked:boolean;lock:(v:boolean)=>void;expired:()=>void;refresh:()=>Promise<void>;target:{symbol:string;request:number}|null}){
 const {money}=usePresentation(),[symbol,setSymbol]=useState('USDTHB'),[value,setValue]=useState(''),[asOf,setAsOf]=useState(localTime()),[enabled,setEnabled]=useState(true),input=useRef<HTMLInputElement>(null)
 const record=data?.references.find(r=>r.symbol===symbol)
 function choose(s:string){setSymbol(s);const r=data?.references.find(r=>r.symbol===s);setValue(r?.value??'');setAsOf(localTime(r?.asOf));setEnabled(r?.enabled??true)}
 useEffect(()=>{if(target){choose(target.symbol);input.current?.focus()}},[target])
 const write=useOwnedWrite(lock,expired,refresh)
 const disabled=blocked||loading||!data||write.busy||!!write.pending
 return <section id="valuation-reference-editor" className="tracker-card rounded-2xl p-5 space-y-4" aria-label="ราคาและอัตราอ้างอิง"><h3 className="font-semibold">ตั้งราคา / อัตราอ้างอิงของคุณ</h3>
  <p className="text-sm leading-7">อ่านราคาจากแหล่งที่คุณเลือก แล้วกรอก USD ต่อหุ้น หรือ THB ต่อ 1 USD ไม่ใช้ต้นทุนซื้อเป็นราคาปัจจุบัน ราคาเดียวกันใช้กับหุ้นนั้นทุกพอร์ตของคุณ · การกรอกเปิดแทนอัตโนมัติ ปิดใช้เพื่อกลับไปใช้ข้อมูลอัตโนมัติที่พร้อม</p>
  <p className="text-sm">ราคา/อัตราที่กรอกเองและ ECB รายวันใช้ได้ไม่เกิน 7 วันจากวันอ้างอิง การแก้ไขไม่ทำให้วันเก่าสดขึ้น · ราคา live ยังคงเกณฑ์ 30 วินาที</p>
  {!data&&!loading&&<p role="alert">อ่านราคาอ้างอิงไม่สำเร็จ กรุณาโหลดสินทรัพย์ล่าสุดก่อนบันทึก</p>}
  {data?.references.map(r=><div className="border-t pt-3 break-all" key={r.id}><p>{r.symbol==='USDTHB'?'1 USD → THB':r.symbol+' · USD ต่อหุ้น'}: {money(displayDecimal(r.value))} · กรอกเอง · {r.enabled?'เปิดแทนอัตโนมัติ':'ปิดใช้'}</p><p className="text-xs">อ้างอิง {new Date(r.asOf).toLocaleString('th-TH')} · บันทึก {new Date(r.updatedAt).toLocaleString('th-TH')}</p><button className="auth-secondary mt-2" disabled={disabled} onClick={()=>{choose(r.symbol);input.current?.focus()}}>แก้ไข / เปิดปิด {r.symbol}</button></div>)}
  <form aria-label="บันทึกราคาอ้างอิง" className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(disabled)return;const date=new Date(asOf);if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()){write.setMessage('วันอ้างอิงต้องไม่อยู่ในอนาคต');return}write.submit('valuation/references',valuationReferenceInputSchema,{symbol,currency:symbol==='USDTHB'?'THB':'USD',value,asOf:date.toISOString(),enabled,expectedVersion:record?.version??null})}}>
   <label className="auth-label">รายการอ้างอิง<select className="auth-input" disabled={disabled} value={symbol} onChange={e=>choose(e.target.value)}><option value="USDTHB">USD → THB</option>{STOCK_INSTRUMENTS.map(r=><option key={r.symbol} value={r.symbol}>{r.symbol}</option>)}</select></label>
   <label className="auth-label">{symbol==='USDTHB'?'อัตรา THB ต่อ 1 USD':'ราคา USD ต่อหุ้น'}<input ref={input} className="auth-input" inputMode="decimal" required disabled={disabled} value={value} onChange={e=>setValue(e.target.value)}/></label>
   <label className="auth-label">วันและเวลาอ้างอิง<input className="auth-input" type="datetime-local" required disabled={disabled} value={asOf} onChange={e=>setAsOf(e.target.value)}/></label>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={disabled} onChange={e=>setEnabled(e.target.checked)}/>ใช้ค่าที่กรอกแทนอัตโนมัติ</label>
   <button className="auth-primary" disabled={disabled}>บันทึกราคา / อัตราอ้างอิง</button>
  </form>{write.message&&<p role="alert">{write.message}</p>}{write.pending&&<div><p role="status">ยังไม่ทราบผลราคาอ้างอิง เมนูพักอยู่ ตรวจผลด้วย payload และ key เดิม</p><button className="auth-primary mt-3" disabled={write.busy} onClick={write.retry}>ตรวจผลราคาอ้างอิงด้วยคำขอเดิม</button></div>}
 </section>
}
