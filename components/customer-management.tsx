'use client'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {X} from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'
import {saveCustomer} from '@/app/customer-actions'
import {customerSchema,normalizeCustomerPhone,matchesCustomer,type Customer} from '@/lib/customers'
import type {Member} from '@/lib/validation'
import DashboardSection from './dashboard-section'

const card='rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm'
const input='mt-1 w-full rounded-lg border border-[#454d5b] bg-[#273242] px-3 py-2.5 text-sm'
const button='rounded-xl border border-[#454d5b] px-4 py-2.5 text-sm font-normal disabled:opacity-40'
export default function CustomerManagement({initialCustomers,member}:{initialCustomers:Customer[];member:Member}){
  const [customers,setCustomers]=useState(initialCustomers),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(0),[editor,setEditor]=useState<Customer|null|undefined>(undefined),[notice,setNotice]=useState('')
  const router=useRouter(),[locked,setLocked]=useState(false)
  useEffect(()=>setCustomers(initialCustomers),[initialCustomers])
  const visible=customers.filter(c=>(status==='all'||c.active===(status==='active'))&&matchesCustomer(c,query))
  return <DashboardSection title="Pelanggan" role={member.role}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#a4a7ac]">Kelola profil dan riwayat belanja pelanggan usaha ini.</p><button disabled={locked} onClick={()=>{setEditor(null);setNotice('')}} className={button+' bg-[#1835d9] text-white hover:bg-[#132c9e]'}>Tambah pelanggan</button></div>{notice&&<p role="status" className="mb-4 rounded-xl bg-[#24cbc5]/10 p-3 text-sm text-[#24cbc5]">{notice}</p>}{editor!==undefined&&<CustomerEditor key={editor?.id||'new'} customer={editor} onLock={setLocked} onClose={()=>{setEditor(undefined);router.refresh()}} onSaved={c=>{setCustomers(rows=>[...rows.filter(v=>v.id!==c.id),c].sort((a,b)=>a.name.localeCompare(b.name,'id')));setEditor(undefined);setNotice('Pelanggan berhasil disimpan.');router.refresh()}}/>}<div className={card+(editor!==undefined?' mt-5':'')}><div className="flex flex-wrap gap-3"><input aria-label="Cari pelanggan" placeholder="Cari nama atau nomor telepon" value={query} maxLength={100} onChange={e=>{setQuery(e.target.value);setPage(0)}} className={input+' min-w-0 flex-1'} /><CustomSelect
  ariaLabel="Filter status pelanggan"
  value={status}
  onChange={val => { setStatus(val); setPage(0) }}
  options={[
    { value: 'all', label: 'Semua status' },
    { value: 'active', label: 'Aktif' },
    { value: 'inactive', label: 'Nonaktif' },
  ]}
  align="right"
  className="min-w-[140px]"
/></div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-xs text-[#a4a7ac]"><tr>{['Nama','Telepon','Status','Tindakan'].map(v=><th key={v} className="p-3 font-medium">{v}</th>)}</tr></thead><tbody>{visible.slice(page*25,page*25+25).map(c=><tr key={c.id} className="border-b border-[#454d5b]"><td className="max-w-64 break-words p-3 font-medium">{c.name}</td><td className="p-3">{c.phone||'—'}</td><td className="p-3"><span className="rounded-lg bg-[#1c222e] px-2 py-1 text-xs text-[#c5cbd5]">{c.active?'Aktif':'Nonaktif'}</span></td><td className="p-3"><div className="flex gap-3"><button disabled={locked} onClick={()=>{setEditor(c);setNotice('');window.scrollTo({top:0,behavior:'smooth'})}} className="font-normal text-[#24cbc5]">Ubah</button><Link href={'/dashboard/customers/'+c.id} className="whitespace-nowrap font-normal text-[#24cbc5]">Riwayat belanja</Link></div></td></tr>)}</tbody></table>{!visible.length&&<p className="p-8 text-center text-sm text-[#a4a7ac]">Belum ada pelanggan yang sesuai.</p>}</div><div className="mt-4 flex items-center justify-between gap-2 text-xs text-[#a4a7ac]"><span>{visible.length} pelanggan</span><div className="flex gap-2"><button disabled={!page} onClick={()=>setPage(p=>p-1)} className={button}>Sebelumnya</button><button disabled={(page+1)*25>=visible.length} onClick={()=>setPage(p=>p+1)} className={button}>Berikutnya</button></div></div></div></DashboardSection>
}
function CustomerEditor({customer,onClose,onSaved,onLock}:{customer:Customer|null;onClose:()=>void;onSaved:(c:Customer)=>void;onLock:(v:boolean)=>void}){
  const [draft,setDraft]=useState({name:customer?.name||'',phone:customer?.phone||'',notes:customer?.notes||'',active:customer?.active??true}),[error,setError]=useState(''),[pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false)
  const busy=useRef(false),request=useRef<FormData|null>(null)
  const [id]=useState(()=>customer?.id||crypto.randomUUID())
  useEffect(()=>{onLock(pending||uncertain);return()=>onLock(false)},[pending,uncertain,onLock])
  const submit=async(e?:FormEvent)=>{
    e?.preventDefault();if(busy.current)return
    if(!request.current){const parsed=customerSchema.safeParse(draft);if(!parsed.success)return setError(parsed.error.issues[0].message);try{normalizeCustomerPhone(parsed.data.phone)}catch(e){return setError((e as Error).message)}const f=new FormData();f.set('id',id);f.set('revision',customer?String(customer.revision):'');f.set('request',crypto.randomUUID());f.set('details',JSON.stringify(parsed.data));request.current=f}
    busy.current=true;setPending(true);setError('')
    try{const result=await saveCustomer(request.current);if(result.customer)onSaved(result.customer);else{setError(result.error||'Pelanggan belum dapat disimpan.');setUncertain(!!result.uncertain);if(!result.uncertain)request.current=null}}
    catch{setUncertain(true);setError('Hasil penyimpanan belum pasti. Coba ulang permintaan yang sama atau muat ulang untuk memeriksa.')}
    finally{busy.current=false;setPending(false)}
  }
  return <section className={card}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-normal">{customer?'Ubah pelanggan':'Tambah pelanggan'}</h2><p className="mt-1 text-sm text-[#a4a7ac]">Nama wajib diisi. Telepon dan catatan bersifat opsional.</p></div><button disabled={pending} onClick={onClose} aria-label="Tutup editor pelanggan"><X/></button></div><form onSubmit={submit}><fieldset disabled={pending||uncertain} className="mt-5 grid gap-4"><label className="text-sm font-medium">Nama pelanggan *<input required maxLength={100} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} className={input}/></label><label className="text-sm font-medium">Nomor telepon<input type="tel" maxLength={40} placeholder="08… atau +62…" value={draft.phone} onChange={e=>setDraft({...draft,phone:e.target.value})} className={input}/></label><label className="text-sm font-medium">Catatan<textarea maxLength={1000} rows={3} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} className={input}/></label><label className="text-sm font-medium">Status pelanggan
  <CustomSelect
    ariaLabel="Status pelanggan"
    value={draft.active ? 'active' : 'inactive'}
    onChange={val => setDraft({ ...draft, active: val === 'active' })}
    options={[
      { value: 'active', label: 'Aktif' },
      { value: 'inactive', label: 'Nonaktif' },
    ]}
    className="mt-1 w-full"
  />
</label><p className="rounded-xl bg-[#24cbc5]/10 p-3 text-xs text-[#24cbc5]">Pelanggan nonaktif tidak dapat dipilih untuk transaksi baru. Riwayat belanja dan struk sebelumnya tetap tersimpan.</p></fieldset>{error&&<p role="alert" className="mt-4 rounded-lg bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={pending} onClick={onClose} className={button}>Batal</button><button type={uncertain?'button':'submit'} onClick={uncertain?()=>submit():undefined} disabled={pending} className={button+' bg-[#1835d9] text-white hover:bg-[#132c9e]'}>{uncertain?'Coba ulang permintaan yang sama':customer?'Simpan perubahan':'Simpan pelanggan'}</button></div></form></section>
}
