'use client'
import { useEffect, useState } from 'react'
import { saveStoreTax } from '@/app/tax-actions'
export default function StoreTaxSettings({rate,revision,onSaved}:{rate:number;revision:number;onSaved:(rate:number,revision:number)=>void}) {
  const [value,setValue]=useState(String(rate)),[pending,setPending]=useState(false),[notice,setNotice]=useState('')
  useEffect(()=>setValue(String(rate)),[rate,revision])
  async function save(){if(pending)return;setPending(true);setNotice('');try{const result=await saveStoreTax(value,revision);if(result.error)setNotice(result.error);else if(result.rate!==undefined&&result.revision!==undefined){onSaved(result.rate,result.revision);setNotice('Pajak tersimpan.')}}catch{setNotice('Penyimpanan belum pasti. Muat ulang untuk memeriksa.')}finally{setPending(false)}}
  return <details className="mt-4 rounded-xl border border-[#454d5b] p-3 text-sm"><summary className="cursor-pointer">Pengaturan pajak toko</summary><fieldset disabled={pending} className="mt-3 space-y-3"><label className="block">Pajak (%)<input aria-label="Pajak toko (%)" type="number" min="0" max="100" step="0.01" value={value} onChange={e=>setValue(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#454d5b] bg-[#1c222e] px-3" /></label><p className="text-xs text-[#c5cbd5]">Ditambahkan setelah diskon produk. Isi 0 untuk tanpa pajak. Berlaku untuk transaksi berikutnya.</p><button type="button" onClick={save} className="min-h-11 rounded-lg bg-[#1835d9] px-3 text-white">{pending?'Menyimpan...':'Simpan pajak'}</button></fieldset>{notice&&<p role="status" className="mt-2 text-xs text-[#c5cbd5]">{notice}</p>}</details>
}
