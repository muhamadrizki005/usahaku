'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { salonVisitOperation } from '@/app/salon-operation-actions'
import { CustomerSearch } from './customer-search'
import type { Business, Member } from '@/lib/validation'
import type { SalonFoundation } from '@/lib/salon'
import { salonStatuses, salonQuote, type SalonVisit, type SalonVisitPage, type SalonBusySlot, type SalonSettings } from '@/lib/salon-operations'
import { enabledPaymentMethods, type PaymentSettings } from '@/lib/business-payments'
import { rupiah, saleDate, paymentLabel } from '@/lib/pos'
import { reservationIso, reservationLocalTime } from '@/lib/restaurant-reservations'
import DashboardSection from './dashboard-section'
import { DatePicker } from './ui/date-picker'
import { SelectInput } from './ui/select-input'
import { NumericInput } from './ui/numeric-input'
import { RestaurantDialog, RestaurantField, restaurantPanel as panel, restaurantInput as input, restaurantButton as button, restaurantPrimary as primary } from './restaurant-forms'
import RestaurantPaymentFields from './restaurant-payment-fields'
import { Sparkles } from 'lucide-react'
import { notify } from '@/lib/notifications'

type Props={business:Business;member:Member;foundation:SalonFoundation;visits:SalonVisitPage;busySlots:SalonBusySlot[];settings:SalonSettings;payments:PaymentSettings;day:string}
type Dialog={kind:'edit'|'detail'|'deposit'|'pay'|'cancel';visit:SalonVisit|null;walkIn?:boolean}
type Packet={input:{id:string;revision:number|null;request:string;action:string};details:unknown}
function useVisitRequest(done:(visit:SalonVisit)=>void){
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[locked,setLocked]=useState(false),packet=useRef<Packet|null>(null),busy=useRef(false)
 async function run(next:Packet){if(busy.current)return;const sent=packet.current||next;busy.current=true;setPending(true);setError('');try{const r=await salonVisitOperation(sent.input,sent.details);if(r.value){packet.current=null;done(r.value)}else{setError(r.error||'Belum tersimpan.');packet.current=r.uncertain?sent:null;setLocked(Boolean(r.uncertain))}}catch{packet.current=sent;setLocked(true);setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.')}finally{busy.current=false;setPending(false)}}
 return{pending,error,locked,run}
}
const time=(value:string)=>new Date(value).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})
export default function SalonAppointments({business,member,foundation,visits,busySlots,settings,payments,day}:Props){
 const router=useRouter(),[changing,startTransition]=useTransition(),[dialog,setDialog]=useState<Dialog|null>(null),[notice,setNotice]=useState(''),[operation,setOperation]=useState<{visit:SalonVisit;action:string}|null>(null)

 const [servicePhotos, setServicePhotos] = useState<Record<string, string>>({})
 const servicesKey = foundation.services.map(s => s.id + ':' + s.revision).join(',')

 useEffect(() => {
   if (typeof window === 'undefined') return
   const loadPhotos = () => {
     const photos: Record<string, string> = {}
     foundation.services.forEach(s => {
       try {
         const p = localStorage.getItem('usahaku_service_photo_' + s.id)
         if (p) photos[s.id] = p
       } catch {}
     })
     setServicePhotos(photos)
   }
   loadPhotos()
   window.addEventListener('storage', loadPhotos)
   return () => window.removeEventListener('storage', loadPhotos)
 }, [servicesKey])

 const request=useVisitRequest(()=>{
   if (operation) {
     const actionMessages: Record<string, string> = {
       arrive: `${operation.visit.customer} telah ditandai tiba di salon.`,
       start: `Pelayanan untuk ${operation.visit.customer} bersama ${operation.visit.practitioner_name} telah dimulai.`,
       finish: `Pelayanan untuk ${operation.visit.customer} telah selesai dan siap dibayar.`,
     }
     const actionTitles: Record<string, string> = {
       arrive: 'Pelanggan tiba',
       start: 'Pelayanan dimulai',
       finish: 'Pelayanan selesai',
     }
     if (actionMessages[operation.action]) {
       notify({
         title: actionTitles[operation.action],
         message: actionMessages[operation.action],
         category: 'reservation',
       })
     }
   }
   setOperation(null)
   setNotice('Perubahan kunjungan tersimpan.')
   router.refresh()
 })
 function navigate(nextDay:string,page=0){startTransition(()=>router.replace('/dashboard/salon/appointments?'+new URLSearchParams({day:nextDay,page:String(page)})))}
 useEffect(()=>{if(dialog||operation)return;const refresh=()=>{if(document.visibilityState==='visible')router.refresh()};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[router,dialog,operation])
 function transition(visit:SalonVisit,action:string){setOperation({visit,action});void request.run({input:{id:visit.id,revision:visit.revision,request:crypto.randomUUID(),action},details:{}})}
 const manage=member.role==='owner'||member.role==='admin'
 const practitioners=foundation.practitioners.filter(p=>p.active||visits.items.some(v=>v.practitioner_id===p.id))
 return <DashboardSection title="Janji temu & kasir" businessName={business.name}>
  <section className={panel}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl">Kunjungan salon</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#c5cbd5]">Jadwal memakai WIB. {manage?'Kunjungan seluruh petugas.':'Kunjungan milikmu; slot petugas lain ditampilkan sebagai sibuk.'} Satu penata per kunjungan; durasi mengikuti layanan. Selesaikan pelayanan sebelum pelunasan.</p></div><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setDialog({kind:'edit',visit:null,walkIn:true})}>Catat walk-in</button><button className={primary} onClick={()=>setDialog({kind:'edit',visit:null})}>Buat janji temu</button></div></div>
   <div className="mt-5 max-w-sm"><DatePicker label="Tanggal kunjungan (WIB)" value={day} onChange={d=>navigate(d)} disabled={changing||request.pending}/></div>
   <p className="mt-3 text-xs text-[#c5cbd5]">Jeda persiapan kunjungan baru: {settings.buffer_minutes} menit. Waktu yang terlihat bukan jaminan slot; ketersediaan diperiksa kembali saat disimpan.</p>
  </section>
  {notice&&<p role="status" className="mt-4 text-sm text-[#24cbc5]">{notice}</p>}{request.error&&<div role="alert" className="mt-4 text-sm text-[#ffb4ae]">{request.error}{request.locked&&operation&&<button className={button+' ml-3'} disabled={request.pending} onClick={()=>transition(operation.visit,operation.action)}>Ulangi permintaan yang sama</button>}</div>}
  <section className={panel+' mt-5'} aria-label="Kalender penata"><h2 className="text-lg">Kalender penata</h2><p className="mt-2 text-xs text-[#c5cbd5]">Blok sibuk mencakup layanan dan jeda persiapan. Pelayanan yang masih berjalan tetap perlu diselesaikan petugas.</p><div className="mt-4 overflow-x-auto"><div className="grid min-w-full grid-flow-col auto-cols-[minmax(200px,1fr)] gap-3 pb-2">{practitioners.map(p=><div key={p.id} className="min-w-0 rounded-xl border border-[#454d5b] bg-[#1c222e] p-3"><h3 className="break-words text-sm text-white">{p.name}</h3>{busySlots.filter(b=>b.practitioner_id===p.id).map((slot,i)=>{const own=visits.items.find(v=>v.practitioner_id===p.id&&v.starts_at===slot.starts_at);return <div key={i} className="mt-3 rounded-lg border border-[#24cbc5]/40 bg-[#24cbc5]/10 p-3 text-sm"><p>{time(slot.starts_at)}–{time(slot.ends_at)} WIB</p>{own?<button className="mt-1 break-words text-left text-[#24cbc5] underline" onClick={()=>setDialog({kind:'detail',visit:own})}>{own.customer} · {salonStatuses[own.status]}</button>:<p className="mt-1 text-[#c5cbd5]">Sibuk{slot.in_service?' / sedang dilayani':''}</p>}</div>})}{!busySlots.some(b=>b.practitioner_id===p.id)&&<p className="mt-3 text-xs text-[#c5cbd5]">Belum ada kunjungan aktif pada tanggal ini.</p>}</div>)}</div></div>{!practitioners.length&&<p className="mt-4 text-sm text-[#c5cbd5]">Tambahkan penata dan jadwal kerja terlebih dahulu.</p>}</section>
  <section className={panel+' mt-5'}><h2 className="text-lg">Daftar kunjungan</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b]"><tr>{['Pelanggan & jadwal','Penata & layanan','Status & tagihan','Tindakan'].map(h=><th key={h} className="p-3 font-normal text-[#c5cbd5]">{h}</th>)}</tr></thead><tbody>{visits.items.map(v=><tr key={v.id} data-testid={'salon-visit-'+v.id} className="border-b border-[#454d5b]/60"><td className="min-w-44 max-w-64 break-words p-3"><p>{v.customer}</p><p className="mt-1 text-xs text-[#c5cbd5]">{saleDate(v.starts_at)}<br/>hingga {saleDate(v.ends_at)}<br/>{v.kind==='walk_in'?'Walk-in':'Janji temu'} · {v.actor_name}</p></td>
  <td className="min-w-40 max-w-72 break-words p-3">
    <p className="font-medium text-white">{v.practitioner_name}</p>
    <ul className="mt-2 space-y-1.5 text-xs text-[#c5cbd5]">
      {v.lines.map(l => (
        <li key={l.id} className="flex items-center gap-2">
          {servicePhotos[l.id] ? (
            <img
              src={servicePhotos[l.id]}
              alt={l.name}
              className="size-6 rounded object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
            />
          ) : (
            <div className="size-6 rounded bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
              <Sparkles className="size-3 text-[#24cbc5]/60" />
            </div>
          )}
          <span>{l.name} · {l.duration} menit</span>
        </li>
      ))}
    </ul>
  </td>
  <td className="min-w-40 p-3"><p>{salonStatuses[v.status]}</p><p className="mt-1 text-xs text-[#c5cbd5]">Subtotal: {rupiah(Number(v.subtotal))}<br/>DP: {rupiah(Number(v.deposit_amount))}{v.deposit_payment?' / '+paymentLabel[v.deposit_payment]:''}<br/>{v.sale_id?'Transaksi tercatat':v.status==='finished'?'Belum dibayar':''}{Number(v.deposit_refunded)>0&&<><br/>Refund DP: {rupiah(Number(v.deposit_refunded))}</>}</p></td><td className="min-w-56 p-3"><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setDialog({kind:'detail',visit:v})}>Detail</button>{!v.sale_id&&!['cancelled','no_show'].includes(v.status)&&<>{['scheduled','waiting'].includes(v.status)&&<button className={button} onClick={()=>setDialog({kind:'edit',visit:v})}>Ubah jadwal / layanan</button>}{v.status==='scheduled'&&<button disabled={request.pending||request.locked} className={button} onClick={()=>transition(v,'arrive')}>Tandai datang</button>}{v.status==='waiting'&&<button disabled={request.pending||request.locked} className={primary} onClick={()=>transition(v,'start')}>Mulai pelayanan</button>}{v.status==='in_service'&&<button disabled={request.pending||request.locked} className={primary} onClick={()=>transition(v,'finish')}>Selesaikan pelayanan</button>}{v.status==='finished'?<button className={primary} onClick={()=>setDialog({kind:'pay',visit:v})}>Bayar</button>:Number(v.deposit_amount)===0&&<button className={button} onClick={()=>setDialog({kind:'deposit',visit:v})}>Catat DP</button>}<button className={button} onClick={()=>setDialog({kind:'cancel',visit:v})}>Batalkan / tidak hadir</button></>}{v.sale_id&&<Link className={button} href={'/dashboard/transactions/'+v.sale_id}>Detail & struk</Link>}</div></td></tr>)}</tbody></table></div>{!visits.items.length&&<p className="py-6 text-sm text-[#c5cbd5]">Belum ada kunjungan yang dapat kamu lihat pada tanggal ini.</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{visits.total} kunjungan</span><div className="flex gap-2"><button disabled={visits.page===0||changing} className={button} onClick={()=>navigate(day,visits.page-1)}>Sebelumnya</button><button disabled={(visits.page+1)*visits.pageSize>=visits.total||changing} className={button} onClick={()=>navigate(day,visits.page+1)}>Berikutnya</button></div></div></section>
  {dialog?.kind==='edit'&&<Booking key={dialog.visit?.id||'new'} initial={dialog.visit} walkIn={dialog.walkIn} foundation={foundation} servicePhotos={servicePhotos} settings={settings} payments={payments} close={()=>setDialog(null)} done={v=>{setDialog(null);setNotice('Kunjungan tersimpan.');navigate(v.starts_at?reservationLocalTime(v.starts_at).slice(0,10):day)}}/>}
  {dialog?.visit&&dialog.kind==='detail'&&<RestaurantDialog title="Detail kunjungan salon" busy={false} close={()=>setDialog(null)}><div className="space-y-3 break-words text-sm"><p>{dialog.visit.customer} · {dialog.visit.phone||'Tanpa nomor kontak'}</p><p>{saleDate(dialog.visit.starts_at)}–{saleDate(dialog.visit.ends_at)}</p><p>Penata: {dialog.visit.practitioner_name} · {salonStatuses[dialog.visit.status]}</p><p>Catatan: {dialog.visit.notes||'Tidak ada'}</p>{dialog.visit.cancellation_reason&&<p>Alasan: {dialog.visit.cancellation_reason}</p>}<p>Subtotal: {rupiah(Number(dialog.visit.subtotal))} · DP: {rupiah(Number(dialog.visit.deposit_amount))}</p></div></RestaurantDialog>}
  {dialog?.visit&&['deposit','pay','cancel'].includes(dialog.kind)&&<VisitAction key={dialog.kind+dialog.visit.id} kind={dialog.kind as 'deposit'|'pay'|'cancel'} visit={dialog.visit} manage={manage} settings={settings} payments={payments} close={()=>setDialog(null)} done={v=>{setDialog(null);if(v.sale_id)router.push('/dashboard/transactions/'+v.sale_id);else{setNotice('Perubahan kunjungan tersimpan.');router.refresh()}}}/>}
 </DashboardSection>
}

