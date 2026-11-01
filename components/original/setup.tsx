'use client'
import { useBusinessPayments, type PaymentDraft } from '@/components/business-payment-state'
import type { PaymentSettings } from '@/lib/business-payments'
import { BusinessHeader } from '@/components/business-header'
import { productSkuPrefix } from '@/lib/product-sku'

import { useEffect, useState, useRef, useActionState, startTransition } from 'react'
import { saveCatalogProduct, bulkCatalogProducts } from '@/app/catalog-actions'
import { productCategories, type CatalogProduct } from '@/lib/catalog'
import { HoursEditor } from '@/components/business-hours'
import { StaffManagement } from '@/components/staff-management'
import { saveBusinessHours } from '@/app/actions'
import { businessHoursSchema, describeHours, type BusinessHours } from '@/lib/business-profile'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, CreditCard, ImagePlus, Package, Plus, Trash2, Users, X } from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'
import type { Business, Member } from '@/lib/validation'

type Category = 'toko' | 'restoran' | 'barbershop'
type ModalType = 'products' | 'hours' | 'payments' | 'staff' | null
type Staff = { id: string; name: string; email: string; role: 'Admin' | 'Kasir' }
type Product = { name: string; category: string; price: string; stock: string; minimumStock: string; image?: string; id?: string; unit?: string; sku?: string; barcode?: string; revision?: number; active?: boolean }
type Hours = Record<string, { open: string; close: string; closed: boolean }>
type Payments = PaymentDraft
const days = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']
const defaultHours = (): Hours => Object.fromEntries(days.map((day) => [day, { open: '09:00', close: '21:00', closed: true }]))
const emptyProduct: Product = { name: '', category: '', price: '', stock: '', minimumStock: '' }
const input = 'h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20'

