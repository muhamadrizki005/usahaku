'use client'
import { useEffect,useRef,useState } from 'react'
import { RestaurantDialog,restaurantButton,restaurantInput,restaurantPrimary } from '@/components/restaurant-forms'

type Options={title:string;description:string;confirmLabel?:string;label?:string;maxLength?:number}
type Request=Options&{kind:'confirm'|'prompt';key:number}
export function useActionDialog(){
  const [request,setRequest]=useState<Request|null>(null),resolver=useRef<((value:string|null)=>void)|null>(null),sequence=useRef(0)
  useEffect(()=>()=>{resolver.current?.(null);resolver.current=null},[])
  function ask(options:Options,kind:Request['kind']){resolver.current?.(null);return new Promise<string|null>(resolve=>{resolver.current=resolve;setRequest({...options,kind,key:++sequence.current})})}
  function finish(value:string|null){resolver.current?.(value);resolver.current=null;setRequest(null)}
  return {confirm:async(options:Options)=>(await ask(options,'confirm'))!==null,prompt:(options:Options)=>ask(options,'prompt'),dialog:request?<ActionDialog key={request.key} request={request} finish={finish}/>:null}
}
function ActionDialog({request,finish}:{request:Request;finish:(value:string|null)=>void}){
  const [value,setValue]=useState('')
  return <RestaurantDialog title={request.title} busy={false} close={()=>finish(null)}><p className="mb-5 text-sm leading-6 text-[#c5cbd5]">{request.description}</p><form onSubmit={event=>{event.preventDefault();if(request.kind==='confirm'||value.trim())finish(request.kind==='confirm'?'confirmed':value.trim())}}>{request.kind==='prompt'&&<label className="block text-sm text-[#c5cbd5]">{request.label||'Nilai baru'}<input autoFocus required pattern=".*\S.*" data-validation-message="Isi kategori yang valid." maxLength={request.maxLength||100} value={value} onChange={event=>setValue(event.target.value)} className={restaurantInput}/></label>}<div className="mt-5 flex flex-wrap justify-end gap-3"><button autoFocus={request.kind==='confirm'} type="button" onClick={()=>finish(null)} className={restaurantButton}>Batal</button><button className={restaurantPrimary}>{request.confirmLabel||'Simpan'}</button></div></form></RestaurantDialog>
}
