'use client'

import { productSkuPrefix } from '@/lib/product-sku'
import { saveCatalogProduct, bulkCatalogProducts } from '@/app/catalog-actions'
import { productCategories, formatQuantity, type CatalogProduct, type CatalogResult } from '@/lib/catalog'
import type { Role } from '@/lib/auth/permissions'
import type { Business } from '@/lib/validation'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Download, Package, Plus, Search, X } from 'lucide-react'

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
      unit: 'pcs',
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
            <FilterDropdown
              value={filterCategory}
              options={categories}
              onChange={val => {
                setFilterCategory(val)
                setPage(1)
              }}
              ariaLabel="Filter semua kategori"
            />
            <FilterDropdown
              value={filterStatus}
              options={['Semua status', 'Aktif', 'Nonaktif']}
              onChange={val => {
                setFilterStatus(val)
                setPage(1)
              }}
              ariaLabel="Filter semua status"
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

function FilterDropdown({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: string[]
  onChange: (val: string) => void
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel || value}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex min-w-[140px] items-center justify-between gap-2.5 rounded-xl border border-border bg-[#273242] px-3.5 py-2.5 text-sm text-white transition hover:bg-[#303640] outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20"
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#a4a7ac] transition-transform duration-200 ${
            open ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-40 mt-2 max-h-60 w-max min-w-full overflow-y-auto rounded-2xl border border-border bg-[#273242] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-150"
        >
          {options.map(opt => {
            const isSelected = opt === value
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-[#1835d9] font-medium text-white shadow-xs'
                    : 'text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
                }`}
              >
                <span>{opt}</span>
                {isSelected && <span className="size-1.5 shrink-0 rounded-full bg-white" />}
              </button>
            )
          })}
        </div>
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
  const [draft, setDraft] = useState(product!)
  const [customCategory, setCustomCategory] = useState(
    Boolean(product?.category && !productCategories.includes(product.category))
  )
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [imageAction, setImageAction] = useState('keep')
  const [operationId] = useState(() => crypto.randomUUID())

  const isNew = !product?.name
  const update = (key: keyof Product, value: string | number | boolean) =>
    setDraft(prev => ({ ...prev, [key]: value }))

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
    if (pending) return
    if (!draft.name.trim() || !draft.category.trim() || !draft.unit.trim()) {
      return setError('Nama, kategori, dan unit stok wajib diisi.')
    }
    setPending(true)
    setError('')
    try {
      const result = await onSave(draft, file, operationId, imageAction)
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

              <div className="space-y-3">
                <label className="text-sm font-medium text-white">
                  Kategori *
                  <select
                    aria-label="Kategori *"
                    value={customCategory ? 'Lainnya' : draft.category}
                    onChange={e => {
                      const custom = e.target.value === 'Lainnya'
                      setCustomCategory(custom)
                      update('category', custom ? '' : e.target.value)
                    }}
                    className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                  >
                    <option value="" disabled>
                      Pilih kategori
                    </option>
                    {productCategories.map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </label>
                {customCategory && (
                  <label className="block text-sm font-medium text-white">
                    Kategori lainnya *
                    <input
                      maxLength={100}
                      value={draft.category}
                      onChange={e => update('category', e.target.value)}
                      placeholder="Masukkan nama kategori"
                      className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                    />
                  </label>
                )}
              </div>

              <label className="text-sm font-medium text-white">
                Unit stok *
                <input
                  value={draft.unit}
                  disabled={!isNew}
                  title="Satuan tetap setelah produk dibuat"
                  onChange={e => update('unit', e.target.value)}
                  placeholder="pcs, porsi, kg, botol..."
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5] disabled:opacity-50"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-white">
                    SKU
                    <input
                      aria-label="SKU"
                      aria-describedby="product-sku-help"
                      maxLength={64}
                      placeholder={isNew ? `${productSkuPrefix(draft.category, draft.name)}001` : product?.sku}
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
                <label className="text-sm font-medium text-white">
                  Barcode
                  <input
                    value={draft.barcode}
                    onChange={e => update('barcode', e.target.value)}
                    placeholder="Contoh: 89912345678"
                    className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-normal text-white">Harga & pengaturan penjualan</h3>

              <label className="text-sm font-medium text-white">
                Harga jual *
                <input
                  type="number"
                  min="0"
                  value={draft.price}
                  onChange={e => update('price', Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </label>

              <label className="text-sm font-medium text-white">
                Stok fisik
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  disabled={!isNew}
                  title="Ubah stok melalui inventori dengan alasan"
                  value={draft.stock}
                  onChange={e => update('stock', Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5] disabled:opacity-50"
                />
              </label>

              <label className="text-sm font-medium text-white">
                Minimum stok *
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={draft.minStock}
                  onChange={e => update('minStock', Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                />
              </label>

              <label className="text-sm font-medium text-white">
                Status produk
                <select
                  value={draft.active ? 'Aktif' : 'Nonaktif'}
                  onChange={e => update('active', e.target.value === 'Aktif')}
                  className="mt-1.5 w-full rounded-xl border border-border bg-[#1c222e]/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#24cbc5]"
                >
                  <option>Aktif</option>
                  <option>Nonaktif</option>
                </select>
              </label>

              <div className="rounded-2xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-4 text-sm text-[#24cbc5]">
                {draft.active
                  ? 'Produk aktif dan tersedia untuk ditampilkan di kasir.'
                  : 'Produk nonaktif tidak muncul di kasir, tetapi riwayat transaksi dan stok fisiknya tetap dipertahankan.'}
              </div>
            </div>
          </div>

          {error && <p className="mt-5 rounded-xl bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}</p>}
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
