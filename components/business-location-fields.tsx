'use client'

import { useEffect, useState } from 'react'
import { RegionCombobox } from './ui/region-combobox'
import { businessProvinces, citiesForProvince, findBusinessCity, findBusinessProvince, type BusinessLocation } from '@/lib/business-regions'
import type { RegionOption } from '@/lib/business-region-details'

function useChildren(level: 'district' | 'village', parent: string | undefined) {
  const [state, setState] = useState<{ parent?: string; rows: RegionOption[]; error: boolean }>({ rows: [], error: false }), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!parent) return
    const controller = new AbortController()
    setState({ rows: [], error: false })
    fetch(`/api/regions?level=${level}&parent=${parent}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('Region load failed')
      const rows: RegionOption[] = await response.json()
      if (!controller.signal.aborted) setState({ parent, rows, error: false })
    }).catch(error => { if (error.name !== 'AbortError') setState({ parent, rows: [], error: true }) })
    return () => controller.abort()
  }, [level, parent, retry])
  return { rows: state.parent === parent ? state.rows : [], loading: Boolean(parent && state.parent !== parent), error: state.parent === parent && state.error, retry: () => setRetry(value => value + 1) }
}
export function BusinessLocationFields({ value, previous, disabled, onChange }: { value: BusinessLocation; previous?: Partial<BusinessLocation>; disabled: boolean; onChange: (value: BusinessLocation) => void }) {
  const province = findBusinessProvince(value.province), city = province ? findBusinessCity(province.id, value.city) : undefined
  const districts = useChildren('district', city?.id), district = districts.rows.find(row => row.name === value.district)
  const villages = useChildren('village', district?.id)
  const legacy = previous?.province === value.province && previous?.city === value.city
  const provinceOptions = businessProvinces.map(row => ({ value: row.id, label: row.label }))
  const cityOptions = (province ? citiesForProvince(province.id) : []).map(row => ({ value: row.id, label: row.label }))
  if (legacy && !province && value.province) provinceOptions.unshift({ value: 'legacy', label: value.province + ' (tersimpan)' })
  if (legacy && !city && value.city) cityOptions.unshift({ value: 'legacy', label: value.city + ' (tersimpan)' })
  return <div className="grid min-w-0 gap-5 sm:grid-cols-2">
    <RegionCombobox label="Provinsi *" value={province?.id || (legacy ? 'legacy' : '')} options={provinceOptions} placeholder="Cari provinsi" disabled={disabled} onChange={id => { const selected = businessProvinces.find(row => row.id === id); if (selected && id !== province?.id) onChange({ province: selected.label, city: '', district: '', village: '' }) }} />
    <RegionCombobox key={province?.id || 'none'} label="Kota/Kabupaten *" value={city?.id || (legacy ? 'legacy' : '')} options={cityOptions} placeholder={province ? 'Cari kota/kabupaten' : 'Pilih provinsi terlebih dahulu'} disabled={disabled || !province} onChange={id => { const selected = cityOptions.find(row => row.value === id); if (selected && id !== city?.id) onChange({ ...value, city: selected.label, district: '', village: '' }) }} />
    <RegionCombobox key={'district-' + city?.id} label="Kecamatan" value={value.district || ''} options={districts.rows.map(row => ({ value: row.name, label: row.name }))} placeholder={!city ? 'Pilih kota/kabupaten terlebih dahulu' : districts.loading ? 'Memuat kecamatan…' : 'Cari kecamatan'} disabled={disabled || !city || districts.loading || districts.error} onChange={name => { if (name !== value.district) onChange({ ...value, district: name, village: '' }) }} />
    <RegionCombobox key={'village-' + district?.id} label="Kelurahan/Desa" value={value.village || ''} options={villages.rows.map(row => ({ value: row.name, label: row.name }))} placeholder={!district ? 'Pilih kecamatan terlebih dahulu' : villages.loading ? 'Memuat kelurahan/desa…' : 'Cari kelurahan/desa'} disabled={disabled || !district || villages.loading || villages.error} onChange={name => onChange({ ...value, village: name })} />
    {(districts.error || villages.error) && <p role="alert" className="text-sm text-[#ffb4ae] sm:col-span-2">Daftar wilayah belum dapat dimuat. <button type="button" className="underline" onClick={() => { if (districts.error) districts.retry(); if (villages.error) villages.retry() }}>Coba lagi</button></p>}
    {legacy && (!province || !city) && <p className="text-xs leading-5 text-[#c5cbd5] sm:col-span-2">Lokasi lama tetap tersimpan. Pilih ulang provinsi dan kota/kabupaten untuk melengkapi kecamatan dan kelurahan/desa.</p>}
  </div>
}
