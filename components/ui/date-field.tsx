'use client'
import { useEffect,useState } from 'react'
import { DatePicker } from './date-picker'
export function DateField({label,name,value,min='2000-01-01',max='2100-12-31'}:{label:string;name:string;value:string;min?:string;max?:string}){
  const [current,setCurrent]=useState(value)
  useEffect(()=>setCurrent(value),[value])
  return <><DatePicker label={label} value={current} onChange={setCurrent} minDate={min} maxDate={max} className="mt-1 w-full"/><input type="hidden" name={name} value={current}/></>
}
