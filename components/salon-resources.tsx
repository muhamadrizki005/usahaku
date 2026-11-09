'use client'
import { SelectInput } from '@/components/ui/select-input'
import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { saveSalonResource } from '@/app/salon-actions'
import { saveCatalogProduct } from '@/app/catalog-actions'
import { salonPractitionerSchema, salonServiceSchema, type SalonFoundation, type SalonPractitioner, type SalonService } from '@/lib/salon'
import { businessDays, defaultBusinessHours, describeHours, type BusinessHours } from '@/lib/business-profile'
import { rupiah } from '@/lib/pos'
import type { CatalogProduct } from '@/lib/catalog'
import { HoursEditor } from './business-hours'
import { RestaurantDialog as Dialog, RestaurantField as Field, restaurantButton as button, restaurantInput as input, restaurantPanel as panel, restaurantPrimary as primary } from './restaurant-forms'
import { Sparkles, Upload, Scissors, Package, Trash2, Plus, X, Tag } from 'lucide-react'
import { notify } from '@/lib/notifications'
import {
  DEFAULT_SALON_BENEFITS,
  type SalonDiscount,
  calculateDiscountedPrice,
  getServiceBenefits,
  saveServiceBenefits,
  getCustomBenefits,
  saveCustomBenefits,
  getServiceDiscount,
  saveServiceDiscount,
  getProductDiscount,
  saveProductDiscount,
  getProductDescription,
  saveProductDescription,
  getProductPhoto,
  saveProductPhoto,
  getProductCostPrice,
  saveProductCostPrice,
} from '@/lib/salon-benefits'

const EMPTY_PRODUCTS: CatalogProduct[] = []
const EMPTY_STRINGS: string[] = []

