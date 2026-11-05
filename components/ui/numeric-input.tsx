'use client'
import { forwardRef,useEffect,useImperativeHandle,useRef,type InputHTMLAttributes } from 'react'
import { numericProblem } from '@/lib/form-feedback'
export const NumericInput=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>>(function NumericInput({type:_type,min,max,step,onChange,value,defaultValue,inputMode,...props},ref){
  const input=useRef<HTMLInputElement>(null)
  useImperativeHandle(ref,()=>input.current!,[])
  useEffect(()=>{if(input.current){input.current.setCustomValidity(numericProblem(input.current.value,min,max,step));input.current.dispatchEvent(new Event('input',{bubbles:true}))}},[value,min,max,step])
  return <input {...props} ref={input} type="text" inputMode={inputMode||(step!==undefined&&step!==1&&step!=='1'?'decimal':'numeric')} value={value} defaultValue={defaultValue} data-numeric-input onChange={event=>{event.currentTarget.setCustomValidity(numericProblem(event.currentTarget.value,min,max,step));onChange?.(event)}}/>
})
