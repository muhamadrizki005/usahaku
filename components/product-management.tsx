'use client'

import { productSkuPrefix } from '@/lib/product-sku'
import { saveCatalogProduct, bulkCatalogProducts } from '@/app/catalog-actions'
import { productCategories, productSchema, formatQuantity, type CatalogProduct, type CatalogResult } from '@/lib/catalog'
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
}: {
  role: Role
  initialCategory?: Category
  business: Business
  initialProducts: Product[]
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('Semua kategori')
  const [filterStatus, setFilterStatus] = useState('Semua status')
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<Product | null | false>(false)
  const [notice, setNotice] = useState('')
  const [bulkPending, setBulkPending] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => setProducts(initialProducts), [initialProducts])

  const businessName = business.name
  const categories = ['Semua kategori', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))]

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
          {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date())}
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
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border bg-[#1c222e] text-xs text-[#a4a7ac]">
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
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(product.id)}
                      onChange={e =>
                        setSelected(e.target.checked ? [...selected, product.id] : selected.filter(id => id !== product.id))
                      }
                      aria-label={`Pilih ${product.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-[#c5cbd5]">{product.category || '-'}</td>
                  <td className="px-4 py-3 font-medium text-white">{money(product.price)}</td>
                  <td className="px-4 py-3">
                    {formatQuantity(product.stock)} {product.unit}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
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
                minimum: p.minStock,
                initialStock: products.some(x => x.id === p.id) ? 0 : p.stock,
                active: p.active,
              })
            )
            data.set('imageAction', imageAction)
            if (file) data.set('image', file)
            const result = await saveCatalogProduct(data)
            if (!result.error && result.product) {
              setProducts(items => [result.product!, ...items.filter(x => x.id !== p.id)])
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
  fileRef,
  onCancel,
  onSave,
}: {
  product: Product | null
  fileRef: React.RefObject<HTMLInputElement | null>
  onCancel: () => void
  onSave: (product: Product, file: File | null, key: string, imageAction: string) => Promise<CatalogResult>
}) {
  const isNew = !product?.name

  const [name, setName] = useState(() => product?.name || '')
  const [category, setCategory] = useState(() => product?.category || '')
  const [customCategory, setCustomCategory] = useState(
    Boolean(product?.category && !productCategories.includes(product.category))
  )
  const [customCategoryText, setCustomCategoryText] = useState(
    Boolean(product?.category && !productCategories.includes(product.category)) ? (product?.category || '') : ''
  )
  const [unit, setUnit] = useState(() => product?.unit || '')
  const [sku, setSku] = useState(() => product?.sku || '')

  const [price, setPrice] = useState(() => (!isNew && product?.price !== undefined ? String(product.price) : ''))
  const [stock, setStock] = useState(() => (!isNew && product?.stock !== undefined ? String(product.stock) : ''))
  const [minStock, setMinStock] = useState(() => (!isNew && product?.minStock !== undefined ? String(product.minStock) : ''))
  const [active, setActive] = useState(() => product?.active ?? true)
  const [image, setImage] = useState(() => product?.image || '')

  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [imageAction, setImageAction] = useState('keep')
  const [operationId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onCancel])

  const removeImage = () => {
    setImage('')
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
    reader.onload = () => setImage(String(reader.result))
    reader.readAsDataURL(fileInput)
  }

  const resolvedCategory = (customCategory ? customCategoryText : category).trim()

  const save = async () => {
    if (pending) return

    const trimmedName = name.trim()
    const trimmedUnit = unit.trim()

    if (!trimmedName || !resolvedCategory || !trimmedUnit) {
      return setError('Nama, kategori, dan unit stok wajib diisi.')
    }

    if (!price.trim()) {
      return setError('Harga jual wajib diisi.')
    }
    const cleanPrice = price.trim()
    if (!/^(0|[1-9]\d{0,11})$/.test(cleanPrice)) {
      return setError('Harga harus rupiah bulat, 0–999.999.999.999.')
    }

    const cleanMinStock = minStock.trim().replace(',', '.')
    if (!cleanMinStock) {
      return setError('Minimum stok wajib diisi.')
    }
    if (!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(cleanMinStock)) {
      return setError('Minimum stok harus angka dengan maksimal 3 desimal.')
    }

    let cleanStock = '0'
    if (isNew) {
      if (stock.trim()) {
        const rawStock = stock.trim().replace(',', '.')
        if (!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(rawStock)) {
          return setError('Stok fisik harus angka dengan maksimal 3 desimal.')
        }
        cleanStock = rawStock
      }
    } else {
      cleanStock = String(product?.stock ?? 0)
    }

    const parsed = productSchema.safeParse({ name: trimmedName, category: resolvedCategory, unit: trimmedUnit, sku: sku.trim(), barcode: product?.barcode || '', price: cleanPrice, minimum: cleanMinStock, initialStock: isNew ? cleanStock : '0', active })
    if (!parsed.success) return setError(parsed.error.issues[0].message)

    setPending(true)
    setError('')
    try {
      const payload: Product = {
        id: product?.id || crypto.randomUUID(),
        name: trimmedName,
        category: resolvedCategory,
        unit: trimmedUnit,
        sku: sku.trim(),
        barcode: product?.barcode || '',
        price: Number(cleanPrice),
        stock: Number(cleanStock),
        minStock: Number(cleanMinStock),
        active,
        revision: product?.revision ?? 0,
        stockRevision: product?.stockRevision ?? 0,
        image,
      }
      const result = await onSave(payload, file, operationId, imageAction)
      if (result.error) setError(result.error)
    } catch {
      setError('Status penyimpanan belum pasti. Muat ulang untuk memeriksa.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
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
            onClick={onCancel}
            aria-label="Tutup editor"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-[#a4a7ac] transition hover:bg-[#303640] hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto px-6 py-6 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h3 className="font-normal text-white">Informasi produk</h3>

              <div className="relative flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-[#24cbc5]/40 bg-[#24cbc5]/10 p-4">
                {image ? (
                  <>
                    <img src={image} alt="Preview produk" className="size-20 rounded-xl object-cover" />
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

              <div>
                <label className="text-sm font-medium text-white" htmlFor="product-name-input">
                  Nama produk *
                </label>
                <input
                  id="product-name-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Contoh: Kopi Susu Aren"
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-white" id="product-category-label">
                    Kategori *
                  </label>
                  <CustomSelect
                    value={customCategory ? 'Lainnya' : category}
                    options={[
                      { value: '', label: 'Pilih kategori', disabled: true },
                      ...productCategories.map(value => ({ value, label: value })),
                      { value: 'Lainnya', label: 'Lainnya' },
                    ]}
                    onChange={val => {
                      const isCustom = val === 'Lainnya'
                      setCustomCategory(isCustom)
                      if (!isCustom) {
                        setCategory(val)
                        setCustomCategoryText('')
                      }
                    }}
                    placeholder="Pilih kategori"
                    ariaLabel="Kategori *"
                    className="mt-1.5 w-full"
                  />
                </div>
                {customCategory && (
                  <div>
                    <label className="block text-sm font-medium text-white" htmlFor="custom-category-input">
                      Kategori lainnya *
                    </label>
                    <input
                      id="custom-category-input"
                      maxLength={100}
                      value={customCategoryText}
                      onChange={e => setCustomCategoryText(e.target.value)}
                      placeholder="Masukkan nama kategori"
                      className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-white" htmlFor="product-unit-input">
                  Unit stok *
                </label>
                <input
                  id="product-unit-input"
                  value={unit}
                  disabled={!isNew}
                  title={isNew ? undefined : 'Satuan tetap setelah produk dibuat'}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="pcs/porsi/kg/botol/..."
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white" htmlFor="product-sku-input">
                  SKU
                </label>
                <input
                  id="product-sku-input"
                  aria-label="SKU"
                  aria-describedby="product-sku-help"
                  maxLength={64}
                  placeholder={isNew ? `${productSkuPrefix(resolvedCategory, name)}001` : product?.sku}
                  value={sku}
                  onChange={e => setSku(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
                <p id="product-sku-help" className="mt-1 text-xs text-[#a4a7ac]">
                  {isNew
                    ? 'Kosongkan untuk SKU otomatis. Nomor ditetapkan saat disimpan; dapat diisi sendiri.'
                    : 'Kosongkan untuk mempertahankan SKU saat ini.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-normal text-white">Harga & pengaturan penjualan</h3>

              <div>
                <label className="text-sm font-medium text-white" htmlFor="product-price-input">
                  Harga jual *
                </label>
                <input
                  id="product-price-input"
                  type="text"
                  inputMode="numeric"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="Contoh: 15000"
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white" htmlFor="product-stock-input">
                  Stok fisik
                </label>
                <input
                  id="product-stock-input"
                  type="text"
                  inputMode="decimal"
                  disabled={!isNew}
                  title={isNew ? undefined : 'Ubah stok melalui inventori dengan alasan'}
                  value={stock}
                  onChange={e => setStock(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white" htmlFor="product-minstock-input">
                  Minimum stok *
                </label>
                <input
                  id="product-minstock-input"
                  type="text"
                  inputMode="decimal"
                  value={minStock}
                  onChange={e => setMinStock(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white" id="product-status-label">
                  Status produk
                </label>
                <CustomSelect
                  value={active ? 'Aktif' : 'Nonaktif'}
                  options={['Aktif', 'Nonaktif']}
                  onChange={val => setActive(val === 'Aktif')}
                  ariaLabel="Status produk"
                  className="mt-1.5 w-full"
                />
              </div>

              <div className="rounded-2xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-4 text-sm text-[#24cbc5]">
                {active
                  ? 'Produk aktif dan tersedia untuk ditampilkan di kasir.'
                  : 'Produk nonaktif tidak muncul di kasir, tetapi riwayat transaksi dan stok fisiknya tetap dipertahankan.'}
              </div>
            </div>
          </div>

          {error && <p role="alert" className="mt-5 rounded-xl bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          <button
            type="button"
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
    </div>
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
