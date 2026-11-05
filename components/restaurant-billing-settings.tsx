'use client'
import { SelectInput } from '@/components/ui/select-input'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveRestaurantBilling } from '@/app/restaurant-billing-actions'
import type { RestaurantBilling } from '@/lib/restaurant-billing'
import { RestaurantField, restaurantInput, restaurantPanel, restaurantPrimary } from './restaurant-forms'

export default function RestaurantBillingSettings({ initial }: { initial: RestaurantBilling }) {
  const router = useRouter(), busy = useRef(false), retry = useRef<{ details: unknown; revision: number } | null>(null)
  const [settings,setSettings] = useState(initial), [tax,setTax] = useState(String(initial.tax_rate)), [service,setService] = useState(String(initial.service_rate)), [base,setBase] = useState(initial.tax_base), [scope,setScope] = useState(initial.service_scope)
  const [pending,setPending] = useState(false), [locked,setLocked] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('')
  useEffect(() => { if (!busy.current && !retry.current) { setSettings(initial);setTax(String(initial.tax_rate));setService(String(initial.service_rate));setBase(initial.tax_base);setScope(initial.service_scope) } }, [initial])
  return <section className={restaurantPanel}><h2 className="text-lg font-normal">Pajak & biaya layanan</h2><p className="mt-2 text-sm leading-6 text-[#c5cbd5]">Atur sesuai kebijakan usaha. Perhitungan dimulai dari subtotal setelah diskon. Tarif dan dasar hitung dicatat pada transaksi; perubahan berikutnya tidak mengubah struk lama.</p>
    <form className="mt-4 space-y-4" onSubmit={async e=>{e.preventDefault();if(busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');const packet=retry.current||{details:{taxRate:tax,serviceRate:service,taxBase:base,serviceScope:scope},revision:settings.revision};try{const r=await saveRestaurantBilling(packet.details,packet.revision);if(r.value){retry.current=null;setLocked(false);setSettings(r.value);setNotice('Pajak dan biaya layanan tersimpan.');router.refresh()}else{setError(r.error||'Belum tersimpan.');retry.current=r.uncertain?packet:null;setLocked(Boolean(r.uncertain))}}catch{retry.current=packet;setLocked(true);setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.')}finally{busy.current=false;setPending(false)}}}>
      <fieldset disabled={pending||locked} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><RestaurantField label="Pajak restoran (%)"><input required inputMode="decimal" value={tax} onChange={e=>setTax(e.target.value)} className={restaurantInput}/></RestaurantField><RestaurantField label="Biaya layanan (%)"><input required inputMode="decimal" value={service} onChange={e=>setService(e.target.value)} className={restaurantInput}/></RestaurantField></div>
      <RestaurantField label="Dasar perhitungan pajak"><SelectInput value={base} onChange={e=>setBase(e.target.value as typeof base)} className={restaurantInput}><option value="net">Subtotal setelah diskon</option><option value="net_service">Subtotal setelah diskon + biaya layanan</option></SelectInput></RestaurantField>
      <RestaurantField label="Biaya layanan berlaku untuk"><SelectInput value={scope} onChange={e=>setScope(e.target.value as typeof scope)} className={restaurantInput}><option value="dine_in">Makan di tempat saja</option><option value="all">Makan di tempat dan bawa pulang</option></SelectInput></RestaurantField><p className="text-xs leading-5 text-[#c5cbd5]">Isi 0 untuk menonaktifkan. Maksimal 100%, dua desimal menggunakan titik. Pembulatan dilakukan per komponen ke rupiah terdekat. DP mengurangi total setelah diskon, layanan dan pajak.</p></fieldset>
      {error&&<p role="alert" className="text-sm text-[#ffb4ae]">{error}</p>}{notice&&<p role="status" className="text-sm text-[#24cbc5]">{notice}</p>}<button disabled={pending} className={restaurantPrimary}>{pending?'Menyimpan...':locked?'Ulangi permintaan yang sama':'Simpan pajak & layanan'}</button>
    </form></section>
}
