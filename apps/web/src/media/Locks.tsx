import {createContext,useCallback,useContext,useEffect,useRef,type ReactNode} from 'react'
const Scope=createContext<((id:object,value:boolean)=>void)|null>(null)
export function MediaLocks({lock,children}:{lock:(v:boolean)=>void;children:ReactNode}){
 const active=useRef(new Set<object>())
 const update=useCallback((id:object,value:boolean)=>{if(value)active.current.add(id);else active.current.delete(id);lock(active.current.size>0)},[lock])
 useEffect(()=>()=>lock(false),[lock])
 return <Scope.Provider value={update}>{children}</Scope.Provider>
}
export function useScopedMediaLock(fallback:(v:boolean)=>void){const scope=useContext(Scope),token=useRef({});return useCallback((value:boolean)=>{if(scope)scope(token.current,value);else fallback(value)},[scope,fallback])}
