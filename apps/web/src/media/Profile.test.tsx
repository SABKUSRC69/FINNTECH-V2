import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import ProfileEditor,{ProfileProvider,Avatar} from './Profile'
vi.mock('./ImageEditor',()=>({default:({onImage}:{onImage:(b:Blob)=>void})=><button type="button" onClick={()=>onImage(new Blob(['fixture'],{type:'image/jpeg'}))}>เลือกภาพบัญชีสังเคราะห์</button>}))
const old='44444444-4444-4444-8444-444444444444',next='55555555-5555-4555-8555-555555555555'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('preserves old avatar for uncertain replacement, retries original key and removes only after confirmation',async()=>{
 let profile={mediaId:old,preset:null,version:1,quota:{usedBytes:1024,maxBytes:3145728,receiptCount:0,maxReceipts:10}},lost=true
 const fetch=vi.fn(async(url:string,options?:RequestInit)=>{if(url==='/api/media/profile')return {ok:true,json:async()=>profile};if(url==='/api/media/staged')return {ok:true,json:async()=>({images:[]})};if(url==='/api/media/stage/avatar')return {ok:true,json:async()=>({id:next})};if(url==='/api/media/avatar'){if(lost){lost=false;throw Error('lost response')}const body=JSON.parse(String(options?.body));profile={...profile,...body,version:profile.version+1};return {ok:true,json:async()=>profile}}throw Error('unexpected URL')})
 vi.stubGlobal('fetch',fetch);render(<ProfileProvider enabled><ProfileEditor name="Synthetic" disabled={false} lock={vi.fn()} expired={vi.fn()}/></ProfileProvider>)
 await waitFor(()=>expect(screen.getByAltText('รูปบัญชีของคุณ').getAttribute('src')).toContain(old));fireEvent.click(screen.getByText('เลือกภาพบัญชีสังเคราะห์'));fireEvent.click(screen.getByText('เตรียมรูปโปรไฟล์'));await screen.findByText('ยืนยันใช้รูปโปรไฟล์นี้');fireEvent.click(screen.getByText('ยืนยันใช้รูปโปรไฟล์นี้'));await screen.findByText('ตรวจคำขอรูปโปรไฟล์เดิม');expect(screen.getByAltText('รูปบัญชีของคุณ').getAttribute('src')).toContain(old)
 fireEvent.click(screen.getByText('ตรวจคำขอรูปโปรไฟล์เดิม'));await waitFor(()=>expect(screen.getByAltText('รูปบัญชีของคุณ').getAttribute('src')).toContain(next));const writes=fetch.mock.calls.filter(([url])=>url==='/api/media/avatar');expect(writes[1]![1]?.headers).toEqual(writes[0]![1]?.headers);expect(writes[1]![1]?.body).toBe(writes[0]![1]?.body)
 fireEvent.click(screen.getByText('นำรูปโปรไฟล์ออก'));expect(screen.getByAltText('รูปบัญชีของคุณ')).toBeTruthy();fireEvent.click(screen.getByText('ยืนยันนำรูปออก'));await waitFor(()=>expect(screen.queryByAltText('รูปบัญชีของคุณ')).toBeNull())
})
it('discards previous owner avatar when account provider is remounted on logout/login',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({mediaId:old,preset:null,version:1,quota:{}})})))
 const view=render(<ProfileProvider key="ownerA" enabled><Avatar name="A"/></ProfileProvider>);await screen.findByAltText('รูปบัญชีของคุณ')
 view.rerender(<ProfileProvider key="signed-out" enabled={false}><Avatar name="B"/></ProfileProvider>);expect(screen.queryByAltText('รูปบัญชีของคุณ')).toBeNull();expect(screen.getByText('B')).toBeTruthy()
})
it('does not let a stale profile GET replace a newer confirmed avatar',async()=>{
 const stale={mediaId:old,preset:null,version:1,quota:{usedBytes:1024,maxBytes:3145728,receiptCount:0,maxReceipts:10}}
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/media/profile'?stale:url==='/api/media/staged'?{images:[]}:{mediaId:null,preset:'leaf',version:2}})))
 render(<ProfileProvider enabled><ProfileEditor name="Synthetic" disabled={false} lock={vi.fn()} expired={vi.fn()}/></ProfileProvider>);await screen.findByAltText('รูปบัญชีของคุณ')
 fireEvent.click(screen.getByText('ใช้รูปใบไม้'));await screen.findByRole('img',{name:'ใบไม้'});await waitFor(()=>expect(screen.queryByAltText('รูปบัญชีของคุณ')).toBeNull())
})
