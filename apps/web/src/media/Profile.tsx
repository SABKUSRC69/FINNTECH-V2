import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {resourceIdSchema} from '@finntech/contracts'
import {trackerRequest} from '../tracker/client'
import ImageEditor from './ImageEditor'
import {useMediaWrite} from './useMediaWrite'
type Profile={mediaId:string|null;preset:string|null;version:number;quota:{usedBytes:number;maxBytes:number;receiptCount:number;maxReceipts:number}}
type Context={profile:Profile|null;refresh:()=>Promise<void>;confirmed:(v:unknown)=>void;error:string}
const ProfileContext=createContext<Context>({profile:null,refresh:async()=>{},confirmed:()=>{},error:''})
export function ProfileProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
 const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState('')
 async function refresh(){try{const v=await trackerRequest('media/profile') as Profile;if(v.mediaId)resourceIdSchema.parse(v.mediaId);if(!Number.isInteger(v.version)||!v.quota)throw Error();setProfile(p=>p&&p.version>v.version?p:v);setError('')}catch{setError('โหลดรูปบัญชีไม่ได้ กรอกบัญชีต่อได้')}}
 function confirmed(value:unknown){const v=value as Profile;if(v.mediaId)resourceIdSchema.parse(v.mediaId);setProfile(p=>p?{...p,mediaId:v.mediaId,preset:v.preset,version:v.version}:p)}
 useEffect(()=>{if(enabled)void refresh();else setProfile(null)},[enabled])
 return <ProfileContext.Provider value={{profile,refresh,confirmed,error}}>{children}</ProfileContext.Provider>
}
const presets={leaf:'ใบไม้',moon:'ดวงจันทร์',book:'สมุด'}
export function Avatar({name='F'}:{name?:string}){
 const {profile}=useContext(ProfileContext)
 return <span className="journal-avatar" aria-label="รูปบัญชี">{profile?.mediaId?<img key={profile.mediaId} src={`/api/media/objects/${profile.mediaId}`} alt="รูปบัญชีของคุณ"/>:profile?.preset?<svg viewBox="0 0 64 64" role="img" aria-label={presets[profile.preset as keyof typeof presets]??'รูปแบบบัญชี'}><circle cx="32" cy="32" r="30" fill="currentColor" opacity=".12"/>{profile.preset==='leaf'?<path d="M18 44C14 22 29 15 46 16C48 35 38 49 18 44M19 43L39 24" fill="none" stroke="currentColor" strokeWidth="3"/>:profile.preset==='moon'?<path d="M39 15A21 21 0 1 0 48 44A23 23 0 0 1 39 15Z" fill="currentColor"/>:<path d="M15 18H29L32 23L35 18H49V47H35L32 50L29 47H15ZM32 23V50" fill="none" stroke="currentColor" strokeWidth="3"/>}</svg>:<span aria-hidden="true">{name.trim().slice(0,1).toUpperCase()||'F'}</span>}</span>
}
export default function ProfileEditor({disabled,lock,expired,name}:{disabled:boolean;lock:(v:boolean)=>void;expired:()=>void;name:string}){
 const {profile,refresh,confirmed,error}=useContext(ProfileContext),[image,setImage]=useState<Blob|null>(null),[stage,setStage]=useState<string>(),[staged,setStaged]=useState<{id:string;purpose:string;byteSize:number}[]>([]),[revision,setRevision]=useState(0),[confirmRemove,setConfirmRemove]=useState(false),write=useMediaWrite(lock,expired)
 async function loadStages(){try{const v=await trackerRequest('media/staged') as {images:typeof staged};setStaged(v.images)}catch{/* Optional staging list; confirmed profile remains. */}}
 useEffect(()=>{void loadStages()},[revision])
 const blocked=disabled||write.busy||!!write.pending
 function save(mediaId:string|null,preset:string|null){if(!profile)return;write.submit('media/avatar',{mediaId,preset,expectedVersion:profile.version},v=>{confirmed(v);setStage(undefined);setImage(null);setConfirmRemove(false);setRevision(v=>v+1);void refresh()})}
 return <section aria-label="รูปโปรไฟล์ส่วนตัว" className="space-y-4 mt-5">
  <Avatar name={name}/><h3 className="font-semibold">รูปโปรไฟล์ของคุณ</h3>
  <p className="text-xs">รูปส่วนตัว ไม่มี URL สาธารณะ · ไม่เปลี่ยนชื่อ รหัสผ่าน หรือสถานะยืนยันอีเมล</p>
  {error&&<><p role="alert">{error}</p><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>{void refresh()}}>โหลดรูปบัญชีอีกครั้ง</button></>}
  <ImageEditor key={revision} purpose="avatar" disabled={blocked||!!stage} onImage={setImage}/>
  {image&&!stage&&<button type="button" className="auth-secondary" disabled={blocked||!profile} onClick={()=>write.submit('media/stage/avatar',image,v=>{const id=resourceIdSchema.parse((v as {id:unknown}).id);setStage(id);setRevision(x=>x);void loadStages()})}>เตรียมรูปโปรไฟล์</button>}
  {stage&&<button type="button" className="auth-primary" disabled={blocked} onClick={()=>save(stage,null)}>ยืนยันใช้รูปโปรไฟล์นี้</button>}
  <div className="flex flex-wrap gap-2">{Object.entries(presets).map(([id,label])=><button key={id} type="button" className="auth-secondary" disabled={blocked||!profile||!!stage} onClick={()=>save(null,id)}>ใช้รูป{label}</button>)}<button type="button" className="auth-secondary" disabled={blocked||!profile||(!profile.mediaId&&!profile.preset)} onClick={()=>setConfirmRemove(true)}>นำรูปโปรไฟล์ออก</button></div>
  {confirmRemove&&<div><p>ยืนยันนำรูปโปรไฟล์ออกและกลับไปใช้ค่าเริ่มต้น?</p><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>save(null,null)}>ยืนยันนำรูปออก</button><button type="button" className="auth-secondary" disabled={blocked} onClick={()=>setConfirmRemove(false)}>เก็บรูปเดิม</button></div>}
  {profile&&<p className="text-xs">พื้นที่รูป {Math.ceil(profile.quota.usedBytes/1024)} / {profile.quota.maxBytes/1024} KiB · รูปแนบ {profile.quota.receiptCount}/{profile.quota.maxReceipts} · รูปพักนับโควตาด้วย</p>}
  {staged.length>0&&<div><h4>รูปพักที่ยังไม่ผูกกับรายการ (หมดอายุ 24 ชั่วโมง)</h4>{staged.map(row=><div key={row.id} className="flex flex-wrap gap-3 mt-2"><span>{row.purpose==='AVATAR'?'รูปบัญชี':'รูปแนบ'} · {Math.ceil(row.byteSize/1024)} KiB</span><a href={`/api/media/objects/${resourceIdSchema.parse(row.id)}?download=1`}>ดาวน์โหลดรูปพัก</a><button className="auth-secondary" type="button" disabled={blocked} onClick={()=>write.submit(`media/objects/${row.id}/discard`,{},()=>{if(stage===row.id)setStage(undefined);void loadStages();void refresh()})}>นำรูปพักออก</button></div>)}</div>}
  {write.message&&<p role="alert">{write.message}</p>}{write.pending&&<button type="button" className="auth-secondary" onClick={write.retry}>ตรวจคำขอรูปโปรไฟล์เดิม</button>}
 </section>
}
