'use client'
import type { PaymentSettings } from '@/lib/business-payments'
import type { Business, Member } from '@/lib/validation'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Package, Plus, Printer, Search, ShoppingBag, Trash2 } from 'lucide-react'
import StoreTaxSettings from './store-tax-settings'
import { discountedPrice, checkoutQuote } from '@/lib/product-pricing'
import { CustomSelect } from './ui/custom-select'
import { parseQuantityInput, formatQuantity, quantity, type CatalogProduct } from '@/lib/catalog'
import { checkoutPos } from '@/app/pos-actions'
import { lineAmount, saleCode, saleDate, paymentLabel, type Sale } from '@/lib/pos'
import PosCustomerPicker from './pos-customer-picker'
import type {PosCustomer} from '@/lib/customers'

type Category = 'toko' | 'restoran' | 'barbershop'
type Product = CatalogProduct
type CartLine = { product: Product; quantity: number }
const money = (value: number) => `Rp${value.toLocaleString('id-ID')}`
function ProductPrice({product}:{product:Product}){const price=discountedPrice(product);return <span className="inline-flex flex-wrap items-center gap-x-2">{price<product.price&&<del className="text-xs text-[#a4a7ac]">{money(product.price)}</del>}<span>{money(price)}</span></span>}
function ProductImage({src}:{src?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img src={src} alt="" onError={()=>setFailed(true)} className="size-full rounded-xl object-cover" />:<Package className="size-10" />}
function ProductThumbnail({src,name}:{src?:string;name?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img src={src} alt={name||''} onError={()=>setFailed(true)} className="size-full object-cover" />:<Package className="size-4" />}

function QuantityInput({
  value,
  name,
  unit,
  maxStock,
  onChangeQty,
  onCommit,
}: {
  value: number
  name: string
  unit: string
  maxStock: number
  onChangeQty: (numericValue: number) => void
  onCommit: (raw: string) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const lastCommitted = useRef(value)

  useEffect(() => {
    if (value !== lastCommitted.current) {
      setDraft(String(value))
      lastCommitted.current = value
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setDraft(text)
    const parsed = parseQuantityInput(text)
    if (parsed.valid && parsed.value > 0) {
      const clamped = Math.min(parsed.value, maxStock)
      lastCommitted.current = clamped
      onChangeQty(clamped)
    }
  }

  const handleBlur = () => {
    onCommit(draft)
  }

  return (
    <div className="flex items-center">
      <input
        aria-label={`Jumlah ${name} (mis. 0,5 atau 1/2)`}
        title="Jumlah (mis. 0,5 atau 1/2)"
        placeholder="mis. 0,5 atau 1/2"
        type="text"
        inputMode="text"
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-20 bg-transparent text-center text-xs font-normal outline-none focus:text-[#24cbc5]"
      />
      <span className="select-none pr-1.5 text-[11px] font-normal text-[#a4a7ac]">{unit}</span>
    </div>
  )
}

export default function PosManagement({ initialCategory = 'toko', business, member, initialProducts, initialPayments, renderedAt }: { renderedAt: string; initialPayments: PaymentSettings; initialCategory?: Category; business: Business; member: Member; initialProducts: CatalogProduct[] }) {
  const router = useRouter()
  const [products,setProducts] = useState<Product[]>(initialProducts)
  useEffect(()=>setProducts(initialProducts),[initialProducts])
  const [pending,setPending]=useState(false)
  const busy=useRef(false)
  const request=useRef<{id:string;details:unknown}|null>(null)
  const [uncertain,setUncertain]=useState(false)
  const [lastSale,setLastSale]=useState<Sale|null>(null)
  const [taxRate,setTaxRate]=useState(Number(business.tax_rate||0))
  const [taxRevision,setTaxRevision]=useState(business.tax_revision||0)
  useEffect(()=>{setTaxRate(Number(business.tax_rate||0));setTaxRevision(business.tax_revision||0)},[business.tax_rate,business.tax_revision])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [cart, setCart] = useState<CartLine[]>([])
  const canDiscount = member.role === 'owner' || member.role === 'admin'
  const [orderKind, setOrderKind] = useState<'none' | 'percent' | 'amount'>('none')
  const [orderValue, setOrderValue] = useState('')
  const [payment, setPayment] = useState(initialPayments.cash?'Tunai':initialPayments.qris?'QRIS usaha':initialPayments.transfer?'Transfer':initialPayments.ewallet?'E-wallet':'')
  useEffect(()=>{if(!({Tunai:initialPayments.cash,'QRIS usaha':initialPayments.qris,Transfer:initialPayments.transfer,'E-wallet':initialPayments.ewallet}[payment])){setPayment(initialPayments.cash?'Tunai':initialPayments.qris?'QRIS usaha':initialPayments.transfer?'Transfer':initialPayments.ewallet?'E-wallet':'');setAck(false)}},[initialPayments,payment])
  const paymentEnabled=Boolean({Tunai:initialPayments.cash,'QRIS usaha':initialPayments.qris,Transfer:initialPayments.transfer,'E-wallet':initialPayments.ewallet}[payment])
  const [cash, setCash] = useState('')
  const [ack, setAck] = useState(false)
  const [customer, setCustomer] = useState<PosCustomer|null>(null)
  const [notice, setNotice] = useState('')
  const businessName = business.name
  const categories = ['Semua', ...Array.from(new Set(products.map(p => p.category === 'Rumah tangga' ? 'Kebutuhan rumah' : p.category)))]
  const visible = useMemo(() => products.filter(p => p.active && p.stock > 0 && [p.name,p.sku,p.barcode].some(v=>v.toLowerCase().includes(query.toLowerCase())) && (filter === 'Semua' || p.category === filter || (filter === 'Kebutuhan rumah' && p.category === 'Rumah tangga'))), [products, query, filter])
  let amounts={subtotal:0,discount:0,productDiscount:0,orderDiscount:0,net:0,tax:0,total:0};let quoteError=''
  try{amounts=checkoutQuote(cart,taxRate,canDiscount?orderKind:'none',canDiscount&&orderKind!=='none'?orderValue:'0')}catch(e){quoteError=(e as Error).message;try{amounts=checkoutQuote(cart,taxRate)}catch{}}
  const {subtotal,productDiscount,orderDiscount,net,tax,total}=amounts
  const estimatedPoints = business?.loyalty_active && business?.loyalty_point_nominal && customer ? Math.floor(total / business.loyalty_point_nominal) : 0
  const units = Math.round(cart.reduce((sum,line)=>sum+line.quantity,0)*1000)/1000
  useEffect(()=>{setAck(false)},[cart,payment,cash,taxRate,taxRevision,customer,orderKind,orderValue])
  useEffect(()=>{if(!cart.length){setOrderKind('none');setOrderValue('');setCash('');setCustomer(null);setAck(false)}},[cart.length])
  const add = (product:Product)=>setCart(current=>{const existing=current.find(l=>l.product.id===product.id);const next=Math.min(product.stock,Math.round(((existing?.quantity||0)+1)*1000)/1000);return existing?current.map(l=>l.product.id===product.id?{...l,quantity:next}:l):[...current,{product,quantity:next}]})
  const setQtyNumeric = (id: string, numericValue: number) => {
    if (numericValue <= 0) return
    setCart(current =>
      current.map(l =>
        l.product.id === id ? { ...l, quantity: Math.min(numericValue, l.product.stock) } : l
      )
    )
  }

  const commitQty = (id: string, rawText: string) => {
    const parsed = parseQuantityInput(rawText)
    const line = cart.find(l => l.product.id === id)
    if (!line) return

    if (!parsed.valid || parsed.value <= 0) {
      setNotice(parsed.error || 'Jumlah tidak valid. Masukkan angka bulat, desimal (mis. 0,5), atau pecahan (mis. 1/2).')
      setCart(current => [...current])
      return
    }

    if (parsed.value > line.product.stock) {
      setNotice(`Jumlah melebihi stok yang tersedia (${line.product.stock} ${line.product.unit}).`)
      setCart(current =>
        current.map(l => (l.product.id === id ? { ...l, quantity: line.product.stock } : l))
      )
    } else {
      setCart(current =>
        current.map(l => (l.product.id === id ? { ...l, quantity: parsed.value } : l))
      )
    }
  }

  const changeQty = (id: string, delta: number) => {
    const line = cart.find(l => l.product.id === id)
    if (!line) return
    const next = Math.max(0, Math.round((line.quantity + delta) * 1000) / 1000)
    if (next <= 0) {
      setCart(current => current.filter(l => l.product.id !== id))
    } else {
      setCart(current =>
        current.map(l => (l.product.id === id ? { ...l, quantity: Math.min(next, l.product.stock) } : l))
      )
    }
  }
  const confirm = async()=>{
    if(busy.current)return
    if(!request.current){
      if(!paymentEnabled||!cart.length||!ack||quoteError||(payment==='Tunai'&&(!/^\d{1,12}$/.test(cash)||Number(cash)<total)))return
      request.current={id:crypto.randomUUID(),details:{lines:cart.map(l=>({id:l.product.id,quantity:String(l.quantity),price:String(l.product.price),revision:l.product.revision})),payment:payment==='Tunai'?'cash':payment==='Transfer'?'transfer':payment==='E-wallet'?'ewallet':'qris',received:payment==='Tunai'?cash:String(total),discountKind:canDiscount?orderKind:'none',discountValue:canDiscount&&orderKind!=='none'?orderValue:'0',taxRate:String(taxRate),taxRevision,paymentRevision:initialPayments.revision,customer:customer?.name||'Pelanggan umum',...(customer?{customerId:customer.id}:{}),confirmed:true}}
    }
    busy.current=true;setPending(true)
    try{
      const result=await checkoutPos(request.current.id,request.current.details)
      if(result.sale){setLastSale(result.sale);setNotice('Transaksi '+saleCode(result.sale)+(result.sale.status==='cancelled'?' sudah tercatat dan telah dibatalkan. Periksa detail transaksi.':' berhasil dicatat.'));setCart([]);setCash('');setAck(false);setCustomer(null);setUncertain(false);request.current=null;router.refresh()}
      else{setNotice(result.error||'Transaksi belum dapat dicatat.');setUncertain(!!result.uncertain);if(!result.uncertain)request.current=null}
    }catch{setUncertain(true);setNotice('Hasil penyimpanan belum pasti. Periksa riwayat atau coba ulang permintaan yang sama.')}
    finally{busy.current=false;setPending(false)}
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#454d5b] pb-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-[#a4a7ac]">
            <span>{businessName}</span>
            <span className="text-white/30">&gt;</span>
            <span className="font-medium text-[#24cbc5]">Kasir</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Kasir</h1>
          <p className="mt-1 text-sm text-[#a4a7ac]">Pilih produk atau pindai barcode yang sudah terdaftar.</p>
          <p className="mt-3 text-xs text-[#a4a7ac]">{products.length} produk tersedia • {new Date(renderedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone:'Asia/Jakarta' })} • WIB</p>
        </div>
        <p className="text-xs text-[#a4a7ac]">Transaksi dan cetak struk</p>
      </div>
      {notice && <div role="status" className="mb-4 rounded-xl border border-[#99f6e4] bg-[#24cbc5]/10 p-3 text-sm text-[#24cbc5]">{notice}{uncertain&&<button disabled={pending} onClick={confirm} className="ml-3 underline">Coba ulang permintaan yang sama</button>}</div>}

      <fieldset disabled={pending||uncertain} className="contents"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(330px,1fr)]"><section className="min-w-0"><div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-[#a4a7ac]" /><input aria-label="Cari produk, SKU, atau pindai barcode" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const match=products.find(p=>p.active&&p.stock>0&&(p.barcode===query||p.sku===query));if(match){add(match);setQuery('')}else setNotice('Barcode atau SKU tidak ditemukan.')}}} placeholder="Cari produk, SKU, atau pindai barcode..." className="h-10 w-full rounded-lg border border-[#454d5b] pl-9 pr-3 text-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#ccfbf1]" /></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{categories.map(item => <button key={item} onClick={() => setFilter(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-normal ${filter === item ? 'bg-[#1835d9] text-white' : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#24cbc5]/10'}`}>{item}</button>)}</div></div><div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map(product => <article key={product.id} className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex aspect-[1.25] items-center justify-center rounded-xl bg-[#24cbc5]/10 text-4xl text-[#24cbc5]"><ProductImage src={product.image} /></div><div className="mt-3 flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-sm font-normal">{product.name}</h2><p className="mt-1 text-xs text-[#a4a7ac]">{product.sku} • per {product.unit}</p></div><span className="shrink-0 rounded-full bg-[#24cbc5]/10 px-2 py-1 text-[10px] font-normal text-[#24cbc5]">{product.stock} {product.unit}</span></div><div className="mt-3 flex items-center justify-between"><p className="font-normal"><ProductPrice product={product}/></p><button onClick={() => add(product)} aria-label={`Tambah ${product.name}`} className="grid size-9 place-items-center rounded-lg bg-[#1835d9] text-white transition hover:bg-[#132c9e] active:scale-95"><Plus className="size-4" /></button></div></article>)}{!visible.length && <div className="col-span-full rounded-xl border border-dashed border-[#454d5b] p-8 text-center text-sm text-[#a4a7ac]">Tidak ada produk yang cocok.</div>}</div><div className="mt-4 rounded-xl bg-[#24cbc5]/10 p-3 text-xs leading-5 text-[#24cbc5]">Stok berkurang setelah transaksi valid selesai dicatat. Keranjang ini belum mengubah persediaan. Produk habis atau nonaktif tidak dapat ditambahkan.</div></section>
        <aside className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm xl:sticky xl:top-20"><div className="flex items-start justify-between"><div><h2 className="font-normal">Keranjang aktif</h2><p className="mt-1 text-xs text-[#a4a7ac]">Draf belum dicatat</p></div><span className="rounded-full bg-[#303640] px-2 py-1 text-xs font-normal">{formatQuantity(units)} unit</span></div>{cart.length>0&&<div className="mt-4"><PosCustomerPicker key={lastSale?.id||'cart'} value={customer} onChange={setCustomer} member={member}/></div>}<div className="mt-4 max-h-72 overflow-y-auto">{cart.length ? cart.map(line => <div key={line.product.id} className="border-b border-[#454d5b] py-3 first:pt-0"><div className="flex gap-2"><div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#24cbc5]/10 text-[#24cbc5]"><ProductThumbnail src={line.product.image} name={line.product.name} /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{line.product.name}</p><p className="text-xs text-[#a4a7ac]"><ProductPrice product={line.product}/> / {line.product.unit}</p></div><button onClick={() => setCart(current => current.filter(item => item.product.id !== line.product.id))} aria-label={`Hapus ${line.product.name}`} className="text-[#94a3b8] hover:text-[#ffb4ae]"><Trash2 className="size-4" /></button></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center rounded-lg border border-[#454d5b] bg-[#1c222e]/40 px-1 py-0.5"><button onClick={() => changeQty(line.product.id, -1)} className="grid size-7 place-items-center text-[#a4a7ac] hover:text-white" aria-label="Kurangi jumlah"><Minus className="size-3" /></button><QuantityInput value={line.quantity} name={line.product.name} unit={line.product.unit} maxStock={line.product.stock} onChangeQty={val => setQtyNumeric(line.product.id, val)} onCommit={raw => commitQty(line.product.id, raw)} /><button onClick={() => changeQty(line.product.id, 1)} className="grid size-7 place-items-center text-[#a4a7ac] hover:text-white" aria-label="Tambah jumlah"><Plus className="size-3" /></button></div><p className="text-sm font-normal">{money(lineAmount(discountedPrice(line.product),line.quantity))}</p></div></div></div></div>) : <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] p-5 text-center"><div><ShoppingBag className="mx-auto size-8 text-[#94a3b8]" /><p className="mt-2 text-sm font-medium">Belum ada produk</p><p className="mt-1 text-xs text-[#a4a7ac]">Pilih produk dari katalog untuk memulai.</p></div></div>}</div>{cart.length>0&&<div className="mt-4 border-t border-[#454d5b] pt-4"><div className="flex justify-between text-sm text-[#c5cbd5]"><span>Subtotal</span><span>{money(subtotal)}</span></div>{productDiscount>0&&<p className="mt-2 flex justify-between text-sm text-[#c5cbd5]"><span>Diskon produk</span><span>−{money(productDiscount)}</span></p>}{canDiscount&&<div className="mt-3 space-y-2"><label htmlFor="order-discount-kind" className="block text-xs font-medium">Diskon keseluruhan</label><CustomSelect className="w-full" id="order-discount-kind" ariaLabel="Jenis diskon keseluruhan" value={orderKind} onChange={value=>{setOrderKind(value as 'none'|'percent'|'amount');setOrderValue('')}} options={[{value:'none',label:'Tanpa diskon'},{value:'percent',label:'Persen (%)'},{value:'amount',label:'Rupiah (Rp)'}]}/>{orderKind!=='none'&&<label className="block text-xs">Nilai diskon keseluruhan<input aria-label="Nilai diskon keseluruhan" type="text" inputMode={orderKind==='percent'?'decimal':'numeric'} maxLength={15} value={orderValue} onChange={event=>setOrderValue(event.target.value.replace(',','.'))} placeholder={orderKind==='percent'?'Contoh: 10':'Contoh: 5000'} className="mt-1 h-10 w-full rounded-lg border border-[#454d5b] px-3 text-sm"/></label>}<p className="text-[11px] text-[#a4a7ac]">Dihitung setelah diskon produk, sebelum pajak.</p></div>}{orderDiscount>0&&<p className="mt-2 flex justify-between text-sm text-[#c5cbd5]"><span>Diskon keseluruhan</span><span>−{money(orderDiscount)}</span></p>}<p className="mt-2 flex justify-between text-sm text-[#c5cbd5]"><span>Setelah diskon</span><span>{money(net)}</span></p><p className="mt-2 flex justify-between text-sm text-[#c5cbd5]"><span>Pajak ({taxRate}%)</span><span>{money(tax)}</span></p><div className="mt-3 flex items-center justify-between rounded-xl bg-[#24cbc5]/10 px-3 py-3"><span className="font-normal">Total</span><strong className="text-xl text-[#24cbc5]">{money(total)}</strong></div>{business?.loyalty_active && customer && (<div className="mt-2 flex items-center justify-between px-1 text-xs"><span className="text-[#a4a7ac]">Estimasi poin member</span><span className="font-medium text-[#24cbc5]">+{estimatedPoints} poin</span></div>)}{member.role==='owner'&&<StoreTaxSettings rate={taxRate} revision={taxRevision} onSaved={(rate,revision)=>{setTaxRate(rate);setTaxRevision(revision);router.refresh()}}/>}{quoteError&&<p role="alert" className="mt-2 text-xs text-[#ffb4ae]">{quoteError}</p>}<h3 className="mt-5 font-normal">Metode pembayaran</h3>{!paymentEnabled&&<p role="status" className="mt-3 rounded-lg bg-[#1c222e] p-3 text-xs text-[#c5cbd5]">Belum ada metode pembayaran aktif. Owner dapat mengaktifkannya melalui Pengaturan.</p>}<div className="mt-2 grid grid-cols-2 gap-2">{['Tunai', 'QRIS usaha', 'Transfer', 'E-wallet'].filter(method=>({Tunai:initialPayments.cash,'QRIS usaha':initialPayments.qris,Transfer:initialPayments.transfer,'E-wallet':initialPayments.ewallet}[method])).map(method => <button key={method} onClick={() => setPayment(method)} className={`rounded-lg border px-2 py-2 text-xs font-normal disabled:cursor-not-allowed disabled:opacity-40 ${payment === method ? 'border-[#0f766e] bg-[#24cbc5]/10 text-[#24cbc5]' : 'border-[#454d5b] text-[#c5cbd5]'}`}>{method}</button>)}</div>{payment==='QRIS usaha'&&initialPayments.qrisImage&&<img src={initialPayments.qrisImage} alt="QRIS usaha" className="mt-3 max-h-64 max-w-full rounded-lg bg-white p-2 object-contain"/>}{payment==='Transfer'&&initialPayments.banks.length>0&&<div className="mt-3 space-y-2 rounded-lg bg-[#1c222e] p-3 text-xs">{initialPayments.banks.map((bank,i)=><p key={i} className="break-words [overflow-wrap:anywhere]">{bank.bank} · {bank.holder} · {bank.account}</p>)}</div>}{payment==='E-wallet'&&initialPayments.ewallets.length>0&&<div className="mt-3 space-y-2 rounded-lg bg-[#1c222e] p-3 text-xs">{initialPayments.ewallets.map((item,i)=><p key={i} className="break-words [overflow-wrap:anywhere]">{item.ewallet} · {item.holder} · {item.number}</p>)}</div>}{payment === 'Tunai' ? <div className="mt-3"><label htmlFor="cash" className="text-xs font-medium">Nominal tunai diterima</label><input id="cash" type="number" min="0" value={cash} onChange={e => setCash(e.target.value)} placeholder="Rp0" className="mt-1 h-10 w-full rounded-lg border border-[#454d5b] px-3 text-sm" /><p className={`mt-2 text-xs ${Number(cash) >= total && total > 0 ? 'text-[#24cbc5]' : 'text-[#ffb4ae]'}`}>Kembalian: {money(Math.max(0, Number(cash || 0) - total))}</p></div> : paymentEnabled&&<div className="mt-3 rounded-lg bg-[#1c222e] p-3 text-xs leading-5 text-[#c5cbd5]">Pembayaran {payment} dicatat manual oleh kasir. Verifikasi dilakukan di luar aplikasi.</div>}<label className="mt-4 flex gap-2 text-xs leading-5 text-[#c5cbd5]"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 rounded-full cursor-pointer" />Saya telah menerima pembayaran dan memeriksa jumlah belanja.</label><button onClick={confirm} disabled={pending||!paymentEnabled||!!quoteError||!cart.length || !ack || (payment === 'Tunai' && (!/^\d{1,12}$/.test(cash)||Number(cash) < total))} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1835d9] text-sm font-normal text-white hover:bg-[#132c9e] disabled:cursor-not-allowed disabled:opacity-40">Konfirmasi & catat transaksi</button><p className="mt-3 text-center text-[11px] text-[#a4a7ac]">Stok dan transaksi disimpan bersamaan setelah konfirmasi.</p></div>}</aside></div></fieldset>
      <section className="mt-6"><div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><div className="flex items-center justify-between"><span className="rounded-full bg-[#303640] px-2 py-1 text-[11px] font-normal text-[#a4a7ac]">Transaksi terakhir sesi ini</span><span className="rounded-full bg-[#24cbc5]/10 px-2 py-1 text-[11px] font-normal text-[#24cbc5]">{lastSale?(lastSale.status==='cancelled'?'Dibatalkan':'Selesai'):'Belum ada'}</span></div><h2 className="mt-5 font-normal">{lastSale?'Transaksi telah dicatat':'Belum ada transaksi'}</h2>{lastSale&&<><p className="mt-1 break-all text-xs text-[#a4a7ac]">{saleCode(lastSale)} {saleDate(lastSale.created_at)} {lastSale.actor_name}</p><div className="mt-4 rounded-xl bg-[#1c222e] p-3 text-sm"><div className="flex justify-between"><span>{lastSale.lines.length} item</span><strong>{money(Number(lastSale.total))}</strong></div><p className="mt-1 text-xs text-[#a4a7ac]">{paymentLabel[lastSale.payment]} diterima {money(Number(lastSale.received))} / Kembalian {money(Number(lastSale.change))}</p>{!!lastSale.points_earned && <p className="mt-1.5 inline-flex items-center rounded-md bg-[#24cbc5]/10 px-2 py-0.5 text-xs font-medium text-[#24cbc5]">+{lastSale.points_earned} poin member diperoleh</p>}</div><div className="mt-4 flex gap-2"><button onClick={()=>router.push('/dashboard/transactions/'+lastSale.id)} className="flex items-center gap-2 rounded-lg border border-[#454d5b] px-3 py-2 text-sm font-normal"><Printer className="size-4" />Cetak struk</button><button disabled={pending||uncertain} onClick={()=>{setCart([]);setCustomer(null);window.scrollTo({top:0,behavior:'smooth'})}} className="rounded-lg bg-[#1835d9] px-3 py-2 text-sm font-normal text-white">+ Transaksi baru</button></div></>}</div></section>
      <footer className="mt-6 flex flex-wrap justify-between gap-2 text-xs text-[#a4a7ac]"><span>POS memerlukan internet • Pembayaran dicatat manual oleh kasir • Data usaha</span><span>Seluruh waktu dalam WIB</span></footer>
    </div>
  )
}