export default function OriginalSetup({ business, ownerName, members, initialProducts, initialPayments }: { initialPayments: PaymentSettings; initialProducts: CatalogProduct[]; business: Business; ownerName: string; members: Member[] }) {
  const paymentState = useBusinessPayments(initialPayments,business.id)
  const {payments,draft:draftPayments,setDraft:setDraftPayments}=paymentState
  const router = useRouter()
  const [category, setCategory] = useState<Category>('toko'), [businessName, setBusinessName] = useState('Usaha Anda'), [products, setProducts] = useState<Product[]>([]), [hours, setHours] = useState<Hours>(defaultHours()), [staff, setStaff] = useState<Staff[]>([])
  const [hoursState, dispatchHours, hoursPending] = useActionState(saveBusinessHours, {})
  const [hoursRevision, setHoursRevision] = useState(business.hours_revision || 0)
  const [notice,setNotice] = useState('')
  const [productPending,setProductPending]=useState(false)
  const productRequest=useRef<{id:string;key:string}|null>(null)
  const [modal, setModal] = useState<ModalType>(null), [draftProduct, setDraftProduct] = useState(emptyProduct), [editing, setEditing] = useState<number | null>(null), [draftHours, setDraftHours] = useState(defaultHours()), [error, setError] = useState('')
  useEffect(() => { setCategory('toko'); setBusinessName(business.name); try { setProducts(initialProducts.map(p=>({...p,price:String(p.price),stock:String(p.stock),minimumStock:String(p.minStock)}))); setHours(business.operating_hours || defaultHours()); setHoursRevision(business.hours_revision || 0); setStaff(members.filter(person => person.role !== 'owner').map(person => ({ id: person.id, name: person.name, email: person.username || '', role: person.role === 'admin' ? 'Admin' : 'Kasir' }))) } catch {} }, [business, members, initialProducts])
  useEffect(() => {
    const backButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Kembali'))
    if (!backButton) return
    const handleBack = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      router.push(`/onboarding/identity?category=${category}`)
    }
    backButton.addEventListener('click', handleBack, true)
    return () => backButton.removeEventListener('click', handleBack, true)
  }, [category, router])
  const completed = { products: initialProducts.length>0, hours: days.some((d) => !hours[d]?.closed), payments: paymentState.settings.configured && (payments.cash||payments.qris||payments.transfer), staff: members.some(person => person.role !== 'owner' && person.active) }
  useEffect(() => { const query=new URLSearchParams(window.location.search); const panel=query.get('panel'); if(panel==='staff')setModal('staff'); if(panel==='hours'){setDraftHours(business.operating_hours||defaultHours());setModal('hours')} if(query.get('notice')==='logo')setNotice('Usaha tersimpan. Periksa logo di identitas usaha; unggah ulang jika belum tampil.') }, [])
  useEffect(()=>{if(hoursState.error)setError(hoursState.error);if(hoursState.business){setHours(hoursState.business.operating_hours||defaultHours());setHoursRevision(hoursState.business.hours_revision||0);setModal(null);setError('')}},[hoursState])
  const count = Object.values(completed).filter(Boolean).length
  const resetModal = () => { setModal(null); setError(''); setEditing(null); setDraftProduct(emptyProduct);productRequest.current=null }
  const close = () => { if(!paymentState.pending&&!productPending&&!hoursPending)resetModal() }
  const open = (type: ModalType) => { setError(''); if (type === 'hours') setDraftHours(JSON.parse(JSON.stringify(hours))); if (type === 'payments') paymentState.open(); setModal(type) }
  const saveProduct = async () => {if(productPending)return;setProductPending(true);setError('');try{productRequest.current ||= {id:draftProduct.id||crypto.randomUUID(),key:crypto.randomUUID()};const f=new FormData();f.set('id',productRequest.current.id);f.set('request',productRequest.current.key);f.set('revision',draftProduct.id?String(draftProduct.revision):'');f.set('details',JSON.stringify({name:draftProduct.name,category:draftProduct.category,unit:draftProduct.unit||'pcs',sku:draftProduct.sku||'',barcode:draftProduct.barcode||'',price:draftProduct.price,minimum:draftProduct.minimumStock||'0',initialStock:draftProduct.id?'0':draftProduct.stock||'0',active:draftProduct.active??true}));let imageAction='keep';if(draftProduct.image?.startsWith('data:')){const blob=await(await fetch(draftProduct.image)).blob();f.set('image',new File([blob],'product',{type:blob.type}));imageAction='replace'}else if(!draftProduct.image&&draftProduct.id&&initialProducts.find(p=>p.id===draftProduct.id)?.image)imageAction='remove';f.set('imageAction',imageAction);const result=await saveCatalogProduct(f);if(result.error)setError(result.error);else{setNotice([result.success,result.warning].filter(Boolean).join(' '));resetModal();router.refresh()}}catch{setError('Status penyimpanan belum pasti. Muat ulang sebelum mencoba lagi.')}finally{setProductPending(false)}}
  const removeProduct = async (i:number) => {const p=products[i];if(!p.id||!confirm('Nonaktifkan produk ini? Stok dan riwayat tetap disimpan.'))return;const f=new FormData();f.set('request',crypto.randomUUID());f.set('items',JSON.stringify([{id:p.id,revision:p.revision}]));f.set('active','false');f.set('category','null');const result=await bulkCatalogProducts(f);if(result.error)setError(result.error);else{close();router.refresh()}}
  const saveHours = () => { if(hoursPending)return;const parsed=businessHoursSchema.safeParse(draftHours);if(!parsed.success)return setError(parsed.error.issues[0].message);setError('');const form=new FormData();form.set('revision',String(hoursRevision));form.set('schedule',JSON.stringify(parsed.data));startTransition(()=>dispatchHours(form)) }

  const savePayments = async () => { if(await paymentState.save()){setModal(null);router.refresh()} }
  const taskData = category === 'toko' ? [['products','Tambahkan produk, stok dan harga','Mulai dengan katalog inti yang dijual setiap hari.',Package] as const,['hours','Tetapkan jam operasional','Beri tahu pelanggan kapan usaha Anda buka.',Clock3] as const,['payments','Siapkan metode pembayaran','Atur metode pembayaran yang tersedia di kasir.',CreditCard] as const,['staff','Atur pengguna & hak akses','Kelola pemilik dan staf yang dapat mengakses operasional usaha.',Users] as const] : [['hours','Tetapkan jam operasional','Atur jam layanan usaha Anda.',Clock3] as const,['payments','Siapkan metode pembayaran','Pilih metode pembayaran untuk transaksi.',CreditCard] as const]
  return <main className="min-h-screen bg-[#1c222e] text-[#ffffff]"><BusinessHeader ownerName={ownerName} /><div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 lg:py-8"><Progress />{notice&&<p role="status" className="mt-4 text-sm text-[#a4a7ac]">{notice}</p>}<p className="mt-10 text-sm font-normal text-[#24cbc5]">PENGATURAN USAHA • LANGKAH 3 DARI 3</p><h1 className="mt-3 text-3xl font-normal sm:text-4xl">Siapkan {businessName}, selangkah demi selangkah</h1><p className="mt-3 text-[#a4a7ac]">Lengkapi pengaturan usaha. Metode pembayaran tersimpan untuk usaha ini; staf opsional.</p><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]"><section className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 sm:p-7"><div className="flex justify-between"><div><b>Checklist utama</b><p className="mt-1 text-sm text-[#a4a7ac]">{count} dari {taskData.length} langkah utama selesai</p></div><b className="text-[#24cbc5]">{Math.round(count / taskData.length * 100)}%</b></div><div className="mt-4 h-2 rounded-full bg-[#1835d9]/15"><div className="h-full rounded-full bg-[#1835d9]" style={{ width: `${count / taskData.length * 100}%` }} /></div><div className="mt-6 flex flex-col gap-3">{taskData.map(([id,title,description,Icon]) => { const done = completed[id as keyof typeof completed]; return <div key={id} className="flex flex-wrap items-start gap-4 rounded-xl border border-[#454d5b] p-4"><div className={`grid size-10 shrink-0 place-items-center rounded-full border ${done ? 'border-[#24cbc5] bg-[#24cbc5]/10 text-[#24cbc5]' : 'border-[#454d5b] bg-[#1c222e] text-[#a4a7ac]'}`}>{done ? <Check className="size-5" /> : <Icon className="size-5" />}</div><div className="min-w-0 flex-1"><p className="font-normal">{title}</p>{id === 'hours' && done ? <div className="mt-3 grid max-w-sm gap-1 rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 text-xs sm:text-sm">{days.map((d) => { const isClosed = !hours[d] || hours[d].closed; return <div key={d} className="grid grid-cols-[85px_1fr] items-center border-b border-[#454d5b]/30 py-1 last:border-b-0"><span className="font-medium text-white">{d}</span><span className={isClosed ? 'text-[#a4a7ac]' : 'font-medium text-[#24cbc5]'}>{isClosed ? 'Tutup' : `${describeHours(hours[d])} WIB`}</span></div> })}</div> : <p className="mt-1 text-sm text-[#a4a7ac]">{done ? 'Sudah tersimpan dan siap digunakan.' : description}</p>}</div><button onClick={() => id === 'products' ? open('products') : id === 'hours' ? open('hours') : id === 'staff' ? open('staff') : open('payments')} className="w-full shrink-0 rounded-lg sm:w-36 border border-[#454d5b] px-3 py-2.5 text-sm font-normal text-[#24cbc5]">{id === 'products' ? 'Kelola produk' : id === 'hours' ? 'Ubah jam' : id === 'payments' ? 'Atur pembayaran' : 'Kelola staf'}</button></div> })}</div></section><aside className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><p className="font-normal">Pengaturan usaha</p><p className="mt-2 text-sm text-[#a4a7ac]">{category === 'toko' ? 'Toko / Minimarket / Kios' : category === 'restoran' ? 'Restoran / Cafe' : 'Barbershop / Salon'}</p></aside></div><div className="mt-8 flex justify-between"><button onClick={() => router.push(`/onboarding/identity?category=${category}`)} className="inline-flex items-center gap-2 rounded-xl border border-[#454d5b] bg-[#273242] px-5 py-3 text-sm font-normal text-[#a4a7ac]"><ArrowLeft className="size-4" />Kembali</button><button onClick={() => router.push(`/onboarding/summary?category=${category}`)} className="inline-flex items-center gap-2 rounded-xl bg-[#1835d9] px-5 py-3 text-sm font-normal text-white">Masuk ke ringkasan <ArrowRight className="size-4" /></button></div></div>{modal === 'products' && <Modal title="Kelola produk" pending={productPending} close={close}><ProductModal product={draftProduct} setProduct={setDraftProduct} products={products} edit={(i) => { setEditing(i); setDraftProduct(products[i]);productRequest.current=null }} remove={removeProduct} save={saveProduct} error={error} cancel={close} /></Modal>}{modal === 'hours' && <Modal title="Ubah jam operasional" pending={hoursPending} close={close}><HoursEditor hours={draftHours} setHours={setDraftHours} save={saveHours} pending={hoursPending} error={error} cancel={close} /></Modal>}{modal === 'payments' && <Modal title="Atur pembayaran" pending={paymentState.pending} close={close}><fieldset disabled={paymentState.pending||paymentState.uncertain}><PaymentsModal payments={draftPayments} setPayments={setDraftPayments} save={savePayments} error={paymentState.error} cancel={close} /></fieldset></Modal>}{modal === 'staff' && <Modal title="Pengguna & hak akses" close={close}><StaffManagement members={members} /></Modal>}</main>
}
function Progress() { return <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><div className="grid gap-4 md:grid-cols-3">{['Kategori usaha','Identitas usaha','Setup usaha'].map((x,i)=><div className="flex items-center gap-3" key={x}><div className="grid size-9 place-items-center rounded-full bg-[#1835d9] text-white">{i<2?<Check className="size-4"/>:'3'}</div><span className="text-sm font-normal">{x}</span></div>)}</div></div> }
export function Modal({ title, close, children, pending=false }: { title:string; close:()=>void; children:React.ReactNode; pending?:boolean }) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const trigger=document.activeElement as HTMLElement|null;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();if(trigger?.isConnected)trigger.focus({preventScroll:true})}},[])
  return <dialog ref={ref} aria-label={title} aria-busy={pending} onCancel={event=>{event.preventDefault();if(!pending)close()}} className="m-auto max-h-[82dvh] w-[calc(100%_-_2rem)] max-w-xl rounded-2xl border-0 bg-[#273242] p-0 text-white shadow-xl backdrop:bg-[#1c222e]/55"><div className="flex max-h-[82dvh] flex-col overflow-hidden"><div className="flex shrink-0 justify-between border-b border-[#454d5b] px-5 py-4"><h2 className="text-lg font-normal">{title}</h2><button disabled={pending} onClick={close} aria-label="Tutup"><X /></button></div><div className="min-h-0 overflow-y-auto p-5"><fieldset disabled={pending} className="contents">{children}</fieldset></div></div></dialog>
}
function ProductModal({product,setProduct,products,edit,remove,save,error,cancel}:{product:Product;setProduct:(p:Product)=>void;products:Product[];edit:(i:number)=>void;remove:(i:number)=>void;save:()=>void;error:string;cancel:()=>void}) { const [customCategory,setCustomCategory]=useState(Boolean(product.category&&!productCategories.includes(product.category))); useEffect(()=>{setCustomCategory(Boolean(product.category&&!productCategories.includes(product.category)))},[product.id]); const upload=(f:File)=>{if(!f.type.startsWith('image/')||f.size>2*1024*1024)return;const r=new FileReader();r.onload=()=>setProduct({...product,image:String(r.result)});r.readAsDataURL(f)}; return <div><div className="grid gap-4 sm:grid-cols-2"><Field label="Nama produk *"><input className={input} value={product.name} onChange={e=>setProduct({...product,name:e.target.value})}/></Field><div className="space-y-2"><Field label="Kategori *">
  <CustomSelect
    ariaLabel="Kategori *"
    value={customCategory ? 'Lainnya' : product.category}
    onChange={val => {
      const custom = val === 'Lainnya'
      setCustomCategory(custom)
      setProduct({ ...product, category: custom ? '' : val })
    }}
    options={[
      { value: '', label: 'Pilih kategori', disabled: true },
      ...productCategories.map(value => ({ value, label: value })),
      { value: 'Lainnya', label: 'Lainnya' },
    ]}
    placeholder="Pilih kategori"
    className="w-full"
  />
</Field>{customCategory&&<Field label="Kategori lainnya *"><input className={input} maxLength={100} value={product.category} onChange={e=>setProduct({...product,category:e.target.value})}/></Field>}</div><div><Field label="SKU"><input aria-label="SKU" aria-describedby="setup-sku-help" maxLength={64} className={input} placeholder={product.id?product.sku:`${productSkuPrefix(product.category,product.name)}001`} value={product.sku||''} onChange={e=>setProduct({...product,sku:e.target.value})}/></Field><p id="setup-sku-help" className="mt-1 text-xs text-[#a4a7ac]">{product.id?'Kosongkan untuk mempertahankan SKU saat ini.':'Kosongkan untuk SKU otomatis; nomor ditetapkan saat disimpan.'}</p></div><Field label="Harga jual *"><input type="number" className={input} value={product.price} onChange={e=>setProduct({...product,price:e.target.value})}/></Field><Field label="Stok *"><input type="number" step="0.001" disabled={Boolean(product.id)} title="Ubah stok melalui inventori" className={input} value={product.stock} onChange={e=>setProduct({...product,stock:e.target.value})}/></Field><Field label="Minimum stok (opsional)"><input type="number" step="0.001" className={input} value={product.minimumStock} onChange={e=>setProduct({...product,minimumStock:e.target.value})}/></Field></div><label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#454d5b] p-3 text-sm"><ImagePlus className="text-[#24cbc5]"/><span className="flex-1">Foto produk (opsional)</span><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/>{product.image&&<img src={product.image} alt="Preview produk" className="size-12 rounded object-cover"/>}</label>{product.image&&<button className="mt-2 text-xs font-normal text-[#a4a7ac]" onClick={()=>setProduct({...product,image:undefined})}>Hapus foto</button>}{products.length>0&&<div className="mt-5 border-t pt-4"><p className="font-normal">Produk tersimpan</p>{products.map((p,i)=><div className="mt-2 flex items-center gap-3 rounded-lg bg-[#1c222e] p-3" key={i}>{p.image&&<img src={p.image} alt="" className="size-9 rounded object-cover"/>}<span className="flex-1 text-sm">{p.name}</span><button onClick={()=>edit(i)} className="text-sm text-[#24cbc5]">Edit</button><button onClick={()=>remove(i)} aria-label={`Hapus ${p.name}`}><Trash2 className="size-4 text-[#ffb4ae]"/></button></div>)}</div>}<Footer cancel={cancel} save={save} label="Simpan produk" error={error}/></div> }
export function PaymentsModal({ payments, setPayments, save, error, cancel }: { payments: Payments; setPayments: React.Dispatch<React.SetStateAction<Payments>>; save: () => void; error: string; cancel: () => void }) {
  const [uploadError, setUploadError] = useState('')
  const uploadVersion = useRef(0)
  useEffect(() => () => { uploadVersion.current++ }, [])
  const uploadQris = (file: File) => {
    const version = ++uploadVersion.current
    setUploadError('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setUploadError('Gunakan gambar PNG, JPG, atau WebP maksimal 2 MB.')
      return
    }
    const reader = new FileReader()
    const fail = () => { if (version === uploadVersion.current) setUploadError('Gambar QRIS tidak dapat dibaca. Pilih gambar lain.') }
    reader.onerror = fail
    reader.onload = () => {
      const source = String(reader.result)
      const image = new Image()
      image.onerror = fail
      image.onload = () => {
        if (version === uploadVersion.current) setPayments(current => ({ ...current, qrisImage: source }))
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  }
  const addBank = () => setPayments({ ...payments, transfer: true, banks: [...payments.banks, { bank: '', holder: '', account: '' }] })
  const toggleTransfer = () => {
    const next = !payments.transfer
    setPayments({
      ...payments,
      transfer: next,
      banks: next && payments.banks.length === 0 ? [{ bank: '', holder: '', account: '' }] : payments.banks
    })
  }
  const addButton = (label: string, onClick: () => void) => <button type="button" aria-label={label} title={label} onClick={onClick} className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#454d5b] bg-[#273242] text-[#24cbc5] transition-colors hover:bg-[#24cbc5]/10"><Plus className="size-4" aria-hidden="true" /></button>
  return <div className="flex flex-col gap-5">
    <div className="grid grid-cols-2 gap-3">{([['qris','QRIS'],['cash','Tunai']] as const).map(([key, label]) => <label key={key} className="flex min-h-[62px] cursor-pointer items-center gap-3 rounded-lg border border-[#454d5b] bg-[#273242] p-3 text-sm transition-colors hover:border-[#24cbc5]/50"><button type="button" role="switch" aria-label={label} aria-checked={payments[key]} onClick={() => setPayments({ ...payments, [key]: !payments[key] })} className={`inline-grid size-5 shrink-0 place-items-center rounded-full border-2 align-middle ${payments[key] ? 'border-[#1835d9] bg-[#273242]' : 'border-[#aab7c8] bg-[#eef2f6]'}`}><span className={`size-2.5 rounded-full ${payments[key] ? 'bg-[#1835d9]' : 'bg-transparent'}`} /></button><span className="font-normal">{label}</span></label>)}</div>
    {payments.qris && <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] p-4 text-sm">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"><ImagePlus className="shrink-0 text-[#24cbc5]" /><div><span className="font-normal">Unggah gambar QRIS *</span><p className="text-xs text-[#a4a7ac]">{payments.qrisImage ? 'Gambar siap disimpan' : 'Wajib diunggah jika QRIS diaktifkan'}</p></div><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadQris(file) }} /></label>
      {payments.qrisImage && <div className="relative shrink-0"><img src={payments.qrisImage} alt="Preview QRIS" className="size-20 rounded bg-white object-contain" /><button type="button" aria-label="Hapus gambar QRIS" title="Hapus gambar QRIS" onClick={() => { uploadVersion.current++; setUploadError(''); setPayments(current => ({ ...current, qris: false, qrisImage: undefined })) }} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-[#454d5b] bg-[#273242] text-white hover:text-[#24cbc5] focus-visible:outline-2 focus-visible:outline-[#24cbc5]"><X className="size-4" aria-hidden="true" /></button></div>}
    </div>}
    {uploadError && <p role="alert" className="text-sm text-[#ffb4ae]">{uploadError}</p>}
    <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-3"><div className="flex min-h-9 flex-nowrap items-center gap-3"><button type="button" role="switch" aria-label="Transfer bank" aria-checked={payments.transfer} onClick={toggleTransfer} className={`inline-grid size-5 shrink-0 place-items-center rounded-full border-2 ${payments.transfer ? 'border-[#1835d9] bg-[#273242]' : 'border-[#aab7c8] bg-[#eef2f6]'}`}><span className={`size-2.5 rounded-full ${payments.transfer ? 'bg-[#1835d9]' : 'bg-transparent'}`} /></button><button type="button" onClick={toggleTransfer} className="font-normal text-left hover:text-[#24cbc5]">Transfer bank</button>{addButton('Tambah rekening', addBank)}</div>{payments.transfer && payments.banks.map((bank, index) => <div key={index} className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[32px_repeat(3,minmax(0,1fr))]"><button type="button" aria-label="Hapus rekening" title="Hapus rekening" onClick={() => setPayments({ ...payments, banks: payments.banks.filter((_, i) => i !== index) })} className="flex size-9 items-center justify-center rounded-lg border border-[#454d5b] bg-[#273242] text-[#ffb4ae] hover:bg-[#4a252b] sm:mt-1"><X className="size-4" aria-hidden="true" /></button><input className={`${input} min-w-0 w-full box-border`} placeholder="Nama bank" value={bank.bank} onChange={e => setPayments({ ...payments, banks: payments.banks.map((item, i) => i === index ? { ...item, bank: e.target.value } : item) })} /><input className={`${input} min-w-0 w-full box-border`} placeholder="Nama pemilik" value={bank.holder} onChange={e => setPayments({ ...payments, banks: payments.banks.map((item, i) => i === index ? { ...item, holder: e.target.value } : item) })} /><input className={`${input} min-w-0 w-full box-border`} placeholder="Nomor rekening" value={bank.account} onChange={e => setPayments({ ...payments, banks: payments.banks.map((item, i) => i === index ? { ...item, account: e.target.value } : item) })} /></div>)}</section>
    <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-3 text-sm text-[#a4a7ac]"><span>E-wallet</span><p className="mt-1 text-xs">Belum tersedia. Pembayaran QRIS dari aplikasi e-wallet dapat dicatat sebagai QRIS.</p></section>
    <Footer cancel={cancel} save={save} label="Simpan pembayaran" error={error} />
  </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}</label>}
function Footer({cancel,save,label,error}:{cancel:()=>void;save:()=>void;label:string;error:string}){return <><p role={error?'alert':undefined} className="mt-4 min-h-5 text-sm text-[#ffb4ae]">{error}</p><div className="mt-4 flex justify-end gap-3"><button onClick={cancel} className="rounded-lg border px-4 py-2.5 text-sm font-normal text-[#a4a7ac]">Batal</button><button onClick={save} className="rounded-lg bg-[#1835d9] px-4 py-2.5 text-sm font-normal text-white">{label}</button></div></>}
