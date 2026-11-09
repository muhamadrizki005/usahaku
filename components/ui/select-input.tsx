'use client'
import { Children,isValidElement,useEffect,useId,useRef,useState,type SelectHTMLAttributes,type ChangeEvent,type ReactNode } from 'react'
import { CustomSelect,type CustomSelectOption } from './custom-select'

function optionsFrom(children:ReactNode,group?:string):CustomSelectOption[]{
  return Children.toArray(children).flatMap(child=>{
    if(!isValidElement<{children?:ReactNode;value?:string|number;disabled?:boolean;label?:string}>(child))return []
    if(child.type==='optgroup')return optionsFrom(child.props.children,child.props.label)
    if(child.type!== 'option')return optionsFrom(child.props.children,group)
    const label=Children.toArray(child.props.children).join('')
    return [{value:String(child.props.value??label),label,disabled:child.props.disabled,group}]
  })
}
export function SelectInput({children,value,defaultValue,onChange,name,required,disabled,id,'aria-label':label,'aria-labelledby':labelledBy,className,dropdownClassName,contentAlign='left',...props}:SelectHTMLAttributes<HTMLSelectElement> & {contentAlign?:'left'|'center'|'right'; dropdownClassName?:string}){
  const generated=useId(),triggerId=id||generated,options=optionsFrom(children),[draft,setDraft]=useState(String(defaultValue??(options[0] as {value?:string})?.value??'')),field=useRef<HTMLInputElement>(null)
  const current=String(value??draft)
  useEffect(()=>{if(value===undefined&&defaultValue!==undefined)setDraft(String(defaultValue))},[value,defaultValue])
  useEffect(()=>{field.current?.dispatchEvent(new Event('input',{bubbles:true}))},[current])
  return <span data-feedback-anchor className="block min-w-0"><CustomSelect id={triggerId} ariaLabel={label} aria-labelledby={labelledBy} disabled={disabled} options={options} value={current} contentAlign={contentAlign} className="block w-full min-w-0" triggerClassName={className} dropdownClassName={dropdownClassName} onChange={next=>{setDraft(next);onChange?.({target:{value:next},currentTarget:{value:next}} as ChangeEvent<HTMLSelectElement>)}}/>
    {name&&<input type="hidden" name={name} value={current} disabled={disabled}/>}
    {required&&<input ref={field} type="text" className="sr-only" tabIndex={-1} aria-hidden="true" data-validation-target={triggerId} value={current} required disabled={disabled} onChange={()=>{}}/>}
  </span>
}
