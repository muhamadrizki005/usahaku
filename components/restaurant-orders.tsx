'use client'
import { SelectInput } from '@/components/ui/select-input'
import { NumericInput } from '@/components/ui/numeric-input'
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import PosCustomerPicker from './pos-customer-picker'
import type { PosCustomer } from '@/lib/customers'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loadRestaurantOrders, saveRestaurantOrder, payRestaurantOrder, checkoutRestaurantCart, cancelRestaurantOrder, loadRestaurantMember } from '@/app/restaurant-actions'
import { restaurantCashAmount, restaurantStages, restaurantOrderCode, type RestaurantMenu, type RestaurantTable, type RestaurantOrder, type RestaurantOrderPage, type RestaurantResult } from '@/lib/restaurant'
import { reservationBalance, type Reservation } from '@/lib/restaurant-reservations'
import type { LoyaltyRedemptionRule } from '@/lib/loyalty'
import type { Member } from '@/lib/validation'
import { rupiah, saleDate, type Sale } from '@/lib/pos'
import RestaurantTableRefresh from './restaurant-table-refresh'
import RestaurantPaymentFields from './restaurant-payment-fields'
import { enabledPaymentMethods, type PaymentSettings } from '@/lib/business-payments'
import { restaurantRewardQuote, type RestaurantBilling } from '@/lib/restaurant-billing'
import DashboardSection from './dashboard-section'
import { RestaurantDialog, RestaurantField, restaurantPanel, restaurantInput, restaurantButton, restaurantPrimary } from './restaurant-forms'
import { UtensilsCrossed, ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react'
import { notify, showErrorToast } from '@/lib/notifications'

function useRestaurantRequest() {
  const busy = useRef(false), retry = useRef<(() => Promise<RestaurantResult>) | null>(null)
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [locked, setLocked] = useState(false)
  async function run(call: () => Promise<RestaurantResult>, saved: (value: NonNullable<RestaurantResult['value']>) => void) {
    if (busy.current) return
    busy.current = true; setPending(true); setError('')
    const action = retry.current || call
    try { const result = await action(); if (result.value) { retry.current = null; setLocked(false); saved(result.value) } else { setError(result.error || 'Belum tersimpan.'); retry.current = result.uncertain ? action : null; setLocked(Boolean(result.uncertain)) } }
    catch { retry.current = action; setLocked(true); setError('Hasil belum pasti. Ulangi permintaan yang sama atau periksa data setelah muat ulang.') }
    finally { busy.current = false; setPending(false) }
  }
  return { pending, error, locked, run }
}
const statusLabel = { open: 'Belum dibayar', paid: 'Dibayar', cancelled: 'Dibatalkan' }
export default function RestaurantOrders({ menu, tables, initialPage, usage, member, payments, billing, reservation = null, linkedOrder = null, reservationError }: { payments: PaymentSettings; billing: RestaurantBilling; menu: RestaurantMenu[]; tables: RestaurantTable[]; initialPage: RestaurantOrderPage; usage: import('@/lib/restaurant').RestaurantTableUsage[]; member: Member; reservation?: Reservation | null; linkedOrder?: RestaurantOrder | null; reservationError?: string }) {
  const router = useRouter()
  const [refreshing, refresh] = useTransition()
  const [editor, updateEditor] = useState<RestaurantOrder | 'new' | null>(linkedOrder || 'new'), [payment, updatePayment] = useState<RestaurantOrder | null>(null), [cancellation, setCancellation] = useState<RestaurantOrder | null>(null)
  const [draftVersion, setDraftVersion] = useState(0)
  const [repeatFrom,setRepeatFrom]=useState<RestaurantOrder|null>(null)
  const setEditor = (value: RestaurantOrder | 'new' | null) => { setRepeatFrom(null); if (value === 'new') setDraftVersion(n => n + 1); updateEditor(value); updatePayment(null); document.getElementById('restaurant-workbench')?.scrollIntoView({ block: 'start' }) }
  const setPayment = (value: RestaurantOrder | null) => { if (value) updateEditor(value); updatePayment(value); if (value) document.getElementById('restaurant-workbench')?.scrollIntoView({ block: 'start' }) }
  const [query, setQuery] = useState(''), [status, setStatus] = useState<'open' | 'paid' | 'cancelled' | 'all'>('open'), [page, setPage] = useState(0)
  const [list, setList] = useState(initialPage), [loading, setLoading] = useState(false), [listError, setListError] = useState(''), [retryList, setRetryList] = useState(0)
  const firstRead = useRef(true)
  useEffect(() => {
    if (firstRead.current) { firstRead.current = false; return }
    let active = true
    setLoading(true); setListError('')
    const timer = setTimeout(async () => {
      try {
        const result = await loadRestaurantOrders({ query, status, page })
        if (!active) return
        if (result.data) { setList(result.data); setPage(result.data.page) }
        else setListError(result.error || 'Daftar pesanan belum dapat dimuat.')
      } catch { if (active) setListError('Daftar pesanan belum dapat dimuat. Coba lagi.') }
      finally { if (active) setLoading(false) }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, status, page, retryList, initialPage])
  const visible = listError ? [] : list.orders
  const saved = () => { setEditor('new'); setPayment(null); setCancellation(null); refresh(() => { if (reservation) router.replace('/dashboard/pos'); else router.refresh() }) }
  return <DashboardSection title="Pesanan & kasir"><RestaurantTableRefresh usage={usage} />
    <OrderEditor payments={payments} billing={billing} repeatFrom={repeatFrom} paid={sale=>{saved();router.push(`/dashboard/transactions/${sale.id}`)}} key={editor && editor !== 'new' ? editor.id + ':' + editor.revision : 'new:' + draftVersion} reservation={editor === 'new' || (editor && editor.reservation_id === reservation?.id) ? reservation : null} initial={editor && editor !== 'new' ? editor : null} menu={menu} tables={tables} usage={usage} member={member} checkout={payment && <Payment inline payments={payments} billing={billing} order={payment} member={member} close={() => setPayment(null)} paid={sale => { saved(); router.push(`/dashboard/transactions/${sale.id}`) }} />} close={saved} saved={value => { const order = value as RestaurantOrder; setEditor('new'); refresh(() => router.refresh()) }} />
    {reservationError && <p role="alert" className="mb-4 text-sm text-[#ffb4ae]">{reservationError}</p>}<section className={restaurantPanel} aria-busy={refreshing || loading}><fieldset disabled={refreshing} className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-normal">Pesanan restoran</h2><button disabled={loading || Boolean(listError)} onClick={() => setEditor(linkedOrder || 'new')} className={restaurantPrimary}>Buat pesanan</button></div>
      <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">{member.role === 'cashier' ? 'Pesanan dan transaksi milik Anda. Meja terpakai milik petugas lain tetap ditandai tanpa membuka rinciannya.' : 'Kelola pesanan makan di tempat dan bawa pulang.'} Pembayaran QRIS/transfer diperiksa manual di luar aplikasi.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><RestaurantField label="Cari pesanan"><input maxLength={100} value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} className={restaurantInput} /></RestaurantField><RestaurantField label="Status pesanan"><SelectInput value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0) }} className={restaurantInput}><option value="open">Belum dibayar</option><option value="paid">Dibayar</option><option value="cancelled">Dibatalkan</option><option value="all">Semua</option></SelectInput></RestaurantField></div>
      {loading && <p role="status" className="mt-3 text-sm text-[#c5cbd5]">Memuat pesanan...</p>}
      {listError && <div className="mt-3"><p role="alert" className="text-sm text-[#ffb4ae]">{listError}</p><button type="button" onClick={() => setRetryList(v => v + 1)} className={restaurantButton + ' mt-2'}>Coba muat lagi</button></div>}
      <fieldset disabled={loading || Boolean(listError)} className="min-w-0">
        <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-[#c5cbd5]"><tr>{['Pesanan', 'Meja / layanan', 'Proses', 'Subtotal', 'Tindakan'].map(v => <th key={v} className="p-3 font-normal">{v}</th>)}</tr></thead><tbody>{visible.map(o => <tr key={o.id} className="border-b border-[#454d5b]/50"><td className="p-3"><p>{restaurantOrderCode(o.id)}</p><p className="mt-1 text-xs text-[#c5cbd5]">{o.customer}<br />{o.actor_name}<br />{saleDate(o.created_at)}</p>{o.cancellation_reason && <p className="mt-1 text-xs text-[#c5cbd5]">{o.cancellation_reason}</p>}</td><td className="p-3">{o.kind === 'dine_in' ? `${o.table_name||'Belum pilih meja'} / ${o.guests} orang` : 'Bawa pulang'}</td><td className="p-3">{statusLabel[o.status]}<br /><span className="text-xs text-[#c5cbd5]">{o.occupies_table === false ? 'Pesanan di muka / belum datang' : restaurantStages[o.stage]}</span></td><td className="p-3">{rupiah(Number(o.subtotal))}</td><td className="p-3"><div className="flex flex-wrap gap-2">{o.status === 'open' && <><button onClick={() => setEditor(o)} className={restaurantButton} aria-label={`Ubah ${restaurantOrderCode(o.id)}`}>Ubah</button>{o.occupies_table === false ? <Link href="/dashboard/restaurant/reservations" className={restaurantButton}>Catat kedatangan di Reservasi</Link> : <button onClick={() => setPayment(o)} className={restaurantPrimary} aria-label={`Bayar ${restaurantOrderCode(o.id)}`}>Bayar</button>}{o.occupies_table === false ? <Link href="/dashboard/restaurant/reservations" className={restaurantButton}>Kelola reservasi</Link> : <button onClick={() => setCancellation(o)} className={restaurantButton} aria-label={`Batalkan ${restaurantOrderCode(o.id)}`}>Batalkan</button>}</>}{o.status!=='cancelled'&&<button type="button" className={restaurantButton} onClick={()=>{if(o.status==='open')setEditor(o);else{setEditor('new');setRepeatFrom(o)}}}>Pesan lagi</button>}{o.sale_id && <Link href={`/dashboard/transactions/${o.sale_id}`} className={restaurantButton}>Detail & struk</Link>}</div></td></tr>)}</tbody></table>{!visible.length && !loading && !listError && <p className="py-8 text-sm text-[#c5cbd5]">Belum ada pesanan yang sesuai.</p>}</div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#c5cbd5]"><span>{list.total} pesanan</span><div className="flex gap-2"><button disabled={!list.page} onClick={() => setPage(list.page - 1)} className={restaurantButton}>Sebelumnya</button><button disabled={(list.page + 1) * list.pageSize >= list.total} onClick={() => setPage(list.page + 1)} className={restaurantButton}>Berikutnya</button></div></div>
      </fieldset></fieldset></section>
    {cancellation && <CancelOrder order={cancellation} close={() => setCancellation(null)} saved={saved} />}
  </DashboardSection>
}

type MenuDiscountStored = {
  enabled: boolean
  kind?: 'percent' | 'amount'
  value?: number
  percent: number
  amount?: number
  basePrice: number
  discountedPrice?: number
}

function getMenuDiscountInfo(id: string): MenuDiscountStored | null {
  if (typeof window === 'undefined') return null
  try {
    const s = localStorage.getItem('usahaku_menu_discount_' + id)
    if (s) {
      const p = JSON.parse(s)
      if (p && p.enabled) return p
    }
  } catch { }
  return null
}

function OrderEditor({ initial, menu, tables, usage, close, saved, reservation, member, checkout, payments, billing, repeatFrom, paid }: { reservation?: Reservation | null; initial: RestaurantOrder | null; menu: RestaurantMenu[]; tables: RestaurantTable[]; usage: import('@/lib/restaurant').RestaurantTableUsage[]; close: () => void; saved: (value: NonNullable<RestaurantResult['value']>) => void; member: Member; checkout: ReactNode; payments:PaymentSettings; billing:RestaurantBilling; repeatFrom:RestaurantOrder|null; paid:(sale:Sale)=>void }) {
  const [menuDetail, setMenuDetail] = useState<RestaurantMenu | null>(null)
  const [menuDiscounts, setMenuDiscounts] = useState<Record<string, MenuDiscountStored>>({})
  const [menuPhotos, setMenuPhotos] = useState<Record<string, string>>({})
  const menuKey = menu.map(m => m.id + ':' + m.revision).join(',')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const loadStored = () => {
      const nextDiscounts: Record<string, MenuDiscountStored> = {}
      const nextPhotos: Record<string, string> = {}
      for (const m of menu) {
        const info = getMenuDiscountInfo(m.id)
        if (info) nextDiscounts[m.id] = info
        try {
          const photo = localStorage.getItem('usahaku_menu_photo_' + m.id)
          if (photo) nextPhotos[m.id] = photo
        } catch { }
      }
      setMenuDiscounts(nextDiscounts)
      setMenuPhotos(nextPhotos)
    }
    loadStored()
    window.addEventListener('storage', loadStored)
    return () => window.removeEventListener('storage', loadStored)
  }, [menuKey])

  const id = useRef(initial?.id || crypto.randomUUID()), request = useRestaurantRequest()
  const [payNow,setPayNow]=useState(false)
  const template=initial||repeatFrom
  const [kind, setKind] = useState<'dine_in' | 'takeaway'>(template?.kind || (reservation ? 'dine_in' : 'takeaway')), [tableId, setTableId] = useState(template?.table_id || reservation?.table_id || ''), [guests, setGuests] = useState(String(template?.guests || reservation?.guests || 1))
  const [customer, setCustomer] = useState(template?.customer || reservation?.customer || 'Pelanggan umum'), [notes, setNotes] = useState(template?.notes || reservation?.notes || ''), [stage, setStage] = useState<RestaurantOrder['stage']>(initial?.stage || 'new')
  const [selectedMember, setSelectedMember] = useState<PosCustomer | null>(template?.customer_id ? { id: template.customer_id, name: template.customer, phone: '' } : null), [memberError, setMemberError] = useState(''), [search, setSearch] = useState(''), [category, setCategory] = useState('Semua')
  useEffect(() => { let live = true; if (template?.customer_id) void loadRestaurantMember(template.customer_id).then(r => { if (live) { if (r.member) setSelectedMember(r.member); else setMemberError(r.error || 'Member belum dapat dibaca.') } }).catch(() => { if (live) setMemberError('Member belum dapat dibaca.') }); return () => { live = false } }, [template?.customer_id])
  const [lines, setLines] = useState((initial?.lines || []).map(l => ({ id: l.id, quantity: l.quantity })))
  const add = (choice: string) => { if (!choice) return; setLines(old => old.some(l => l.id === choice) ? old.map(l => l.id === choice ? { ...l, quantity: Math.min(9999, l.quantity + 1) } : l) : old.length < 100 ? [...old, { id: choice, quantity: 1 }] : old) }
  const updateQty = (choice: string, qty: number) => {
    const next = Math.max(1, Math.min(9999, qty))
    setLines(old => old.map(item => item.id === choice ? { ...item, quantity: next } : item))
  }
  const preview = lines.map(l => { const old = initial?.lines.find(p => p.id === l.id), current = menu.find(p => p.id === l.id); const price = old && l.quantity <= old.quantity ? Number(old.price) : Number(current?.price || 0); return { ...l, name: old?.name || current?.name || 'Menu tidak tersedia', price } })
  const subtotal = preview.reduce((sum, l) => sum + l.price * l.quantity, 0)
  const orderInput=()=>({id:id.current,revision:initial?.revision??null,request:crypto.randomUUID(),...(repeatFrom?{sourceId:repeatFrom.id}:{})})
  const orderDetails=()=>({ kind, tableId: kind === 'dine_in' ? tableId || null : null, guests: Number(guests), customer: selectedMember?.name || customer, customerId: selectedMember?.id || null, notes, stage, lines, ...(reservation ? { reservationId: reservation.id } : {}) })
  function submit(e:FormEvent){
    e.preventDefault()
    const input=orderInput(),details=orderDetails()
    void request.run(() => saveRestaurantOrder(input, details), val => {
      notify({
        title: initial ? 'Pesanan diperbarui' : 'Pesanan baru dibuat',
        message: `Pesanan untuk "${details.customer}" (${lines.reduce((n, l) => n + l.quantity, 0)} porsi) berhasil disimpan.`,
        category: 'order',
      })
      saved(val)
    })
  }
  const visibleMenu = menu.filter(m => m.active && (category === 'Semua' || m.category === category) && m.name.toLowerCase().includes(search.toLowerCase()))
  return <section id="restaurant-workbench" className="mb-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
    <section className={restaurantPanel} aria-label="Katalog menu">
      <h2 className="text-lg">Menu restoran</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <RestaurantField label="Cari menu"><input value={search} onChange={e => setSearch(e.target.value)} className={restaurantInput} placeholder="Cari nama menu" /></RestaurantField>
        <RestaurantField label="Kategori menu kasir"><SelectInput value={category} onChange={e => setCategory(e.target.value)} className={restaurantInput}><option>Semua</option>{[...new Set(menu.map(m => m.category))].sort().map(c => <option key={c}>{c}</option>)}</SelectInput></RestaurantField>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
        {visibleMenu.map(m => (
          <article
            key={m.id}
            onClick={() => setMenuDetail(m)}
            className={`group flex min-h-36 min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-[#454d5b] bg-[#1c222e] p-2.5 text-left text-sm transition hover:border-[#24cbc5] focus-visible:outline-2 focus-visible:outline-[#24cbc5] cursor-pointer ${!m.available ? 'opacity-50' : ''
              }`}
          >
            <div>
              <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#273242]">
                {menuPhotos[m.id] ? (
                  <img src={menuPhotos[m.id]} alt={m.name} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="grid size-full place-items-center text-[#a4a7ac]">
                    <UtensilsCrossed className="size-6 text-[#24cbc5]/50" />
                  </div>
                )}
                {!m.available && (
                  <div className="absolute inset-0 grid place-items-center bg-black/60 font-medium text-[#ffb4ae]">
                    Habis
                  </div>
                )}
              </div>
              <div className="px-1 pb-1">
                <span className="line-clamp-2 break-words font-medium text-white">{m.name}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1 px-1 pt-1 border-t border-[#454d5b]/40">
              <div>
                <span className="font-semibold text-[#24cbc5]">{rupiah(Number(m.price))}</span>
                {menuDiscounts[m.id] && (
                  <span className="ml-1.5 inline-block rounded bg-[#24cbc5]/15 px-1 py-0.2 text-[10px] font-medium text-[#24cbc5]">
                    {menuDiscounts[m.id].kind === 'amount'
                      ? `-${rupiah(menuDiscounts[m.id].value || menuDiscounts[m.id].amount || 0)}`
                      : `-${menuDiscounts[m.id].value || menuDiscounts[m.id].percent}%`}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={!m.available || request.pending || request.locked || Boolean(checkout)||payNow}
                aria-label={`Tambah ${m.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  add(m.id)
                }}
                className="grid size-8 place-items-center rounded-lg bg-[#1835d9] text-white hover:bg-[#132c9e] active:scale-95 transition border-0 shadow-sm shrink-0 cursor-pointer disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visibleMenu.length && <p className="py-8 text-sm text-[#c5cbd5]">Tidak ada menu yang sesuai.</p>}
      {menuDetail && (
        <RestaurantDialog
          title="Detail Menu"
          busy={false}
          close={() => setMenuDetail(null)}
        >
          <div className="space-y-4">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#1c222e] border border-[#454d5b]/60 flex items-center justify-center">
              {menuPhotos[menuDetail.id] ? (
                <img src={menuPhotos[menuDetail.id]} alt={menuDetail.name} className="size-full object-cover" />
              ) : (
                <UtensilsCrossed className="size-12 text-[#24cbc5]/60" />
              )}
            </div>
            <div className="px-1 pb-1">
              <span className="line-clamp-2 break-words font-medium text-white">{menuDetail.name}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-1 px-1 pt-1">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#24cbc5] uppercase tracking-wider">
                  {menuDetail.category}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${menuDetail.available ? 'bg-[#24cbc5]/15 text-[#24cbc5]' : 'bg-red-500/20 text-[#ffb4ae]'}`}>
                  {menuDetail.available ? 'Tersedia' : 'Habis'}
                </span>
              </div>
              <h3 className="mt-1 text-lg font-bold text-white">{menuDetail.name}</h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold text-[#24cbc5]">{rupiah(Number(menuDetail.price))}</span>
                {menuDiscounts[menuDetail.id] && (
                  <span className="rounded bg-[#24cbc5]/20 px-1.5 py-0.5 text-xs font-semibold text-[#24cbc5]">
                    {menuDiscounts[menuDetail.id].kind === 'amount'
                      ? `-${rupiah(menuDiscounts[menuDetail.id].value || menuDiscounts[menuDetail.id].amount || 0)}`
                      : `-${menuDiscounts[menuDetail.id].value || menuDiscounts[menuDetail.id].percent}%`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-[#454d5b]/60">
              <button
                type="button"
                onClick={() => setMenuDetail(null)}
                className={restaurantButton + ' flex-1 !py-2.5'}
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={!menuDetail.available || request.pending || request.locked || Boolean(checkout)||payNow}
                onClick={() => {
                  add(menuDetail.id)
                  setMenuDetail(null)
                }}
                className={restaurantPrimary + ' flex-1 flex items-center justify-center gap-1.5 border-0 !py-2.5'}
              >
                <Plus className="size-4" />
                <span>Tambah ke Keranjang</span>
              </button>
            </div>
          </div>
        </RestaurantDialog>
      )}
    </section>
    <section className={restaurantPanel} aria-label="Keranjang restoran">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg">Keranjang aktif</h2><span className="text-xs text-[#c5cbd5]">{lines.reduce((n, l) => n + l.quantity, 0)} porsi</span></div>
      {!lines.length ? <div className="rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] px-4 py-12 text-center"><p>Belum ada menu</p><p className="mt-2 text-sm text-[#c5cbd5]">Pilih menu dari katalog untuk memulai.</p></div> : checkout || (payNow ? <Payment inline payments={payments} billing={billing} order={{...(initial||{}),id:id.current,business_id:member.business_id,actor_id:member.user_id,actor_name:member.name,kind,table_id:tableId||null,table_name:tables.find(t=>t.id===tableId)?.name||null,guests:Number(guests),customer:selectedMember?.name||customer,customer_id:selectedMember?.id||null,notes,stage,lines:preview.map(l=>({...l,sku:'',unit:'porsi',total:l.price*l.quantity})),subtotal,status:'open' as const,revision:initial?.revision||0,sale_id:null,cancellation_reason:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deposit_amount:initial?.deposit_amount||reservation?.deposit_amount||0}} member={member} close={()=>setPayNow(false)} paid={paid} submitPayment={(packet,details)=>checkoutRestaurantCart({...packet,...(repeatFrom?{sourceId:repeatFrom.id}:{})},orderDetails(),details,subtotal)} /> : <form onSubmit={submit}><fieldset disabled={request.pending || request.locked} className="space-y-4">
        {(initial?.occupies_table === false || reservation?.status === 'reserved') && <p className="text-sm leading-6 text-[#c5cbd5]">Pesanan di muka tidak menandai meja terpakai. Tandai pelanggan datang di Reservasi sebelum memproses atau melunasi pesanan.</p>}
        <RestaurantField label="Jenis pesanan"><SelectInput disabled={Boolean(reservation || initial?.reservation_id)} value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={restaurantInput}><option value="takeaway">Bawa pulang</option><option value="dine_in">Makan di tempat</option></SelectInput></RestaurantField>
        {kind === 'dine_in' && <><RestaurantField label="Meja"><SelectInput disabled={Boolean(reservation || initial?.reservation_id)} value={tableId} onChange={e => setTableId(e.target.value)} className={restaurantInput}><option value="">Belum pilih meja</option>{tables.filter(t => t.active).map(t => { const taken = usage.some(u => u.id === t.id && (u.occupied || u.reserved)) && t.id !== initial?.table_id && t.id !== repeatFrom?.table_id && t.id !== reservation?.table_id; return <option key={t.id} value={t.id} disabled={taken}>{t.name} / {t.capacity} orang{taken ? (usage.some(u => u.id === t.id && u.reserved) ? ' / Reservasi' : ' / Terpakai') : ''}</option> })}</SelectInput></RestaurantField><RestaurantField label="Jumlah tamu"><NumericInput disabled={Boolean(reservation || initial?.reservation_id)} required type="number" min={1} max={1000} value={guests} onChange={e => setGuests(e.target.value)} className={restaurantInput} /></RestaurantField><p className="text-xs text-[#c5cbd5]">Meja boleh ditentukan nanti. Pesanan tanpa meja tetap dapat dibayar.</p></>}
        {reservation || initial?.reservation_id ? <RestaurantField label="Nama pelanggan reservasi"><input readOnly value={customer} className={restaurantInput} /></RestaurantField> : <PosCustomerPicker member={member} addLabel="Tambah member" value={selectedMember} onChange={value => { setSelectedMember(value); setMemberError(''); setCustomer(value?.name || 'Pelanggan umum') }} />}{memberError && <p role="alert" className="text-sm text-[#ffb4ae]">{memberError}</p>}
        <ul className="divide-y divide-[#454d5b]">{preview.map(l => {
          const discount = menuDiscounts[l.id]
          return (
            <li key={l.id} className="py-3">
              <div className="flex items-start gap-3">
                {menuPhotos[l.id] ? (
                  <img src={menuPhotos[l.id]} alt={l.name} className="size-11 rounded-lg object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]" />
                ) : (
                  <div className="size-11 rounded-lg bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                    <UtensilsCrossed className="size-5 text-[#24cbc5]/60" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-white">{l.name}</p>
                  {discount ? (
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                      <span className="text-xs text-[#a4a7ac] line-through">{rupiah(discount.basePrice)}</span>
                      <span className="text-sm font-semibold text-[#24cbc5]">{rupiah(l.price)}</span>
                      <span className="rounded bg-[#24cbc5]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#24cbc5]">
                        {discount.kind === 'amount'
                          ? `-${rupiah(discount.value || discount.amount || 0)}`
                          : `-${discount.value || discount.percent}%`}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-0.5">
                      <span className="text-sm font-semibold text-[#24cbc5]">{rupiah(l.price)}</span>
                    </div>
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQty(l.id, (l.quantity || 1) + 1)}
                        disabled={l.quantity >= 9999}
                        aria-label={`Tambah ${l.name}`}
                        title="Tambah kuantitas"
                        className="grid size-8 place-items-center rounded-lg bg-[#273242] text-[#c5cbd5] hover:bg-[#303640] hover:text-white active:scale-95 transition-all border border-[#454d5b] shrink-0 disabled:opacity-40"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={l.quantity || ''}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10)
                          if (isNaN(val)) {
                            setLines(old => old.map(item => item.id === l.id ? { ...item, quantity: 1 } : item))
                          } else {
                            updateQty(l.id, val)
                          }
                        }}
                        aria-label={`Jumlah ${l.name}`}
                        className="h-8 w-14 rounded-lg border border-[#454d5b] bg-[#1c222e] text-center text-sm font-medium text-white focus:border-[#24cbc5] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(l.id, (l.quantity || 1) - 1)}
                        disabled={l.quantity <= 1}
                        aria-label={`Kurangi ${l.name}`}
                        title="Kurangi kuantitas"
                        className="grid size-8 place-items-center rounded-lg bg-[#273242] text-[#c5cbd5] hover:bg-[#303640] hover:text-white active:scale-95 transition-all border border-[#454d5b] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines(old => old.filter(item => item.id !== l.id))}
                      aria-label={`Hapus ${l.name}`}
                      title={`Hapus ${l.name}`}
                      className="grid size-8 place-items-center rounded-full bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all border-0 shadow-sm shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}</ul>
        {!lines.length && <p className="text-sm text-[#c5cbd5]">Tambahkan minimal satu menu.</p>}
        <RestaurantField label="Catatan pesanan"><textarea maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} className={restaurantInput} /></RestaurantField>
        {initial && <RestaurantField label="Proses pesanan"><SelectInput disabled={initial.occupies_table === false} value={stage} onChange={e => setStage(e.target.value as typeof stage)} className={restaurantInput}>{Object.entries(restaurantStages).map(([value, label], index, all) => <option key={value} value={value} disabled={index < all.findIndex(([v]) => v === initial.stage)}>{label}</option>)}</SelectInput></RestaurantField>}
        <p className="text-sm">Subtotal pratinjau: {rupiah(subtotal)}</p><p className="text-xs leading-5 text-[#c5cbd5]">Harga diperiksa server saat disimpan. Menu yang sudah dipesan mempertahankan harga tersimpan jika jumlahnya tetap atau berkurang; penambahan jumlah memakai harga menu saat ini. Periksa hasil tersimpan sebelum menerima pembayaran.</p>
      </fieldset>{request.error && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}<div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Pesanan baru</button><button disabled={request.pending || !lines.length || Boolean(memberError)} className="min-h-11 inline-flex items-center justify-center rounded-full border-0 bg-[#1835d9] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#132c9e] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] disabled:opacity-50 shadow-sm">{request.pending ? 'Menyimpan...' : request.locked ? 'Ulangi permintaan yang sama' : initial?.occupies_table === false ? 'Simpan pesanan di muka' : 'Bayar nanti'}</button>{initial?.occupies_table!==false&&reservation?.status!=='reserved'&&<button type="button" disabled={request.pending||request.locked||!lines.length||Boolean(memberError)} onClick={e=>{if(e.currentTarget.form?.reportValidity())setPayNow(true)}} className={restaurantPrimary}>Bayar sekarang</button>}</div></form>)}</section></section>
}

function Payment({ order, member, close, paid, payments, billing, inline = false, submitPayment }: { payments: PaymentSettings; billing: RestaurantBilling; order: RestaurantOrder; member: Member; close: () => void; paid: (sale: Sale) => void; inline?: boolean; submitPayment?:(input:{id:string;revision:number|null;request:string},details:unknown)=>Promise<RestaurantResult> }) {
  const request = useRestaurantRequest()
  const [method, setMethod] = useState<Sale['payment']>(enabledPaymentMethods(payments)[0] || 'cash'), [received, setReceived] = useState(''), [confirmed, setConfirmed] = useState(false), [kind, setKind] = useState('none'), [value, setValue] = useState('0')
  const [reward,setReward]=useState<LoyaltyRedemptionRule|null>(null)
  const [customer, setCustomer] = useState<PosCustomer | null>(null), [memberError, setMemberError] = useState(''), [memberLoading, setMemberLoading] = useState(Boolean(order.customer_id))
  useEffect(() => { let live = true; if (order.customer_id) void loadRestaurantMember(order.customer_id).then(r => { if (live) { setCustomer(r.member || null); setMemberError(r.error || ''); setMemberLoading(false) } }).catch(() => { if (live) { setMemberError('Member belum dapat dibaca. Muat ulang sebelum pembayaran.'); setMemberLoading(false) } }); return () => { live = false } }, [order.customer_id])
  useEffect(() => { if (!request.locked && !enabledPaymentMethods(payments).includes(method)) setMethod(enabledPaymentMethods(payments)[0] || 'cash') }, [payments, method, request.locked])
  let total = Number(order.subtotal), discount = 0, error = '', service = 0, serviceRate = 0, tax = 0
  let pointDiscount = 0, earnedPoints = 0
  try { const result = restaurantRewardQuote(Number(order.subtotal), kind, value, order.kind, billing, reward, Number(customer?.points || 0),order.lines.map(l=>({id:l.id,price:Number(l.price)}))); total = result.total; discount = result.orderDiscount; pointDiscount = result.pointDiscount; earnedPoints = customer ? result.pointsEarned : 0; service = result.service; serviceRate = result.serviceRate; tax = result.tax } catch (e) { error = (e as Error).message }
  const deposit = Number(order.deposit_amount || 0)
  let balance = total
  try { balance = reservationBalance(total, deposit) } catch (e) { error = (e as Error).message }
  const cashAmount = restaurantCashAmount(received)
  const cashError = method === 'cash' && received !== '' && cashAmount === null ? 'Masukkan nominal rupiah yang valid, tanpa pemisah ribuan.' : ''
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!request.locked && (error || memberLoading || memberError || (method === 'cash' && cashAmount === null))) return
    const input = { id: order.id, revision: order.revision, request: crypto.randomUUID() }
    const details = { payment: method, received: method === 'cash' ? received : String(balance), discountKind: kind, discountValue: value, paymentRevision: payments.revision, billingRevision: billing.revision, redeemPoints: String(reward?.points_required||0), ...(reward?{redemptionId:reward.id}:{}), confirmed }
    void request.run(() => submitPayment?submitPayment(input,details):payRestaurantOrder(input, details), v => {
      const sale = (v as { sale: Sale }).sale
      notify({
        title: 'Pembayaran pesanan selesai',
        message: `Pembayaran pesanan ${restaurantOrderCode(order.id)} sebesar ${rupiah(total)} berhasil dicatat.`,
        category: 'transaction',
      })
      paid(sale)
    })
  }
  return <PaymentFrame inline={inline} title={`Bayar ${restaurantOrderCode(order.id)}`} busy={request.pending} close={close}><form onSubmit={submit}><fieldset disabled={request.pending || request.locked} className="space-y-4">
    {memberLoading && <p role="status" className="text-sm text-[#c5cbd5]">Memuat member...</p>}{memberError && <p role="alert" className="text-sm text-[#ffb4ae]">{memberError}</p>}{customer && <div className="rounded-xl bg-[#1c222e] p-3 text-sm"><p>{customer.name} · {customer.phone || 'Tanpa telepon'}</p><p className="mt-1 text-[#24cbc5]">Saldo: {customer.points || 0} poin</p>{billing.loyalty_active&&<RestaurantField label="Tukar poin"><SelectInput value={reward?.id||''} onChange={e=>{setReward(billing.redemptions?.find(r=>r.id===e.target.value)||null);setConfirmed(false)}} className={restaurantInput}><option value="">Tanpa penukaran poin</option>{billing.redemptions?.filter(r=>r.reward_type!=='service').map(r=><option key={r.id} value={r.id} disabled={r.points_required>Number(customer.points||0)}>{r.reward_type==='voucher'?`Voucher ${rupiah(Number(r.voucher_amount||0))}`:r.product_name||'Menu hadiah'} ? {r.points_required} poin</option>)}</SelectInput></RestaurantField>}<p className="mt-2 text-xs text-[#c5cbd5]">Estimasi perolehan: {earnedPoints} poin.</p></div>}
    <ul className="divide-y divide-[#454d5b] text-sm">{order.lines.map(l => <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.name} / {l.quantity} porsi</span><span>{rupiah(Number(l.total))}</span></li>)}</ul>
    {member.role !== 'cashier' && <div className="grid gap-3 sm:grid-cols-2"><RestaurantField label="Jenis diskon"><SelectInput value={kind} onChange={e => { setKind(e.target.value); setValue('0') }} className={restaurantInput}><option value="none">Tanpa diskon</option><option value="amount">Nominal rupiah</option><option value="percent">Persen</option></SelectInput></RestaurantField>{kind !== 'none' && <RestaurantField label="Nilai diskon"><input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} className={restaurantInput} /></RestaurantField>}</div>}
    <p className="text-sm">Diskon: {rupiah(discount)}</p>{pointDiscount > 0 && <p className="text-sm">Potongan poin: {rupiah(pointDiscount)}</p>}{serviceRate > 0 && <p className="text-sm">Biaya layanan ({serviceRate}%): {rupiah(service)}</p>}{Number(billing.tax_rate) > 0 && <><p className="text-sm">Pajak ({Number(billing.tax_rate)}%): {rupiah(tax)}</p><p className="text-xs text-[#c5cbd5]">Dasar pajak: {billing.tax_base === 'net_service' ? 'subtotal setelah diskon + biaya layanan' : 'subtotal setelah diskon'}.</p></>}<p className="text-lg">Total: {rupiah(total)}</p>
    {deposit > 0 && <><p className="text-sm">DP terkonfirmasi: {rupiah(deposit)}</p><p className="text-lg">Sisa pembayaran: {rupiah(balance)}</p></>}<RestaurantPaymentFields settings={payments} method={method} onChange={setMethod} />
    {method === 'cash' ? <><RestaurantField label="Uang diterima"><input required inputMode="numeric" maxLength={32} aria-invalid={Boolean(cashError)} value={received} onChange={e => setReceived(e.target.value)} className={restaurantInput} /></RestaurantField><p className="text-sm">Kembalian pratinjau: {cashAmount === null ? (received === '' ? rupiah(0) : '-') : rupiah(Math.max(0, cashAmount - balance))}</p></> : <p className="text-sm leading-6 text-[#c5cbd5]">Periksa pembayaran pada rekening/aplikasi usaha. Usahaku tidak memverifikasi QRIS atau transfer secara otomatis.</p>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{deposit > 0 ? 'Sisa pembayaran sudah diterima dan diperiksa.' : 'Pembayaran sebesar total sudah diterima dan diperiksa.'}</label>
  </fieldset>{(cashError || request.error || error) && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{cashError || request.error || error}</p>}<div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={request.pending||request.locked} onClick={close} className={restaurantButton}>Ubah pesanan</button><button disabled={request.pending || (!request.locked && (memberLoading || Boolean(memberError) || !enabledPaymentMethods(payments).includes(method) || !confirmed || Boolean(error) || (method === 'cash' && cashAmount === null)))} className="min-h-11 inline-flex items-center justify-center rounded-full border-0 bg-[#1835d9] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#132c9e] active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] disabled:opacity-50 shadow-sm">{request.pending ? 'Mencatat...' : request.locked ? 'Ulangi permintaan yang sama' : 'Catat pembayaran'}</button></div></form></PaymentFrame>
}

function PaymentFrame({ inline, title, busy, close, children }: { inline: boolean; title: string; busy: boolean; close: () => void; children: ReactNode }) {
  return inline ? <section aria-label="Pembayaran pesanan"><h3 className="mb-4 text-lg">{title}</h3>{children}</section> : <RestaurantDialog title={title} busy={busy} close={close}>{children}</RestaurantDialog>
}

function CancelOrder({ order, close, saved }: { order: RestaurantOrder; close: () => void; saved: () => void }) {
  const request = useRestaurantRequest(), [reason, setReason] = useState('')
  return <RestaurantDialog title={`Batalkan ${restaurantOrderCode(order.id)}`} busy={request.pending} close={close}><form onSubmit={e => {
    e.preventDefault()
    void request.run(() => cancelRestaurantOrder(order.id, order.revision, reason), () => {
      notify({
        title: 'Pesanan dibatalkan',
        message: `Pesanan ${restaurantOrderCode(order.id)} telah dibatalkan.`,
        category: 'order',
      })
      saved()
    })
  }}><fieldset disabled={request.pending || request.locked}><p className="mb-4 text-sm leading-6 text-[#c5cbd5]">{order.reservation_id && Number(order.deposit_amount) > 0 ? <>Pesanan memiliki DP. <Link className="text-[#24cbc5] underline" href="/dashboard/restaurant/reservations">Batalkan melalui Reservasi dengan refund DP.</Link><br /></> : null}Pesanan ini belum dibayar. Pembatalan dicatat tanpa menghapus riwayat atau membuat refund.</p><RestaurantField label="Alasan pembatalan"><textarea required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} className={restaurantInput} /></RestaurantField></fieldset>{request.error && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Kembali</button><button disabled={request.pending} className={restaurantPrimary}>{request.pending ? 'Menyimpan...' : request.locked ? 'Ulangi permintaan yang sama' : 'Batalkan pesanan'}</button></div></form></RestaurantDialog>
}
