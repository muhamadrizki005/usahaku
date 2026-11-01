'use client'
import './mobile-record-table.css'
import { moveCatalogStock } from '@/app/catalog-actions'
import { adjustedStock, formatQuantity, quantity, type CatalogProduct, type StockRow } from '@/lib/catalog'
import type { Role } from '@/lib/auth/permissions'
import type { Business } from '@/lib/validation'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, Search } from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'
import { useRouter } from 'next/navigation'

type Category = 'toko' | 'restoran' | 'barbershop'
type Product = CatalogProduct
type Movement = { id: string; product: string; type: 'Masuk' | 'Keluar' | 'Hitung fisik'; reason: string; date: string; quantity: number; unit: string; before: number; after: number }

export default function InventoryManagement({ role, initialCategory = 'toko', business, initialProducts, initialMovements, memberName }: { role: Role; initialCategory?: Category; business: Business; initialProducts: Product[]; initialMovements: StockRow[]; memberName: string }) {
  const router = useRouter(); const [products, setProducts] = useState(initialProducts); const [query, setQuery] = useState(''); const [condition, setCondition] = useState('Semua kondisi'); const [category, setCategory] = useState('Semua kategori'); const [selectedId, setSelectedId] = useState(initialProducts[0]?.id||''); const [adjustment, setAdjustment] = useState(''); const [direction, setDirection] = useState<'in'|'out'>('in'); const [reason, setReason] = useState(''); const [movements, setMovements] = useState<Movement[]>([]); const [movementFilter, setMovementFilter] = useState('Semua'); const [notice, setNotice] = useState('')
  const [pending,setPending]=useState(false),[showAll,setShowAll]=useState(false)
  const operation=useRef('')
  useEffect(()=>{setProducts(initialProducts);setMovements(initialMovements.map(m=>({id:m.id,product:m.product_name,type:m.kind==='initial'||m.kind==='in'||m.kind==='sale_cancel'?'Masuk':m.kind==='out'||m.kind==='sale'?'Keluar':'Hitung fisik',reason:m.reason+' / '+m.actor_name,date:new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(m.created_at)),quantity:Number(m.quantity),unit:m.unit,before:Number(m.before_stock),after:Number(m.after_stock)})))},[initialProducts,initialMovements])
  let delta='0', amountError=''
  if(adjustment.trim()) { try { const amount=quantity(adjustment); delta=direction==='out'&&Number(amount)!==0?'-'+amount:amount } catch { amountError='Masukkan jumlah positif dengan maksimal 3 angka desimal.' } }
  const businessName = business.name; const selected = products.find(p => p.id === selectedId) || products[0]; const result = amountError ? NaN : selected ? adjustedStock(selected.stock,delta) : 0; const lowStock = products.filter(p => p.stock <= p.minStock); const categories = ['Semua kategori', ...Array.from(new Set(products.map(p => p.category)))]; const filtered = useMemo(() => products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()) && (category === 'Semua kategori' || p.category === category) && (condition === 'Semua kondisi' || (condition === 'Habis' ? p.stock === 0 : condition === 'Menipis' ? p.stock > 0 && p.stock <= p.minStock : p.stock > p.minStock))), [products, query, category, condition]); const filteredMovements = movementFilter === 'Semua' ? movements : movements.filter(m => m.type === movementFilter)
  const conditionLabel = (p: Product) => p.stock === 0 ? 'Habis' : p.stock <= p.minStock ? 'Menipis' : 'Cukup'
  const saveAdjustment = async () => {if(pending||!selected||!reason.trim()||!Number.isFinite(result)||result<0||Number(delta)===0)return;setPending(true);operation.current ||= crypto.randomUUID();try{const form=new FormData();form.set('id',selected.id);form.set('revision',String(selected.stockRevision));form.set('request',operation.current);form.set('delta',delta);form.set('kind',direction);form.set('reason',reason);const response=await moveCatalogStock(form);setNotice(response.error||response.success||'');if(response.product){setProducts(items=>items.map(p=>p.id===selected.id?response.product!:p));setAdjustment('');setReason('');operation.current='';router.refresh()}}catch{setNotice('Status belum pasti. Muat ulang sebelum mencoba lagi.')}finally{setPending(false)}}
  const openStockChange=()=>{if(pending)return;setDirection('in');setAdjustment('');setReason('');operation.current='';document.getElementById('adjustment')?.scrollIntoView({behavior:'smooth'})}

  return <div className="w-full">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs text-[#a4a7ac] flex items-center gap-1.5">
                  <span>{businessName}</span>
                  <span className="text-white/30">›</span>
                  <span className="text-[#24cbc5] font-medium">Inventori</span>
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl text-white">Manajemen stok</h1>
                <p className="mt-1 text-xs sm:text-sm text-[#c5cbd5]">Pantau persediaan dan telusuri setiap perubahan jumlah barang.</p>
              </div>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-4 text-xs sm:text-sm font-normal text-white hover:bg-[#132c9e] transition shadow-xs active:scale-95" disabled={pending} onClick={openStockChange}>
                ＋ Catat perubahan stok
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs sm:text-sm text-[#a4a7ac]">Kondisi per hari ini • Waktu dalam WIB</p>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              <Info className="mt-0.5 size-4.5 shrink-0 text-amber-400" />
              <div>
                <p className="font-normal text-amber-300">{lowStock.length} produk perlu diisi ulang</p>
                <p className="mt-1 text-xs text-[#c5cbd5]">{lowStock.length ? lowStock.slice(0, 3).map(p => p.name).join(', ') + '. Stok menipis berbeda dari status aktif produk.' : 'Semua stok berada di atas batas minimum.'}</p>
              </div>
            </div>

            <section className="mt-6 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm">
              <h2 className="text-base font-normal text-white">Persediaan saat ini</h2>
              <p className="mt-0.5 text-xs text-[#a4a7ac]">Stok fisik tercatat • Sama dengan katalog produk, sebelum keranjang aktif diselesaikan.</p>
              <div className="mt-4 flex flex-col gap-3 lg:flex-row">
                <label className="relative flex-1">
                  <Search className="absolute left-3 top-3 size-4 text-[#a4a7ac]" />
                  <input aria-label="Cari produk atau SKU" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari produk atau SKU" className="h-10 w-full rounded-xl border border-[#454d5b] bg-[#1c222e]/70 pl-9 pr-3 text-sm text-white outline-none focus:border-[#24cbc5]" />
                </label>
                <CustomSelect
                  value={condition}
                  onChange={setCondition}
                  options={['Semua kondisi', 'Habis', 'Menipis', 'Cukup']}
                  ariaLabel="Filter semua kondisi"
                  className="min-w-[140px]"
                />
                <CustomSelect
                  value={category}
                  onChange={setCategory}
                  options={categories}
                  align="right"
                  ariaLabel="Filter semua kategori"
                  className="min-w-[140px]"
                />
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="mobile-record-table w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-[#1c222e] text-xs text-[#a4a7ac] border-b border-[#454d5b]">
                    <tr>
                      {['Produk', 'Stok fisik', 'Minimum', 'Kondisi stok', 'Status produk', 'Tindakan'].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#454d5b]/50">
                    {filtered.map(p => (
                      <tr key={p.id} className="hover:bg-[#1c222e]/40 transition">
                        <td data-label="Produk" data-primary="" className="px-3 py-3 font-medium text-white">
                          <p className="font-normal">{p.name}</p>
                          <p className="mt-0.5 text-xs text-[#a4a7ac]">{p.sku} • {p.category}</p>
                        </td>
                        <td data-label="Stok fisik" className={`px-3 py-3 font-normal ${p.stock === 0 ? 'text-red-400' : 'text-white'}`}>{formatQuantity(p.stock)} {p.unit}</td>
                        <td data-label="Minimum stok" className="px-3 py-3 text-[#c5cbd5]">{formatQuantity(p.minStock)} {p.unit}</td>
                        <td data-label="Kondisi stok" className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-normal ${p.stock === 0 ? 'bg-red-500/15 border border-red-500/30 text-red-400' : p.stock <= p.minStock ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400' : 'bg-[#24cbc5]/15 border border-[#24cbc5]/30 text-[#24cbc5]'}`}>
                            {conditionLabel(p)}
                          </span>
                        </td>
                        <td data-label="Status produk" className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-normal ${p.active ? 'bg-[#24cbc5]/10 text-[#24cbc5]' : 'bg-[#303640] text-[#a4a7ac]'}`}>
                            {p.active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td data-label="Tindakan" data-actions="" className="px-3 py-3">
                          <button className="font-normal text-[#24cbc5] hover:underline" onClick={() => { setSelectedId(p.id); document.getElementById('adjustment')?.scrollIntoView({ behavior: 'smooth' }) }}>
                            Sesuaikan →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-[#a4a7ac]">{filtered.length} dari {products.length} produk • Stok produk nonaktif tetap tercatat.</p>
            </section>

            <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[.9fr_1.1fr]">
              <section id="adjustment" className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm">
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-normal text-amber-400">Validasi penyesuaian</span>
                <h2 className="mt-4 text-lg font-normal text-white">Catat perubahan stok</h2>
                <p className="mt-1 text-xs sm:text-sm text-[#a4a7ac]">Catat penambahan atau pengurangan barang beserta alasannya. Penjualan POS tercatat otomatis pada riwayat.</p>
                <label className="mt-5 block text-xs font-normal text-white">Produk *
                  <CustomSelect
                    value={selected?.id || ''}
                    disabled={pending}
                    onChange={setSelectedId}
                    options={[
                      { value: '', label: 'Pilih produk' },
                      ...products.map(p => ({ value: p.id, label: `${p.name} • ${p.sku}` }))
                    ]}
                    placeholder="Pilih produk"
                    ariaLabel="Pilih produk"
                    className="mt-2 w-full"
                  />
                </label>
                <div className="mt-4 grid grid-cols-3 rounded-xl bg-[#1c222e] p-3 text-center border border-[#454d5b]/60">
                  <div>
                    <p className="text-xs text-[#a4a7ac]">Stok tercatat</p>
                    <p className="mt-1 text-base font-normal text-white">{formatQuantity(selected?.stock || 0)} {selected?.unit}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#a4a7ac]">Penyesuaian</p>
                    <p className="mt-1 text-base font-normal text-white">{amountError ? '-' : formatQuantity(Number(delta))} {selected?.unit}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#a4a7ac]">Hasil</p>
                    <p className={`mt-1 text-base font-normal ${result < 0 ? 'text-red-400' : 'text-[#24cbc5]'}`}>{Number.isFinite(result) ? formatQuantity(result) : '-'} {selected?.unit}</p>
                  </div>
                </div>
                <div className="mt-5"><label htmlFor="inventory-adjustment-quantity" className="block text-xs font-normal text-white">Jumlah perubahan *</label>
                  <div className="mt-2 flex items-center gap-2"><input id="inventory-adjustment-quantity" type="text" inputMode="decimal" disabled={pending} value={adjustment} onChange={e => setAdjustment(e.target.value)} aria-invalid={Boolean(amountError)||result<0} className={`h-11 min-w-0 flex-1 rounded-xl border bg-[#1c222e]/70 px-3 text-sm text-white ${result < 0 || amountError ? 'border-red-500' : 'border-[#454d5b]'}`} />
                    <div role="group" aria-label="Arah koreksi stok" className="flex shrink-0 gap-1">{([['in','Masuk'],['out','Keluar']] as const).map(([value,label])=><button key={value} type="button" disabled={pending} aria-label={label+' barang'} aria-pressed={direction===value} onClick={()=>{setDirection(value)}} className={'min-h-11 rounded-xl border px-3 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] disabled:opacity-50 '+(direction===value?(value==='out'?'border-[#b91c1c] bg-[#b91c1c]':'border-[#1835d9] bg-[#1835d9]'):'border-[#454d5b] bg-[#1c222e] hover:bg-[#303640]')}>{label}</button>)}</div>
                  </div>
                </div>
                {amountError && <p role="alert" className="mt-2 text-xs text-[#ffb4ae]">{amountError}</p>}
                {result < 0 && <p className="mt-2 text-xs text-red-400">Maksimal pengurangan {selected?.stock || 0} {selected?.unit}. Hasil stok tidak boleh di bawah 0.</p>}
                <label className="mt-4 block text-xs font-normal text-white">Alasan perubahan *
                  <input disabled={pending} value={reason} onChange={e => setReason(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#454d5b] bg-[#1c222e]/70 px-3 text-sm text-white" />
                </label>
                <div className="mt-5 flex justify-end gap-3">
                  <button disabled={pending} className="h-10 rounded-xl border border-[#454d5b] px-4 text-xs sm:text-sm font-normal text-[#c5cbd5] hover:text-white hover:bg-[#303640] transition disabled:opacity-50" onClick={() => { setAdjustment(''); setNotice('Perubahan dibatalkan.') }}>Batal</button>
                  <button disabled={pending || !selected || !Number.isFinite(result) || result < 0 || Number(delta) === 0 || !reason.trim()} className="h-10 rounded-xl bg-[#1835d9] px-4 text-xs sm:text-sm font-normal text-white hover:bg-[#132c9e] transition disabled:opacity-40" onClick={saveAdjustment}>Simpan perubahan stok</button>
                </div>
                {notice && <p className="mt-3 text-xs text-[#24cbc5]">{notice}</p>}
              </section>

              <section className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-normal text-white">Riwayat pergerakan stok</h2>
                    <p className="mt-0.5 text-xs text-[#a4a7ac]">Catatan tersimpan operasional</p>
                  </div>
                  <button onClick={() => setShowAll(v => !v)} className="text-xs sm:text-sm font-normal text-[#24cbc5] hover:underline">
                    {showAll ? 'Ringkas riwayat' : 'Lihat semua'} →
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Semua', 'Masuk', 'Keluar', 'Hitung fisik'].map(tab => (
                    <button key={tab} onClick={() => setMovementFilter(tab)} className={`rounded-xl px-3 py-1.5 text-xs font-normal transition ${movementFilter === tab ? 'bg-[#24cbc5]/15 border border-[#24cbc5]/30 text-[#24cbc5]' : 'bg-[#1c222e] text-[#c5cbd5] hover:text-white'}`}>
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="mt-3 divide-y divide-[#454d5b]/40">
                  {(showAll ? filteredMovements : filteredMovements.slice(0, 10)).map(m => (
                    <div key={m.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-normal text-white">{m.product}</p>
                        <p className="mt-0.5 text-xs text-[#a4a7ac]">{m.type} • {m.reason} • {m.date}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-normal ${m.quantity > 0 ? 'text-[#24cbc5]' : m.type === 'Hitung fisik' ? 'text-amber-400' : 'text-white'}`}>
                          {m.quantity > 0 ? '+' : ''}{formatQuantity(m.quantity)} {m.unit}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#a4a7ac]">{m.before} → {m.after} {m.unit}</p>
                      </div>
                    </div>
                  ))}
                  {filteredMovements.length === 0 && (
                    <p className="py-8 text-center text-xs text-[#a4a7ac]">Belum ada data pergerakan stok.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
}
