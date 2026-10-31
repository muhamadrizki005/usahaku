'use client'
import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { saveRestaurantResource } from '@/app/restaurant-actions'
import type { RestaurantMenu, RestaurantTable } from '@/lib/restaurant'
import { rupiah } from '@/lib/pos'

export const restaurantPanel = 'rounded-2xl border border-[#454d5b]/50 bg-[#273242] p-5 sm:p-6'
export const restaurantInput = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[#454d5b] bg-[#273242] px-3 py-2 text-sm text-white outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20'
export const restaurantButton = 'min-h-11 rounded-lg border border-[#454d5b] px-4 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] disabled:opacity-50'
export const restaurantPrimary = restaurantButton + ' border-transparent bg-[#1835d9] hover:bg-[#132c9e]'
export function RestaurantField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId(), labelId = id + '-label'
  return <div className="min-w-0 text-sm text-[#c5cbd5]"><label id={labelId} htmlFor={id}>{label}</label>{isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-labelledby'?: string }>, { id, 'aria-labelledby': labelId }) : children}</div>
}
export function RestaurantDialog({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = dialog.current, previous = document.activeElement
    if (!el) return
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const controls = Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')).filter(item => item.getClientRects().length > 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); el.focus() }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === el)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    el.showModal(); el.addEventListener('keydown', trap)
    return () => { el.removeEventListener('keydown', trap); el.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return <dialog ref={dialog} aria-label={title} onCancel={e => { e.preventDefault(); if (!busy) close() }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[640px] overflow-y-auto rounded-2xl border border-[#454d5b] bg-[#273242] p-5 text-white backdrop:bg-black/60 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-4"><h2 className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">{title}</h2><button type="button" disabled={busy} onClick={close} aria-label="Tutup dialog" className={restaurantButton + ' shrink-0'}>Tutup</button></div>{children}
  </dialog>
}

export function RestaurantResources({ resource, menu = [], tables = [], usage = [] }: { resource: 'menu' | 'table'; menu?: RestaurantMenu[]; tables?: RestaurantTable[]; usage?: { id: string; occupied: boolean }[] }) {
  const router = useRouter()
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [editing, setEditing] = useState<RestaurantMenu | RestaurantTable | 'new' | null>(null), [notice, setNotice] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const occupiedHint = useId()
  const selectedTable = tables.find(table => table.id === viewing)
  const occupied = Boolean(selectedTable && usage.some(item => item.id === selectedTable.id && item.occupied))
  const title = resource === 'menu' ? 'menu' : 'meja'
  const items = resource === 'menu' ? menu : [...tables].sort((a, b) => a.name.localeCompare(b.name, 'id-ID', { numeric: true, sensitivity: 'base' }))
  const visible = items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  return <section className={restaurantPanel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-normal">{resource === 'menu' ? 'Daftar menu' : 'Daftar meja'}</h2><button type="button" onClick={() => { setNotice(''); setEditing('new') }} className={restaurantPrimary}>Tambah {title}</button></div>
    <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">{resource === 'menu' ? 'Atur harga dan ketersediaan menu. Stok bahan baku dan resep belum dihitung.' : 'Kapasitas diperiksa saat pesanan dibuat. Satu meja menampung satu pesanan terbuka.'}</p>
    {notice && <p role="status" className="mt-3 text-sm text-[#24cbc5]">{notice}</p>}
    <RestaurantField label={`Cari ${title}`}><input value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} className={restaurantInput} /></RestaurantField>
    {resource === 'table' ? <div className="mt-5">
      <div role="group" aria-label="Pilihan meja" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {visible.slice(page * 25, page * 25 + 25).map(item => {
          const taken = usage.some(table => table.id === item.id && table.occupied)
          return <button key={item.id} type="button" aria-label={item.name} aria-describedby={taken ? occupiedHint : undefined} aria-haspopup="dialog" title={taken ? `${item.name}: terpakai, tidak tersedia untuk pesanan baru` : item.name} onClick={() => setViewing(item.id)} className={'flex aspect-square min-w-0 items-center justify-center rounded-xl border border-[#454d5b] bg-[#1c222e] p-3 text-center text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] ' + (taken ? 'opacity-60' : 'hover:border-[#24cbc5] hover:bg-[#303640]')}><span className="line-clamp-3 [overflow-wrap:anywhere]">{item.name}</span></button>
        })}
      </div>
      <p id={occupiedHint} className="mt-3 text-xs leading-5 text-[#c5cbd5]">Meja pudar sedang terpakai dan tidak dapat dipilih untuk pesanan baru. Tekan meja untuk melihat detail.</p>
      {!visible.length && <p className="py-8 text-sm text-[#c5cbd5]">Belum ada meja yang sesuai.</p>}
    </div> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-[#c5cbd5]"><tr><th className="p-3 font-normal">Nama</th><th className="p-3 font-normal">Kategori / harga</th><th className="p-3 font-normal">Status</th><th className="p-3 font-normal">Tindakan</th></tr></thead><tbody>{visible.slice(page * 25, page * 25 + 25).map(item => <tr key={item.id} className="border-b border-[#454d5b]/50"><td className="max-w-64 break-words p-3">{item.name}</td><td className="p-3">{'price' in item && <>{item.category}<br />{rupiah(Number(item.price))}</>}</td><td className="p-3">{!item.active ? 'Nonaktif' : 'available' in item && (item.available ? 'Tersedia' : 'Habis')}</td><td className="p-3"><button type="button" onClick={() => setEditing(item)} className={restaurantButton} aria-label={`Ubah ${item.name}`}>Ubah</button></td></tr>)}</tbody></table>{!visible.length && <p className="py-8 text-sm text-[#c5cbd5]">Belum ada menu yang sesuai.</p>}</div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#c5cbd5]"><span>{visible.length} {title}</span><div className="flex gap-2"><button disabled={!page} onClick={() => setPage(v => v - 1)} className={restaurantButton}>Sebelumnya</button><button disabled={(page + 1) * 25 >= visible.length} onClick={() => setPage(v => v + 1)} className={restaurantButton}>Berikutnya</button></div></div>
    {resource === 'table' && selectedTable && <RestaurantDialog title={`Detail ${selectedTable.name}`} busy={false} close={() => setViewing(null)}>
      <dl className="space-y-4 text-sm"><div><dt className="text-[#c5cbd5]">Nama / nomor meja</dt><dd className="mt-1 break-words text-white [overflow-wrap:anywhere]">{selectedTable.name}</dd></div><div><dt className="text-[#c5cbd5]">Kapasitas</dt><dd className="mt-1 text-white">{selectedTable.capacity} orang</dd></div><div><dt className="text-[#c5cbd5]">Status</dt><dd className="mt-1 text-white">{!selectedTable.active ? 'Nonaktif' : occupied ? 'Terpakai' : 'Tersedia'}</dd></div></dl>
      <p className="mt-5 text-sm leading-6 text-[#c5cbd5]">{!selectedTable.active ? 'Meja nonaktif tidak dapat dipilih untuk pesanan baru.' : occupied ? 'Meja ini memiliki pesanan yang belum dibayar.' : 'Belum ada pesanan terbuka pada meja ini.'}</p>
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => { setViewing(null); setEditing(selectedTable) }} className={restaurantPrimary}>Ubah meja</button></div>
    </RestaurantDialog>}
    {editing && <ResourceEditor resource={resource} initial={editing === 'new' ? null : editing} close={() => setEditing(null)} saved={() => { setEditing(null); setNotice(`${resource === 'menu' ? 'Menu' : 'Meja'} tersimpan.`); router.refresh() }} />}
  </section>
}

function ResourceEditor({ resource, initial, close, saved }: { resource: 'menu' | 'table'; initial: RestaurantMenu | RestaurantTable | null; close: () => void; saved: () => void }) {
  const id = useRef(initial?.id || crypto.randomUUID()), busy = useRef(false)
  const [name, setName] = useState(initial?.name || ''), [active, setActive] = useState(initial?.active ?? true)
  const initialCategory = initial && 'category' in initial ? initial.category : 'Makanan'
  const [category, setCategory] = useState(['Makanan', 'Minuman'].includes(initialCategory) ? initialCategory : 'Lainnya'), [custom, setCustom] = useState(initialCategory)
  const [price, setPrice] = useState(initial && 'price' in initial ? String(initial.price) : '0'), [available, setAvailable] = useState(initial && 'available' in initial ? initial.available : true)
  const [capacity, setCapacity] = useState(initial && 'capacity' in initial ? String(initial.capacity) : '2')
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const retry = useRef<{ input: { id: string; revision: number | null; request: string }; details: unknown } | null>(null)
  const [locked, setLocked] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy.current) return
    busy.current = true; setPending(true); setError('')
    const packet = retry.current || { input: { id: id.current, revision: initial?.revision ?? null, request: crypto.randomUUID() }, details: resource === 'menu' ? { name, category: category === 'Lainnya' ? custom : category, price, active, available } : { name, capacity: Number(capacity), active } }
    try { const result = await saveRestaurantResource(resource, packet.input, packet.details); if (result.value) { saved(); return } setError(result.error || 'Belum tersimpan.'); retry.current = result.uncertain ? packet : null; setLocked(Boolean(result.uncertain)) }
    catch { retry.current = packet; setLocked(true); setError('Hasil belum pasti. Coba ulang permintaan yang sama atau muat ulang untuk memeriksa.') }
    finally { busy.current = false; setPending(false) }
  }
  return <RestaurantDialog title={`${initial ? 'Ubah' : 'Tambah'} ${resource === 'menu' ? 'menu' : 'meja'}`} busy={pending} close={close}><form onSubmit={submit}><fieldset disabled={pending || locked} className="space-y-4">
    <RestaurantField label="Nama"><input required maxLength={resource === 'menu' ? 100 : 60} value={name} onChange={e => setName(e.target.value)} className={restaurantInput} /></RestaurantField>
    {resource === 'menu' ? <><RestaurantField label="Kategori menu"><select value={category} onChange={e => setCategory(e.target.value)} className={restaurantInput}><option>Makanan</option><option>Minuman</option><option>Lainnya</option></select></RestaurantField>{category === 'Lainnya' && <RestaurantField label="Kategori lainnya"><input required maxLength={100} value={custom} onChange={e => setCustom(e.target.value)} className={restaurantInput} /></RestaurantField>}<RestaurantField label="Harga menu"><input required inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} className={restaurantInput} /></RestaurantField><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} />Menu tersedia</label></> : <RestaurantField label="Kapasitas orang"><input required type="number" min={1} max={1000} value={capacity} onChange={e => setCapacity(e.target.value)} className={restaurantInput} /></RestaurantField>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Aktif</label>
  </fieldset>{error && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={pending} onClick={close} className={restaurantButton}>Batal</button><button disabled={pending} className={restaurantPrimary}>{pending ? 'Menyimpan...' : locked ? 'Ulangi permintaan yang sama' : 'Simpan'}</button></div></form></RestaurantDialog>
}
