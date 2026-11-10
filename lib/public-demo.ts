import type { Sale } from './pos'

export const demoCategories = ['toko', 'restoran', 'salon'] as const
export type DemoCategory = typeof demoCategories[number]
export type DemoItem = { id: string; name: string; category: string; price: number; unit: string }
export type DemoCart = Record<string, number>
export const demoBusinesses = {
  toko: { name: 'Toko Senja', label: 'Toko', category: 'store', catalog: 'Produk', cashier: 'Kasir (POS)' },
  restoran: { name: 'Kopi Senja', label: 'Restoran / Cafe', category: 'restaurant', catalog: 'Menu', cashier: 'Pesanan & kasir' },
  salon: { name: 'Salon Senja', label: 'Barbershop / Salon', category: 'barbershop', catalog: 'Layanan & produk', cashier: 'Janji temu & kasir' },
} as const
export const demoCatalogs: Record<DemoCategory, DemoItem[]> = {
  toko: [
    { id: 'beras', name: 'Beras premium 5 kg', category: 'Bahan pokok', price: 75000, unit: 'karung' },
    { id: 'susu', name: 'Susu UHT 1 liter', category: 'Minuman', price: 18000, unit: 'kotak' },
    { id: 'roti', name: 'Roti tawar', category: 'Makanan', price: 16000, unit: 'bungkus' },
    { id: 'minyak', name: 'Minyak goreng 1 liter', category: 'Bahan pokok', price: 20000, unit: 'botol' },
    { id: 'teh', name: 'Teh botol', category: 'Minuman', price: 6000, unit: 'botol' },
    { id: 'biskuit', name: 'Biskuit cokelat', category: 'Makanan', price: 12000, unit: 'bungkus' },
  ],
  restoran: [
    { id: 'kopi-susu', name: 'Kopi susu gula aren', category: 'Minuman', price: 22000, unit: 'gelas' },
    { id: 'americano', name: 'Americano', category: 'Minuman', price: 18000, unit: 'gelas' },
    { id: 'matcha', name: 'Matcha latte', category: 'Minuman', price: 26000, unit: 'gelas' },
    { id: 'nasi', name: 'Nasi goreng', category: 'Makanan', price: 28000, unit: 'porsi' },
    { id: 'kentang', name: 'Kentang goreng', category: 'Camilan', price: 18000, unit: 'porsi' },
    { id: 'toast', name: 'Roti bakar cokelat', category: 'Camilan', price: 20000, unit: 'porsi' },
  ],
  salon: [
    { id: 'potong', name: 'Potong rambut', category: 'Layanan', price: 50000, unit: 'layanan' },
    { id: 'creambath', name: 'Creambath', category: 'Layanan', price: 85000, unit: 'layanan' },
    { id: 'cuci', name: 'Cuci & blow', category: 'Layanan', price: 65000, unit: 'layanan' },
    { id: 'hair-spa', name: 'Hair spa', category: 'Layanan', price: 120000, unit: 'layanan' },
    { id: 'sampo', name: 'Sampo perawatan', category: 'Produk', price: 75000, unit: 'botol' },
    { id: 'pomade', name: 'Pomade', category: 'Produk', price: 55000, unit: 'pcs' },
  ],
}
export const isDemoCategory = (value: string): value is DemoCategory => demoCategories.includes(value as DemoCategory)
export function changeDemoQuantity(cart: DemoCart, catalog: DemoItem[], id: string, change: number): DemoCart {
  if (!catalog.some(item => item.id === id) || !Number.isSafeInteger(change)) return cart
  const next = { ...cart }, quantity = Math.max(0, Math.min(99, (cart[id] || 0) + change))
  if (!quantity) delete next[id]
  else next[id] = quantity
  return next
}
export function demoCartLines(cart: DemoCart, catalog: DemoItem[]) {
  return catalog.flatMap(item => Number.isInteger(cart[item.id]) && cart[item.id] > 0 && cart[item.id] <= 99 ? [{ ...item, quantity: cart[item.id], total: item.price * cart[item.id] }] : [])
}
export function makeDemoSales(category: DemoCategory, now: Date): Sale[] {
  const catalog = demoCatalogs[category]
  const day = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(day + 'T12:00:00+07:00'); date.setUTCDate(date.getUTCDate() - (6 - i))
    const lines = catalog.slice(0, 3).map((item, j) => ({ id: item.id, name: item.name, sku: 'DEMO', unit: item.unit, price: item.price, quantity: [4, 7, 5, 9, 11, 8, 13][i] + j, total: item.price * ([4, 7, 5, 9, 11, 8, 13][i] + j) }))
    const total = lines.reduce((sum, line) => sum + line.total, 0)
    return { id: `demo-${category}-${i}`, business_id: 'public-demo', actor_id: null, actor_name: 'Kasir contoh', customer: 'Pelanggan contoh', lines, subtotal: total, discount_kind: 'none', discount_value: 0, discount: 0, total, payment: 'cash', received: total, change: 0, status: 'completed', created_at: date.toISOString(), cancelled_at: null, cancelled_by_name: null, cancellation_reason: null, refund_amount: null }
  })
}
