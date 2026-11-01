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
  if (!raw || typeof raw !== 'string') {
    return { valid: false, value: 0, formatted: '', error: 'Jumlah wajib diisi.' }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return { valid: false, value: 0, formatted: '', error: 'Jumlah wajib diisi.' }
  }

  // Reject negative quantities
  if (trimmed.startsWith('-')) {
    return { valid: false, value: 0, formatted: '', error: 'Jumlah tidak boleh bernilai negatif.' }
  }

  // 1. Mixed fraction: e.g. "1 1/2", "2 1/4"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixedMatch) {
    const whole = Number(mixedMatch[1])
    const num = Number(mixedMatch[2])
    const den = Number(mixedMatch[3])
    if (den === 0) {
      return { valid: false, value: 0, formatted: '', error: 'Pembagian dengan nol tidak diperbolehkan.' }
    }
    const val = whole + num / den
    const rounded = Math.round(val * 1000) / 1000
    if (rounded <= 0) {
      return { valid: false, value: 0, formatted: '', error: 'Jumlah harus lebih besar dari 0.' }
    }
    if (rounded > 999999999.999) {
      return { valid: false, value: 0, formatted: '', error: 'Jumlah di luar batas yang diperbolehkan.' }
    }
    return { valid: true, value: rounded, formatted: String(rounded) }
  }

  // 2. Simple fraction: e.g. "1/2", "1/4", "3/4"
  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fractionMatch) {
    const num = Number(fractionMatch[1])
    const den = Number(fractionMatch[2])
    if (den === 0) {
      return { valid: false, value: 0, formatted: '', error: 'Pembagian dengan nol tidak diperbolehkan.' }
    }
    const val = num / den
    const rounded = Math.round(val * 1000) / 1000
    if (rounded <= 0) {
      return { valid: false, value: 0, formatted: '', error: 'Jumlah harus lebih besar dari 0.' }
    }
    if (rounded > 999999999.999) {
      return { valid: false, value: 0, formatted: '', error: 'Jumlah di luar batas yang diperbolehkan.' }
    }
    return { valid: true, value: rounded, formatted: String(rounded) }
  }

  // 3. Decimal or integer: e.g. "0.5", "0,5", "10", "1.25"
  const normalized = trimmed.replace(',', '.')
  if (!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(normalized)) {
    return { valid: false, value: 0, formatted: '', error: 'Jumlah harus berupa angka atau pecahan dengan maksimal 3 desimal.' }
  }
  const val = Number(normalized)
  if (!Number.isFinite(val) || isNaN(val)) {
    return { valid: false, value: 0, formatted: '', error: 'Format angka tidak valid.' }
  }
  const rounded = Math.round(val * 1000) / 1000
  if (rounded <= 0) {
    return { valid: false, value: 0, formatted: '', error: 'Jumlah harus lebih besar dari 0.' }
  }
  if (rounded > 999999999.999) {
    return { valid: false, value: 0, formatted: '', error: 'Jumlah di luar batas yang diperbolehkan.' }
  }

  return { valid: true, value: rounded, formatted: normalized }
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
