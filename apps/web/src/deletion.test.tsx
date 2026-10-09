import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import AccountDeletion from './auth/AccountDeletion'
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals()})
const reply=(body:unknown)=>({ok:true,status:200,json:async()=>body})
it('locks double submission, reconciles a lost response after reload without new payload or key',async()=>{
  const lock=vi.fn(),done=vi.fn(),writes:string[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
    if(url.endsWith('/request')){writes.push(options!.body as string);throw Error('lost response')}
    return reply({status:'REQUESTED',caseId:'synthetic-case'})
  }))
  const view=render(<AccountDeletion lock={lock} done={done}/>)
  fireEvent.change(screen.getByLabelText('รหัสผ่านปัจจุบัน'),{target:{value:'synthetic-long-password'}})
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'ยืนยันขอลบบัญชี'}))
  await screen.findByText(/ยังไม่ทราบผล/)
  expect(writes).toHaveLength(1);expect(lock).toHaveBeenLastCalledWith(true)
  const stored=sessionStorage.getItem('finntech.deletion.pending-receipt')!
  expect(JSON.parse(writes[0]!).requestKey).toBe(stored)
  expect(sessionStorage.length).toBe(1);expect(sessionStorage.getItem('finntech.deletion.pending-receipt')).not.toContain('password')
  view.unmount();render(<AccountDeletion initialKey={stored} lock={lock} done={done}/>)
  fireEvent.click(screen.getByRole('button',{name:'ตรวจผลคำขอลบเดิม'}))
  await screen.findByText(/รับคำขอลบแล้ว/)
  expect(writes).toHaveLength(1);expect(lock).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button',{name:'กลับไปเข้าสู่ระบบ'}))
  await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));expect(lock).toHaveBeenLastCalledWith(false)
})
it('respects existing navigation lock and requires explicit consent',()=>{
  render(<AccountDeletion locked lock={vi.fn()} done={vi.fn()}/>)
  expect(screen.getByRole('button',{name:'ยืนยันขอลบบัญชี'}).hasAttribute('disabled')).toBe(true)
  expect(screen.getByLabelText('รหัสผ่านปัจจุบัน').hasAttribute('disabled')).toBe(true)
})
