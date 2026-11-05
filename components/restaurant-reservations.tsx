'use client'
import { NumericInput } from '@/components/ui/numeric-input'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardSection from './dashboard-section'
import { RestaurantDialog, RestaurantField, restaurantButton, restaurantInput, restaurantPanel, restaurantPrimary } from './restaurant-forms'
import { createReservationBooking, arriveReservation, closeReservation, loadReservationAvailability, recordReservationDeposit, saveReservation, type ReservationResult } from '@/app/reservation-actions'
import { reservationIso, reservationLocalTime, reservationStatus, type Reservation, type ReservationAvailability, type ReservationPage } from '@/lib/restaurant-reservations'
import { paymentLabel, rupiah, saleDate } from '@/lib/pos'
import ReservationMealFields, { type ReservationMealLine } from './reservation-meal-fields'
import type { RestaurantMenu } from '@/lib/restaurant'
import RestaurantPaymentFields from './restaurant-payment-fields'
import { enabledPaymentMethods, type PaymentSettings } from '@/lib/business-payments'
import { businessDays, describeHours, type BusinessHours } from '@/lib/business-profile'
import type { Member } from '@/lib/validation'

function useReservationRequest() {
  const busy = useRef(false), retry = useRef<(() => Promise<ReservationResult>) | null>(null)
  const [pending,setPending] = useState(false), [locked,setLocked] = useState(false), [error,setError] = useState('')
  async function run(call: () => Promise<ReservationResult>, saved: () => void) {
    if (busy.current) return
    busy.current=true;setPending(true);setError('')
    const action=retry.current || call
    try { const result=await action(); if(result.value){retry.current=null;setLocked(false);saved()}else{setError(result.error || 'Belum tersimpan.');retry.current=result.uncertain?action:null;setLocked(Boolean(result.uncertain))} }
    catch {retry.current=action;setLocked(true);setError('Hasil belum pasti. Ulangi permintaan yang sama atau periksa setelah muat ulang.')}
    finally{busy.current=false;setPending(false)}
  }
  return {pending,locked,error,run}
}