function Booking({initial,walkIn,foundation,servicePhotos,settings,payments,close,done}:{initial:SalonVisit|null;walkIn?:boolean;foundation:SalonFoundation;servicePhotos:Record<string,string>;settings:SalonSettings;payments:PaymentSettings;close:()=>void;done:(v:SalonVisit)=>void}){
 const [id]=useState(initial?.id||crypto.randomUUID()),[customer,setCustomer]=useState(initial?.customer||''),[phone,setPhone]=useState(initial?.phone||''),[notes,setNotes]=useState(initial?.notes||''),[kind,setKind]=useState(initial?.kind||(walkIn?'walk_in':'appointment')),[start,setStart]=useState(initial?reservationLocalTime(initial.starts_at):reservationLocalTime(new Date().toISOString())),[selected,setSelected]=useState<string[]>(initial?.lines.map(l=>l.id)||[]),[practitioner,setPractitioner]=useState(initial?.practitioner_id||''),[customerId,setCustomerId]=useState<string|null>(initial?.customer_id||null),[serviceQuery,setServiceQuery]=useState(''),[deposit,setDeposit]=useState(''),[method,setMethod]=useState(enabledPaymentMethods(payments)[0]||'cash'),[confirmed,setConfirmed]=useState(false),[localError,setLocalError]=useState('')
 const request=useVisitRequest(v => {
   notify({
     title: initial ? 'Kunjungan salon diperbarui' : (walkIn ? 'Walk-in dicatat' : 'Janji temu baru dibuat'),
     message: `Kunjungan untuk "${customer}" berhasil disimpan.`,
     category: 'reservation',
   })
   done(v)
 })
 const services=foundation.services.filter(s=>s.active||Boolean(initial?.lines.some(l=>l.id===s.id))),lines=services.filter(s=>selected.includes(s.id)),duration=lines.reduce((n,s)=>n+s.duration_minutes,0),subtotal=lines.reduce((n,s)=>n+Number(s.price),0)
 const compatible=(p:SalonFoundation['practitioners'][number])=>p.active&&Boolean(p.schedule)&&selected.every(s=>p.service_ids.includes(s))
 return <RestaurantDialog title={initial?'Ubah kunjungan salon':walkIn?'Catat walk-in':'Buat janji temu'} busy={request.pending} close={close} wide><form className="space-y-4" onSubmit={e=>{e.preventDefault();setLocalError('');try{const startsAt=reservationIso(start);void request.run({input:{id,revision:initial?.revision??null,request:crypto.randomUUID(),action:'save'},details:{practitionerId:practitioner,customerId,customer,phone,notes,kind,startsAt,serviceIds:selected,deposit:!initial&&deposit?{amount:deposit,payment:method,confirmed,paymentRevision:payments.revision}:null}})}catch(e){setLocalError((e as Error).message)}}}>
  <fieldset disabled={request.pending||request.locked} className="space-y-4"><p className="text-sm text-[#c5cbd5]">Pilih beberapa layanan untuk satu penata. Slot dan harga diperiksa kembali saat penyimpanan. Pelunasan dilakukan setelah pelayanan selesai.</p><div><p className="mb-2 text-sm text-[#c5cbd5]">Cari pelanggan tersimpan</p><CustomerSearch label="Cari pelanggan tersimpan" showPoints={false} onSelect={c=>{setCustomerId(c.id);setCustomer(c.name);setPhone(c.phone)}}/></div>{customerId&&<p className="text-xs text-[#24cbc5]">Pelanggan tersimpan dipilih. <button type="button" onClick={()=>setCustomerId(null)} className="underline">Lepaskan pilihan</button></p>}<div className="grid gap-4 sm:grid-cols-2"><RestaurantField label="Nama pelanggan"><input required maxLength={100} readOnly={Boolean(customerId)} value={customer} onChange={e=>setCustomer(e.target.value)} className={input}/></RestaurantField><RestaurantField label="Nomor kontak (opsional)"><input maxLength={40} readOnly={Boolean(customerId)} value={phone} onChange={e=>setPhone(e.target.value)} className={input}/></RestaurantField></div>
  <RestaurantField label="Cari layanan"><input maxLength={100} value={serviceQuery} onChange={e=>setServiceQuery(e.target.value)} className={input} placeholder="Cari nama layanan"/></RestaurantField><p className="text-xs text-[#c5cbd5]">Daftar menampilkan maksimal 100 layanan. Gunakan pencarian untuk pilihan lainnya; layanan terpilih tetap ditampilkan.</p>
  <fieldset className="space-y-2">
    <legend className="text-sm text-[#c5cbd5]">Layanan (maksimal 20)</legend>
    {[...services.filter(s=>selected.includes(s.id)),...services.filter(s=>!selected.includes(s.id)&&s.name.toLocaleLowerCase('id-ID').includes(serviceQuery.trim().toLocaleLowerCase('id-ID')))].slice(0,100).map(s=>(
      <label key={s.id} className="flex min-h-11 items-center gap-3 rounded-lg p-1 text-sm transition hover:bg-[#1c222e]">
        <input
          type="checkbox"
          checked={selected.includes(s.id)}
          disabled={!selected.includes(s.id)&&(!s.active||selected.length>=20)}
          onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}
          className="size-4 shrink-0 accent-[#1835d9]"
        />
        {servicePhotos[s.id] ? (
          <img
            src={servicePhotos[s.id]}
            alt={s.name}
            className="size-9 rounded-lg object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
          />
        ) : (
          <div className="size-9 rounded-lg bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
            <Sparkles className="size-4 text-[#24cbc5]/60" />
          </div>
        )}
        <span className="break-words">{s.name}{!s.active?' (nonaktif)':''} · {s.duration_minutes} menit · {rupiah(Number(s.price))}</span>
      </label>
    ))}
    {!services.length&&<p className="text-sm text-[#c5cbd5]">Tambahkan layanan aktif terlebih dahulu.</p>}
  </fieldset>
  <div className="grid gap-4 sm:grid-cols-2"><RestaurantField label="Penata / terapis"><SelectInput required value={practitioner} onChange={e=>setPractitioner(e.target.value)} className={input}><option value="" disabled>Pilih penata</option>{foundation.practitioners.filter(p=>p.active||p.id===initial?.practitioner_id).map(p=><option key={p.id} value={p.id} disabled={!compatible(p)}>{p.name}{!p.active?' / nonaktif':!p.schedule?' / jadwal belum diatur':!compatible(p)?' / tidak menangani pilihan':''}</option>)}</SelectInput></RestaurantField><RestaurantField label="Jenis kunjungan"><SelectInput disabled={Boolean(initial)} value={kind} onChange={e=>{setKind(e.target.value as typeof kind);if(!initial&&e.target.value==='walk_in')setStart(reservationLocalTime(new Date().toISOString()))}} className={input}><option value="appointment">Janji temu</option><option value="walk_in">Walk-in</option></SelectInput></RestaurantField></div>
  {kind==='walk_in'&&<p className="text-xs leading-5 text-[#c5cbd5]">Kedatangan dicatat sekarang. Jika penata masih melayani, pilih estimasi mulai pada slot kosong berikutnya, maksimal 24 jam.</p>}<DatePicker label="Mulai kunjungan (WIB)" withTime value={start} onChange={setStart}/><p className="text-sm text-[#24cbc5]">Durasi: {duration} menit · Subtotal: {rupiah(subtotal)} · Jeda baru: {settings.buffer_minutes} menit</p>{duration>720&&<p role="alert" className="text-sm text-[#ffb4ae]">Total durasi maksimal 720 menit.</p>}<RestaurantField label="Catatan kunjungan (opsional)"><textarea maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} className={input}/></RestaurantField>
  {!initial&&<details className="rounded-xl border border-[#454d5b] p-3"><summary className="cursor-pointer text-sm">DP opsional</summary><div className="mt-3 space-y-3"><RestaurantField label="Nominal DP (Rp)"><NumericInput min={1} max={subtotal} value={deposit} onChange={e=>{setDeposit(e.target.value);setConfirmed(false)}} placeholder="Kosongkan jika tanpa DP" className={input}/></RestaurantField>{deposit&&<><RestaurantPaymentFields settings={payments} method={method} onChange={m=>{setMethod(m);setConfirmed(false)}} label="Metode DP"/><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>DP sudah diterima dan diperiksa.</label></>}<p className="text-xs text-[#c5cbd5]">DP mengurangi sisa tagihan dan belum menjadi penjualan. Pembatalan dengan DP memerlukan refund penuh manual oleh owner/admin.</p></div></details>}
  </fieldset>{(localError||request.error)&&<p role="alert" className="text-sm text-[#ffb4ae]">{localError||request.error}</p>}<div className="flex flex-wrap justify-end gap-3"><button type="button" className={button} disabled={request.pending} onClick={close}>Batal</button><button className={primary} disabled={request.pending||(!request.locked&&(!selected.length||selected.some(id=>!services.find(s=>s.id===id)?.active)||duration>720||!foundation.practitioners.some(p=>p.id===practitioner&&compatible(p))||Boolean(deposit&&!confirmed)))}>{request.pending?'Menyimpan...':request.locked?'Ulangi permintaan yang sama':'Simpan kunjungan'}</button></div>
 </form></RestaurantDialog>
}