export function SalonResources({
  resource,
  data,
  canManage,
  initialProducts = EMPTY_PRODUCTS,
  initialCategories = EMPTY_STRINGS,
  initialUnits = EMPTY_STRINGS,
  defaultTab = 'service',
}: {
  resource: 'service' | 'practitioner'
  data: SalonFoundation
  canManage: boolean
  initialProducts?: CatalogProduct[]
  initialCategories?: string[]
  initialUnits?: string[]
  defaultTab?: 'service' | 'product'
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'service' | 'product'>(defaultTab)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<SalonService | SalonPractitioner | CatalogProduct | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<SalonService | SalonPractitioner | CatalogProduct | null>(null)
  const [deleting, setDeleting] = useState(false)

  const people = resource === 'practitioner'
  const isProductTab = !people && activeTab === 'product'
  const label = people ? 'penata/terapis' : isProductTab ? 'produk' : 'layanan'

  // Service benefits, photos and discounts state
  const [servicePhotos, setServicePhotos] = useState<Record<string, string>>({})
  const [serviceBenefits, setServiceBenefits] = useState<Record<string, string[]>>({})
  const [serviceDiscounts, setServiceDiscounts] = useState<Record<string, SalonDiscount | null>>({})

  // Products state
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts)
  const [productPhotos, setProductPhotos] = useState<Record<string, string>>({})
  const [productDiscounts, setProductDiscounts] = useState<Record<string, SalonDiscount | null>>({})
  const [productDescriptions, setProductDescriptions] = useState<Record<string, string>>({})

  const initialProductsKey = (initialProducts || EMPTY_PRODUCTS).map(p => p.id + ':' + p.revision).join(',')

  useEffect(() => {
    if (people) return
    setProducts(initialProducts || EMPTY_PRODUCTS)
  }, [people, initialProductsKey])

  const servicesKey = data.services.map(s => s.id + ':' + s.revision).join(',')
  const productsKey = products.map(p => p.id + ':' + p.revision).join(',')

  // Load service metadata
  useEffect(() => {
    if (typeof window === 'undefined' || people) return
    const loadServiceMeta = () => {
      const photos: Record<string, string> = {}
      const benefits: Record<string, string[]> = {}
      const discounts: Record<string, SalonDiscount | null> = {}

      data.services.forEach(s => {
        try {
          const p = localStorage.getItem('usahaku_service_photo_' + s.id)
          if (p) photos[s.id] = p
        } catch {}
        benefits[s.id] = getServiceBenefits(s.id)
        discounts[s.id] = getServiceDiscount(s.id, Number(s.price))
      })

      setServicePhotos(photos)
      setServiceBenefits(benefits)
      setServiceDiscounts(discounts)
    }

    loadServiceMeta()
    window.addEventListener('storage', loadServiceMeta)
    window.addEventListener('usahaku:service_benefits_changed', loadServiceMeta)
    window.addEventListener('usahaku:service_discount_changed', loadServiceMeta)
    return () => {
      window.removeEventListener('storage', loadServiceMeta)
      window.removeEventListener('usahaku:service_benefits_changed', loadServiceMeta)
      window.removeEventListener('usahaku:service_discount_changed', loadServiceMeta)
    }
  }, [people, servicesKey])

  // Load product metadata
  useEffect(() => {
    if (typeof window === 'undefined' || people) return
    const loadProductMeta = () => {
      const photos: Record<string, string> = {}
      const discounts: Record<string, SalonDiscount | null> = {}
      const descriptions: Record<string, string> = {}

      products.forEach(p => {
        photos[p.id] = getProductPhoto(p.id) || p.image || ''
        discounts[p.id] = getProductDiscount(p.id, p.price) || (p.discountKind && p.discountKind !== 'none' ? {
          enabled: true,
          kind: p.discountKind,
          value: p.discountValue || 0,
          basePrice: p.price,
          discountedPrice: calculateDiscountedPrice(p.price, p.discountKind, p.discountValue || 0),
        } : null)
        descriptions[p.id] = getProductDescription(p.id)
      })

      setProductPhotos(photos)
      setProductDiscounts(discounts)
      setProductDescriptions(descriptions)
    }

    loadProductMeta()
    window.addEventListener('storage', loadProductMeta)
    window.addEventListener('usahaku:product_discount_changed', loadProductMeta)
    window.addEventListener('usahaku:product_description_changed', loadProductMeta)
    window.addEventListener('usahaku:product_photo_changed', loadProductMeta)
    return () => {
      window.removeEventListener('storage', loadProductMeta)
      window.removeEventListener('usahaku:product_discount_changed', loadProductMeta)
      window.removeEventListener('usahaku:product_description_changed', loadProductMeta)
      window.removeEventListener('usahaku:product_photo_changed', loadProductMeta)
    }
  }, [people, productsKey])

  // Filter rows
  const serviceRows = data.services.filter(v => v.name.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id')))
  const practitionerRows = data.practitioners.filter(v => v.name.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id')))
  const productRows = products.filter(p =>
    p.name.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id')) ||
    p.category.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id'))
  )

  const rows = people ? practitionerRows : isProductTab ? productRows : serviceRows

  // Handle soft deletion
  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      if (people && 'service_ids' in confirmDelete) {
        // Practitioner soft delete
        const result = await saveSalonResource(
          {
            resource: 'practitioner',
            id: confirmDelete.id,
            revision: confirmDelete.revision,
            request: crypto.randomUUID(),
          },
          {
            name: confirmDelete.name,
            active: false,
            serviceIds: confirmDelete.service_ids,
            schedule: confirmDelete.schedule,
          }
        )
        if (result.value) {
          notify({
            title: 'Penata dinonaktifkan',
            message: `Penata "${confirmDelete.name}" berhasil dinonaktifkan.`,
            category: 'practitioner',
          })
          setNotice(`Penata "${confirmDelete.name}" berhasil dinonaktifkan.`)
          setConfirmDelete(null)
          router.refresh()
        } else {
          setNotice(result.error || 'Gagal menonaktifkan penata.')
        }
      } else if (!people && isProductTab && 'stock' in confirmDelete) {
        // Product soft delete
        const form = new FormData()
        form.append('id', confirmDelete.id)
        form.append('request', crypto.randomUUID())
        form.append('revision', String(confirmDelete.revision ?? ''))
        form.append('imageAction', 'keep')
        form.append(
          'details',
          JSON.stringify({
            name: confirmDelete.name,
            category: confirmDelete.category,
            unit: confirmDelete.unit,
            sku: confirmDelete.sku || '',
            barcode: confirmDelete.barcode || '',
            price: String(confirmDelete.price),
            minimum: String(confirmDelete.minStock || 0),
            initialStock: String(confirmDelete.stock || 0),
            active: false,
            discountKind: confirmDelete.discountKind || 'none',
            discountValue: confirmDelete.discountValue || 0,
          })
        )
        const result = await saveCatalogProduct(form)
        if (result.success) {
          notify({
            title: 'Produk dinonaktifkan',
            message: `Produk "${confirmDelete.name}" berhasil dinonaktifkan.`,
            category: 'product',
          })
          setNotice(`Produk "${confirmDelete.name}" berhasil dinonaktifkan.`)
          setConfirmDelete(null)
          router.refresh()
        } else {
          setNotice(result.error || 'Gagal menonaktifkan produk.')
        }
      } else if (!people && 'duration_minutes' in confirmDelete) {
        // Service soft delete
        const result = await saveSalonResource(
          {
            resource: 'service',
            id: confirmDelete.id,
            revision: confirmDelete.revision,
            request: crypto.randomUUID(),
          },
          {
            name: confirmDelete.name,
            price: String(confirmDelete.price),
            duration: String(confirmDelete.duration_minutes),
            active: false,
          }
        )
        if (result.value) {
          notify({
            title: 'Layanan dinonaktifkan',
            message: `Layanan "${confirmDelete.name}" berhasil dinonaktifkan.`,
            category: 'service',
          })
          setNotice(`Layanan "${confirmDelete.name}" berhasil dinonaktifkan.`)
          setConfirmDelete(null)
          router.refresh()
        } else {
          setNotice(result.error || 'Gagal menonaktifkan layanan.')
        }
      }
    } catch {
      setNotice('Terjadi kesalahan saat menonaktifkan data.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className={panel}>
      {/* Tab Nav for Services & Products when not managing practitioners */}
      {!people && (
        <div className="mb-5 flex items-center gap-2 border-b border-[#454d5b]/60 pb-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('service')
              setPage(0)
              setQuery('')
            }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition cursor-pointer border-0 ${
              activeTab === 'service'
                ? 'bg-[#1835d9] text-white shadow-xs'
                : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#3d4653] hover:text-white'
            }`}
          >
            <Scissors className="size-4" />
            <span>Daftar Layanan ({data.services.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('product')
              setPage(0)
              setQuery('')
            }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition cursor-pointer border-0 ${
              activeTab === 'product'
                ? 'bg-[#1835d9] text-white shadow-xs'
                : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#3d4653] hover:text-white'
            }`}
          >
            <Package className="size-4" />
            <span>Daftar Produk ({products.length})</span>
          </button>
        </div>
      )}

      {/* Header and Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {people
              ? 'Daftar penata & terapis'
              : isProductTab
              ? 'Daftar produk salon'
              : 'Daftar layanan salon'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#c5cbd5]">
            {people
              ? 'Penata/terapis adalah tenaga layanan, terpisah dari akun login pada Staf & akses. Jadwal kerja memakai WIB.'
              : isProductTab
              ? 'Kelola stok, foto, deskripsi, dan diskon produk perawatan rambut atau grooming yang dijual ke pelanggan.'
              : 'Atur harga rupiah, durasi, foto, diskon, dan benefit layanan. Menonaktifkan layanan mempertahankan data transaksi yang sudah ada.'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className={primary}
            onClick={() => {
              setNotice('')
              setEditing('new')
            }}
          >
            Tambah {label}
          </button>
        )}
      </div>

      {!canManage && (
        <p className="mt-2 text-sm text-[#c5cbd5]">
          Akses lihat saja. Perubahan dilakukan owner/admin.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-[#24cbc5]">
          {notice}
        </p>
      )}

      {/* Search Input */}
      <div className="mt-4">
        <Field label={`Cari ${label}`}>
          <input
            className={input}
            value={query}
            placeholder={`Cari nama ${label}...`}
            onChange={e => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </Field>
      </div>

      {/* Content Table */}
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">
            {people ? 'Penata dan jadwal kerja' : isProductTab ? 'Daftar produk' : 'Harga dan durasi layanan'}
          </caption>
          <thead className="text-[#c5cbd5]">
            <tr>
              {(people
                ? ['Nama', 'Layanan', 'Jadwal kerja', 'Status', ...(canManage ? ['Tindakan'] : [])]
                : isProductTab
                ? ['Produk', 'Kategori', 'Harga', 'Stok', 'Status', ...(canManage ? ['Tindakan'] : [])]
                : ['Layanan', 'Harga', 'Durasi', 'Status', ...(canManage ? ['Tindakan'] : [])]
              ).map(h => (
                <th key={h} className="border-b border-[#454d5b] px-3 py-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Practitioners */}
            {people &&
              practitionerRows.slice(page * 25, page * 25 + 25).map(row => (
                <tr key={row.id} className="border-b border-[#454d5b]/50">
                  <td className="max-w-64 break-words px-3 py-3 font-medium text-white">
                    {row.name}
                  </td>
                  <td className="max-w-56 break-words px-3 py-3 text-xs text-[#c5cbd5]">
                    {row.service_ids
                      .map(id => data.services.find(s => s.id === id))
                      .filter(Boolean)
                      .map(s => s!.name + (s!.active ? '' : ' (nonaktif)'))
                      .join(', ') || 'Belum dipilih'}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {row.schedule ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 min-w-[220px] max-w-[280px]">
                        {businessDays.map(day => {
                          const item = row.schedule![day];
                          const isClosed = !item || item.closed;
                          return (
                            <div key={day} className="flex items-center justify-between gap-1 text-[11px] py-0.5">
                              <span className="font-medium text-[#c5cbd5]">{day}:</span>
                              <span className={isClosed ? 'text-[#8b949e]' : 'text-[#24cbc5] font-medium'}>
                                {describeHours(item)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[#a4a7ac]">Belum diatur</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-normal ${
                        row.active
                          ? 'bg-[#24cbc5]/15 text-[#24cbc5]'
                          : 'bg-[#454d5b]/40 text-[#a4a7ac]'
                      }`}
                    >
                      {row.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={button + ' !text-xs !py-1 !px-2.5'}
                          aria-label={`Ubah ${row.name}`}
                          onClick={() => {
                            setNotice('')
                            setEditing(row)
                          }}
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          title={`Hapus ${row.name}`}
                          aria-label={`Hapus ${row.name}`}
                          className="grid size-8 place-items-center rounded-full bg-red-500/15 text-[#ffb4ae] hover:bg-red-500/25 active:scale-95 transition cursor-pointer border-0"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

            {/* Services */}
            {!people &&
              !isProductTab &&
              serviceRows.slice(page * 25, page * 25 + 25).map(row => {
                const discount = serviceDiscounts[row.id]
                const benefits = serviceBenefits[row.id] || []

                return (
                  <tr key={row.id} className="border-b border-[#454d5b]/50">
                    <td className="max-w-80 break-words px-3 py-3">
                      <div className="flex items-start gap-3">
                        {servicePhotos[row.id] ? (
                          <img
                            src={servicePhotos[row.id]}
                            alt={row.name}
                            className="size-11 rounded-xl object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
                          />
                        ) : (
                          <div className="size-11 rounded-xl bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                            <Sparkles className="size-5 text-[#24cbc5]/60" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="break-words font-medium text-white">{row.name}</span>
                          {benefits.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {benefits.map(b => (
                                <span
                                  key={b}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#24cbc5]/10 px-1.5 py-0.5 text-[10px] font-normal text-[#24cbc5]"
                                >
                                  <Tag className="size-2.5" />
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {discount ? (
                        <div>
                          <del className="text-xs text-[#a4a7ac]">{rupiah(discount.basePrice)}</del>
                          <div className="flex items-center gap-1.5 font-semibold text-[#24cbc5]">
                            <span>{rupiah(discount.discountedPrice)}</span>
                            <span className="rounded bg-[#24cbc5]/20 px-1 py-0.2 text-[10px] font-medium text-[#24cbc5]">
                              {discount.kind === 'amount'
                                ? `-${rupiah(discount.value)}`
                                : `-${discount.value}%`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold text-white">{rupiah(Number(row.price))}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#c5cbd5]">{row.duration_minutes} menit</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-normal ${
                          row.active
                            ? 'bg-[#24cbc5]/15 text-[#24cbc5]'
                            : 'bg-[#454d5b]/40 text-[#a4a7ac]'
                        }`}
                      >
                        {row.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={button + ' !text-xs !py-1 !px-2.5'}
                            aria-label={`Ubah ${row.name}`}
                            onClick={() => {
                              setNotice('')
                              setEditing(row)
                            }}
                          >
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(row)}
                            title={`Hapus ${row.name}`}
                            aria-label={`Hapus ${row.name}`}
                            className="grid size-8 place-items-center rounded-full bg-red-500/15 text-[#ffb4ae] hover:bg-red-500/25 active:scale-95 transition cursor-pointer border-0"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}

            {/* Products */}
            {!people &&
              isProductTab &&
              productRows.slice(page * 25, page * 25 + 25).map(row => {
                const discount = productDiscounts[row.id]
                const desc = productDescriptions[row.id]
                const photo = productPhotos[row.id]

                return (
                  <tr key={row.id} className="border-b border-[#454d5b]/50">
                    <td className="max-w-80 break-words px-3 py-3">
                      <div className="flex items-start gap-3">
                        {photo ? (
                          <img
                            src={photo}
                            alt={row.name}
                            className="size-11 rounded-xl object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
                          />
                        ) : (
                          <div className="size-11 rounded-xl bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                            <Package className="size-5 text-[#24cbc5]/60" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="break-words font-medium text-white">{row.name}</span>
                          {desc && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-[#a4a7ac]">{desc}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-[#c5cbd5]">
                      <span className="rounded-md bg-[#303640] px-2 py-0.5 font-normal">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {discount ? (
                        <div>
                          <del className="text-xs text-[#a4a7ac]">{rupiah(discount.basePrice)}</del>
                          <div className="flex items-center gap-1.5 font-semibold text-[#24cbc5]">
                            <span>{rupiah(discount.discountedPrice)}</span>
                            <span className="rounded bg-[#24cbc5]/20 px-1 py-0.2 text-[10px] font-medium text-[#24cbc5]">
                              {discount.kind === 'amount'
                                ? `-${rupiah(discount.value)}`
                                : `-${discount.value}%`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold text-white">{rupiah(row.price)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#c5cbd5]">
                      <span className={row.stock <= row.minStock ? 'text-amber-400 font-medium' : ''}>
                        {row.stock} {row.unit}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-normal ${
                          row.active
                            ? 'bg-[#24cbc5]/15 text-[#24cbc5]'
                            : 'bg-[#454d5b]/40 text-[#a4a7ac]'
                        }`}
                      >
                        {row.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={button + ' !text-xs !py-1 !px-2.5'}
                            aria-label={`Ubah ${row.name}`}
                            onClick={() => {
                              setNotice('')
                              setEditing(row)
                            }}
                          >
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(row)}
                            title={`Hapus ${row.name}`}
                            aria-label={`Hapus ${row.name}`}
                            className="grid size-8 place-items-center rounded-full bg-red-500/15 text-[#ffb4ae] hover:bg-red-500/25 active:scale-95 transition cursor-pointer border-0"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}

            {/* Empty state */}
            {!rows.length && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-3 py-6 text-center text-[#c5cbd5]">
                  {query ? 'Tidak ada hasil pencarian.' : `Belum ada ${label}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-[#c5cbd5]">
          {rows.length} {label}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className={button}
            disabled={page === 0}
            onClick={() => setPage(v => v - 1)}
          >
            Sebelumnya
          </button>
          <button
            type="button"
            className={button}
            disabled={(page + 1) * 25 >= rows.length}
            onClick={() => setPage(v => v + 1)}
          >
            Berikutnya
          </button>
        </div>
      </div>

      {/* Service / Practitioner Editor */}
      {editing && (!isProductTab || people) && (
        <SalonEditor
          resource={resource}
          initial={editing === 'new' ? null : (editing as SalonService | SalonPractitioner)}
          services={data.services}
          close={() => setEditing(null)}
          saved={() => {
            setEditing(null)
            setNotice('Perubahan tersimpan.')
            router.refresh()
          }}
        />
      )}

      {/* Product Editor */}
      {editing && isProductTab && !people && (
        <SalonProductEditor
          initial={editing === 'new' ? null : (editing as CatalogProduct)}
          existingCategories={initialCategories}
          existingUnits={initialUnits}
          close={() => setEditing(null)}
          saved={updatedProduct => {
            setEditing(null)
            setNotice('Produk berhasil disimpan.')
            if (updatedProduct) {
              setProducts(prev => {
                const idx = prev.findIndex(p => p.id === updatedProduct.id)
                if (idx >= 0) {
                  const next = [...prev]
                  next[idx] = updatedProduct
                  return next
                }
                return [updatedProduct, ...prev]
              })
            }
            router.refresh()
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <Dialog
          title={`Hapus ${
            'service_ids' in confirmDelete
              ? 'Penata / Terapis'
              : 'duration_minutes' in confirmDelete
              ? 'Layanan'
              : 'Produk'
          }`}
          busy={deleting}
          close={() => setConfirmDelete(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-[#c5cbd5] leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong className="text-white">"{confirmDelete.name}"</strong>?
              {' '}Data akan dinonaktifkan agar seluruh riwayat janji temu, transaksi kasir, dan laporan keuangan sebelumnya tetap terjaga keasliannya.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className={button}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteConfirm}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:scale-95 transition disabled:opacity-50 border-0 cursor-pointer"
              >
                {deleting ? 'Menonaktifkan...' : 'Hapus (Nonaktifkan)'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  )
}

function SalonEditor({
  resource,
  initial,
  services,
  close,
  saved,
}: {
  resource: 'service' | 'practitioner'
  initial: SalonService | SalonPractitioner | null
  services: SalonService[]
  close: () => void
  saved: () => void
}) {
  const people = resource === 'practitioner'
  const busy = useRef(false)
  const retry = useRef<{ input: unknown; details: unknown } | null>(null)

  const [id] = useState(initial?.id || crypto.randomUUID())
  const [name, setName] = useState(initial?.name || '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [price, setPrice] = useState(initial && 'price' in initial ? String(initial.price) : '')
  const [duration, setDuration] = useState(
    initial && 'duration_minutes' in initial ? String(initial.duration_minutes) : ''
  )
  const [serviceIds, setServiceIds] = useState<string[]>(
    initial && 'service_ids' in initial ? initial.service_ids : []
  )
  const [hours, setHours] = useState<BusinessHours>(
    initial && 'schedule' in initial && initial.schedule
      ? initial.schedule
      : defaultBusinessHours()
  )
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')

  // Service Benefits
  const [customBenefits, setCustomBenefits] = useState<string[]>(() => getCustomBenefits())
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>(() => {
    if (!people && initial?.id) {
      return getServiceBenefits(initial.id)
    }
    return []
  })
  const [showAddCustomBenefit, setShowAddCustomBenefit] = useState(false)
  const [newBenefitName, setNewBenefitName] = useState('')

  const handleAddCustomBenefit = () => {
    const trimmed = newBenefitName.trim()
    if (!trimmed) return
    if (!customBenefits.includes(trimmed) && !DEFAULT_SALON_BENEFITS.includes(trimmed as any)) {
      const updated = [...customBenefits, trimmed]
      setCustomBenefits(updated)
      saveCustomBenefits(updated)
    }
    if (!selectedBenefits.includes(trimmed)) {
      setSelectedBenefits(prev => [...prev, trimmed])
    }
    setNewBenefitName('')
    setShowAddCustomBenefit(false)
  }

  const handleDeleteCustomBenefit = (b: string) => {
    const updated = customBenefits.filter(x => x !== b)
    setCustomBenefits(updated)
    saveCustomBenefits(updated)
    setSelectedBenefits(prev => prev.filter(x => x !== b))
  }

  // Service Discount
  const [discountKind, setDiscountKind] = useState<'none' | 'percent' | 'amount'>(() => {
    if (!people && initial?.id && 'price' in initial) {
      const d = getServiceDiscount(initial.id, Number(initial.price || 0))
      if (d && d.enabled) return d.kind
    }
    return 'none'
  })
  const [discountValue, setDiscountValue] = useState<string>(() => {
    if (!people && initial?.id && 'price' in initial) {
      const d = getServiceDiscount(initial.id, Number(initial.price || 0))
      if (d && d.enabled) return String(d.value)
    }
    return '0'
  })

  // Photo
  const [photo, setPhoto] = useState<string>(() => {
    if (!people && initial?.id && typeof window !== 'undefined') {
      try {
        return localStorage.getItem('usahaku_service_photo_' + initial.id) || ''
      } catch {}
    }
    return ''
  })
  const [photoError, setPhotoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setPhotoError('Format foto harus PNG, JPG, atau WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Ukuran foto maksimal 2MB.')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Live discount preview
  const numPrice = Number(price) || 0
  const numDiscount = Number(discountValue) || 0
  const finalPrice = calculateDiscountedPrice(numPrice, discountKind, numDiscount)

  async function submit() {
    if (busy.current) return

    // Validation for discount
    if (!people && discountKind !== 'none') {
      if (discountKind === 'percent' && (numDiscount <= 0 || numDiscount > 100)) {
        setError('Diskon persentase harus antara 1% sampai 100%.')
        return
      }
      if (discountKind === 'amount' && (numDiscount <= 0 || numDiscount > numPrice)) {
        setError('Diskon rupiah tidak boleh melebihi harga layanan.')
        return
      }
    }

    const details = people
      ? {
          name,
          active,
          serviceIds,
          schedule: businessDays.every(d => hours[d].closed) ? null : hours,
        }
      : { name, price, duration, active }

    if (!retry.current) {
      const parsed = (people ? salonPractitionerSchema : salonServiceSchema).safeParse(details)
      if (!parsed.success) {
        setError(parsed.error.issues[0].message)
        return
      }
    }

    const packet =
      retry.current || {
        input: {
          resource,
          id,
          revision: initial?.revision ?? null,
          request: crypto.randomUUID(),
        },
        details,
      }

    busy.current = true
    setPending(true)
    setError('')

    try {
      const result = await saveSalonResource(packet.input, packet.details)
      if (result.value) {
        retry.current = null

        if (!people) {
          // Persist photo
          try {
            if (photo) {
              localStorage.setItem('usahaku_service_photo_' + id, photo)
            } else {
              localStorage.removeItem('usahaku_service_photo_' + id)
            }
          } catch {}

          // Persist benefits
          saveServiceBenefits(id, selectedBenefits)

          // Persist discount
          if (discountKind !== 'none' && numDiscount > 0) {
            saveServiceDiscount(id, {
              enabled: true,
              kind: discountKind,
              value: numDiscount,
              basePrice: numPrice,
              discountedPrice: finalPrice,
            })
          } else {
            saveServiceDiscount(id, null)
          }
        }

        notify({
          title: initial
            ? people
              ? 'Penata diperbarui'
              : 'Layanan diperbarui'
            : people
            ? 'Penata baru ditambahkan'
            : 'Layanan baru ditambahkan',
          message: people
            ? `Penata "${name}" berhasil disimpan.`
            : `Layanan "${name}" berhasil disimpan.`,
          category: people ? 'practitioner' : 'service',
        })
        saved()
      } else {
        setError(result.error || 'Belum tersimpan.')
        retry.current = result.uncertain ? packet : null
        setLocked(Boolean(result.uncertain))
      }
    } catch {
      retry.current = packet
      setLocked(true)
      setError('Hasil penyimpanan belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const allBenefits = [...DEFAULT_SALON_BENEFITS, ...customBenefits]

  return (
    <Dialog
      title={`${initial ? 'Ubah' : 'Tambah'} ${people ? 'penata/terapis' : 'layanan'}`}
      busy={pending}
      close={close}
      wide={people || !people}
    >
      <form
        onSubmit={e => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-4 max-h-[78vh] overflow-y-auto pr-1"
      >
        <fieldset disabled={pending || locked} className="space-y-4">
          <Field label={people ? 'Nama penata/terapis' : 'Nama layanan'}>
            <input
              required
              maxLength={100}
              value={name}
              placeholder={people ? 'Contoh: Mas Budi' : 'Contoh: Regular Haircut'}
              onChange={e => setName(e.target.value)}
              className={input}
            />
          </Field>

          {!people && (
            <>
              {/* Photo Upload */}
              <div>
                <label className="mb-2 block text-sm font-medium text-white">
                  Foto layanan (opsional)
                </label>
                {photo ? (
                  <div className="relative inline-block">
                    <img
                      src={photo}
                      alt="Pratinjau foto layanan"
                      className="size-28 rounded-xl object-cover border border-[#454d5b]/40 bg-[#1c222e]"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={button + ' text-xs py-1 px-2.5'}
                      >
                        Ganti foto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPhoto('')
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs text-[#ffb4ae] hover:bg-red-500/25 transition border-0 cursor-pointer"
                      >
                        Hapus foto
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] p-6 text-center transition hover:border-[#24cbc5] hover:bg-[#1c222e]/80"
                  >
                    <Upload className="mb-2 size-6 text-[#24cbc5]" />
                    <p className="text-sm font-medium text-white">Klik untuk unggah foto layanan</p>
                    <p className="mt-1 text-xs text-[#a4a7ac]">PNG, JPG, atau WebP (maksimal 2MB)</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                {photoError && (
                  <p role="alert" className="mt-1 text-xs text-[#ffb4ae]">
                    {photoError}
                  </p>
                )}
              </div>

              {/* Price & Duration */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Harga layanan (Rp)">
                  <input
                    required
                    inputMode="numeric"
                    placeholder="Contoh: 50000"
                    value={price}
                    onChange={e => setPrice(e.target.value.replace(/\D/g, ''))}
                    className={input}
                  />
                </Field>
                <Field label="Durasi layanan (menit)">
                  <input
                    required
                    inputMode="numeric"
                    placeholder="Contoh: 30"
                    value={duration}
                    onChange={e => setDuration(e.target.value.replace(/\D/g, ''))}
                    className={input}
                  />
                </Field>
              </div>

              {/* Discount Section */}
              <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e]/80 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Diskon layanan (opsional)</span>
                  <span className="text-xs text-[#24cbc5]">Potongan harga khusus</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Jenis diskon">
                    <SelectInput
                      className={input}
                      value={discountKind}
                      onChange={e => {
                        setDiscountKind(e.target.value as any)
                        if (e.target.value === 'none') setDiscountValue('0')
                      }}
                    >
                      <option value="none">Tanpa diskon</option>
                      <option value="percent">Persentase (%)</option>
                      <option value="amount">Nominal (Rp)</option>
                    </SelectInput>
                  </Field>
                  {discountKind !== 'none' && (
                    <Field
                      label={
                        discountKind === 'percent'
                          ? 'Nilai diskon (%)'
                          : 'Nilai diskon (Rp)'
                      }
                    >
                      <input
                        type="number"
                        min={0}
                        max={discountKind === 'percent' ? 100 : numPrice}
                        step={discountKind === 'percent' ? '0.01' : '1'}
                        value={discountValue}
                        onChange={e => setDiscountValue(e.target.value)}
                        className={input}
                      />
                    </Field>
                  )}
                </div>

                {discountKind !== 'none' && numPrice > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-[#273242] p-2.5 text-xs">
                    <span className="text-[#c5cbd5]">Pratinjau harga setelah diskon:</span>
                    <div className="flex items-center gap-2">
                      <del className="text-[#a4a7ac]">{rupiah(numPrice)}</del>
                      <span className="font-semibold text-[#24cbc5] text-sm">
                        {rupiah(finalPrice)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Service Benefits Section */}
              <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e]/80 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Benefit & fasilitas layanan</span>
                  <span className="text-xs text-[#a4a7ac]">Pilih benefit yang didapatkan</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {allBenefits.map(b => {
                    const isCustom = !DEFAULT_SALON_BENEFITS.includes(b as any)
                    const checked = selectedBenefits.includes(b)

                    return (
                      <div
                        key={b}
                        className={`flex items-center justify-between rounded-lg p-2 transition ${
                          checked ? 'bg-[#24cbc5]/10 border border-[#24cbc5]/30' : 'bg-[#273242]/60 hover:bg-[#273242]'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedBenefits(prev => [...prev, b])
                              } else {
                                setSelectedBenefits(prev => prev.filter(x => x !== b))
                              }
                            }}
                            className="size-4 shrink-0 accent-[#1835d9] cursor-pointer"
                          />
                          <span className={`truncate ${checked ? 'text-white font-medium' : 'text-[#c5cbd5]'}`}>
                            {b}
                          </span>
                        </label>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomBenefit(b)}
                            title={`Hapus benefit kustom "${b}"`}
                            className="text-[#a4a7ac] hover:text-red-400 p-1 ml-1 cursor-pointer border-0 bg-transparent"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add Custom Benefit */}
                {!showAddCustomBenefit ? (
                  <button
                    type="button"
                    onClick={() => setShowAddCustomBenefit(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#24cbc5] hover:text-[#24cbc5]/80 font-medium cursor-pointer border-0 bg-transparent pt-1"
                  >
                    <Plus className="size-3.5" />
                    <span>Tambah benefit lainnya</span>
                  </button>
                ) : (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#273242] p-2">
                    <input
                      type="text"
                      maxLength={50}
                      value={newBenefitName}
                      placeholder="Nama benefit (contoh: Free Drink, Pomade Sample)"
                      onChange={e => setNewBenefitName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCustomBenefit()
                        }
                      }}
                      className={input + ' !py-1 !text-xs flex-1'}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomBenefit}
                      disabled={!newBenefitName.trim()}
                      className={primary + ' !text-xs !py-1 !px-3 disabled:opacity-40'}
                    >
                      Tambah
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewBenefitName('')
                        setShowAddCustomBenefit(false)
                      }}
                      className="text-[#a4a7ac] hover:text-white p-1 cursor-pointer border-0 bg-transparent"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <Field label="Status">
            <SelectInput
              className={input}
              value={active ? 'active' : 'inactive'}
              onChange={e => setActive(e.target.value === 'active')}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </SelectInput>
          </Field>

          {people && (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm text-[#c5cbd5]">
                  Layanan yang dapat dikerjakan
                </legend>
                <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                  {services
                    .filter(s => s.active || serviceIds.includes(s.id))
                    .map(s => (
                      <label
                        key={s.id}
                        className="flex min-h-10 items-center gap-2.5 rounded-lg bg-[#1c222e] p-2 text-xs cursor-pointer hover:bg-[#1c222e]/80"
                      >
                        <input
                          type="checkbox"
                          checked={serviceIds.includes(s.id)}
                          onChange={e =>
                            setServiceIds(v =>
                              e.target.checked ? [...v, s.id] : v.filter(id => id !== s.id)
                            )
                          }
                          className="size-4 shrink-0 accent-[#1835d9]"
                        />
                        <span className="truncate text-white">
                          {s.name}
                          {!s.active ? ' (nonaktif)' : ''}
                        </span>
                      </label>
                    ))}
                </div>
                {!services.some(s => s.active) && (
                  <p className="text-sm text-[#c5cbd5]">
                    Tambahkan layanan aktif melalui tab Layanan. Penata tetap dapat disimpan tanpa pilihan layanan.
                  </p>
                )}
              </fieldset>

              <section aria-label="Jadwal kerja penata">
                <h3 className="mb-2 text-base font-semibold text-white">Jadwal kerja mingguan</h3>
                <p className="mb-3 text-xs leading-5 text-[#c5cbd5]">
                  Semua hari nonaktif berarti jadwal belum diatur. Jadwal penata disimpan terpisah dari jam usaha; janji temu nantinya memakai waktu yang beririsan dengan keduanya.
                </p>
                <HoursEditor
                  hours={hours}
                  setHours={h => setHours(h as BusinessHours)}
                  save={() => {}}
                  cancel={() => {}}
                  pending={pending}
                  error=""
                  showActions={false}
                  stackOnSmallScreens
                />
              </section>
            </>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-[#ffb4ae]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" disabled={pending} onClick={close} className={button}>
            Batal
          </button>
          <button disabled={pending} className={primary}>
            {pending
              ? 'Menyimpan...'
              : locked
              ? 'Ulangi permintaan yang sama'
              : people
              ? 'Simpan penata/terapis'
              : 'Simpan layanan'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function SalonProductEditor({
  initial,
  existingCategories = [],
  existingUnits = [],
  close,
  saved,
}: {
  initial: CatalogProduct | null
  existingCategories?: string[]
  existingUnits?: string[]
  close: () => void
  saved: (product?: CatalogProduct) => void
}) {
  const [id] = useState(initial?.id || crypto.randomUUID())
  const [name, setName] = useState(initial?.name || '')
  const [category, setCategory] = useState(initial?.category || 'Styling')
  const [customCategory, setCustomCategory] = useState('')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [costPrice, setCostPrice] = useState(() => (initial?.id ? getProductCostPrice(initial.id) : ''))
  const [stock, setStock] = useState(initial ? String(initial.stock) : '10')
  const [unit, setUnit] = useState(initial?.unit || 'pcs')
  const [customUnit, setCustomUnit] = useState('')
  const [active, setActive] = useState(initial?.active ?? true)
  const [description, setDescription] = useState(() => {
    if (initial?.id) return getProductDescription(initial.id)
    return ''
  })

  // Discount
  const [discountKind, setDiscountKind] = useState<'none' | 'percent' | 'amount'>(() => {
    if (initial?.id) {
      const d = getProductDiscount(initial.id, initial.price)
      if (d && d.enabled) return d.kind
      if (initial.discountKind) return initial.discountKind
    }
    return 'none'
  })
  const [discountValue, setDiscountValue] = useState<string>(() => {
    if (initial?.id) {
      const d = getProductDiscount(initial.id, initial.price)
      if (d && d.enabled) return String(d.value)
      if (initial.discountValue != null) return String(initial.discountValue)
    }
    return '0'
  })

  // Photo
  const [photo, setPhoto] = useState<string>(() => {
    if (initial?.id) return getProductPhoto(initial.id) || initial.image || ''
    return ''
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const numPrice = Number(price) || 0
  const numDiscount = Number(discountValue) || 0
  const finalPrice = calculateDiscountedPrice(numPrice, discountKind, numDiscount)

  const defaultSalonCategories = ['Styling', 'Perawatan Rambut', 'Aksesoris', 'Shampoo & Conditioner', 'Parfum & Grooming']
  const allCategories = Array.from(new Set([...defaultSalonCategories, ...existingCategories]))
  const defaultSalonUnits = ['pcs', 'botol', 'jar', 'tube', 'box', 'set']
  const allUnits = Array.from(new Set([...defaultSalonUnits, ...existingUnits]))

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setPhotoError('Format foto harus PNG, JPG, atau WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Ukuran foto maksimal 2MB.')
      return
    }

    setPhotoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function submit() {
    if (!name.trim()) {
      setError('Isi nama produk.')
      return
    }
    if (numPrice < 0) {
      setError('Harga jual harus berupa angka valid.')
      return
    }

    if (discountKind !== 'none') {
      if (discountKind === 'percent' && (numDiscount <= 0 || numDiscount > 100)) {
        setError('Diskon persentase harus antara 1% sampai 100%.')
        return
      }
      if (discountKind === 'amount' && (numDiscount <= 0 || numDiscount > numPrice)) {
        setError('Diskon nominal tidak boleh melebihi harga produk.')
        return
      }
    }

    const finalCat = category === '__custom__' ? customCategory.trim() : category
    if (!finalCat) {
      setError('Pilih atau ketik kategori produk.')
      return
    }

    const finalUnit = unit === '__custom__' ? customUnit.trim() : unit
    if (!finalUnit) {
      setError('Pilih atau ketik satuan stok produk.')
      return
    }

    setPending(true)
    setError('')

    try {
      const form = new FormData()
      form.append('id', id)
      form.append('request', crypto.randomUUID())
      form.append('revision', String(initial?.revision ?? ''))
      form.append('imageAction', photoFile ? 'replace' : photo ? 'keep' : 'remove')
      if (photoFile) {
        form.append('image', photoFile)
      }

      form.append(
        'details',
        JSON.stringify({
          name: name.trim(),
          category: finalCat,
          unit: finalUnit,
          sku: initial?.sku || '',
          barcode: initial?.barcode || '',
          price: String(numPrice),
          minimum: '0',
          initialStock: stock.trim() || '0',
          active,
          discountKind,
          discountValue: numDiscount,
        })
      )

      const result = await saveCatalogProduct(form)
      if (result.success) {
        // Persist photo data URL locally
        if (photo) {
          saveProductPhoto(id, photo)
        } else {
          saveProductPhoto(id, '')
        }

        // Persist description
        saveProductDescription(id, description)
        saveProductCostPrice(id, costPrice)

        // Persist discount
        if (discountKind !== 'none' && numDiscount > 0) {
          saveProductDiscount(id, {
            enabled: true,
            kind: discountKind,
            value: numDiscount,
            basePrice: numPrice,
            discountedPrice: finalPrice,
          })
        } else {
          saveProductDiscount(id, null)
        }

        notify({
          title: initial ? 'Produk diperbarui' : 'Produk baru ditambahkan',
          message: `Produk "${name.trim()}" berhasil disimpan.`,
          category: 'product',
        })

        saved(result.product)
      } else {
        setError(result.error || 'Gagal menyimpan produk.')
      }
    } catch {
      setError('Terjadi kesalahan saat menyimpan produk.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      title={`${initial ? 'Ubah' : 'Tambah'} produk salon`}
      busy={pending}
      close={close}
      wide
    >
      <form
        onSubmit={e => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-4 max-h-[78vh] overflow-y-auto pr-1"
      >
        <fieldset disabled={pending} className="space-y-4">
          <Field label="Nama produk">
            <input
              required
              maxLength={160}
              value={name}
              placeholder="Contoh: Water-based Matte Pomade"
              onChange={e => setName(e.target.value)}
              className={input}
            />
          </Field>

          {/* Photo Upload */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">
              Foto produk (opsional)
            </label>
            {photo ? (
              <div className="relative inline-block">
                <img
                  src={photo}
                  alt="Pratinjau foto produk"
                  className="size-28 rounded-xl object-cover border border-[#454d5b]/40 bg-[#1c222e]"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={button + ' text-xs py-1 px-2.5'}
                  >
                    Ganti foto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto('')
                      setPhotoFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs text-[#ffb4ae] hover:bg-red-500/25 transition border-0 cursor-pointer"
                  >
                    Hapus foto
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] p-6 text-center transition hover:border-[#24cbc5] hover:bg-[#1c222e]/80"
              >
                <Upload className="mb-2 size-6 text-[#24cbc5]" />
                <p className="text-sm font-medium text-white">Klik untuk unggah foto produk</p>
                <p className="mt-1 text-xs text-[#a4a7ac]">PNG, JPG, atau WebP (maksimal 2MB)</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
            {photoError && (
              <p role="alert" className="mt-1 text-xs text-[#ffb4ae]">
                {photoError}
              </p>
            )}
          </div>

          {/* Category & Unit */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field label="Kategori produk">
                <SelectInput
                  className={input}
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {allCategories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__custom__">+ Kategori kustom baru</option>
                </SelectInput>
              </Field>
              {category === '__custom__' && (
                <input
                  type="text"
                  maxLength={50}
                  placeholder="Ketik kategori baru..."
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  className={input + ' mt-2'}
                  required
                />
              )}
            </div>

            <div>
              <Field label="Satuan stok">
                <SelectInput
                  className={input}
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                >
                  {allUnits.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="__custom__">+ Satuan kustom baru</option>
                </SelectInput>
              </Field>
              {unit === '__custom__' && (
                <input
                  type="text"
                  maxLength={30}
                  placeholder="Ketik satuan baru..."
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value)}
                  className={input + ' mt-2'}
                  required
                />
              )}
            </div>
          </div>

          {/* Price, Cost Price, Stock */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Harga jual (Rp)">
              <input
                required
                inputMode="numeric"
                placeholder="Contoh: 85000"
                value={price}
                onChange={e => setPrice(e.target.value.replace(/\D/g, ''))}
                className={input}
              />
            </Field>
            <Field label="Harga modal / HPP (Rp, opsional)">
              <input
                inputMode="numeric"
                placeholder="Contoh: 50000"
                value={costPrice}
                onChange={e => setCostPrice(e.target.value.replace(/\D/g, ''))}
                className={input}
              />
            </Field>
            <Field label="Stok awal">
              <input
                required
                inputMode="numeric"
                placeholder="Contoh: 15"
                value={stock}
                onChange={e => setStock(e.target.value.replace(/\D/g, ''))}
                className={input}
              />
            </Field>
          </div>

          {/* Product Description */}
          <Field label="Deskripsi produk (opsional)">
            <textarea
              rows={3}
              maxLength={500}
              placeholder="Contoh: Pomade water-based dengan daya tahan kuat dan mudah dibersihkan."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={input + ' resize-none'}
            />
          </Field>

          {/* Discount Section */}
          <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e]/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Diskon produk (opsional)</span>
              <span className="text-xs text-[#24cbc5]">Potongan harga promo</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jenis diskon">
                <SelectInput
                  className={input}
                  value={discountKind}
                  onChange={e => {
                    setDiscountKind(e.target.value as any)
                    if (e.target.value === 'none') setDiscountValue('0')
                  }}
                >
                  <option value="none">Tanpa diskon</option>
                  <option value="percent">Persentase (%)</option>
                  <option value="amount">Nominal (Rp)</option>
                </SelectInput>
              </Field>
              {discountKind !== 'none' && (
                <Field
                  label={
                    discountKind === 'percent'
                      ? 'Nilai diskon (%)'
                      : 'Nilai diskon (Rp)'
                  }
                >
                  <input
                    type="number"
                    min={0}
                    max={discountKind === 'percent' ? 100 : numPrice}
                    step={discountKind === 'percent' ? '0.01' : '1'}
                    value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                    className={input}
                  />
                </Field>
              )}
            </div>

            {discountKind !== 'none' && numPrice > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-[#273242] p-2.5 text-xs">
                <span className="text-[#c5cbd5]">Pratinjau harga setelah diskon:</span>
                <div className="flex items-center gap-2">
                  <del className="text-[#a4a7ac]">{rupiah(numPrice)}</del>
                  <span className="font-semibold text-[#24cbc5] text-sm">
                    {rupiah(finalPrice)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <Field label="Status">
            <SelectInput
              className={input}
              value={active ? 'active' : 'inactive'}
              onChange={e => setActive(e.target.value === 'active')}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </SelectInput>
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-[#ffb4ae]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" disabled={pending} onClick={close} className={button}>
            Batal
          </button>
          <button disabled={pending} className={primary}>
            {pending ? 'Menyimpan...' : 'Simpan produk'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
