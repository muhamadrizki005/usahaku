'use client'
import {useEffect,useState} from 'react'
import { CustomSelect } from '@/components/ui/custom-select'
import {searchPosCustomers} from '@/app/customer-actions'
import type {PosCustomer} from '@/lib/customers'
export default function PosCustomerPicker({value,onChange}:{value:PosCustomer|null;onChange:(v:PosCustomer|null)=>void}){
  const [query,setQuery]=useState(''),[results,setResults]=useState<PosCustomer[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  useEffect(()=>{
    let current=true;setResults([]);setError('');setLoading(false)
    if(query.trim().length<2)return
    setLoading(true)
    const timer=setTimeout(async()=>{try{const response=await searchPosCustomers(query);if(current){setResults(response.customers);setError(response.error||'')}}catch{if(current)setError('Pencarian belum berhasil. Coba lagi.')}finally{if(current)setLoading(false)}},250)
    return()=>{current=false;clearTimeout(timer)}
  },[query])
  const choices=[...(value?[value]:[]),...results.filter(c=>c.id!==value?.id)]
  return <><input aria-label="Cari pelanggan POS" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama atau telepon (min. 2 karakter)" className="mt-1 h-9 w-full rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm"/><CustomSelect
  id="customer"
  ariaLabel="Pilih pelanggan POS"
  value={value?.id || ''}
  options={[
    { value: '', label: 'Pelanggan umum' },
    ...choices.map(c => ({
      value: c.id,
      label: c.name + (c.phone ? ' — ' + c.phone : ''),
    })),
  ]}
  onChange={val => onChange(choices.find(c => c.id === val) || null)}
  size="sm"
  className="mt-1 w-full"
/><p aria-live="polite" className="mt-1 text-xs text-[#a4a7ac]">{error|| (loading?'Mencari pelanggan…':query.trim().length>=2?(results.length?'Pilih pelanggan dari hasil pencarian. Maksimal 20 hasil.':'Tidak ada pelanggan aktif yang cocok.'):'Tanpa memilih profil, transaksi memakai pelanggan umum.')}</p></>
}