function VisitAction({kind,visit,manage,settings,payments,close,done}:{kind:'deposit'|'pay'|'cancel';visit:SalonVisit;manage:boolean;settings:SalonSettings;payments:PaymentSettings;close:()=>void;done:(v:SalonVisit)=>void}){
 const [method,setMethod]=useState(enabledPaymentMethods(payments)[0]||'cash'),[amount,setAmount]=useState(''),[confirmed,setConfirmed]=useState(false),[discountKind,setDiscountKind]=useState('none'),[discount,setDiscount]=useState('0'),[reason,setReason]=useState(''),[noShow,setNoShow]=useState(false)
 let pricing:ReturnType<typeof salonQuote>|undefined;let quoteError='';try{pricing=salonQuote(Number(visit.subtotal),discountKind,discount,Number(settings.tax_rate),Number(visit.deposit_amount))}catch(e){quoteError=(e as Error).message}

 const request=useVisitRequest(v => {
   if (kind === 'pay') {
     notify({
       title: 'Pembayaran kunjungan selesai',
       message: `Pembayaran kunjungan ${visit.customer} sebesar ${rupiah(pricing?.balance ?? 0)} berhasil dicatat.`,
       category: 'transaction',
     })
   } else if (kind === 'cancel') {
     notify({
       title: noShow ? 'Pelanggan tidak hadir' : 'Kunjungan dibatalkan',
       message: `Kunjungan ${visit.customer} telah ${noShow ? 'ditandai tidak hadir' : 'dibatalkan'}.`,
       category: 'reservation',
     })
   } else if (kind === 'deposit') {
     notify({
       title: 'DP kunjungan dicatat',
       message: `DP kunjungan ${visit.customer} sebesar ${rupiah(Number(amount))} berhasil dicatat.`,
       category: 'transaction',
     })
   }
   done(v)
 })
 const title=kind==='deposit'?'Catat DP salon':kind==='pay'?'Pembayaran salon':'Batalkan kunjungan / tidak hadir'
 const blockedRefund=kind==='cancel'&&Number(visit.deposit_amount)>0&&!manage
 return <RestaurantDialog title={title} busy={request.pending} close={close}><p className="mb-4 break-words text-sm text-[#c5cbd5]">{visit.customer} · {visit.practitioner_name}</p><form onSubmit={e=>{e.preventDefault();const details=kind==='cancel'?{reason,refundConfirmed:confirmed}:kind==='deposit'?{amount,payment:method,confirmed,paymentRevision:payments.revision}:{payment:method,received:method==='cash'?amount:String(pricing?.balance??0),discountKind,discountValue:discount,confirmed,paymentRevision:payments.revision,settingsRevision:settings.revision};void request.run({input:{id:visit.id,revision:visit.revision,request:crypto.randomUUID(),action:kind==='cancel'?(noShow?'no_show':'cancel'):kind==='deposit'?'deposit':'pay'},details})}} className="space-y-4"><fieldset disabled={request.pending||request.locked||blockedRefund} className="space-y-4">
  {kind==='cancel'?<><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={noShow} onChange={e=>setNoShow(e.target.checked)}/>Tandai tidak hadir (setelah terlambat 15 menit, belum check-in).</label><RestaurantField label="Alasan pembatalan kunjungan"><textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className={input}/></RestaurantField>{Number(visit.deposit_amount)>0&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Refund DP penuh {rupiah(Number(visit.deposit_amount))} sudah dilakukan manual dan diperiksa.</label>}</>:<>
   {kind==='pay'&&<><ul className="space-y-2 text-sm">{visit.lines.map(l=><li key={l.id} className="flex justify-between gap-3"><span>{l.name}</span><span>{rupiah(Number(l.total))}</span></li>)}</ul>{manage&&<div className="grid gap-3 sm:grid-cols-2"><RestaurantField label="Jenis diskon salon"><SelectInput value={discountKind} onChange={e=>{setDiscountKind(e.target.value);setDiscount('0');setConfirmed(false)}} className={input}><option value="none">Tanpa diskon</option><option value="percent">Persen</option><option value="amount">Rupiah</option></SelectInput></RestaurantField>{discountKind!=='none'&&<RestaurantField label="Nilai diskon salon"><NumericInput required min={0} max={discountKind==='percent'?100:Number(visit.subtotal)} step={discountKind==='percent'?'0.01':'1'} value={discount} onChange={e=>{setDiscount(e.target.value);setConfirmed(false)}} className={input}/></RestaurantField>}</div>}{pricing&&<div className="space-y-2 rounded-xl bg-[#1c222e] p-4 text-sm"><p>Subtotal: {rupiah(Number(visit.subtotal))}</p><p>Diskon: {rupiah(pricing.discount)}</p><p>Pajak ({settings.tax_rate}%): {rupiah(pricing.tax)}</p><p>Total: {rupiah(pricing.total)}</p><p>DP terkonfirmasi: {rupiah(Number(visit.deposit_amount))}</p><p className="text-lg text-[#24cbc5]">Sisa tagihan: {rupiah(pricing.balance)}</p></div>}</>}
   {kind==='deposit'&&<RestaurantField label="Nominal DP (Rp)"><NumericInput required min={1} max={Number(visit.subtotal)} value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false)}} className={input}/></RestaurantField>}
   <RestaurantPaymentFields settings={payments} method={method} onChange={m=>{setMethod(m);setConfirmed(false)}}/>{kind==='pay'&&method==='cash'&&<><RestaurantField label="Uang diterima"><NumericInput required min={0} value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false)}} className={input}/></RestaurantField><p className="text-sm">Kembalian pratinjau: {rupiah(Math.max(0,Number(amount)-(pricing?.balance??0)))}</p></>}
   <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{kind==='deposit'?'DP sudah diterima dan diperiksa.':'Sisa pembayaran sudah diterima dan diperiksa.'}</label><p className="text-xs leading-5 text-[#c5cbd5]">Pembayaran diperiksa manual pada kas/rekening/aplikasi usaha. Usahaku tidak menagih atau mengembalikan dana secara otomatis.</p>
  </>}
  </fieldset>{blockedRefund&&<p role="alert" className="text-sm text-[#ffb4ae]">Minta owner/admin melakukan refund DP penuh dan pembatalan.</p>}{(request.error||quoteError)&&<p role="alert" className="text-sm text-[#ffb4ae]">{request.error||quoteError}</p>}<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={request.pending} onClick={close} className={button}>Batal</button><button disabled={request.pending||blockedRefund||(!request.locked&&(Boolean(quoteError)&&kind==='pay'||kind!=='cancel'&&(!confirmed||!enabledPaymentMethods(payments).includes(method))))} className={primary}>{request.pending?'Menyimpan...':request.locked?'Ulangi permintaan yang sama':kind==='cancel'?'Simpan pembatalan':kind==='deposit'?'Simpan DP':'Catat pembayaran'}</button></div>
 </form></RestaurantDialog>
}
