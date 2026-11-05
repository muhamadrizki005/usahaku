'use client'
import { useEffect,useState } from 'react'
import { createPortal } from 'react-dom'
import { constraintMessage } from '@/lib/form-feedback'

type Control=HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement
type Entry={field:Control;display:HTMLElement;slot:HTMLDivElement;id:string;message:string;originalInvalid:string|null;originalDescription:string|null}
export function FormFeedback({children}:{children:React.ReactNode}){
  const [entries,setEntries]=useState<Entry[]>([])
  useEffect(()=>{
    const records=new Map<Control,Entry>();let first:Control|null=null;let sequence=0;let focusFrame=0
    const isControl=(v:unknown):v is Control=>v instanceof HTMLInputElement||v instanceof HTMLTextAreaElement||v instanceof HTMLSelectElement
    const publish=()=>setEntries([...records.values()])
    function clear(field:Control){const entry=records.get(field);if(!entry)return;records.delete(field);entry.slot.remove();const display=entry.display;if(entry.originalInvalid===null)display.removeAttribute('aria-invalid');else display.setAttribute('aria-invalid',entry.originalInvalid);if(entry.originalDescription===null)display.removeAttribute('aria-describedby');else display.setAttribute('aria-describedby',entry.originalDescription)}
    function invalid(event:Event){
      if(!isControl(event.target))return
      event.preventDefault();const field=event.target
      let entry=records.get(field)
      if(!entry){const slot=document.createElement('div'),id=`usahaku-field-error-${++sequence}`,display=(field.dataset.validationTarget?document.getElementById(field.dataset.validationTarget):field)||field;const target=field.closest('[data-feedback-anchor]')||field.closest('label')||field;target.after(slot);entry={field,display,slot,id,message:'',originalInvalid:display.getAttribute('aria-invalid'),originalDescription:display.getAttribute('aria-describedby')};records.set(field,entry)}
      entry.message=constraintMessage(field);entry.display.setAttribute('aria-invalid','true');entry.display.setAttribute('aria-describedby',[entry.originalDescription,entry.id].filter(Boolean).join(' '));publish()
      if(!first){first=field;focusFrame=requestAnimationFrame(()=>{if(first?.isConnected){const target=first.dataset.validationTarget?document.getElementById(first.dataset.validationTarget):first;target?.focus();target?.scrollIntoView({block:'nearest'})}first=null})}
    }
    function change(event:Event){if(!isControl(event.target)||!records.has(event.target))return;const field=event.target;if(field.validity.valid)clear(field);else records.get(field)!.message=constraintMessage(field);publish()}
    function reset(event:Event){if(!(event.target instanceof HTMLFormElement))return;for(const field of records.keys())if(event.target.contains(field))clear(field);publish()}
    const observer=new MutationObserver(()=>{let changed=false;for(const [field,entry]of records)if(!field.isConnected||!entry.slot.isConnected){clear(field);changed=true}if(changed)publish()})
    observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('invalid',invalid,true);document.addEventListener('input',change);document.addEventListener('change',change);document.addEventListener('reset',reset)
    return()=>{cancelAnimationFrame(focusFrame);observer.disconnect();document.removeEventListener('invalid',invalid,true);document.removeEventListener('input',change);document.removeEventListener('change',change);document.removeEventListener('reset',reset);for(const field of records.keys())clear(field)}
  },[])
  return <>{children}{entries.map(entry=>createPortal(<p id={entry.id} role="alert" className="mt-2 text-sm leading-5 text-[#ffb4ae]">{entry.message}</p>,entry.slot,entry.id))}</>
}
