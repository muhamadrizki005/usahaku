'use client'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import Link from 'next/link'
import { CustomSelect } from '@/components/ui/custom-select'
import {useRouter} from 'next/navigation'
import {cancelPos} from '@/app/pos-actions'
import {paymentLabel,rupiah,saleCode,saleDate,type Sale} from '@/lib/pos'
import type {Customer} from '@/lib/customers'
import type {Business,Member} from '@/lib/validation'
import DashboardSection from './dashboard-section'
import { RestaurantDialog, RestaurantField, restaurantInput, restaurantButton, restaurantPrimary } from './restaurant-forms'

const card='rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm'
const input='mt-1 h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm'
const button='rounded-lg border border-[#454d5b] px-3 py-2 text-sm font-normal disabled:opacity-40'
export function TransactionHistory({sales,member,customer,business}:{sales:Sale[];member:Member;customer?:Customer;business?:Business}){
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(0)
  const visible=sales.filter(s=>(status==='all'||s.status===status)&&[saleCode(s),s.actor_name,s.customer,paymentLabel[s.payment]].some(v=>v.toLowerCase().includes(query.toLowerCase())))
  const todayWib = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  return <DashboardSection
    title={customer ? 'Riwayat pelanggan' : 'Transaksi'}
    breadcrumbTitle="Transaksi"
    businessName={business?.name}
    description={customer ? 'Riwayat belanja pelanggan ini.' : member.role === 'cashier' ? 'Riwayat transaksi yang Anda catat.' : 'Pantau dan telusuri seluruh riwayat transaksi usaha.'}
    meta={`${sales.length} transaksi tercatat • ${todayWib} • WIB`}
    action={<div className="flex items-center gap-3"><p className="text-xs text-[#a4a7ac]">Transaksi dan cetak struk</p><Link href="/dashboard/pos" className="rounded-xl bg-[#1835d9] px-3.5 py-2 text-xs font-normal text-white hover:bg-[#132c9e]">Ke kasir</Link></div>}
    role={member.role}
  >{customer&&<section className={card+' mb-5'}><Link href="/dashboard/customers" className="text-sm font-normal text-[#24cbc5]">Kembali ke pelanggan</Link><h2 className="mt-4 break-words text-lg font-normal">{customer.name}</h2><p className="mt-1 text-sm text-[#a4a7ac]">{customer.phone||'Tanpa nomor telepon'} / {customer.active?'Aktif':'Nonaktif'}</p>{customer.notes&&<p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#c5cbd5]">{customer.notes}</p>}<p className="mt-4 text-sm">{sales.filter(s=>s.status==='completed').length} transaksi selesai / Total belanja {rupiah(sales.filter(s=>s.status==='completed').reduce((n,s)=>n+Number(s.total),0))}</p><p className="mt-2 text-xs text-[#a4a7ac]">Transaksi ditautkan saat pelanggan dipilih di POS. Transaksi lama tidak dipasangkan otomatis.</p></section>}<div className={card}><div className="flex flex-wrap gap-3"><input aria-label="Cari transaksi" placeholder="Nomor transaksi, kasir, atau pembayaran" value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}} className={input+' flex-1'} /><CustomSelect
  ariaLabel="Status transaksi"
  value={status}
  onChange={val => { setStatus(val); setPage(0) }}
  options={[
    { value: 'all', label: 'Semua status' },
    { value: 'completed', label: 'Selesai' },
    { value: 'cancelled', label: 'Dibatalkan' },
  ]}
  align="right"
  className="min-w-[140px]"
/></div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-xs text-[#a4a7ac]"><tr>{['Transaksi','Kasir','Pembayaran','Total','Status',''].map((v,i)=><th key={i} className="p-3 font-medium">{v}</th>)}</tr></thead><tbody>{visible.slice(page*25,page*25+25).map(s=><tr key={s.id} className="border-b border-[#454d5b]"><td className="max-w-64 break-all p-3"><p className="font-medium">{saleCode(s)}</p><p className="mt-1 text-xs text-[#a4a7ac]">{saleDate(s.created_at)}</p></td><td className="p-3">{s.actor_name}</td><td className="p-3">{paymentLabel[s.payment]}</td><td className="p-3">{rupiah(Number(s.total))}</td><td className="p-3">{s.status==='completed'?'Selesai':'Dibatalkan'}</td><td className="p-3"><Link href={'/dashboard/transactions/'+s.id} className="font-normal text-[#24cbc5]">Detail & struk</Link></td></tr>)}</tbody></table>{!visible.length&&<p className="p-8 text-center text-sm text-[#a4a7ac]">Belum ada transaksi yang sesuai.</p>}</div><div className="mt-4 flex items-center justify-between gap-2 text-xs text-[#a4a7ac]"><span>{visible.length} transaksi</span><div className="flex gap-2"><button disabled={!page} onClick={()=>setPage(p=>p-1)} className={button}>Sebelumnya</button><button disabled={(page+1)*25>=visible.length} onClick={()=>setPage(p=>p+1)} className={button}>Berikutnya</button></div></div></div></DashboardSection>
}
export function TransactionDetail(props:{initialSale:Sale;business:Business;member:Member}){
  return props.business.category==='restaurant'?<RestaurantSaleDetail {...props}/>:<StoreTransactionDetail {...props}/>
}
function StoreTransactionDetail({initialSale,business,member}:{initialSale:Sale;business:Business;member:Member}){
  const [mounted,setMounted]=useState(false)
  useEffect(()=>setMounted(true),[])
  const router=useRouter(),busy=useRef(false)
  const [sale,setSale]=useState(initialSale),[reason,setReason]=useState(''),[goods,setGoods]=useState(false),[refund,setRefund]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState(''),[show,setShow]=useState(false)
  useEffect(()=>setSale(initialSale),[initialSale])
  const cancel=async()=>{if(busy.current)return;busy.current=true;setPending(true);try{const result=await cancelPos(sale.id,reason,goods,refund);if(result.sale){setSale(result.sale);setShow(false);setNotice('Pembatalan dicatat dan stok dikembalikan.');router.refresh()}else setNotice(result.error||'Pembatalan belum pasti; periksa ulang transaksi.')}catch{setNotice('Pembatalan belum pasti. Muat ulang untuk memeriksa sebelum mencoba kembali.')}finally{busy.current=false;setPending(false)}}
  return <DashboardSection
    title="Detail transaksi"
    breadcrumbTitle="Detail transaksi"
    businessName={business.name}
    description="Rincian informasi transaksi dan cetak struk."
    meta={`${saleCode(sale)} • ${saleDate(sale.created_at)} • ${sale.actor_name}`}
    role={member.role}
  ><style>{`@media print { body { background:white !important } body > :not(#pos-print-root) { display:none !important } #pos-print-root { display:block !important } #pos-print-root section { border:0;box-shadow:none } }`}</style><div className="mb-4 flex flex-wrap gap-3"><Link href="/dashboard/transactions" className={button}>Kembali</Link><button onClick={()=>window.print()} className={button}>Cetak struk</button>{sale.status==='completed'&&member.role!=='cashier'&&<button onClick={()=>setShow(v=>!v)} className={button}>Batalkan transaksi</button>}</div>{notice&&<p role="status" className="mb-4 rounded-xl bg-[#24cbc5]/10 p-3 text-sm text-[#24cbc5]">{notice}</p>}<Receipt sale={sale} business={business} id="pos-receipt" />{mounted&&createPortal(<div id="pos-print-root" className="hidden" aria-hidden="true"><Receipt sale={sale} business={business}/></div>,document.body)}{show&&<section className={card+' mt-5'}><h2 className="font-normal">Pembatalan penuh</h2><p className="mt-2 text-sm text-[#a4a7ac]">Seluruh stok akan dikembalikan. Pastikan barang sudah kembali atau belum keluar dari toko, dan uang pembayaran sudah dikembalikan secara manual. Aplikasi tidak mengirim refund ke bank/QRIS.</p><fieldset disabled={pending} className="mt-4 space-y-3"><label className="block text-sm">Alasan pembatalan<input aria-label="Alasan pembatalan" minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className={input+' w-full'} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={goods} onChange={e=>setGoods(e.target.checked)} />Semua barang sudah kembali atau belum keluar dari toko.</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={refund} onChange={e=>setRefund(e.target.checked)} />Dana {rupiah(Number(sale.total))} sudah dikembalikan manual, atau total pembayaran nol.</label><button disabled={!goods||!refund||reason.trim().length<3||pending} onClick={cancel} className={button+' bg-[#1835d9] text-white'}>Konfirmasi pembatalan penuh</button></fieldset></section>}</DashboardSection>
}

function Receipt({sale,business,id}:{sale:Sale;business:Business;id?:string}){return <section id={id} className={card}><h2 className="text-lg font-normal">{business.name}</h2><p className="mt-1 text-xs text-[#a4a7ac]">{business.street_address||business.address} {business.phone}</p><p className="mt-4 break-all text-sm font-normal">{saleCode(sale)}</p><p className="mt-1 text-xs text-[#a4a7ac]">{saleDate(sale.created_at)} · {sale.actor_name}</p><p className="mt-2 text-sm">{sale.customer} · {sale.status==='completed'?'Selesai':'Dibatalkan'}</p><div className="mt-5 divide-y divide-[#e2e8f0]">{sale.lines.map(l=><div key={l.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{l.name}</p><p className="mt-1 text-xs text-[#a4a7ac]">{l.sku} · {Number(l.quantity).toLocaleString('id-ID')} {l.unit} × {rupiah(Number(l.price))}</p></div><strong>{rupiah(Number(l.total))}</strong></div>)}</div><dl className="mt-4 space-y-2 border-t border-[#454d5b] pt-4 text-sm">{[['Subtotal',sale.subtotal],['Diskon',sale.discount],['Total',sale.total],[paymentLabel[sale.payment]+' diterima',sale.received],['Kembalian',sale.change]].map(([label,value])=><div key={String(label)} className="flex justify-between"><dt>{label}</dt><dd className="font-normal">{rupiah(Number(value))}</dd></div>)}</dl>{sale.status==='cancelled'&&<div className="mt-5 rounded-xl bg-[#1c222e] p-3 text-sm"><p>Dibatalkan oleh {sale.cancelled_by_name} · {saleDate(sale.cancelled_at!)}</p><p className="mt-2">Alasan: {sale.cancellation_reason}</p><p className="mt-2">{business.category==='restaurant'?'Pembatalan pesanan dicatat.':'Stok dikembalikan.'} Pengembalian dana manual dikonfirmasi: {rupiah(Number(sale.refund_amount))}.</p></div>}<p className="mt-5 text-xs text-[#a4a7ac]">Pembayaran non-tunai dan pengembalian dana dikonfirmasi petugas secara manual.</p></section>}

function RestaurantSaleDetail({initialSale,business,member}:{initialSale:Sale;business:Business;member:Member}){
  const router=useRouter(), busy=useRef(false)
  const [mounted,setMounted]=useState(false),[sale,setSale]=useState(initialSale),[show,setShow]=useState(false),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[refund,setRefund]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('')
  useEffect(()=>setMounted(true),[])
  useEffect(()=>setSale(initialSale),[initialSale])
  async function cancel(){if(busy.current)return;busy.current=true;setPending(true);setError('');try{const result=await cancelPos(sale.id,reason,confirmed,refund);if(result.sale){setSale(result.sale);setShow(false);router.refresh()}else setError(result.error||'Pembatalan belum dapat dipastikan.')}catch{setError('Hasil pembatalan belum pasti. Muat ulang transaksi sebelum mencoba kembali.')}finally{busy.current=false;setPending(false)}}
  return <DashboardSection
    title="Detail transaksi"
    breadcrumbTitle="Detail transaksi"
    businessName={business.name}
    description="Rincian informasi transaksi dan cetak struk."
    meta={`${saleCode(sale)} • ${saleDate(sale.created_at)} • ${sale.actor_name}`}
    role={member.role}
  ><style>{`@media print { body { background:white !important } body > :not(#pos-print-root) { display:none !important } #pos-print-root { display:block !important } #pos-print-root section { border:0;box-shadow:none } }`}</style>
    <div className="mb-4 flex flex-wrap gap-3"><Link href="/dashboard/transactions" className={restaurantButton}>Kembali</Link><button onClick={()=>window.print()} className={restaurantButton}>Cetak struk</button>{sale.status==='completed'&&member.role!=='cashier'&&<button onClick={()=>setShow(true)} className={restaurantButton}>Batalkan transaksi</button>}</div>
    <Receipt sale={sale} business={business} id="pos-receipt"/>{mounted&&createPortal(<div id="pos-print-root" className="hidden" aria-hidden="true"><Receipt sale={sale} business={business}/></div>,document.body)}
    {show&&<RestaurantDialog title="Pembatalan penuh restoran" busy={pending} close={()=>setShow(false)}><p className="mb-4 text-sm leading-6 text-[#c5cbd5]">Pembatalan dicatat tanpa mengembalikan stok bahan baku. Dana dikembalikan manual di luar aplikasi; tidak ada refund bank/QRIS otomatis.</p><fieldset disabled={pending} className="space-y-4"><RestaurantField label="Alasan pembatalan"><textarea minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className={restaurantInput}/></RestaurantField><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Pembatalan seluruh pesanan telah dikonfirmasi.</label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={refund} onChange={e=>setRefund(e.target.checked)}/>Dana {rupiah(Number(sale.total))} sudah dikembalikan manual, atau total pembayaran nol.</label><button disabled={!confirmed||!refund||reason.trim().length<3||pending} onClick={cancel} className={restaurantPrimary}>{pending?'Mencatat...':'Konfirmasi pembatalan penuh'}</button></fieldset>{error&&<p role="alert" className="mt-4 text-sm text-[#ffb4ae]">{error}</p>}</RestaurantDialog>}
  </DashboardSection>
}