export default function RestaurantReservations({data,day,member,lockMinutes,menu,payments,hours}:{data:ReservationPage;day:string;member:Member;lockMinutes:number;menu:RestaurantMenu[];payments:PaymentSettings;hours:BusinessHours|null}) {
  const router=useRouter(), [filter,setFilter]=useState(day), [editing,setEditing]=useState<Reservation | 'new' | null>(null), [deposit,setDeposit]=useState<Reservation | null>(null), [arriving,setArriving]=useState<Reservation | null>(null), [closing,setClosing]=useState<Reservation | null>(null), [notice,setNotice]=useState('')
  const [filtering,startFilter]=useTransition()
  useEffect(()=>setFilter(day),[day])
  const saved=()=>{setEditing(null);setDeposit(null);setClosing(null);setArriving(null);setNotice('Perubahan reservasi tersimpan.');router.refresh()}
  const go=(page:number,nextDay=day)=>startFilter(()=>router.replace('/dashboard/restaurant/reservations?'+new URLSearchParams({day:nextDay,page:String(page)}),{scroll:false}))
  const changeDay=(value:string)=>{setFilter(value);try{reservationIso(value+'T00:00')}catch{return}if(value!==day)go(0,value)}
  return <DashboardSection title="Reservasi">
    <section className={restaurantPanel} aria-busy={filtering}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-normal">Reservasi meja</h2><button disabled={filtering||filter!==day||!hours} onClick={()=>setEditing('new')} className={restaurantPrimary}>Buat reservasi</button></div>
      <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">{member.role==='cashier'?'Reservasi milik Anda.':'Reservasi seluruh petugas.'} Jadwal memakai WIB. Meja dikunci {lockMinutes} menit sebelum kedatangan. Pesanan di muka bisa dicatat sejak reservasi dibuat; pelunasan setelah pelanggan ditandai datang. Durasi awal 90 menit; toleransi terlambat 15 menit. Staf menandai pembatalan/tidak hadir, tanpa pembatalan otomatis.</p>
      <p className="mt-2 text-xs leading-5 text-[#c5cbd5]">DP opsional dicatat setelah pembayaran diperiksa. DP belum menjadi penjualan; pelunasan mencatat total tagihan sekali. Pembatalan dengan DP memerlukan refund penuh manual oleh owner/admin.</p>
      {hours?<details className="mt-3 text-sm text-[#c5cbd5]"><summary className="cursor-pointer">Jam operasional restoran (WIB)</summary><dl className="mt-3 space-y-2">{businessDays.map(day=><div key={day} className="flex flex-wrap justify-between gap-3"><dt>{day}</dt><dd>{describeHours(hours[day])}</dd></div>)}</dl><p className="mt-2 text-xs">Seluruh durasi reservasi harus berada dalam jam buka. Jam lintas tengah malam mengikuti hari mulai buka.</p></details>:<p className="mt-3 text-sm text-[#ffb4ae]">Jam operasional belum diatur. Minta owner menyimpannya melalui Pengaturan sebelum membuat reservasi baru.</p>}
      {notice&&<p role="status" className="mt-3 text-sm text-[#24cbc5]">{notice}</p>}
      <div className="mt-4 flex flex-wrap items-end gap-3"><RestaurantField label="Tanggal reservasi (WIB)"><DatePicker label="Tanggal reservasi (WIB)" value={filter} onChange={changeDay} className="mt-1"/></RestaurantField></div>
      {filtering&&<p role="status" className="mt-3 text-sm text-[#c5cbd5]">Memuat reservasi tanggal yang dipilih...</p>}
      <div inert={filtering||filter!==day}>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-[#c5cbd5]"><tr>{['Pelanggan & jadwal','Meja','Status & DP','Tindakan'].map(v=><th key={v} className="p-3 font-normal">{v}</th>)}</tr></thead><tbody>{data.items.map(r=><tr key={r.id} data-testid={'reservation-'+r.id} className="border-b border-[#454d5b]/50"><td className="min-w-48 p-3"><p className="break-words">{r.customer}</p><p className="mt-1 text-xs leading-5 text-[#c5cbd5]">{r.phone}<br/>{saleDate(r.starts_at)}<br/>hingga {saleDate(r.ends_at)}<br/>{r.actor_name}<br/>Meja dikunci: {saleDate(new Date(Date.parse(r.starts_at)-lockMinutes*60000).toISOString())}</p>{r.notes&&<p className="mt-2 max-w-64 break-words text-xs text-[#c5cbd5]">{r.notes}</p>}</td><td className="p-3">{r.table_name}<br/><span className="text-xs text-[#c5cbd5]">{r.guests} orang</span></td><td className="min-w-40 p-3"><p>{reservationStatus[r.status]}</p><p className="mt-1 text-xs leading-5 text-[#c5cbd5]">DP: {rupiah(Number(r.deposit_amount))}{r.deposit_payment&&<> / {paymentLabel[r.deposit_payment]}</>}{r.deposit_at&&<><br/>{saleDate(r.deposit_at)}</>}{Number(r.deposit_refunded)>0&&<><br/>Refund DP: {rupiah(Number(r.deposit_refunded))}</>}</p>{r.cancellation_reason&&<p className="mt-2 max-w-56 break-words text-xs">{r.cancellation_reason}</p>}</td><td className="p-3"><div className="flex flex-wrap gap-2">{r.status==='reserved'&&<><button onClick={()=>setEditing(r)} className={restaurantButton}>Ubah reservasi</button>{!Number(r.deposit_amount)&&<button onClick={()=>setDeposit(r)} className={restaurantButton}>Catat DP</button>}<Link href={'/dashboard/pos?reservation='+r.id} className={restaurantPrimary}>Tambah / ubah pesanan</Link><button onClick={()=>setArriving(r)} className={restaurantButton}>Tandai pelanggan datang</button></>}{r.status==='seated'&&<Link href={'/dashboard/pos?reservation='+r.id} className={restaurantButton}>Tambah / ubah pesanan</Link>}{['reserved','seated'].includes(r.status)&&<button onClick={()=>setClosing(r)} className={restaurantButton}>Batalkan / tidak hadir</button>}</div></td></tr>)}</tbody></table>{!data.items.length&&<p className="py-8 text-sm text-[#c5cbd5]">Belum ada reservasi pada tanggal ini.</p>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#c5cbd5]"><span>{data.total} reservasi</span><div className="flex gap-2"><button onClick={()=>go(data.page-1)} disabled={!data.page} className={restaurantButton}>Sebelumnya</button><button onClick={()=>go(data.page+1)} disabled={(data.page+1)*data.pageSize>=data.total} className={restaurantButton}>Berikutnya</button></div></div>
      </div>
    </section>
    {editing&&<ReservationEditor payments={payments} menu={menu} initial={editing==='new'?null:editing} day={day} close={()=>setEditing(null)} saved={saved}/>}
    {deposit&&<DepositForm payments={payments} reservation={deposit} close={()=>setDeposit(null)} saved={saved}/>}
    {arriving&&<ArrivalForm reservation={arriving} close={()=>setArriving(null)} saved={saved}/>}
    {closing&&<CloseForm reservation={closing} member={member} close={()=>setClosing(null)} saved={saved}/>}
  </DashboardSection>
}

function ReservationEditor({initial,day,close,saved,menu,payments}:{initial:Reservation|null;day:string;close:()=>void;saved:()=>void;menu:RestaurantMenu[];payments:PaymentSettings}) {
  const request=useReservationRequest(), id=useRef(initial?.id || crypto.randomUUID()), reads=useRef(0)
  const [start,setStart]=useState(initial?reservationLocalTime(initial.starts_at):day+'T19:00'), [duration,setDuration]=useState(initial?String((Date.parse(initial.ends_at)-Date.parse(initial.starts_at))/60000):'90'), [guests,setGuests]=useState(String(initial?.guests || 2)), [customer,setCustomer]=useState(initial?.customer || ''), [phone,setPhone]=useState(initial?.phone || ''), [notes,setNotes]=useState(initial?.notes || ''), [table,setTable]=useState(initial?.table_id || '')
  const [tables,setTables]=useState<ReservationAvailability[] | null>(null),[checking,setChecking]=useState(false),[lookupError,setLookupError]=useState('')
  const [submitError,setSubmitError]=useState('')
  const [withMeal,setWithMeal]=useState(false), [mealLines,setMealLines]=useState<ReservationMealLine[]>([]), [mealNotes,setMealNotes]=useState('')
  const [withDeposit,setWithDeposit]=useState(false), [amount,setAmount]=useState(''), [payment,setPayment]=useState<import('@/lib/pos').Sale['payment']>(enabledPaymentMethods(payments)[0]||'cash'), [confirmed,setConfirmed]=useState(false)
  useEffect(()=>{if(!request.locked&&!enabledPaymentMethods(payments).includes(payment))setPayment(enabledPaymentMethods(payments)[0]||'cash')},[payments,payment,request.locked])
  const mealSubtotal=mealLines.reduce((sum,l)=>sum+Number(menu.find(m=>m.id===l.id)?.price || 0)*Number(l.quantity),0)
  const invalidate=()=>{reads.current++;setTables(null);setChecking(false);setLookupError('')}
  function slot(){const startsAt=reservationIso(start),minutes=Number(duration);if(!Number.isInteger(minutes)||minutes<1||minutes>720)throw Error('Durasi harus 1–720 menit.');return{startsAt,endsAt:new Date(Date.parse(startsAt)+minutes*60000).toISOString()}}
  async function check(){let times;try{times=slot()}catch(e){setLookupError((e as Error).message);return}const token=++reads.current;setChecking(true);setLookupError('');setTables(null);try{const result=await loadReservationAvailability({...times,guests:Number(guests),exclude:initial?.id || null});if(token!==reads.current)return;setTables(result.items || null);setLookupError(result.error || '');if(!result.items?.some(t=>t.id===table&&t.available))setTable('')}catch{if(token===reads.current)setLookupError('Meja belum dapat diperiksa. Coba lagi.')}finally{if(token===reads.current)setChecking(false)}}
  function submit(e:FormEvent){e.preventDefault();setSubmitError('');if(!request.locked&&!tables?.some(t=>t.id===table&&t.available))return;let times;try{times=slot()}catch(e){setLookupError((e as Error).message);return}const input={id:id.current,revision:initial?.revision ?? null,request:crypto.randomUUID()},details={...times,tableId:table,guests:Number(guests),customer,phone,notes};const extras={meal:withMeal?{lines:mealLines.map(l=>({id:l.id,quantity:Number(l.quantity)})),notes:mealNotes}:null,deposit:withDeposit?{amount,payment,confirmed,paymentRevision:payments.revision}:null};if(!request.locked&&!initial&&withDeposit&&!enabledPaymentMethods(payments).includes(payment)){setSubmitError('Pilih metode pembayaran aktif atau nonaktifkan pencatatan DP.');return}if(!request.locked&&!initial&&withMeal&&withDeposit&&Number(amount)>mealSubtotal){setSubmitError('DP tidak boleh melebihi subtotal pesanan. Kurangi nominal DP atau periksa menu.');return}void request.run(()=>initial?saveReservation(input,details):createReservationBooking(input,details,extras),saved)}
  return <RestaurantDialog title={initial?'Ubah reservasi':'Buat reservasi'} busy={request.pending} close={close}><form onSubmit={submit}><fieldset disabled={request.pending||request.locked} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><RestaurantField label="Kedatangan (WIB)"><DatePicker label="Kedatangan (WIB)" withTime value={start} onChange={value=>{setStart(value);invalidate()}} className="mt-1"/></RestaurantField><RestaurantField label="Durasi (menit)"><NumericInput required inputMode="numeric" type="number" min={1} max={720} value={duration} onChange={e=>{setDuration(e.target.value);invalidate()}} className={restaurantInput}/></RestaurantField></div>
    <RestaurantField label="Jumlah tamu"><NumericInput required type="number" min={1} max={1000} value={guests} onChange={e=>{setGuests(e.target.value);invalidate()}} className={restaurantInput}/></RestaurantField>
    <button type="button" disabled={checking} onClick={check} className={restaurantButton}>{checking?'Memeriksa...':'Periksa meja tersedia'}</button>
    {lookupError&&<p role="alert" className="text-sm text-[#ffb4ae]">{lookupError}</p>}
    {tables&&<><div role="group" aria-label="Pilih meja reservasi" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{tables.map(t=><button key={t.id} type="button" disabled={!t.available} aria-pressed={t.id===table} aria-label={t.name} onClick={()=>setTable(t.id)} className={restaurantButton+' relative aspect-square break-words '+(t.id===table?'bg-[#24cbc5]/15 ring-2 ring-[#24cbc5] text-white':'bg-[#1c222e]')}>{t.name}{t.id===table&&<Check aria-hidden="true" className="absolute right-2 top-2 size-4 text-[#24cbc5]"/>}</button>)}</div><p className="text-xs leading-5 text-[#c5cbd5]">{!tables.length?'Tidak ada meja aktif dengan kapasitas yang cukup.':table?`${tables.find(t=>t.id===table)?.name}: kapasitas ${tables.find(t=>t.id===table)?.capacity} orang.`:'Pilih meja. Meja pudar tidak tersedia pada jadwal ini.'} Ketersediaan diperiksa kembali saat menyimpan.</p></>}
    <RestaurantField label="Nama pelanggan"><input required maxLength={100} value={customer} onChange={e=>setCustomer(e.target.value)} className={restaurantInput}/></RestaurantField>
    <RestaurantField label="Nomor kontak"><input required type="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Contoh: 081234567890" className={restaurantInput}/></RestaurantField>
    <RestaurantField label="Catatan reservasi"><textarea maxLength={300} value={notes} onChange={e=>setNotes(e.target.value)} className={restaurantInput}/></RestaurantField>
    {!initial&&<div className="space-y-4 border-t border-[#454d5b] pt-4">
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={withMeal} onChange={e=>setWithMeal(e.target.checked)}/>Pesan makanan sekalian (opsional)</label>
      {withMeal&&<ReservationMealFields menu={menu} lines={mealLines} onChange={setMealLines} notes={mealNotes} onNotes={setMealNotes}/>}
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={withDeposit} onChange={e=>setWithDeposit(e.target.checked)}/>Catat DP sekarang (opsional)</label>
      {withDeposit&&<div className="space-y-4">
        <RestaurantField label="Nominal DP reservasi (Rp)"><input required inputMode="numeric" pattern="[1-9][0-9]{0,11}" maxLength={12} placeholder="Contoh: 50000" value={amount} onChange={e=>{setAmount(e.target.value);setSubmitError('')}} className={restaurantInput}/></RestaurantField>
        <RestaurantPaymentFields settings={payments} method={payment} onChange={setPayment} label="Metode DP reservasi"/>
        <p className="text-xs leading-5 text-[#c5cbd5]">DP mengurangi tagihan saat pelunasan. Catat hanya uang yang sudah diterima dan diperiksa; tidak ada penagihan otomatis.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>DP reservasi sudah diterima dan diperiksa.</label>
      </div>}
      <p className="text-xs leading-5 text-[#c5cbd5]">Tanpa makanan atau DP, formulir ini menyimpan reservasi meja saja. Anda bisa menambahkan makanan dan mencatat DP nanti.</p>
    </div>}
    {initial&&Number(initial.deposit_amount)>0&&<p className="text-sm text-[#c5cbd5]">DP {rupiah(Number(initial.deposit_amount))} tetap tercatat. Mengubah jadwal tidak mencatat pembayaran baru.</p>}
  </fieldset>{(submitError||request.error)&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{submitError||request.error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Batal</button><button disabled={request.pending||(!request.locked&&!tables?.some(t=>t.id===table&&t.available))} className={restaurantPrimary}>{request.pending?'Menyimpan...':request.locked?'Ulangi permintaan yang sama':'Simpan reservasi'}</button></div></form></RestaurantDialog>
}

function DepositForm({reservation:r,close,saved,payments}:{reservation:Reservation;close:()=>void;saved:()=>void;payments:PaymentSettings}) {
  const request=useReservationRequest(),[amount,setAmount]=useState(''),[payment,setPayment]=useState<import('@/lib/pos').Sale['payment']>(enabledPaymentMethods(payments)[0]||'cash'),[confirmed,setConfirmed]=useState(false)
  useEffect(()=>{if(!request.locked&&!enabledPaymentMethods(payments).includes(payment))setPayment(enabledPaymentMethods(payments)[0]||'cash')},[payments,payment,request.locked])
  return <RestaurantDialog title="Catat DP reservasi" busy={request.pending} close={close}><form onSubmit={e=>{e.preventDefault();const input={id:r.id,revision:r.revision,request:crypto.randomUUID()},details={amount,payment,confirmed,paymentRevision:payments.revision};void request.run(()=>recordReservationDeposit(input,details),saved)}}><fieldset disabled={request.pending||request.locked} className="space-y-4"><p className="text-sm">{r.customer} / {r.table_name}</p><RestaurantField label="Nominal DP (Rp)"><input required inputMode="numeric" pattern="[1-9][0-9]{0,11}" maxLength={12} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Contoh: 50000" className={restaurantInput}/></RestaurantField><RestaurantPaymentFields settings={payments} method={payment} onChange={setPayment} label="Metode DP"/><p className="text-sm leading-6 text-[#c5cbd5]">Periksa uang/rekening usaha terlebih dahulu. Satu DP dicatat per reservasi; tidak ada penagihan atau verifikasi bank otomatis.</p><label className="flex min-h-11 items-center gap-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>DP sudah diterima dan diperiksa.</label></fieldset>{request.error&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Batal</button><button disabled={request.pending||(!request.locked&&(!enabledPaymentMethods(payments).includes(payment)||!confirmed))} className={restaurantPrimary}>{request.pending?'Mencatat...':request.locked?'Ulangi permintaan yang sama':'Simpan DP'}</button></div></form></RestaurantDialog>
}

function CloseForm({reservation:r,member,close,saved}:{reservation:Reservation;member:Member;close:()=>void;saved:()=>void}) {
  const request=useReservationRequest(),[reason,setReason]=useState(''),[noShow,setNoShow]=useState(false),[refund,setRefund]=useState(false),needsRefund=Number(r.deposit_amount)>0,allowed=!needsRefund||member.role!=='cashier'
  return <RestaurantDialog title="Batalkan reservasi / tidak hadir" busy={request.pending} close={close}><form onSubmit={e=>{e.preventDefault();const input={id:r.id,revision:r.revision,request:crypto.randomUUID()},details={reason,noShow,refund};void request.run(()=>closeReservation(input,details),saved)}}><fieldset disabled={request.pending||request.locked||!allowed} className="space-y-4"><p className="text-sm leading-6">{r.customer} / {r.table_name}. Pesanan terbuka dari reservasi ini ikut dibatalkan; riwayat tetap tersimpan.</p>{r.status==='reserved'&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={noShow} onChange={e=>setNoShow(e.target.checked)}/>Tandai tidak hadir (setelah terlambat 15 menit).</label>}<RestaurantField label="Alasan pembatalan reservasi"><textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className={restaurantInput}/></RestaurantField>{needsRefund&&<><p className="text-sm text-[#c5cbd5]">Kembalikan DP penuh {rupiah(Number(r.deposit_amount))} di luar aplikasi. Tidak ada potongan atau DP hangus otomatis.</p><label className="flex min-h-11 items-center gap-3 text-sm"><input required type="checkbox" checked={refund} onChange={e=>setRefund(e.target.checked)}/>Refund DP penuh sudah dilakukan dan diperiksa.</label></>}</fieldset>{!allowed&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">Minta owner/admin membatalkan reservasi ini dan mengonfirmasi refund DP.</p>}{request.error&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={restaurantButton}>Kembali</button><button disabled={request.pending||!allowed||(needsRefund&&!refund)} className={restaurantPrimary}>{request.pending?'Menyimpan...':request.locked?'Ulangi permintaan yang sama':'Simpan pembatalan'}</button></div></form></RestaurantDialog>
}
function ArrivalForm({reservation:r,close,saved}:{reservation:Reservation;close:()=>void;saved:()=>void}) {
 const request=useReservationRequest()
 return <RestaurantDialog title="Tandai pelanggan datang" busy={request.pending} close={close}>
  <p className="text-sm leading-6">{r.customer} / {r.table_name}. Pastikan pelanggan sudah datang dan meja sudah kosong. Setelah dicatat, meja menjadi terpakai dan pesanan bisa dilunasi.</p>
  {request.error&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}</p>}
  <div className="mt-5 flex justify-end gap-3"><button disabled={request.pending} onClick={close} className={restaurantButton}>Kembali</button><button disabled={request.pending} className={restaurantPrimary} onClick={()=>{const input={id:r.id,revision:r.revision,request:crypto.randomUUID()};void request.run(()=>arriveReservation(input),saved)}}>{request.pending?'Mencatat...':request.locked?'Ulangi permintaan yang sama':'Konfirmasi kedatangan'}</button></div>
 </RestaurantDialog>
}
