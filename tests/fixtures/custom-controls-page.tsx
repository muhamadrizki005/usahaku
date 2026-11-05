'use client'
import { useState } from 'react'
import { RestaurantDialog,RestaurantField,restaurantInput,restaurantButton } from '@/components/restaurant-forms'
import { SelectInput } from '@/components/ui/select-input'
import { NumericInput } from '@/components/ui/numeric-input'
import { TimeInput } from '@/components/ui/time-input'
import { DateField } from '@/components/ui/date-field'
import { useActionDialog } from '@/components/ui/action-dialog'
export default function ControlsQa(){
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(''),[time,setTime]=useState(''),[result,setResult]=useState(''),[dialogResult,setDialogResult]=useState(''),[maximum,setMaximum]=useState(100),action=useActionDialog()
 return <main className="min-h-screen bg-[#1c222e] p-5 text-white"><h1>Kontrol QA sementara</h1>{action.dialog}<button className={restaurantButton} onClick={()=>setOpen(true)}>Buka kontrol QA</button><button className={restaurantButton} onClick={async()=>setDialogResult(String(await action.prompt({title:'Ubah kategori QA',description:'Data uji lokal, tidak menyimpan ke database.',label:'Kategori baru'})))}>Uji prompt</button><button className={restaurantButton} onClick={async()=>setDialogResult(String(await action.confirm({title:'Konfirmasi QA',description:'Data uji lokal, tidak mengubah database.',confirmLabel:'Lanjutkan'})))}>Uji konfirmasi</button><p data-dialog-result>{dialogResult}</p>
 {open&&<RestaurantDialog title="Kontrol QA" busy={false} close={()=>setOpen(false)}><form className="space-y-4" onSubmit={e=>{e.preventDefault();setResult(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))))}}>
 <RestaurantField label="Alasan pembatalan reservasi"><textarea name="reason" required minLength={3} maxLength={300} className={restaurantInput}/></RestaurantField>
 <RestaurantField label="Email QA"><input name="email" type="email" required className={restaurantInput}/></RestaurantField>
 <RestaurantField label="Harga QA"><NumericInput name="price" required min={1} max={maximum} step="0.01" className={restaurantInput}/></RestaurantField><button type="button" className={restaurantButton} onClick={()=>setMaximum(200)}>Ubah batas QA</button>
 <RestaurantField label="Pilihan QA"><SelectInput required name="choice" value={choice} onChange={e=>setChoice(e.target.value)} className={restaurantInput}><option value="" disabled>Pilih opsi</option><option value="one">Opsi satu</option><option value="blocked" disabled>Opsi tidak tersedia</option><option value="two">Opsi dua dengan nama panjang untuk menguji batas layar</option></SelectInput></RestaurantField>
 <RestaurantField label="Jam QA"><TimeInput name="time" required value={time} onChange={e=>setTime(e.target.value)} className={restaurantInput}/></RestaurantField>
 <label className="block text-sm">Tanggal QA<DateField label="Tanggal QA" name="date" value="2026-11-05"/></label>
 <label className="flex min-h-11 gap-3 text-sm"><input type="checkbox" name="confirmed" required/>Konfirmasi QA</label><button className={restaurantButton}>Simpan QA</button><p role="status" data-result>{result}</p>
 </form></RestaurantDialog>}</main>
}
