import { z } from 'zod'
import { discountedPrice } from './product-pricing'

export const productCategories = ['Makanan', 'Minuman', 'Bahan Pokok']
export const defaultProductUnits = ['pcs', 'botol', 'kg', 'porsi', 'liter'] as const

export type ParsedQuantity = {
  valid: boolean
  value: number
  formatted: string
  error?: string
}

export function parseQuantityInput(raw: string): ParsedQuantity {
  const invalid = (error: string): ParsedQuantity => ({ valid: false, value: 0, formatted: '', error })
  if (typeof raw !== 'string' || !raw.trim()) return invalid('Jumlah wajib diisi.')
  const text = raw.trim()
  if (text.length > 64) return invalid('Jumlah terlalu panjang.')
  if (text.startsWith('-')) return invalid('Jumlah tidak boleh bernilai negatif.')
  const fraction = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/)
  if (fraction) {
    const whole = BigInt(fraction[1] || '0'), numerator = BigInt(fraction[2]), denominator = BigInt(fraction[3])
    if (denominator === BigInt(0)) return invalid('Pembagian dengan nol tidak diperbolehkan.')
    const scaled = ((whole * denominator + numerator) * BigInt(2000) + denominator) / (denominator * BigInt(2))
    if (scaled <= BigInt(0)) return invalid('Jumlah harus lebih besar dari 0.')
    if (scaled > BigInt('999999999999')) return invalid('Jumlah di luar batas yang diperbolehkan.')
    const value = Number(scaled) / 1000
    return { valid: true, value, formatted: String(value) }
  }
  const normalized = text.replace(',', '.')
  if (!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(normalized)) return invalid('Jumlah harus berupa angka atau pecahan dengan maksimal 3 desimal.')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value > 999999999.999) return invalid('Jumlah di luar batas yang diperbolehkan.')
  if (value <= 0) return invalid('Jumlah harus lebih besar dari 0.')
  return { valid: true, value, formatted: normalized }
}

export function quantity(value: unknown, signed=false): string {
  let text = String(value).trim()
  if (!text) throw Error('Jumlah wajib diisi.')
  if (text.includes('/')) {
    const parsed = parseQuantityInput(text)
    if (!parsed.valid) throw Error(parsed.error || 'Format pecahan tidak valid.')
    return parsed.formatted
  }
  text = text.replace(',', '.')
  if (!/^-?(0|[1-9]\d*)(\.\d{1,3})?$/.test(text) || text.length > 20) {
    throw Error('Jumlah harus angka dengan maksimal 3 desimal.')
  }
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const scaled = BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, '0'))
  if (scaled > BigInt('999999999999') || (!signed && text.startsWith('-'))) {
    throw Error('Jumlah di luar batas yang diperbolehkan.')
  }
  return text
}

const qty = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return quantity(v)
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: (e as Error).message })
    return z.NEVER
  }
})

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Nama produk wajib diisi.').max(160),
  category: z.string().trim().min(1, 'Kategori wajib diisi.').max(100),
  unit: z.string().trim().min(1, 'Unit stok wajib diisi.').max(30),
  sku: z.string().trim().max(64),
  barcode: z.string().trim().max(100),
  price: z.union([z.string(), z.number()]).transform(String).refine(v => /^(0|[1-9]\d{0,11})$/.test(v), 'Harga harus rupiah bulat, 0–999.999.999.999.'),
  minimum: qty,
  initialStock: qty,
  active: z.boolean(),
  discountKind: z.enum(['none', 'percent', 'amount']).default('none'),
  discountValue: z.coerce.number().finite().nonnegative().default(0),
}).strict().superRefine((p, ctx) => {
  try {
    discountedPrice({ price: Number(p.price), discountKind: p.discountKind, discountValue: p.discountValue })
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Diskon persen maksimal 100% (2 desimal); diskon rupiah harus bulat dan tidak melebihi harga.', path: ['discountValue'] })
  }
})

export type CatalogRow = {
  id: string
  business_id: string
  name: string
  category: string
  unit: string
  sku: string
  barcode: string
  price: number
  discount_kind?: 'none' | 'percent' | 'amount'
  discount_value?: number
  stock: number
  minimum_stock: number
  active: boolean
  revision: number
  stock_revision: number
  image_path: string | null
  created_at: string
  updated_at: string
}

export type CatalogProduct = {
  id: string
  name: string
  category: string
  unit: string
  sku: string
  barcode: string
  price: number
  discountKind?: 'none' | 'percent' | 'amount'
  discountValue?: number
  stock: number
  minStock: number
  active: boolean
  revision: number
  stockRevision: number
  image?: string
}

export type StockRow = {
  id: string
  product_id: string
  kind: 'initial' | 'in' | 'out' | 'adjustment' | 'sale' | 'sale_cancel'
  quantity: number
  before_stock: number
  after_stock: number
  product_name: string
  unit: string
  reason: string
  actor_name: string
  created_at: string
}

export type CatalogResult = { error?: string; success?: string; warning?: string; product?: CatalogProduct }

export function catalogView(p: CatalogRow): CatalogProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    sku: p.sku,
    barcode: p.barcode,
    price: Number(p.price),
    discountKind: p.discount_kind || 'none',
    discountValue: Number(p.discount_value || 0),
    stock: Number(p.stock),
    minStock: Number(p.minimum_stock),
    active: p.active,
    revision: p.revision,
    stockRevision: p.stock_revision,
    ...(p.image_path ? { image: `/api/products/${p.id}/image?v=${p.revision}` } : {}),
  }
}

export const formatQuantity = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n)

export function adjustedStock(stock: number, delta: string) {
  try {
    return (Math.round(stock * 1000) + Math.round(Number(quantity(delta, true)) * 1000)) / 1000
  } catch {
    return NaN
  }
}
