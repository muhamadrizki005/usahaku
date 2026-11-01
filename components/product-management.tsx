'use client'
import './mobile-record-table.css'

import { productSkuPrefix } from '@/lib/product-sku'
import { discountedPrice } from '@/lib/product-pricing'
import { saveCatalogProduct, bulkCatalogProducts } from '@/app/catalog-actions'
import { productCategories, defaultProductUnits, productSchema, formatQuantity, type CatalogProduct, type CatalogResult } from '@/lib/catalog'
import type { Role } from '@/lib/auth/permissions'
import type { Business } from '@/lib/validation'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Package, Plus, Search, X } from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'

type Category = 'toko' | 'restoran' | 'barbershop'
type Product = CatalogProduct
const labels: Record<Category, string> = { toko: 'Toko / Minimarket / Kios', restoran: 'Restoran / Cafe', barbershop: 'Barbershop / Salon' }
const money = (value: number) => `Rp${value.toLocaleString('id-ID')}`

export default function ProductManagement({
  role,
  initialCategory = 'toko',
  business,
  initialProducts,
  initialCustomCategories = [],
  initialCustomUnits = [],
  renderedAt,
}: {
  role: Role
  initialCategory?: Category
  business: Business
  initialProducts: Product[]
  initialCustomCategories?: string[]
  initialCustomUnits?: string[]
  renderedAt: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [customCategories, setCustomCategories] = useState<string[]>(initialCustomCategories)
  const [customUnits, setCustomUnits] = useState<string[]>(initialCustomUnits)
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('Semua kategori')
  const [filterStatus, setFilterStatus] = useState('Semua status')
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<Product | null | false>(false)
  const [notice, setNotice] = useState('')
  const [bulkPending, setBulkPending] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => setProducts(initialProducts), [initialProducts])
  useEffect(() => setCustomCategories(initialCustomCategories), [initialCustomCategories])
  useEffect(() => setCustomUnits(initialCustomUnits), [initialCustomUnits])

  const businessName = business.name

  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    const list: string[] = []
    const add = (item: string) => {
      const trimmed = item.trim()
      const lower = trimmed.toLowerCase()
      if (trimmed && !set.has(lower)) {
        set.add(lower)
        list.push(trimmed)
      }
    }
    productCategories.forEach(add)
    customCategories.forEach(add)
    products.forEach(p => { if (p.category) add(p.category) })
    return list
  }, [customCategories, products])

  const availableUnits = useMemo(() => {
    const set = new Set<string>()
    const list: string[] = []
    const add = (item: string) => {
      const trimmed = item.trim()
      const lower = trimmed.toLowerCase()
      if (trimmed && !set.has(lower)) {
        set.add(lower)
        list.push(trimmed)
      }
    }
    defaultProductUnits.forEach(add)
    customUnits.forEach(add)
    products.forEach(p => { if (p.unit) add(p.unit) })
    return list
  }, [customUnits, products])

  const categories = useMemo(() => ['Semua kategori', ...availableCategories], [availableCategories])

  const filtered = useMemo(
    () =>
      products.filter(
        p =>
          `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(query.toLowerCase()) &&
          (filterCategory === 'Semua kategori' || p.category === filterCategory) &&
          (filterStatus === 'Semua status' || (filterStatus === 'Aktif' ? p.active : !p.active))
      ),
    [products, query, filterCategory, filterStatus]
  )

  const activeCount = products.filter(p => p.active).length
  const selectedAll = filtered.length > 0 && filtered.every(p => selected.includes(p.id))

  const exportCsv = () => {
    const rows = [
      ['Produk', 'SKU', 'Barcode', 'Kategori', 'Harga', 'Stok', 'Unit', 'Status'],
      ...filtered.map(p => [
        p.name,
        p.sku,
        p.barcode,
        p.category,
        String(p.price),
        String(p.stock),
        p.unit,
        p.active ? 'Aktif' : 'Nonaktif',
      ]),
    ]
    const blob = new Blob(
      [
        rows
          .map(r =>
            r
              .map(raw => {
                const v = /^(?:\s*[=+@-]|[\t\r\n])/.test(raw) ? "'" + raw : raw
                return `"${v.replaceAll('"', '""')}"`
              })
              .join(',')
          )
          .join('\n'),
      ],
      { type: 'text/csv;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'produk-usahaku.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const bulk = async (active: boolean | null, category: string | null) => {
    if (bulkPending) return
    setBulkPending(true)
    try {
      const form = new FormData()
      form.set('request', crypto.randomUUID())
      form.set('items', JSON.stringify(products.filter(p => selected.includes(p.id)).map(p => ({ id: p.id, revision: p.revision }))))
      form.set('active', JSON.stringify(active))
      form.set('category', JSON.stringify(category))
      const result = await bulkCatalogProducts(form)
      setNotice(result.error || result.success || '')
      if (!result.error) {
        setSelected([])
        router.refresh()
      }
    } catch {
      setNotice('Status belum pasti. Muat ulang sebelum mencoba lagi.')
    } finally {
      setBulkPending(false)
    }
  }

  const bulkStatus = (active: boolean) => bulk(active, null)
  const bulkCategory = () => {
    const next = window.prompt('Masukkan kategori baru')
    if (next?.trim()) void bulk(null, next.trim())
  }

  const openNew = () =>
    setEditor({
      id: crypto.randomUUID(),
      name: '',
      category: '',
      price: 0,
      stock: 0,
      unit: '',
      minStock: 0,
      sku: '',
      barcode: '',
      active: true,
      revision: 0,
      stockRevision: 0,
    })

  return (
    <div className="w-full">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-[#a4a7ac]">
            <span>{businessName}</span>
            <span className="text-white/30">›</span>
            <span className="font-medium text-[#24cbc5]">Produk</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Manajemen produk</h1>
          <p className="mt-1 text-xs text-[#c5cbd5] sm:text-sm">Kelola katalog, harga, dan produk yang tampil di kasir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-[#273242] px-4 py-2.5 text-xs font-normal text-[#c5cbd5] transition hover:bg-[#303640] hover:text-white sm:text-sm"
          >
            <Download className="size-4" /> Ekspor produk
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1835d9] px-4 py-2.5 text-xs font-normal text-white shadow-xs transition hover:bg-[#132c9e] active:scale-95 sm:text-sm"
          >
            <Plus className="size-4" /> Tambah produk
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-[#273242] px-5 py-3.5 text-sm shadow-xs">
        <span><strong className="text-white">{products.length}</strong> total produk</span>
        <span className="text-[#24cbc5]"><strong>{activeCount}</strong> aktif</span>
        <span className="text-[#a4a7ac]"><strong>{products.length - activeCount}</strong> nonaktif</span>
        <span className="ml-auto text-xs text-[#a4a7ac]">
          {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(renderedAt))}
        </span>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#24cbc5]/30 bg-[#24cbc5]/10 px-4 py-3 text-sm text-[#24cbc5]">
          {notice}
          <button type="button" onClick={() => setNotice('')} aria-label="Tutup notifikasi">
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-border bg-[#273242] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#a4a7ac]" />
            <input
              aria-label="Cari nama produk, SKU, atau barcode"
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Cari nama produk, SKU, atau barcode"
              className="w-full rounded-xl border border-border bg-[#1c222e]/70 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-[#24cbc5]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <CustomSelect
              value={filterCategory}
              options={categories}
              onChange={val => {
                setFilterCategory(val)
                setPage(1)
              }}
              align="right"
              ariaLabel="Filter semua kategori"
              className="min-w-[140px]"
            />
            <CustomSelect
              value={filterStatus}
              options={['Semua status', 'Aktif', 'Nonaktif']}
              onChange={val => {
                setFilterStatus(val)
                setPage(1)
              }}
              align="right"
              ariaLabel="Filter semua status"
              className="min-w-[140px]"
            />
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-[#24cbc5]/10 px-4 py-3 text-sm text-[#24cbc5]">
            <strong>{selected.length} dipilih</strong>
            <button
              type="button"
              onClick={bulkCategory}
              className="rounded-lg border border-[#24cbc5]/30 bg-[#273242] px-3 py-1.5 font-normal text-white"
            >
              Ubah kategori
            </button>
            <button
              type="button"
              onClick={() => bulkStatus(false)}
              className="rounded-lg border border-[#24cbc5]/30 bg-[#273242] px-3 py-1.5 font-normal text-white"
            >
              Nonaktifkan produk
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="ml-auto font-normal text-white hover:underline"
            >
              Batalkan pilihan
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-b-2xl">
          <table className="mobile-record-table w-full min-w-[980px] text-left text-sm">
            <thead className="mobile-selection-header border-b border-border bg-[#1c222e] text-xs text-[#a4a7ac]">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedAll}
                    onChange={e => setSelected(e.target.checked ? filtered.map(p => p.id) : [])}
                    aria-label="Pilih semua produk"
                  />
                </th>
                <th className="px-4 py-3">Produk / SKU / barcode</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Harga jual</th>
                <th className="px-4 py-3">Stok fisik</th>
                <th className="px-4 py-3">Ketersediaan</th>
                <th className="px-4 py-3">Status produk</th>
                <th className="px-4 py-3">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice((page - 1) * 50, page * 50).map(product => (
                <tr key={product.id} className="border-b border-border/60 transition hover:bg-[#1c222e]/40">
                  <td data-label="Pilih produk" className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(product.id)}
                      onChange={e =>
                        setSelected(e.target.checked ? [...selected, product.id] : selected.filter(id => id !== product.id))
                      }
                      aria-label={`Pilih ${product.name}`}
                    />
                  </td>
                  <td data-label="Produk / SKU" data-primary="" className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#24cbc5]/20 bg-[#24cbc5]/10 text-[#24cbc5]">
                        <ProductThumbnail src={product.image} />
                      </div>
                      <div>
                        <p className="font-normal text-white">{product.name}</p>
                        <p className="text-xs text-[#a4a7ac]">
                          SKU {product.sku || '-'} · {product.barcode || 'Tanpa barcode'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Kategori" className="px-4 py-3 text-[#c5cbd5]">{product.category || '-'}</td>
                  <td data-label="Harga jual" className="px-4 py-3 font-medium text-white">{money(product.price)}</td>
                  <td data-label="Stok fisik" className="px-4 py-3">
                    {formatQuantity(product.stock)} {product.unit}
                  </td>
                  <td data-label="Ketersediaan" className="px-4 py-3">
                    {product.stock === 0 ? (
                      <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-xs font-normal text-red-400">
                        Habis
                      </span>
                    ) : product.stock <= product.minStock ? (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-normal text-amber-400">
                        Menipis
                      </span>
                    ) : (
                      <span className="rounded-full border border-[#24cbc5]/30 bg-[#24cbc5]/15 px-2.5 py-0.5 text-xs font-normal text-[#24cbc5]">
                        Tersedia
                      </span>
                    )}
                  </td>
                  <td data-label="Status produk" className="px-4 py-3">
                    {product.active ? (
                      <span className="rounded-full bg-[#24cbc5]/15 px-2.5 py-0.5 text-xs font-normal text-[#24cbc5]">
                        Aktif
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#303640] px-2.5 py-0.5 text-xs font-normal text-[#a4a7ac]">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td data-label="Tindakan" data-actions="" className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditor(product)}
                      className="font-normal text-[#24cbc5] hover:underline"
                    >
                      Ubah
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 text-xs text-[#a4a7ac] sm:flex-row sm:items-center sm:justify-between">
          <span>
            Menampilkan {filtered.length} dari {products.length} produk
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-white transition hover:bg-[#303640] disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="rounded-lg bg-[#1835d9] px-3 py-1.5 font-normal text-white">{page}</span>
            <button
              type="button"
              disabled={page * 50 >= filtered.length}
              onClick={() => setPage(p => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-white transition hover:bg-[#303640] disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>

      {/* Modal Box Tambah / Ubah Produk */}
      {editor !== false && (
        <ProductEditor
          key={editor?.id}
          product={editor}
          availableCategories={availableCategories}
          availableUnits={availableUnits}
          fileRef={fileRef}
          onCancel={() => setEditor(false)}
          onSave={async (p, file, key, imageAction) => {
            const data = new FormData()
            data.set('id', p.id)
            data.set('request', key)
            data.set('revision', products.some(x => x.id === p.id) ? String(p.revision) : '')
            data.set(
              'details',
              JSON.stringify({
                name: p.name,
                category: p.category,
                unit: p.unit,
                sku: p.sku,
                barcode: p.barcode,
                price: p.price,
                discountKind: p.discountKind || 'none',
                discountValue: p.discountValue || 0,
                minimum: p.minStock,
                initialStock: products.some(x => x.id === p.id) ? 0 : p.stock,
                active: p.active,
              })
            )
            data.set('imageAction', imageAction)
            if (file) data.set('image', file)
            const result = await saveCatalogProduct(data)
            if (!result.error && result.product) {
              const saved = result.product
              setProducts(items => [saved, ...items.filter(x => x.id !== p.id)])
              setCustomCategories(prev => {
                const lower = saved.category.trim().toLowerCase()
                if (!prev.some(c => c.toLowerCase() === lower) && !productCategories.some(c => c.toLowerCase() === lower)) {
                  return [...prev, saved.category.trim()]
                }
                return prev
              })
              setCustomUnits(prev => {
                const lower = saved.unit.trim().toLowerCase()
                if (!prev.some(u => u.toLowerCase() === lower) && !defaultProductUnits.some(u => u.toLowerCase() === lower)) {
                  return [...prev, saved.unit.trim()]
                }
                return prev
              })
              setEditor(false)
              setNotice([result.success, result.warning].filter(Boolean).join(' '))
              router.refresh()
            }
            return result
          }}
        />
      )}
    </div>
  )
}

function ProductEditor({
  product,
  availableCategories,
  availableUnits,
  fileRef,
  onCancel,
  onSave,
}: {
  product: Product | null
  availableCategories: string[]
  availableUnits: string[]
  fileRef: React.RefObject<HTMLInputElement | null>
  onCancel: () => void
  onSave: (product: Product, file: File | null, key: string, imageAction: string) => Promise<CatalogResult>
}) {
  const isNew = !product?.name
  const [draft, setDraft] = useState(product!)
  const [priceText, setPriceText] = useState(product?.name ? String(product.price) : '')
  const [stockText, setStockText] = useState(product?.name ? String(product.stock) : '')
  const [minimumText, setMinimumText] = useState(product?.name ? String(product.minStock) : '')
  const [discountKind, setDiscountKind] = useState(product?.discountKind || 'none')
  const [discountText, setDiscountText] = useState(product?.discountValue ? String(product.discountValue) : '')

  // Category selection
  const initialCategoryMatched = useMemo(() => {
    if (!product?.category) return ''
    const match = availableCategories.find(c => c.toLowerCase() === product.category.trim().toLowerCase())
    return match || product.category.trim()
  }, [product?.category, availableCategories])

  const [selectedCategory, setSelectedCategory] = useState<string>(() => (isNew ? '' : initialCategoryMatched))
  const [customCategory, setCustomCategory] = useState<boolean>(false)
  const [customCategoryText, setCustomCategoryText] = useState<string>('')

  // Unit selection
  const initialUnitMatched = useMemo(() => {
    if (!product?.unit) return 'pcs'
    const match = availableUnits.find(u => u.toLowerCase() === product.unit.trim().toLowerCase())
    return match || product.unit.trim()
  }, [product?.unit, availableUnits])

  const [selectedUnit, setSelectedUnit] = useState<string>(() => (isNew ? 'pcs' : initialUnitMatched))
  const [customUnit, setCustomUnit] = useState<boolean>(false)
  const [customUnitText, setCustomUnitText] = useState<string>('')

  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [imageAction, setImageAction] = useState('keep')
  const [operationId] = useState(() => crypto.randomUUID())
  const dialogRef = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  let discountPreview: number | null = null
  try { if (priceText && discountText) discountPreview = discountedPrice({ price: Number(priceText), discountKind, discountValue: Number(discountText) }) } catch {}
  const update = (key: keyof Product, value: string | number | boolean) =>
    setDraft(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    dialog?.querySelector<HTMLInputElement>('input:not([type="file"])')?.focus()
    return () => {
      dialog?.close()
      document.body.style.overflow = prevOverflow
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  const removeImage = () => {
    update('image', '')
    setFile(null)
    setImageAction('remove')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = (fileInput?: File) => {
    if (!fileInput) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(fileInput.type) || fileInput.size > 2 * 1024 * 1024) {
      return setError('Gunakan PNG/JPG/WebP maksimal 2 MB.')
    }
    setFile(fileInput)
    setImageAction('replace')
    setError('')
    const reader = new FileReader()
    reader.onload = () => update('image', String(reader.result))
    reader.readAsDataURL(fileInput)
  }

  const save = async () => {
    if (saving.current) return
    const rawCat = customCategory ? customCategoryText.trim() : selectedCategory.trim()
    const matchedCat = availableCategories.find(c => c.toLowerCase() === rawCat.toLowerCase()) || rawCat

    let finalUnit = draft.unit.trim()
    if (isNew) {
      const rawUnit = customUnit ? customUnitText.trim() : selectedUnit.trim()
      const matchedU = availableUnits.find(u => u.toLowerCase() === rawUnit.toLowerCase()) || rawUnit
      finalUnit = matchedU
    }

    if (!draft.name.trim() || !matchedCat || !finalUnit) {
      return setError('Nama, kategori, dan unit stok wajib diisi.')
    }
    if (!priceText.trim()) return setError('Harga jual wajib diisi. Isi 0 jika harganya nol.')
    if (!minimumText.trim()) return setError('Minimum stok wajib diisi. Isi 0 jika tidak ada batas minimum.')
    if (discountKind !== 'none' && !discountText.trim()) return setError('Isi nilai diskon produk.')
    const parsed = productSchema.safeParse({
      name: draft.name,
      category: matchedCat,
      unit: finalUnit,
      sku: draft.sku,
      barcode: draft.barcode,
      price: priceText,
      minimum: minimumText,
      initialStock: isNew ? stockText || '0' : '0',
      active: draft.active,
      discountKind,
      discountValue: discountKind === 'none' ? 0 : discountText,
    })
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    saving.current = true
    setPending(true)
    setError('')
    try {
      const result = await onSave(
        {
          ...draft,
          category: matchedCat,
          unit: finalUnit,
          price: Number(parsed.data.price),
          minStock: Number(parsed.data.minimum),
          stock: isNew ? Number(parsed.data.initialStock) : draft.stock,
          discountKind: parsed.data.discountKind,
          discountValue: parsed.data.discountValue,
        },
        file,
        operationId,
        imageAction
      )
      if (result.error) setError(result.error)
    } catch {
      setError('Status penyimpanan belum pasti. Muat ulang untuk memeriksa.')
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-busy={pending}
      aria-labelledby="product-editor-title"
      className="fixed inset-0 m-0 max-h-none max-w-none h-dvh w-screen border-0 flex items-center justify-center bg-transparent text-white p-4 sm:p-6 backdrop:bg-black/75 backdrop:backdrop-blur-sm animate-in fade-in duration-200"
      onCancel={event => { event.preventDefault(); if (!saving.current) onCancel() }}
      onKeyDown={event => {
        const dialog=dialogRef.current
        if(event.key==='Escape'&&dialog?.querySelector('[role="listbox"]'))event.preventDefault()
        if(event.key!=='Tab'||!dialog)return
        const items=Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"]')).filter(el=>!el.matches(':disabled')&&el.getClientRects().length>0)
        const first=items[0],last=items[items.length-1]
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }}
      onClick={event => { if (event.target === event.currentTarget && !saving.current) onCancel() }}
    >
      <div
        className="relative my-auto flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-border bg-[#273242] text-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 sm:px-8">
          <div>
            <h2 id="product-editor-title" className="text-xl font-medium text-white">
              {isNew ? 'Tambah produk' : 'Ubah produk'}
            </h2>
            <p className="mt-1 text-xs text-[#a4a7ac] sm:text-sm">
              Lengkapi informasi katalog dan pengaturan penjualan.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            aria-label="Tutup editor"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-[#a4a7ac] transition hover:bg-[#303640] hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="min-h-0 overflow-y-auto px-6 py-6 sm:px-8">
          <fieldset disabled={pending} className="contents">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h3 className="font-normal text-white">Informasi produk</h3>

              <div className="relative flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-[#24cbc5]/40 bg-[#24cbc5]/10 p-4">
                {draft.image ? (
                  <>
                    <img src={draft.image} alt="Preview produk" className="size-20 rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={removeImage}
                      aria-label="Hapus gambar produk"
                      className="absolute right-3 top-3 grid size-7 place-items-center rounded-full border border-border bg-[#273242] text-[#a4a7ac] transition hover:text-[#ffb4ae]"
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-[#a4a7ac]">Unggah gambar produk</p>
                )}
                <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-[#24cbc5]/40 bg-[#273242] px-3.5 py-2 text-xs font-normal text-[#24cbc5] transition hover:bg-[#24cbc5]/15">
                  Pilih gambar
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Pilih gambar produk"
                    onChange={e => handleFile(e.target.files?.[0])}
                    className="sr-only"
                  />
                </label>
              </div>

              <label className="text-sm font-medium text-white">
                Nama produk *
                <input
                  value={draft.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="Contoh: Kopi Susu Aren"
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </label>

              {/* Kategori Dropdown & Custom Input */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white">
                    Kategori *
                  </label>
                  <div className="mt-1.5">
                    <CustomSelect
                      value={customCategory ? 'Lainnya' : selectedCategory}
                      options={[
                        { value: '', label: 'Pilih kategori', disabled: true },
                        ...availableCategories.map(value => ({ value, label: value })),
                        { value: 'Lainnya', label: 'Lainnya' },
                      ]}
                      onChange={val => {
                        const isOther = val === 'Lainnya'
                        setCustomCategory(isOther)
                        if (!isOther) {
                          setSelectedCategory(val)
                          update('category', val)
                        } else {
                          update('category', customCategoryText)
                        }
                      }}
                      placeholder="Pilih kategori"
                      ariaLabel="Kategori *"
                      className="w-full"
                    />
                  </div>
                </div>
                {customCategory && (
                  <div className="pt-1">
                    <label className="block text-sm font-medium text-white">
                      Kategori lainnya *
                      <input
                        maxLength={100}
                        value={customCategoryText}
                        onChange={e => {
                          setCustomCategoryText(e.target.value)
                          update('category', e.target.value)
                        }}
                        placeholder="Masukkan nama kategori baru"
                        className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Unit Stok Dropdown & Custom Input */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white">
                    Unit stok *
                  </label>
                  <div className="mt-1.5">
                    {isNew ? (
                      <CustomSelect
                        value={customUnit ? 'Lainnya' : selectedUnit}
                        options={[
                          { value: '', label: 'Pilih unit stok', disabled: true },
                          ...availableUnits.map(value => ({ value, label: value })),
                          { value: 'Lainnya', label: 'Lainnya' },
                        ]}
                        onChange={val => {
                          const isOther = val === 'Lainnya'
                          setCustomUnit(isOther)
                          if (!isOther) {
                            setSelectedUnit(val)
                            update('unit', val)
                          } else {
                            update('unit', customUnitText)
                          }
                        }}
                        placeholder="Pilih unit stok"
                        ariaLabel="Unit stok *"
                        className="w-full"
                      />
                    ) : (
                      <CustomSelect
                        value={draft.unit}
                        disabled={true}
                        options={[{ value: draft.unit, label: draft.unit }]}
                        onChange={() => {}}
                        ariaLabel="Unit stok (satuan tetap setelah produk dibuat)"
                        className="w-full opacity-60"
                      />
                    )}
                  </div>
                  {!isNew && (
                    <p className="mt-1 text-xs text-[#a4a7ac]">Satuan tetap setelah produk dibuat.</p>
                  )}
                </div>
                {isNew && customUnit && (
                  <div className="pt-1">
                    <label className="block text-sm font-medium text-white">
                      Unit stok lainnya *
                      <input
                        maxLength={30}
                        value={customUnitText}
                        onChange={e => {
                          setCustomUnitText(e.target.value)
                          update('unit', e.target.value)
                        }}
                        placeholder="Masukkan nama unit baru (mis. gram, meter, dus)"
                        className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div>
                <div>
                  <label className="text-sm font-medium text-white">
                    SKU
                    <input
                      aria-label="SKU"
                      aria-describedby="product-sku-help"
                      maxLength={64}
                      placeholder={isNew ? `${productSkuPrefix(customCategory ? customCategoryText.trim() : selectedCategory, draft.name)}001` : product?.sku}
                      value={draft.sku}
                      onChange={e => update('sku', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                    />
                  </label>
                  <p id="product-sku-help" className="mt-1 text-xs text-[#a4a7ac]">
                    {isNew
                      ? 'Kosongkan untuk SKU otomatis. Nomor ditetapkan saat disimpan; dapat diisi sendiri.'
                      : 'Kosongkan untuk mempertahankan SKU saat ini.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-normal text-white">Harga & pengaturan penjualan</h3>

              <label className="text-sm font-medium text-white">
                Harga jual *
                <input
                  type="number"
                  min="0"
                  placeholder="Contoh: 15000"
                  value={priceText}
                  onChange={e => setPriceText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </label>

              <div className="space-y-3 rounded-xl border border-border p-3.5">
                <label className="flex min-h-11 items-center gap-3 text-sm text-white">
                  <input type="checkbox" checked={discountKind !== 'none'} onChange={e => setDiscountKind(e.target.checked ? 'percent' : 'none')} className="rounded-full cursor-pointer" />
                  Diskon produk
                </label>
                {discountKind !== 'none' && <>
                  <label className="block text-sm text-white">Jenis diskon
                    <CustomSelect ariaLabel="Jenis diskon produk" value={discountKind} options={[{label:'Persen (%)',value:'percent'},{label:'Rupiah (Rp)',value:'amount'}]} onChange={value=>{setDiscountKind(value as 'percent'|'amount');setDiscountText('')}} className="mt-1.5 w-full" />
                  </label>
                  <label className="block text-sm text-white">Nilai diskon {discountKind === 'percent' ? '(%)' : '(Rp)'}
                    <input aria-label="Nilai diskon produk" type="number" min="0" max={discountKind === 'percent' ? 100 : Number(priceText) || 0} step={discountKind === 'percent' ? '0.01' : '1'} placeholder={discountKind === 'percent' ? 'Contoh: 10' : 'Contoh: 1000'} value={discountText} onChange={e=>setDiscountText(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]" />
                  </label>
                  {discountPreview !== null && <p className="text-sm text-[#24cbc5]">Harga setelah diskon: {money(discountPreview)} / {draft.unit || 'unit'}</p>}
                  <p className="text-xs text-[#a4a7ac]">Potongan berlaku per unit; harga dibulatkan ke rupiah terdekat.</p>
                </>}
              </div>

              <label className="text-sm font-medium text-white">
                Stok fisik
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  disabled={!isNew}
                  title="Ubah stok melalui inventori dengan alasan"
                  placeholder="Contoh: 10"
                  value={stockText}
                  onChange={e => setStockText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5] disabled:opacity-50"
                />
              </label>

              <label className="text-sm font-medium text-white">
                Minimum stok *
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Contoh: 5"
                  value={minimumText}
                  onChange={e => setMinimumText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </label>

              <label className="text-sm font-medium text-white">
                Status produk
                <CustomSelect
                  value={draft.active ? 'Aktif' : 'Nonaktif'}
                  options={['Aktif', 'Nonaktif']}
                  onChange={val => update('active', val === 'Aktif')}
                  ariaLabel="Status produk"
                  className="mt-1.5 w-full"
                />
              </label>

              <div className="rounded-2xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-4 text-sm text-[#24cbc5]">
                {draft.active
                  ? 'Produk aktif dan tersedia untuk ditampilkan di kasir.'
                  : 'Produk nonaktif tidak muncul di kasir, tetapi riwayat transaksi dan stok fisiknya tetap dipertahankan.'}
              </div>
            </div>
          </div>

          {error && <p role="alert" className="mt-5 rounded-xl bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}</p>}
          </fieldset>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-normal text-white transition hover:bg-[#303640]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-xl bg-[#1835d9] px-5 py-2.5 text-sm font-normal text-white shadow-xs transition hover:bg-[#132c9e] disabled:opacity-50"
          >
            {pending ? 'Menyimpan...' : isNew ? 'Simpan produk' : 'Simpan perubahan'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

function ProductThumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState('')
  return src && failed !== src ? (
    <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
  ) : (
    <Package className="size-4" />
  )
}
