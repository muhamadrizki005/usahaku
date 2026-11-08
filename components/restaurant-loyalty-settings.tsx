'use client'
import {useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {saveRestaurantLoyalty} from '@/app/restaurant-actions'
import type {RestaurantBilling} from '@/lib/restaurant-billing'
import {RestaurantField,restaurantInput,restaurantPanel,restaurantPrimary} from './restaurant-forms'
import {NumericInput} from './ui/numeric-input'

export default function RestaurantLoyaltySettings({initial}:{initial:RestaurantBilling}){
 const router=useRouter(),busy=useRef(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [active,setActive]=useState(initial.loyalty_active??false),[nominal,setNominal]=useState(String(initial.earn_nominal??10000)),[redemption,setRedemption]=useState(initial.redemption_active??false),[value,setValue]=useState(String(initial.point_value??0))
 return <section className={restaurantPanel+' mt-5'}><h2 className="text-lg">Poin member restoran</h2><form className="mt-4 space-y-4" onSubmit={async e=>{e.preventDefault();if(busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');try{const r=await saveRestaurantLoyalty({active,nominal,redemption,pointValue:value},initial.revision);if(r.error)setError(r.error);else{setNotice('Pengaturan poin tersimpan.');router.refresh()}}catch{setError('Hasil belum pasti. Muat ulang untuk memeriksa.')}finally{busy.current=false;setPending(false)}}}>
 <fieldset disabled={pending} className="space-y-4"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Aktifkan perolehan poin</label>
 <RestaurantField label="Belanja untuk memperoleh 1 poin (Rp)"><NumericInput required min={1} max={1000000000} value={nominal} onChange={e=>setNominal(e.target.value)} className={restaurantInput}/></RestaurantField>
 <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={redemption} onChange={e=>setRedemption(e.target.checked)}/>Aktifkan penukaran poin</label>
 <RestaurantField label="Nilai 1 poin (Rp)"><NumericInput required min={redemption?1:0} max={1000000000} value={value} onChange={e=>setValue(e.target.value)} className={restaurantInput}/></RestaurantField>
 <p className="text-xs leading-5 text-[#c5cbd5]">Poin diperoleh saat pelunasan dari total akhir, seperti toko; DP sendiri belum menghasilkan poin. Penukaran memotong subtotal setelah diskon, sebelum biaya layanan/pajak. Penukaran awalnya nonaktif. Pembatalan mengembalikan poin yang ditukar dan menarik poin perolehan sebatas saldo tersedia.</p></fieldset>
 {error&&<p role="alert" className="text-sm text-[#ffb4ae]">{error}</p>}{notice&&<p role="status" className="text-sm text-[#24cbc5]">{notice}</p>}<button disabled={pending} className={restaurantPrimary}>{pending?'Menyimpan...':'Simpan poin member'}</button>
 </form></section>
}
