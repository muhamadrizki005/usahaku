'use client'
import { useState } from 'react'
import { saveSalonSettings } from '@/app/salon-operation-actions'
import { notify } from '@/lib/notifications'
import type { SalonSettings } from '@/lib/salon-operations'
import { NumericInput } from './ui/numeric-input'
import { RestaurantField,restaurantPanel,restaurantInput,restaurantPrimary } from './restaurant-forms'

export default function SalonOperationSettings({initial}:{initial:SalonSettings}){
  const [buffer,setBuffer]=useState(String(initial.buffer_minutes))
  const [tax]=useState(String(initial.tax_rate))
  const [revision,setRevision]=useState(initial.revision)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  return (
    <section className={restaurantPanel}>
      <h2 className="text-xl">Pengaturan kunjungan salon</h2>
      <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">
        Jeda digunakan untuk persiapan setelah layanan dan diperhitungkan saat membuat atau mengubah jadwal kunjungan. Jadwal yang sudah dibuat tetap memakai jeda yang tersimpan.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async e => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          setNotice('')
          try {
            const result = await saveSalonSettings({ buffer, taxRate: tax }, revision)
            if (result.value) {
              setRevision(result.value.revision)
              setNotice('Pengaturan salon tersimpan.')
              notify({
                title: 'Pengaturan Kunjungan Salon Diperbarui',
                message: 'Pengaturan jeda persiapan salon berhasil disimpan.',
                category: 'system',
              })
            } else {
              setError(result.error || 'Belum tersimpan.')
            }
          } catch {
            setError('Hasil penyimpanan belum pasti. Muat ulang sebelum mencoba lagi.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy} className="max-w-md">
          <RestaurantField label="Jeda persiapan (menit)">
            <NumericInput
              required
              min={0}
              max={120}
              value={buffer}
              onChange={e => setBuffer(e.target.value)}
              className={restaurantInput}
            />
          </RestaurantField>
        </fieldset>
        {error && <p role="alert" className="text-sm text-[#ffb4ae]">{error}</p>}
        {notice && <p role="status" className="text-sm text-[#24cbc5]">{notice}</p>}
        <button disabled={busy} className={restaurantPrimary}>
          {busy ? 'Menyimpan...' : 'Simpan pengaturan salon'}
        </button>
      </form>
    </section>
  )
}
