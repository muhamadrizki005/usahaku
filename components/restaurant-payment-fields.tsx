'use client'
import { enabledPaymentMethods, type PaymentSettings } from '@/lib/business-payments'
import { paymentLabel, type Sale } from '@/lib/pos'
import { RestaurantField, restaurantInput } from './restaurant-forms'

export default function RestaurantPaymentFields({ settings, method, onChange, label='Metode pembayaran' }: { settings: PaymentSettings; method: Sale['payment']; onChange: (v: Sale['payment']) => void; label?: string }) {
  const methods = enabledPaymentMethods(settings)
  return <div className="space-y-3"><RestaurantField label={label}><select disabled={!methods.length} value={methods.includes(method)?method:''} onChange={e=>onChange(e.target.value as Sale['payment'])} className={restaurantInput}>{!methods.includes(method)&&<option value="">Pilih metode aktif</option>}{methods.map(m=><option key={m} value={m}>{paymentLabel[m]}{m!=='cash'?' manual':''}</option>)}</select></RestaurantField>
    {!methods.length&&<p role="alert" className="text-sm text-[#ffb4ae]">Belum ada metode pembayaran aktif. Minta owner mengaturnya melalui Pengaturan.</p>}
    {method==='qris'&&settings.qris&&<>{settings.qrisImage?<img src={settings.qrisImage} alt="QRIS usaha" width={224} height={224} className="h-56 max-w-full rounded-lg bg-white object-contain"/>:<p className="text-sm text-[#c5cbd5]">Gambar QRIS belum tersedia. Periksa QRIS usaha secara langsung sebelum mengonfirmasi pembayaran.</p>}</>}
    {method==='transfer'&&settings.transfer&&<ul className="space-y-2 text-sm text-[#c5cbd5]">{settings.banks.map((b,i)=><li key={i} className="break-words">{b.bank} / {b.account}<br/>a.n. {b.holder}</li>)}</ul>}
    {method==='ewallet'&&settings.ewallet&&<ul className="space-y-2 text-sm text-[#c5cbd5]">{settings.ewallets.map((e,i)=><li key={i} className="break-words">{e.ewallet} / {e.number}<br/>a.n. {e.holder}</li>)}</ul>}
  </div>
}
