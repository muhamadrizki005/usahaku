'use client'
import { SelectInput } from '@/components/ui/select-input'
import { NumericInput } from '@/components/ui/numeric-input'
import { cloneElement, isValidElement, useEffect, useId, useRef, useState, useTransition, type ReactElement, type ReactNode, type FormEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { saveRestaurantResource, deleteRestaurantTable, setRestaurantTableAvailability } from '@/app/restaurant-actions'
import { Pencil, X, Upload, Trash2, AlertTriangle, UtensilsCrossed } from 'lucide-react'
import type { RestaurantMenu, RestaurantTable } from '@/lib/restaurant'
import RestaurantTableRefresh from './restaurant-table-refresh'
import { rupiah } from '@/lib/pos'
import { discountedPrice } from '@/lib/product-pricing'

export const restaurantPanel = 'rounded-2xl border border-[#454d5b]/50 bg-[#273242] p-5 sm:p-6'
export const restaurantInput = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[#454d5b] bg-[#273242] px-3 py-2 text-sm font-normal text-white placeholder:font-normal placeholder:text-[#a4a7ac] outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20'
export const restaurantButton = 'min-h-11 inline-flex items-center justify-center rounded-xl border-0 bg-[#303640] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d4653] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] disabled:opacity-50'
export const restaurantPrimary = 'min-h-11 inline-flex items-center justify-center rounded-xl border-0 bg-[#1835d9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#132c9e] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] disabled:opacity-50'
export function RestaurantField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId(), labelId = id + '-label'
  return <div className="min-w-0 text-sm text-[#c5cbd5]"><label id={labelId} htmlFor={id}>{label}</label>{isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-labelledby'?: string }>, { id, 'aria-labelledby': labelId }) : children}</div>
}
export function RestaurantDialog({ title, busy, close, children, wide = false }: { title: string; busy: boolean; close: () => void; children: ReactNode; wide?: boolean }) {
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
  return <dialog ref={dialog} aria-label={title} onCancel={e => { e.preventDefault(); if (!busy) close() }} className={`m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] ${wide ? 'max-w-[900px]' : 'max-w-[640px]'} overflow-y-auto rounded-2xl border border-[#454d5b] bg-[#273242] p-5 text-white backdrop:bg-black/60 sm:p-6`}>
    <div className="mb-5 flex items-center justify-between gap-4"><h2 className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">{title}</h2><button type="button" disabled={busy} onClick={close} aria-label="Tutup dialog" className={restaurantButton + ' shrink-0'}>Tutup</button></div>{children}
  </dialog>
}

export function RestaurantResources({ resource, menu = [], tables = [], usage = [], canManage = true, draft = false }: { resource: 'menu' | 'table'; canManage?: boolean; draft?: boolean; menu?: RestaurantMenu[]; tables?: RestaurantTable[]; usage?: import('@/lib/restaurant').RestaurantTableUsage[] }) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const refreshView = () => startRefresh(() => router.refresh())
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [editing, setEditing] = useState<RestaurantMenu | RestaurantTable | 'new' | null>(null), [notice, setNotice] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const [deleting,setDeleting]=useState<RestaurantTable|null>(null),[deletePending,setDeletePending]=useState(false),[deleteError,setDeleteError]=useState('')
  const deletePacket=useRef<{id:string;revision:number;request:string}|null>(null),deleteBusy=useRef(false)
  async function removeTable(){if(!deleting||deleteBusy.current)return;deleteBusy.current=true;setDeletePending(true);setDeleteError('');const packet=deletePacket.current||{id:deleting.id,revision:deleting.revision,request:crypto.randomUUID()};deletePacket.current=packet;try{const result=await deleteRestaurantTable(packet);if(result.value){setDeleting(null);deletePacket.current=null;setNotice('Meja dihapus dari daftar. Riwayat tetap tersimpan.');refreshView()}else{setDeleteError(result.error||'Meja belum dihapus.');if(!result.uncertain)deletePacket.current=null}}catch{setDeleteError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang.')}finally{deleteBusy.current=false;setDeletePending(false)}}
  const [deletingMenu,setDeletingMenu]=useState<RestaurantMenu|null>(null),[menuDeletePending,setMenuDeletePending]=useState(false)
  const occupiedHint = useId()
  // Track menu photos from persistent browser storage
  const [menuPhotos, setMenuPhotos] = useState<Record<string, string>>({})
  // Track menu discounts from persistent browser storage
  const [menuDiscounts, setMenuDiscounts] = useState<Record<string, { percent: number; basePrice: number }>>({})

  useEffect(() => {
    if (resource !== 'menu' || typeof window === 'undefined') return
    const photos: Record<string, string> = {}
    const discounts: Record<string, { percent: number; basePrice: number }> = {}
    menu.forEach((item) => {
      try {
        const savedPhoto = localStorage.getItem('usahaku_menu_photo_' + item.id)
        if (savedPhoto) photos[item.id] = savedPhoto
      } catch {}
      try {
        const savedDiscount = localStorage.getItem('usahaku_menu_discount_' + item.id)
        if (savedDiscount) {
          const parsed = JSON.parse(savedDiscount)
          if (parsed && parsed.enabled) discounts[item.id] = parsed
        }
      } catch {}
    })
    setMenuPhotos(photos)
    setMenuDiscounts(discounts)
  }, [resource, menu])

  const selectedTable = tables.find(table => table.id === viewing)
  const occupied = Boolean(selectedTable && usage.some(item => item.id === selectedTable.id && item.occupied))
  const reserved = Boolean(selectedTable && usage.some(item => item.id === selectedTable.id && item.reserved))
  const title = resource === 'menu' ? 'menu' : 'meja'
  const items = resource === 'menu' ? menu : [...tables].sort((a, b) => a.name.localeCompare(b.name, 'id-ID', { numeric: true, sensitivity: 'base' }))
  const visible = items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  const handleConfirmDeleteMenu = async () => {
    if (!deletingMenu) return
    setMenuDeletePending(true)
    try {
      const result = await saveRestaurantResource(
        'menu',
        { id: deletingMenu.id, revision: deletingMenu.revision, request: crypto.randomUUID() },
        {
          name: deletingMenu.name,
          category: deletingMenu.category,
          price: String(deletingMenu.price),
          available: false,
          active: false,
        }
      )
      if (result.value) {
        try {
          localStorage.removeItem('usahaku_menu_photo_' + deletingMenu.id)
        } catch {}
        setNotice(`Menu "${deletingMenu.name}" berhasil dihapus.`)
        setDeletingMenu(null)
        refreshView()
      } else {
        setNotice(result.error || 'Gagal menghapus menu.')
        setDeletingMenu(null)
      }
    } catch {
      setNotice('Gagal menghapus menu. Periksa koneksi dan coba lagi.')
      setDeletingMenu(null)
    } finally {
      setMenuDeletePending(false)
    }
  }

  return <section className={restaurantPanel}><RestaurantTableRefresh usage={usage}/>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-normal">{resource === 'menu' ? 'Daftar menu' : 'Daftar meja'}</h2>{canManage&&<button type="button" onClick={() => { setNotice(''); setEditing('new') }} className={restaurantPrimary}>Tambah {title}</button>}</div>
    <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">{resource === 'menu' ? 'Atur harga dan ketersediaan menu. Stok bahan baku dan resep belum dihitung.' : 'Kapasitas diperiksa saat pesanan dibuat. Satu meja menampung satu pesanan terbuka.'}</p>
    {notice && <p role="status" className="mt-3 text-sm text-[#24cbc5]">{notice}</p>}
    <RestaurantField label={`Cari ${title}`}><input value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} className={restaurantInput} /></RestaurantField>
    {resource === 'table' ? <div className="mt-5">
      <div role="group" aria-label="Pilihan meja" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
        {visible.slice(page * 25, page * 25 + 25).map(item => {
          const taken = usage.some(table => table.id === item.id && (table.occupied || table.reserved))
          const state=usage.find(t=>t.id===item.id),label=!item.active?'Tidak tersedia':state?.occupied&&state.reserved?'Terpakai / reservasi':state?.reserved?'Reservasi':(item as RestaurantTable).occupied_until_released?'Tidak tersedia':state?.occupied?'Terpakai':'Tersedia'
          return <div key={item.id} role="group" aria-label={`Kartu ${item.name}`} className="relative min-w-0">
            <button type="button" aria-label={item.name} aria-describedby={taken ? occupiedHint : undefined} aria-haspopup="dialog" title={`${item.name}: ${label}`} onClick={() => setViewing(item.id)} className={'flex aspect-square w-full min-w-0 items-center justify-center rounded-xl border border-[#454d5b] bg-[#1c222e] px-4 pb-8 pt-20 text-center text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] ' + (taken || !item.active ? 'opacity-60' : 'hover:border-[#24cbc5] hover:bg-[#303640]')}><span className="line-clamp-3 [overflow-wrap:anywhere]">{item.name}</span></button>
            {canManage&&<button type="button" aria-label={`Edit meja ${item.name}`} title="Edit meja" className="absolute left-3 top-3 grid size-11 place-items-center rounded-lg text-white hover:bg-[#303640] focus-visible:outline-2 focus-visible:outline-[#24cbc5]" onClick={()=>setEditing(item)}><Pencil aria-hidden="true" className="size-4"/></button>}
            <TableAvailability draft={draft} refreshing={refreshing} table={item as RestaurantTable} occupied={taken} label={label} saved={()=>{setNotice('Status meja tersimpan.');refreshView()}}/>
            {canManage&&<button type="button" aria-label={`Hapus meja ${item.name}`} className="absolute right-3 top-3 grid size-11 place-items-center rounded-lg text-[#ffb4ae] hover:bg-[#303640] focus-visible:outline-2 focus-visible:outline-[#24cbc5]" onClick={()=>{deletePacket.current=null;setDeleteError('');setDeleting(item as RestaurantTable)}}><X aria-hidden="true" className="size-4"/></button>}
          </div>
        })}
      </div>
      <p id={occupiedHint} className="mt-3 text-xs leading-5 text-[#c5cbd5]">Meja pudar belum tersedia atau dikunci untuk reservasi. Setelah pelanggan pergi, pilih Tersedia secara manual. Pembayaran tidak melepas meja. Tekan meja untuk melihat detail.</p>
      {!visible.length && <p className="py-8 text-sm text-[#c5cbd5]">Belum ada meja yang sesuai.</p>}
    </div> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#454d5b] text-[#c5cbd5]">
              <tr>
                <th className="p-3 font-normal">Nama</th>
                <th className="p-3 font-normal">Kategori / harga</th>
                <th className="p-3 font-normal">Status</th>
                <th className="p-3 font-normal">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(page * 25, page * 25 + 25).map((item) => (
                <tr key={item.id} className="border-b border-[#454d5b]/50">
                  <td className="max-w-64 break-words p-3">
                    <div className="flex items-center gap-3">
                      {menuPhotos[item.id] ? (
                        <img
                          src={menuPhotos[item.id]}
                          alt={item.name}
                          className="size-11 rounded-xl object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
                        />
                      ) : (
                        <div className="size-11 rounded-xl bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                          <UtensilsCrossed className="size-5 text-[#24cbc5]/60" />
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-white">{item.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    {'price' in item && (
                      <>
                        <span className="text-xs text-[#c5cbd5]">{item.category}</span>
                        <br />
                        {menuDiscounts[item.id] ? (
                          <div>
                            <span className="font-semibold text-[#24cbc5]">{rupiah(Number(item.price))}</span>
                            <div className="flex items-center gap-1.5 text-[11px] text-[#a4a7ac]">
                              <span className="line-through">{rupiah(Number(menuDiscounts[item.id].basePrice))}</span>
                              <span className="rounded bg-[#24cbc5]/15 px-1 py-0.2 text-[10px] font-medium text-[#24cbc5]">
                                -{menuDiscounts[item.id].percent}%
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="font-semibold text-white">{rupiah(Number(item.price))}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-3">
                    {!item.active ? (
                      <span className="rounded-full bg-[#1c222e] px-2.5 py-0.5 text-xs text-[#a4a7ac]">Nonaktif</span>
                    ) : 'available' in item && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.available ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {item.available ? 'Tersedia' : 'Habis'}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(item)}
                        className={restaurantButton}
                        aria-label={`Ubah ${item.name}`}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingMenu(item as RestaurantMenu)}
                        className="min-h-11 inline-flex items-center justify-center rounded-xl border-0 bg-red-500/15 px-3.5 py-2 text-sm font-medium text-red-400 hover:bg-red-500/25 hover:text-white active:scale-[0.98] transition-all"
                        aria-label={`Hapus ${item.name}`}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <p className="py-8 text-sm text-[#c5cbd5]">Belum ada menu yang sesuai.</p>}
        </div>
      )}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#c5cbd5]"><span>{visible.length} {title}</span><div className="flex gap-2"><button disabled={!page} onClick={() => setPage(v => v - 1)} className={restaurantButton}>Sebelumnya</button><button disabled={(page + 1) * 25 >= visible.length} onClick={() => setPage(v => v + 1)} className={restaurantButton}>Berikutnya</button></div></div>
    {resource === 'table' && selectedTable && <RestaurantDialog title={`Detail ${selectedTable.name}`} busy={false} close={() => setViewing(null)}>
      <dl className="space-y-4 text-sm"><div><dt className="text-[#c5cbd5]">Nama / nomor meja</dt><dd className="mt-1 break-words text-white [overflow-wrap:anywhere]">{selectedTable.name}</dd></div><div><dt className="text-[#c5cbd5]">Kapasitas</dt><dd className="mt-1 text-white">{selectedTable.capacity} orang</dd></div><div><dt className="text-[#c5cbd5]">Status</dt><dd className="mt-1 text-white">{!selectedTable.active ? 'Tidak tersedia' : occupied && reserved ? 'Masih terpakai menjelang reservasi' : occupied ? 'Terpakai' : reserved ? 'Dikunci untuk reservasi' : 'Tersedia'}</dd></div></dl>
      <p className="mt-5 text-sm leading-6 text-[#c5cbd5]">{!selectedTable.active ? 'Meja dinonaktifkan oleh pengelola dan tidak dapat dipilih untuk pesanan baru.' : occupied ? 'Meja ini masih terpakai. Pembayaran tidak otomatis melepas meja; pilih Tersedia setelah pelanggan pergi.' : reserved ? 'Meja ini dikunci sesuai waktu penguncian yang diatur owner. Periksa halaman Reservasi sebelum menerima tamu.' : 'Belum ada pesanan terbuka pada meja ini.'}</p>
    </RestaurantDialog>}
      {deletingMenu && (
        <RestaurantDialog
          title={`Hapus Menu "${deletingMenu.name}"?`}
          busy={menuDeletePending}
          close={() => !menuDeletePending && setDeletingMenu(null)}
        >
          <div className="space-y-3 text-sm text-[#c5cbd5]">
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-red-300 leading-relaxed">
              <AlertTriangle className="size-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-medium text-white">Konfirmasi penghapusan menu</p>
                <p className="mt-1 text-xs text-red-300">
                  Menu ini akan dinonaktifkan dan tidak dapat lagi dipilih untuk pesanan baru. Data pesanan dan riwayat transaksi sebelumnya tetap tersimpan dengan aman.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={menuDeletePending}
              onClick={() => setDeletingMenu(null)}
              className={restaurantButton}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={menuDeletePending}
              onClick={handleConfirmDeleteMenu}
              className="min-h-11 inline-flex items-center justify-center rounded-xl border-0 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {menuDeletePending ? 'Menghapus...' : 'Ya, Hapus Menu'}
            </button>
          </div>
        </RestaurantDialog>
      )}
    {editing && <ResourceEditor resource={resource} initial={editing === 'new' ? null : editing} close={() => setEditing(null)} saved={() => { setEditing(null); setNotice(`${resource === 'menu' ? 'Menu' : 'Meja'} tersimpan.`); refreshView() }} />}
    {deleting&&<RestaurantDialog title="Hapus meja" busy={deletePending} close={()=>setDeleting(null)}><p className="text-sm leading-6">Hapus {deleting.name} dari daftar meja? Riwayat pesanan dan reservasi tetap tersimpan. Meja dengan pesanan atau reservasi aktif harus diselesaikan atau dipindahkan dahulu.</p>{deleteError&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{deleteError}</p>}<div className="mt-5 flex justify-end gap-3"><button disabled={deletePending} onClick={()=>setDeleting(null)} className={restaurantButton}>Batal</button><button disabled={deletePending} onClick={()=>void removeTable()} className={restaurantPrimary}>{deletePending?'Menghapus...':deletePacket.current?'Ulangi permintaan yang sama':'Hapus meja'}</button></div></RestaurantDialog>}
  </section>
}

function TableAvailability({table,occupied,label,saved,refreshing,draft}:{draft:boolean;refreshing:boolean;table:RestaurantTable;occupied:boolean;label:string;saved:()=>void}){
  const [current,setCurrent]=useState(table),[pending,setPending]=useState(false),[error,setError]=useState(''),busy=useRef(false)
  const retry=useRef<{input:{id:string;revision:number;request:string};available:boolean}|null>(null)
  useEffect(()=>{if(!busy.current&&!retry.current)setCurrent(table)},[table])
  async function change(available:boolean){
    if(busy.current)return
    const packet=retry.current||{input:{id:current.id,revision:current.revision,request:crypto.randomUUID()},available}
    busy.current=true;setPending(true);setError('')
    try{const result=draft?await saveRestaurantResource('table',packet.input,{name:current.name,capacity:current.capacity,active:packet.available}):await setRestaurantTableAvailability(packet.input,packet.available);if(result.value){retry.current=null;setCurrent(result.value as RestaurantTable);saved()}else{setError(result.error||'Status belum tersimpan.');retry.current=result.uncertain?packet:null}}
    catch{retry.current=packet;setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang.')}
    finally{busy.current=false;setPending(false)}
  }
  return <>
    <div className="absolute left-16 right-16 top-3">
      <SelectInput aria-label={`Status meja ${table.name}`} value={occupied?'busy':current.active?'available':'unavailable'} disabled={pending||refreshing||Boolean(retry.current)} onChange={e=>void change(e.target.value==='available')} className={'!min-h-11 !h-11 !gap-1 !rounded-lg !px-2 !py-2 !text-[11px] [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:!whitespace-normal [&>span]:!overflow-visible [&>span]:break-words [&>span]:before:size-1.5 [&>span]:before:shrink-0 [&>span]:before:rounded-full [&>svg]:!size-3 '+(!occupied&&current.active?'[&>span]:before:bg-[#4ade80]':'[&>span]:before:bg-[#f87171]')}>
        {occupied&&<option value="busy" disabled>{label}</option>}<option value="available">Tersedia</option><option value="unavailable">Tidak tersedia</option>
      </SelectInput>
    </div>
    {pending&&<p role="status" className="mt-2 text-xs text-[#c5cbd5]">Menyimpan status...</p>}
    {error&&<div role="alert" className="mt-2 text-xs leading-5 text-[#ffb4ae]">{error}{retry.current&&<button type="button" disabled={pending} onClick={()=>void change(retry.current!.available)} className={restaurantButton+' mt-2 w-full'}>Ulangi permintaan yang sama</button>}</div>}
  </>
}

function ResourceEditor({
  resource,
  initial,
  close,
  saved,
}: {
  resource: 'menu' | 'table'
  initial: RestaurantMenu | RestaurantTable | null
  close: () => void
  saved: () => void
}) {
  const id = useRef(initial?.id || crypto.randomUUID())
  const busy = useRef(false)
  const [name, setName] = useState(initial?.name || '')
  const [active, setActive] = useState(initial?.active ?? true)
  const initialCategory = initial && 'category' in initial ? initial.category : 'Makanan'
  const [category, setCategory] = useState(['Makanan', 'Minuman'].includes(initialCategory) ? initialCategory : 'Lainnya')
  const [custom, setCustom] = useState(initialCategory)

  // Discount state for menu
  const initialDiscount = useRef<{ enabled: boolean; percent: number; basePrice: number } | null>(null)
  if (initialDiscount.current === null && resource === 'menu' && initial?.id && typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('usahaku_menu_discount_' + initial.id)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && parsed.enabled) initialDiscount.current = parsed
      }
    } catch {}
  }

  const [hasDiscount, setHasDiscount] = useState<boolean>(() => Boolean(initialDiscount.current?.enabled))
  const [discountPercent, setDiscountPercent] = useState<string>(() =>
    initialDiscount.current ? String(initialDiscount.current.percent) : ''
  )
  const [price, setPrice] = useState<string>(() => {
    if (initialDiscount.current && initialDiscount.current.basePrice) {
      return String(initialDiscount.current.basePrice)
    }
    return initial && 'price' in initial ? String(initial.price) : '0'
  })
  const [available, setAvailable] = useState(initial && 'available' in initial ? initial.available : true)
  const [capacity, setCapacity] = useState(initial && 'capacity' in initial ? String(initial.capacity) : '2')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const retry = useRef<{ input: { id: string; revision: number | null; request: string }; details: unknown } | null>(null)
  const [locked, setLocked] = useState(false)

  const numericBasePrice = Number(price) || 0
  const numericDiscountPercent = Number(discountPercent.replace(',', '.')) || 0
  const simulatedPrice =
    hasDiscount && numericBasePrice >= 0 && numericDiscountPercent > 0 && numericDiscountPercent <= 100
      ? discountedPrice({ price: numericBasePrice, discountKind: 'percent', discountValue: numericDiscountPercent })
      : null

  // Photo state for menu (Requirement 2)
  const [photo, setPhoto] = useState<string>(() => {
    if (resource === 'menu' && initial?.id && typeof window !== 'undefined') {
      try {
        return localStorage.getItem('usahaku_menu_photo_' + initial.id) || ''
      } catch {}
    }
    return ''
  })
  const [photoError, setPhotoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setPhotoError('Format foto harus PNG, JPG, atau WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Ukuran foto maksimal 2 MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(String(reader.result))
    }
    reader.onerror = () => {
      setPhotoError('Gagal membaca file foto.')
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => {
    setPhoto('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return

    if (resource === 'menu' && hasDiscount) {
      if (!discountPercent.trim()) {
        setError('Isi persentase diskon menu.')
        return
      }
      if (isNaN(numericDiscountPercent) || numericDiscountPercent <= 0 || numericDiscountPercent > 100) {
        setError('Persentase diskon harus lebih dari 0% dan maksimal 100%.')
        return
      }
    }

    busy.current = true
    setPending(true)
    setError('')
    const priceToSave = resource === 'menu' && hasDiscount && simulatedPrice !== null ? String(simulatedPrice) : price
    const packet = retry.current || {
      input: { id: id.current, revision: initial?.revision ?? null, request: crypto.randomUUID() },
      details:
        resource === 'menu'
          ? { name, category: category === 'Lainnya' ? custom : category, price: priceToSave, active, available }
          : { name, capacity: Number(capacity), active },
    }
    try {
      const result = await saveRestaurantResource(resource, packet.input, packet.details)
      if (result.value) {
        // Save or remove photo & discount reference locally across page reloads
        if (resource === 'menu' && typeof window !== 'undefined') {
          try {
            if (photo) {
              localStorage.setItem('usahaku_menu_photo_' + id.current, photo)
            } else {
              localStorage.removeItem('usahaku_menu_photo_' + id.current)
            }
          } catch {}
          try {
            if (hasDiscount && simulatedPrice !== null) {
              localStorage.setItem(
                'usahaku_menu_discount_' + id.current,
                JSON.stringify({
                  enabled: true,
                  percent: numericDiscountPercent,
                  basePrice: numericBasePrice,
                  discountedPrice: simulatedPrice,
                })
              )
            } else {
              localStorage.removeItem('usahaku_menu_discount_' + id.current)
            }
          } catch {}
        }
        saved()
        return
      }
      setError(result.error || 'Belum tersimpan.')
      retry.current = result.uncertain ? packet : null
      setLocked(Boolean(result.uncertain))
    } catch {
      retry.current = packet
      setLocked(true)
      setError('Hasil belum pasti. Coba ulang permintaan yang sama atau muat ulang untuk memeriksa.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <RestaurantDialog title={`${initial ? 'Ubah' : 'Tambah'} ${resource === 'menu' ? 'menu' : 'meja'}`} busy={pending} close={close}>
      <form onSubmit={submit}>
        <fieldset disabled={pending || locked} className="space-y-4">
          <RestaurantField label="Nama">
            <input
              required
              maxLength={resource === 'menu' ? 100 : 60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={restaurantInput}
            />
          </RestaurantField>

          {/* Photo upload field for menu (Requirement 2) */}
          {resource === 'menu' && (
            <div className="space-y-2">
              <span className="block text-sm text-[#c5cbd5]">Foto menu</span>
              {photo ? (
                <div className="relative flex items-center gap-4 rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3">
                  <img
                    src={photo}
                    alt="Preview menu"
                    className="size-20 rounded-xl object-cover shrink-0 border border-[#454d5b]/40"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-medium text-[#24cbc5]">Foto siap disimpan</p>
                    <p className="text-[11px] text-[#a4a7ac]">Format PNG, JPG, atau WebP (maks. 2 MB)</p>
                    <div className="flex gap-2 pt-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg bg-[#303640] px-2.5 py-1 text-xs text-white hover:bg-[#3d4653] transition-colors"
                      >
                        Ganti foto
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/25 transition-colors"
                      >
                        Hapus foto
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#454d5b] bg-[#1c222e]/60 p-5 text-center cursor-pointer transition-colors hover:border-[#24cbc5]/60 hover:bg-[#1c222e]"
                >
                  <Upload className="size-6 text-[#24cbc5] mb-2" />
                  <p className="text-sm font-medium text-white">Unggah foto menu</p>
                  <p className="mt-1 text-xs text-[#a4a7ac]">PNG, JPG, atau WebP (maks. 2 MB)</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {photoError && (
                <p role="alert" className="text-xs text-[#ffb4ae]">
                  {photoError}
                </p>
              )}
            </div>
          )}

          {resource === 'menu' ? (
            <>
              <RestaurantField label="Kategori menu">
                <SelectInput value={category} onChange={(e) => setCategory(e.target.value)} className={restaurantInput}>
                  <option>Makanan</option>
                  <option>Minuman</option>
                  <option>Lainnya</option>
                </SelectInput>
              </RestaurantField>
              {category === 'Lainnya' && (
                <RestaurantField label="Kategori lainnya">
                  <input
                    required
                    maxLength={100}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    className={restaurantInput}
                  />
                </RestaurantField>
              )}
              <RestaurantField label="Harga menu">
                <input
                  required
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Rp0"
                  className={restaurantInput}
                />
              </RestaurantField>

              <div className="space-y-3 rounded-xl border border-[#454d5b]/60 bg-[#1c222e]/40 p-3.5">
                <label className="flex min-h-6 items-center gap-3 text-sm text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasDiscount}
                    onChange={(e) => setHasDiscount(e.target.checked)}
                    className="rounded-full cursor-pointer"
                  />
                  Diskon menu
                </label>
                {hasDiscount && (
                  <div className="space-y-3 pt-1">
                    <RestaurantField label="Persentase diskon (%)">
                      <NumericInput
                        aria-label="Persentase diskon menu"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        placeholder="Contoh: 10"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        className={restaurantInput}
                      />
                    </RestaurantField>
                    {simulatedPrice !== null && (
                      <div className="rounded-lg bg-[#24cbc5]/10 border border-[#24cbc5]/20 p-2.5 text-xs">
                        <div className="flex justify-between text-[#c5cbd5]">
                          <span>Harga asli:</span>
                          <span className="line-through">{rupiah(numericBasePrice)}</span>
                        </div>
                        <div className="mt-1 flex justify-between font-medium text-[#24cbc5]">
                          <span>Harga setelah diskon ({numericDiscountPercent}%):</span>
                          <span className="text-sm font-semibold">{rupiah(simulatedPrice)}</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-[#a4a7ac]">
                      Potongan berlaku per porsi; harga dibulatkan ke rupiah terdekat.
                    </p>
                  </div>
                )}
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="rounded-full cursor-pointer"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                />
                Menu tersedia
              </label>
            </>
          ) : (
            <RestaurantField label="Kapasitas orang">
              <NumericInput
                required
                type="number"
                min={1}
                max={1000}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className={restaurantInput}
              />
            </RestaurantField>
          )}
          {resource==='table'?<RestaurantField label="Meja diaktifkan pengelola"><SelectInput value={active?'available':'unavailable'} onChange={e=>setActive(e.target.value==='available')} className={restaurantInput}><option value="available">Tersedia</option><option value="unavailable">Tidak tersedia</option></SelectInput></RestaurantField>:<label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="rounded-full cursor-pointer"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Aktif
          </label>}
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={pending} onClick={close} className={restaurantButton}>
            Batal
          </button>
          <button disabled={pending} className={restaurantPrimary}>
            {pending ? 'Menyimpan...' : locked ? 'Ulangi permintaan yang sama' : 'Simpan'}
          </button>
        </div>
      </form>
    </RestaurantDialog>
  )
}
