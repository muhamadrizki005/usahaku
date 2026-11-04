'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveReservationLockSettings } from '@/app/reservation-actions'
import { RestaurantField, restaurantInput, restaurantPanel, restaurantPrimary } from './restaurant-forms'

export default function RestaurantReservationSettings({ minutes, revision }: { minutes: number; revision: number }) {
  const router = useRouter(), busy = useRef(false), retry = useRef<{ minutes: number; revision: number; request: string } | null>(null)
  const [value, setValue] = useState(String(minutes)), [version, setVersion] = useState(revision), [pending, setPending] = useState(false), [locked, setLocked] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => {
    if (!busy.current && !retry.current) { setValue(String(minutes)); setVersion(revision) }
  }, [minutes, revision])
  return <section className={restaurantPanel}>
    <h2 className="text-lg font-normal">Pengaturan reservasi</h2>
    <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">Meja dikunci sebelum kedatangan agar tidak dipakai pesanan baru. Waktu ini juga diperhitungkan saat mencari jadwal reservasi. Pesanan yang sudah aktif tetap dapat diubah dan dibayar.</p>
    <form className="mt-4 space-y-4" onSubmit={async e => {
      e.preventDefault(); if (busy.current) return
      busy.current = true; setPending(true); setError(''); setNotice('')
      const packet = retry.current || { minutes: value === '' ? NaN : Number(value), revision: version, request: crypto.randomUUID() }
      try {
        const result = await saveReservationLockSettings(packet)
        if (result.value) {
          retry.current = null; setLocked(false); setVersion(result.value.revision); setValue(String(result.value.minutes))
          setNotice(result.value.conflicts ? `Tersimpan. Ada ${result.value.conflicts} pasangan reservasi dengan waktu penguncian bertumpuk. Reservasi tetap tersimpan; periksa dan atur ulang bersama pelanggan.` : 'Waktu penguncian tersimpan. Reservasi lama tetap dipertahankan.'); router.refresh()
        } else { setError(result.error || 'Belum tersimpan.'); retry.current = result.uncertain ? packet : null; setLocked(Boolean(result.uncertain)) }
      } catch { retry.current = packet; setLocked(true); setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.') }
      finally { busy.current = false; setPending(false) }
    }}>
      <fieldset disabled={pending || locked}><RestaurantField label="Penguncian sebelum kedatangan (menit)"><input required type="number" min={0} max={720} step={1} value={value} onChange={e => setValue(e.target.value)} className={restaurantInput}/></RestaurantField></fieldset>
      <p className="text-xs leading-5 text-[#c5cbd5]">0–720 menit. Contoh 120 menit: reservasi pukul 19.00 mengunci meja sejak 17.00. Mengubah pengaturan tidak membatalkan reservasi lama. Pelanggan tetap harus ditandai datang sebelum pelunasan.</p>
      {error && <p role="alert" className="text-sm text-[#ffb4ae]">{error}</p>}{notice && <p role="status" className="text-sm leading-6 text-[#24cbc5]">{notice}</p>}
      <button disabled={pending} className={restaurantPrimary}>{pending ? 'Menyimpan...' : locked ? 'Ulangi permintaan yang sama' : 'Simpan pengaturan reservasi'}</button>
    </form>
  </section>
}
