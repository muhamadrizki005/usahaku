'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { RestaurantDialog, restaurantButton, restaurantInput, restaurantPrimary } from './restaurant-forms'
import { mapPointSchema, type MapAddress, type MapPoint } from '@/lib/business-map'

const MapCanvas = dynamic(() => import('./business-map-canvas'), { ssr: false, loading: () => <p role="status" className="py-16 text-center text-sm text-[#c5cbd5]">Memuat peta…</p> })
export function BusinessLocationMap({ value, disabled, onChange }: { value: MapPoint | null; disabled: boolean; onChange: (value: MapAddress | null) => void }) {
  const [open, setOpen] = useState(false)
  return <div className="space-y-2 text-sm">
    <p className="font-medium">Lokasi usaha</p>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={restaurantButton + ' inline-flex items-center gap-2'}><MapPin aria-hidden="true" className="size-4" />{value ? 'Ubah titik di peta' : 'Pilih titik di peta'}</button>
      {value && <button type="button" disabled={disabled} onClick={() => onChange(null)} className={restaurantButton}>Hapus titik</button>}
    </div>
    <p className="text-xs leading-5 text-[#c5cbd5]">Opsional. Pilih titik untuk membantu mengisi alamat; periksa kembali hasilnya sebelum menyimpan.</p>
    {value && <p className="text-xs text-[#24cbc5]">Titik dipilih: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p>}
    {open && <LocationDialog initial={value} close={() => setOpen(false)} apply={result => { onChange(result); setOpen(false) }} />}
  </div>
}

function LocationDialog({ initial, close, apply }: { initial: MapPoint | null; close: () => void; apply: (value: MapAddress) => void }) {
  const [point, setPoint] = useState(initial), [result, setResult] = useState<MapAddress | null>(null), [query, setQuery] = useState(''), [matches, setMatches] = useState<MapAddress[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const current = useRef<AbortController | null>(null), revision = useRef(0), alive = useRef(true)
  const [focusVersion, setFocusVersion] = useState(0)
  const [locating, setLocating] = useState(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false; current.current?.abort(); revision.current++ } }, [])
  useEffect(() => { locate() }, [])
  async function request(body: object) {
    current.current?.abort(); const controller = new AbortController(); current.current = controller; const version = ++revision.current
    setLocating(false); setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
      const data = await response.json()
      if (version !== revision.current) return null
      if (!response.ok) throw Error(data.error || 'Lokasi belum dapat dibaca.')
      return data.results as MapAddress[]
    } catch (failure) { if (version === revision.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Lokasi belum dapat dibaca.'); return null }
    finally { if (version === revision.current) setBusy(false) }
  }
  async function pick(next: MapPoint) {
    setLocating(false)
    if (!mapPointSchema.safeParse(next).success) { current.current?.abort(); revision.current++; setPoint(null); setResult(null); setBusy(false); setError('Pilih titik di wilayah Indonesia.'); return }
    setPoint(next); setMatches([])
    const data = await request({ mode: 'reverse', ...next })
    if (data) { setResult(data[0] || null); if (!data.length) setError('Alamat di titik ini belum ditemukan. Geser pin atau isi alamat secara manual.') }
  }
  async function search() {
    if (query.trim().length < 3) { setError('Ketik minimal 3 karakter untuk mencari lokasi.'); return }
    setMatches([])
    const data = await request({ mode: 'search', query: query.trim() })
    if (data) { setMatches(data); if (!data.length) setError('Lokasi tidak ditemukan. Coba nama jalan atau daerah lain.') }
  }
  function locate() {
    if (!navigator.geolocation) { setError('Browser ini tidak mendukung lokasi perangkat. Cari lokasi atau pilih titik pada peta.'); return }
    current.current?.abort(); const version = ++revision.current
    setLocating(true); setBusy(false); setError('')
    navigator.geolocation.getCurrentPosition(position => { if (alive.current && version === revision.current) { setLocating(false); setFocusVersion(value => value + 1); void pick({ latitude: position.coords.latitude, longitude: position.coords.longitude }) } }, failure => { if (alive.current && version === revision.current) { setLocating(false); setError(failure.code === 1 ? 'Izin lokasi ditolak. Cari alamat atau pilih titik secara manual.' : failure.code === 3 ? 'Lokasi perangkat belum didapat dalam batas waktu. Coba lagi atau cari alamat manual.' : 'Lokasi perangkat belum tersedia. Cari alamat atau pilih titik secara manual.') } }, { timeout: 10000, maximumAge: 0, enableHighAccuracy: true })
  }
  return <RestaurantDialog title="Pilih lokasi usaha" busy={false} close={close} wide>
    <div className="space-y-4">
      <div><label htmlFor="map-address-search" className="text-sm text-[#c5cbd5]">Cari lokasi atau alamat</label><div className="mt-1 flex gap-2"><input id="map-address-search" className={restaurantInput + ' mt-0'} maxLength={200} placeholder="Nama jalan, kota, atau tempat" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search() } }} /><button type="button" className={restaurantButton} disabled={busy} onClick={() => void search()}>Cari</button></div></div>
      <button type="button" className={restaurantButton} disabled={locating} onClick={locate}>Gunakan lokasi perangkat</button>
      {locating && <p role="status" className="text-sm text-[#c5cbd5]">Mendeteksi lokasi perangkat… Izinkan akses lokasi pada browser.</p>}
      {matches.length > 0 && <ul className="max-h-40 overflow-y-auto rounded-lg border border-[#454d5b]">{matches.map((match, index) => <li key={index}><button type="button" className="w-full px-3 py-2 text-left text-sm text-[#c5cbd5] hover:bg-[#303640] focus-visible:outline-2 focus-visible:outline-[#24cbc5]" onClick={() => { setFocusVersion(value => value + 1); void pick({ latitude: match.latitude, longitude: match.longitude }) }}>{match.display}</button></li>)}</ul>}
      <MapCanvas point={point} focusVersion={focusVersion} onPick={next => void pick(next)} />
      <p className="text-xs leading-5 text-[#c5cbd5]">Klik peta atau geser pin untuk memilih titik. Pencarian dan titik yang dipilih dikirim ke Geoapify.</p>
      {busy && <p role="status" className="text-sm text-[#c5cbd5]">Mencari alamat…</p>}
      {error && <p role="alert" className="text-sm text-[#ffb4ae]">{error}</p>}
      {point && <p className="text-xs text-[#c5cbd5]">Koordinat: {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</p>}
      {result && <div className="space-y-3 text-sm"><p>{result.display}</p><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[['Provinsi', result.province], ['Kota/Kabupaten', result.city], ['Kecamatan', result.district], ['Kelurahan/Desa', result.village]].map(([label, value]) => <div key={label}><dt className="text-xs text-[#c5cbd5]">{label}</dt><dd className="mt-1">{value || 'Belum ditemukan'}</dd></div>)}</dl>{result.incomplete && <p className="text-[#c5cbd5]">Sebagian wilayah belum cocok dengan daftar CSV. Lengkapi field yang kosong setelah menggunakan lokasi ini.</p>}</div>}
      {initial && !point && !busy && <p className="text-xs text-[#c5cbd5]">Pilih titik untuk memperbarui alamat.</p>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className={restaurantButton} onClick={close}>Batal</button><button type="button" className={restaurantPrimary} disabled={locating || busy || !result} onClick={() => result && apply(result)}>Gunakan lokasi ini</button></div>
    </div>
  </RestaurantDialog>
}
