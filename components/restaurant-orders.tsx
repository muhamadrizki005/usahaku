'use client'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loadRestaurantOrders, saveRestaurantOrder, payRestaurantOrder, cancelRestaurantOrder } from '@/app/restaurant-actions'
import { restaurantCashAmount, restaurantStages, restaurantOrderCode, type RestaurantMenu, type RestaurantTable, type RestaurantOrder, type RestaurantOrderPage, type RestaurantResult } from '@/lib/restaurant'
import type { Member } from '@/lib/validation'
import { quote, rupiah, saleDate, type Sale } from '@/lib/pos'
import DashboardSection from './dashboard-section'
import { RestaurantDialog, RestaurantField, restaurantPanel, restaurantInput, restaurantButton, restaurantPrimary } from './restaurant-forms'

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
export default function RestaurantOrders({ menu, tables, initialPage, usage, member }: { menu: RestaurantMenu[]; tables: RestaurantTable[]; initialPage: RestaurantOrderPage; usage: { id: string; occupied: boolean }[]; member: Member }) {
  const router = useRouter()
  const [refreshing, refresh] = useTransition()
  const [editor, setEditor] = useState<RestaurantOrder | 'new' | null>(null), [payment, setPayment] = useState<RestaurantOrder | null>(null), [cancellation, setCancellation] = useState<RestaurantOrder | null>(null)
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
  const saved = () => { setEditor(null); setPayment(null); setCancellation(null); refresh(() => router.refresh()) }
  return <DashboardSection title="Pesanan & kasir">
    <section className={restaurantPanel} aria-busy={refreshing || loading}><fieldset disabled={refreshing} className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-normal">Pesanan restoran</h2><button disabled={loading || Boolean(listError)} onClick={() => setEditor('new')} className={restaurantPrimary}>Buat pesanan</button></div>
      <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">{member.role === 'cashier' ? 'Pesanan dan transaksi milik Anda. Meja terpakai milik petugas lain tetap ditandai tanpa membuka rinciannya.' : 'Kelola pesanan makan di tempat dan bawa pulang.'} Pembayaran QRIS/transfer diperiksa manual di luar aplikasi.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><RestaurantField label="Cari pesanan"><input maxLength={100} value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} className={restaurantInput} /></RestaurantField><RestaurantField label="Status pesanan"><select value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0) }} className={restaurantInput}><option value="open">Belum dibayar</option><option value="paid">Dibayar</option><option value="cancelled">Dibatalkan</option><option value="all">Semua</option></select></RestaurantField></div>
      {loading && <p role="status" className="mt-3 text-sm text-[#c5cbd5]">Memuat pesanan...</p>}
      {listError && <div className="mt-3"><p role="alert" className="text-sm text-[#ffb4ae]">{listError}</p><button type="button" onClick={() => setRetryList(v => v + 1)} className={restaurantButton + ' mt-2'}>Coba muat lagi</button></div>}
      <fieldset disabled={loading || Boolean(listError)} className="min-w-0">
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-[#c5cbd5]"><tr>{['Pesanan', 'Meja / layanan', 'Proses', 'Subtotal', 'Tindakan'].map(v => <th key={v} className="p-3 font-normal">{v}</th>)}</tr></thead><tbody>{visible.map(o => <tr key={o.id} className="border-b border-[#454d5b]/50"><td className="p-3"><p>{restaurantOrderCode(o.id)}</p><p className="mt-1 text-xs text-[#c5cbd5]">{o.customer}<br />{o.actor_name}<br />{saleDate(o.created_at)}</p>{o.cancellation_reason && <p className="mt-1 text-xs text-[#c5cbd5]">{o.cancellation_reason}</p>}</td><td className="p-3">{o.kind === 'dine_in' ? `${o.table_name} / ${o.guests} orang` : 'Bawa pulang'}</td><td className="p-3">{statusLabel[o.status]}<br /><span className="text-xs text-[#c5cbd5]">{restaurantStages[o.stage]}</span></td><td className="p-3">{rupiah(Number(o.subtotal))}</td><td className="p-3"><div className="flex flex-wrap gap-2">{o.status === 'open' && <><button onClick={() => setEditor(o)} className={restaurantButton} aria-label={`Ubah ${restaurantOrderCode(o.id)}`}>Ubah</button><button onClick={() => setPayment(o)} className={restaurantPrimary} aria-label={`Bayar ${restaurantOrderCode(o.id)}`}>Bayar</button><button onClick={() => setCancellation(o)} className={restaurantButton} aria-label={`Batalkan ${restaurantOrderCode(o.id)}`}>Batalkan</button></>}{o.sale_id && <Link href={`/dashboard/transactions/${o.sale_id}`} className={restaurantButton}>Detail & struk</Link>}</div></td></tr>)}</tbody></table>{!visible.length && !loading && !listError && <p className="py-8 text-sm text-[#c5cbd5]">Belum ada pesanan yang sesuai.</p>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#c5cbd5]"><span>{list.total} pesanan</span><div className="flex gap-2"><button disabled={!list.page} onClick={() => setPage(list.page - 1)} className={restaurantButton}>Sebelumnya</button><button disabled={(list.page + 1) * list.pageSize >= list.total} onClick={() => setPage(list.page + 1)} className={restaurantButton}>Berikutnya</button></div></div>
    </fieldset></fieldset></section>
    {editor && <OrderEditor initial={editor === 'new' ? null : editor} menu={menu} tables={tables} usage={usage} close={() => setEditor(null)} saved={saved} />}
    {payment && <Payment order={payment} member={member} close={() => setPayment(null)} paid={sale => { saved(); router.push(`/dashboard/transactions/${sale.id}`) }} />}
    {cancellation && <CancelOrder order={cancellation} close={() => setCancellation(null)} saved={saved} />}
  </DashboardSection>
}

function OrderEditor({ initial, menu, tables, usage, close, saved }: { initial: RestaurantOrder | null; menu: RestaurantMenu[]; tables: RestaurantTable[]; usage: { id: string; occupied: boolean }[]; close: () => void; saved: () => void }) {
  const id = useRef(initial?.id || crypto.randomUUID()), request = useRestaurantRequest()
  const [kind, setKind] = useState<'dine_in' | 'takeaway'>(initial?.kind || 'takeaway'), [tableId, setTableId] = useState(initial?.table_id || ''), [guests, setGuests] = useState(String(initial?.guests || 1))
  const [customer, setCustomer] = useState(initial?.customer || 'Pelanggan umum'), [notes, setNotes] = useState(initial?.notes || ''), [stage, setStage] = useState<RestaurantOrder['stage']>(initial?.stage || 'new')
  const [lines, setLines] = useState((initial?.lines || []).map(l => ({ id: l.id, quantity: l.quantity }))), [choice, setChoice] = useState('')
  const add = () => { if (!choice) return; setLines(old => old.some(l => l.id === choice) ? old.map(l => l.id === choice ? { ...l, quantity: Math.min(9999, l.quantity + 1) } : l) : [...old, { id: choice, quantity: 1 }]); setChoice('') }
  const preview = lines.map(l => { const old = initial?.lines.find(p => p.id === l.id), current = menu.find(p => p.id === l.id); const price = old && l.quantity <= old.quantity ? Number(old.price) : Number(current?.price || 0); return { ...l, name: old?.name || current?.name || 'Menu tidak tersedia', price } })
  const subtotal = preview.reduce((sum, l) => sum + l.price * l.quantity, 0)
  function submit(e: FormEvent) { e.preventDefault(); const input = { id: id.current, revision: initial?.revision ?? null, request: crypto.randomUUID() }; const details = { kind, tableId: kind === 'dine_in' ? tableId || null : null, guests: Number(guests), customer, notes, stage, lines }; void request.run(() => saveRestaurantOrder(input, details), saved) }
  return <RestaurantDialog title={initial ? 'Ubah pesanan' : 'Buat pesanan'} busy={request.pending} close={close}><form onSubmit={submit}><fieldset disabled={request.pending || request.locked} className="space-y-4">
    <RestaurantField label="Jenis pesanan"><select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={restaurantInput}><option value="takeaway">Bawa pulang</option><option value="dine_in">Makan di tempat</option></select></RestaurantField>
    {kind === 'dine_in' && <><RestaurantField label="Meja"><select required value={tableId} onChange={e => setTableId(e.target.value)} className={restaurantInput}><option value="">Pilih meja</option>{tables.filter(t => t.active).map(t => { const taken = usage.some(u => u.id === t.id && u.occupied) && t.id !== initial?.table_id; return <option key={t.id} value={t.id} disabled={taken}>{t.name} / {t.capacity} orang{taken ? ' / Terpakai' : ''}</option> })}</select></RestaurantField><RestaurantField label="Jumlah tamu"><input required type="number" min={1} max={1000} value={guests} onChange={e => setGuests(e.target.value)} className={restaurantInput} /></RestaurantField></>}
    <RestaurantField label="Nama pelanggan"><input required maxLength={100} value={customer} onChange={e => setCustomer(e.target.value)} className={restaurantInput} /></RestaurantField>
    <RestaurantField label="Pilih menu"><select value={choice} onChange={e => setChoice(e.target.value)} className={restaurantInput}><option value="">Pilih menu tersedia</option>{menu.filter(m => m.active && m.available).map(m => <option key={m.id} value={m.id}>{m.name} / {rupiah(Number(m.price))}</option>)}</select></RestaurantField><button type="button" disabled={!choice || lines.length >= 100} onClick={add} className={restaurantButton}>Tambahkan menu</button>
    <ul className="divide-y divide-[#454d5b]">{preview.map(l => <li key={l.id} className="py-3"><p className="break-words text-sm">{l.name} / {rupiah(l.price)} per porsi</p><div className="mt-2 flex flex-wrap items-end gap-3"><RestaurantField label={`Jumlah ${l.name}`}><input required type="number" min={1} max={9999} value={l.quantity || ''} onChange={e => setLines(old => old.map(item => item.id === l.id ? { ...item, quantity: Number(e.target.value) } : item))} className={restaurantInput} /></RestaurantField><button type="button" onClick={() => setLines(old => old.filter(item => item.id !== l.id))} aria-label={`Hapus ${l.name}`} className={restaurantButton}>Hapus</button></div></li>)}</ul>
    {!lines.length && <p className="text-sm text-[#c5cbd5]">Tambahkan minimal satu menu.</p>}
    <RestaurantField label="Catatan pesanan"><textarea maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} className={restaurantInput} /></RestaurantField>
    {initial && <RestaurantField label="Proses pesanan"><select value={stage} onChange={e => setStage(e.target.value as typeof stage)} className={restaurantInput}>{Object.entries(restaurantStages).map(([value, label], index, all) => <option key={value} value={value} disabled={index < all.findIndex(([v]) => v === initial.stage)}>{label}</option>)}</select></RestaurantField>}
    <p className="text-sm">Subtotal pratinjau: {rupiah(subtotal)}</p><p className="text-xs leading-5 text-[#c5cbd5]">Harga diperiksa server saat disimpan. Menu yang sudah dipesan mempertahankan harga tersimpan jika jumlahnya tetap atau berkurang; penambahan jumlah memakai harga menu saat ini. Periksa hasil tersimpan sebelum menerima pembayaran.</p>
  </fieldset>{request.error && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Batal</button><button disabled={request.pending || !lines.length} className={restaurantPrimary}>{request.pending ? 'Menyimpan...' : request.locked ? 'Ulangi permintaan yang sama' : 'Simpan pesanan'}</button></div></form></RestaurantDialog>
}

function Payment({ order, member, close, paid }: { order: RestaurantOrder; member: Member; close: () => void; paid: (sale: Sale) => void }) {
  const request = useRestaurantRequest()
  const [method, setMethod] = useState<'cash' | 'qris' | 'transfer'>('cash'), [received, setReceived] = useState(''), [confirmed, setConfirmed] = useState(false), [kind, setKind] = useState('none'), [value, setValue] = useState('0')
  let total = Number(order.subtotal), discount = 0, error = ''
  try { const result = quote(order.lines.map(l => ({ product: { price: Number(l.price) }, quantity: Number(l.quantity) })), kind, value); total = result.total; discount = result.discount } catch (e) { error = (e as Error).message }
  const cashAmount = restaurantCashAmount(received)
  const cashError = method === 'cash' && received !== '' && cashAmount === null ? 'Masukkan nominal rupiah yang valid, tanpa pemisah ribuan.' : ''
  function submit(e: FormEvent) { e.preventDefault(); if (error || (method === 'cash' && cashAmount === null)) return; const input = { id: order.id, revision: order.revision, request: crypto.randomUUID() }; const details = { payment: method, received: method === 'cash' ? received : String(total), discountKind: kind, discountValue: value, confirmed }; void request.run(() => payRestaurantOrder(input, details), v => paid((v as { sale: Sale }).sale)) }
  return <RestaurantDialog title={`Bayar ${restaurantOrderCode(order.id)}`} busy={request.pending} close={close}><form onSubmit={submit}><fieldset disabled={request.pending || request.locked} className="space-y-4">
    <ul className="divide-y divide-[#454d5b] text-sm">{order.lines.map(l => <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.name} / {l.quantity} porsi</span><span>{rupiah(Number(l.total))}</span></li>)}</ul>
    {member.role !== 'cashier' && <div className="grid gap-3 sm:grid-cols-2"><RestaurantField label="Jenis diskon"><select value={kind} onChange={e => { setKind(e.target.value); setValue('0') }} className={restaurantInput}><option value="none">Tanpa diskon</option><option value="amount">Nominal rupiah</option><option value="percent">Persen</option></select></RestaurantField>{kind !== 'none' && <RestaurantField label="Nilai diskon"><input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} className={restaurantInput} /></RestaurantField>}</div>}
    <p className="text-sm">Diskon: {rupiah(discount)}</p><p className="text-lg">Total: {rupiah(total)}</p>
    <RestaurantField label="Metode pembayaran"><select value={method} onChange={e => setMethod(e.target.value as typeof method)} className={restaurantInput}><option value="cash">Tunai</option><option value="qris">QRIS manual</option><option value="transfer">Transfer manual</option></select></RestaurantField>
    {method === 'cash' ? <><RestaurantField label="Uang diterima"><input required inputMode="numeric" maxLength={32} aria-invalid={Boolean(cashError)} value={received} onChange={e => setReceived(e.target.value)} className={restaurantInput} /></RestaurantField><p className="text-sm">Kembalian pratinjau: {cashAmount === null ? (received === '' ? rupiah(0) : '-') : rupiah(Math.max(0, cashAmount - total))}</p></> : <p className="text-sm leading-6 text-[#c5cbd5]">Periksa pembayaran pada rekening/aplikasi usaha. Usahaku tidak memverifikasi QRIS atau transfer secara otomatis.</p>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Pembayaran sebesar total sudah diterima dan diperiksa.</label>
  </fieldset>{(cashError || request.error || error) && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{cashError || request.error || error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Batal</button><button disabled={request.pending || !confirmed || Boolean(error) || (method === 'cash' && cashAmount === null)} className={restaurantPrimary}>{request.pending ? 'Mencatat...' : request.locked ? 'Ulangi permintaan yang sama' : 'Catat pembayaran'}</button></div></form></RestaurantDialog>
}

function CancelOrder({ order, close, saved }: { order: RestaurantOrder; close: () => void; saved: () => void }) {
  const request = useRestaurantRequest(), [reason, setReason] = useState('')
  return <RestaurantDialog title={`Batalkan ${restaurantOrderCode(order.id)}`} busy={request.pending} close={close}><form onSubmit={e => { e.preventDefault(); void request.run(() => cancelRestaurantOrder(order.id, order.revision, reason), saved) }}><fieldset disabled={request.pending || request.locked}><p className="mb-4 text-sm leading-6 text-[#c5cbd5]">Pesanan ini belum dibayar. Pembatalan dicatat tanpa menghapus riwayat atau membuat refund.</p><RestaurantField label="Alasan pembatalan"><textarea required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} className={restaurantInput} /></RestaurantField></fieldset>{request.error && <p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Kembali</button><button disabled={request.pending} className={restaurantPrimary}>{request.pending ? 'Menyimpan...' : request.locked ? 'Ulangi permintaan yang sama' : 'Batalkan pesanan'}</button></div></form></RestaurantDialog>
}
