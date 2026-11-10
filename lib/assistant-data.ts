import { z } from 'zod'
import type { Fact } from './assistant'

export const dataSources = ['business', 'staff', 'catalog', 'services', 'inventory', 'stock_history', 'customers', 'payments', 'sales', 'tables', 'orders', 'reservations', 'report', 'billing'] as const
export type DataSource = typeof dataSources[number]
export const dataReadSchema = z.object({ source: z.enum(dataSources), search: z.string().trim().max(80), page: z.number().int().min(1).max(1000), order: z.enum(['default', 'price_desc', 'price_asc']).optional() }).strict().refine(read => !read.order || read.order === 'default' || read.source === 'catalog' || read.source === 'services', 'Urutan harga hanya untuk katalog atau layanan.')
export const dataPlanSchema = z.object({ reads: z.array(dataReadSchema).max(3) }).strict()
export type DataRead = z.infer<typeof dataReadSchema>
export const sourceLabels: Record<DataSource, string> = { business: 'Profil dan jam usaha', staff: 'Staf dan akses', catalog: 'Katalog usaha', services: 'Layanan salon', inventory: 'Inventori saat ini', stock_history: 'Riwayat stok', customers: 'Pelanggan dan poin', payments: 'Metode pembayaran aktif', sales: 'Riwayat transaksi', tables: 'Meja restoran', orders: 'Pesanan restoran', reservations: 'Reservasi restoran', report: 'Laporan penjualan periode pilihan', billing: 'Pajak, layanan, dan poin restoran' }
export function sourceAllowed(source: DataSource, category: string, role: string, permissions: string[]) {
  const has = (permission: string) => permissions.includes('*') || permissions.includes(permission)
  if (!has('reports:view') || !has('products:view') || !['store', 'restaurant', 'barbershop'].includes(category)) return false
  if (['restaurant', 'barbershop'].includes(category) && !['owner', 'admin'].includes(role)) return false
  if (source === 'staff') return role === 'owner'
  if (source === 'customers') return has('customers:view')
  if (source === 'inventory' || source === 'stock_history') return ['store', 'barbershop'].includes(category) && has('inventory:view')
  if (['tables', 'orders', 'reservations', 'billing'].includes(source)) return category === 'restaurant'
  if (source === 'services') return category === 'barbershop'
  if (source === 'sales') return has('transactions:view')
  if (source === 'payments') return role === 'owner' || has('pos:view')
  return true
}

export function dataFacts(read: DataRead, rows: Record<string, unknown>[], total: number, at: string): Fact[] {
  const label = sourceLabels[read.source], start = (read.page - 1) * 20
  const base = `${read.source}_${read.page}`
  const ordering = read.order === 'price_desc' ? ' Harga diurutkan dari tertinggi, sebelum pembagian halaman.' : read.order === 'price_asc' ? ' Harga diurutkan dari terendah, sebelum pembagian halaman.' : ''
  const metadata = `${label}: ${total} hasil${read.search ? ` untuk pencarian ${JSON.stringify(read.search)}` : ''}; halaman ${read.page}, menampilkan ${rows.length} data${rows.length ? ` (${start + 1}–${start + rows.length})` : ''}. ${total > start + rows.length ? 'Masih ada data pada halaman berikutnya; ini bukan daftar lengkap.' : ''}${ordering} Dibaca ${at}.`
  const fact = (id: string, text: string): Fact => ({ id, text, providerText: text, source: label })
  const labels: Record<string, string> = { name: 'Nama', role: 'Role', active: 'Aktif', price: 'Harga rupiah', stock: 'Stok', minimum_stock: 'Stok minimum', unit: 'Satuan', available: 'Menu tersedia', duration_minutes: 'Durasi menit', points: 'Poin', category: 'Kategori', customer: 'Pelanggan', table_name: 'Meja', guests: 'Jumlah tamu', occupied_until_released: 'Belum dilepas manual', operating_hours: 'Jam operasional WIB', starts_at: 'Mulai', ends_at: 'Selesai', deposit_amount: 'DP rupiah', deposit_refunded: 'DP dikembalikan rupiah' }
  const describe = (row: Record<string, unknown>) => Object.entries(row).map(([key, value]) => {
    if (key === 'lines' && Array.isArray(value)) {
      const lines = value.slice(0, 5).map(line => Object.fromEntries(['name','unit','price','quantity','total'].filter(k => Object.hasOwn(line, k)).map(k => [k, line[k]])))
      return `Rincian barang: ${JSON.stringify(lines)}; total baris ${value.length}${value.length > 5 ? ', hanya lima baris awal ditampilkan' : ''}`
    }
    return `${labels[key] || key}: ${typeof value === 'boolean' ? value ? 'Ya' : 'Tidak' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}`
  }).join('; ')
  const money = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? /^\d+$/.test(String(value)) ? 'Rp' + BigInt(String(value)).toLocaleString('id-ID') : String(value) : 'belum tercatat'
  const number = (value: unknown) => Number(value).toLocaleString('id-ID', { maximumFractionDigits: 3 })
  const role = (value: unknown) => ({ owner: 'pemilik', admin: 'admin', cashier: 'kasir' }[String(value)] || String(value))
  const when = (value: unknown) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(String(value))) + ' WIB'
  const status = (value: unknown) => ({ open: 'belum dibayar', paid: 'sudah dibayar', completed: 'selesai', cancelled: 'dibatalkan', reserved: 'dijadwalkan', seated: 'pelanggan sudah datang', no_show: 'tidak hadir', new: 'baru masuk', preparing: 'sedang disiapkan', ready: 'siap disajikan', served: 'sudah disajikan' }[String(value)] || String(value))
  const baseFacts: Fact[] = [
    fact(`${base}_scope`, metadata),
    fact(`${base}_count`, String(total)),
  ]
  if (!rows.length) {
    const emptyUnit = read.source === 'services' ? 'layanan' : read.source === 'catalog' ? 'produk/menu' : read.source === 'staff' ? 'staf' : 'data'
    baseFacts.push(fact(`${base}_empty`, `Belum ada ${emptyUnit} yang tercatat.`))
  }
  return [...baseFacts, ...rows.flatMap((row, index) => {
    const id = `${base}_${index}`, name = String(row.name || '')
    let text = describe(row)
    if (read.source === 'catalog') text = `${name} harganya ${money(row.price)}.${row.active === false ? ' Saat ini dinonaktifkan.' : ''}${row.available === false ? ' Saat ini sedang habis.' : ''}${row.category ? ` Kategori: ${row.category}.` : ''}`
    if (read.source === 'services') text = `${name} tarifnya ${money(row.price)}${row.duration_minutes ? ` (durasi ${number(row.duration_minutes)} menit)` : ''}.${row.active === false ? ' Saat ini dinonaktifkan.' : ''}`
    if (read.source === 'staff') text = `${name} berperan sebagai ${role(row.role)} dan akunnya ${row.active ? 'aktif' : 'nonaktif'}.`
    if (read.source === 'inventory') text = `Stok ${name} saat ini ${number(row.stock)} ${row.unit}, dengan batas minimum ${number(row.minimum_stock)} ${row.unit}.`
    if (read.source === 'customers') text = `${name} memiliki ${number(row.points)} poin dan statusnya ${row.active ? 'aktif' : 'nonaktif'}.`
    if (read.source === 'tables') text = `${name} berkapasitas ${number(row.capacity)} orang.${row.active === false ? ' Meja dinonaktifkan.' : row.occupied_until_released ? ' Pemakaiannya belum dilepas manual.' : ' Tidak ada penahanan manual; pesanan dan kunci reservasi perlu diperiksa terpisah.'}`
    if (read.source === 'business') {
      const hours = row.operating_hours && typeof row.operating_hours === 'object' ? Object.entries(row.operating_hours).map(([day, h]) => {
        const hour = h as { closed: boolean; open: string; close: string }
        return hour.closed ? `${day} tutup` : `${day} pukul ${hour.open}–${hour.close}${hour.close < hour.open ? ' hari berikutnya' : ''}`
      }).join(', ') : 'jam operasional belum diatur'
      text = `${name}${row.address ? ` beralamat di ${row.address}` : ''}. Jadwalnya: ${hours}.`
    }
    if (read.source === 'payments') {
      const methods = Object.entries({ cash: 'tunai', qris: 'QRIS', transfer: 'transfer bank', ewallet: 'e-wallet' }).filter(([key]) => row[key] === true).map(([, label]) => label)
      text = methods.length ? `Pembayaran yang aktif adalah ${methods.join(', ')}. Pembayaran nontunai diperiksa manual.` : 'Belum ada metode pembayaran yang aktif.'
    }
    if (read.source === 'billing') text = `Pajak restoran ${number(row.tax_rate)}% dan biaya layanan ${number(row.service_rate)}%. Biaya layanan berlaku untuk ${row.service_scope === 'all' ? 'semua pesanan' : 'makan di tempat'}; dasar pajaknya ${row.tax_base === 'net_service' ? 'nilai setelah diskon ditambah biaya layanan' : 'nilai setelah diskon'}. Perolehan poin ${row.loyalty_active ? `aktif, setiap ${money(row.earn_nominal)} memperoleh satu poin` : 'nonaktif'}. Penukaran poin ${row.redemption_active ? `aktif dengan nilai ${money(row.point_value)} per poin` : 'nonaktif'}.`
    if (read.source === 'sales') text = `Transaksi ${row.receipt_number || 'tanpa nomor struk'} pada ${when(row.created_at)} berstatus ${status(row.status)}, dengan total ${money(row.total)}. Pelanggannya ${row.customer || 'umum'}.`
    if (read.source === 'orders') text = `Pesanan ${row.customer || 'pelanggan umum'}${row.table_name ? ` di ${row.table_name}` : ' tanpa meja'} senilai ${money(row.subtotal)} berstatus ${status(row.status)}; tahapnya ${status(row.stage)}.`
    if (read.source === 'reservations') text = `Reservasi ${row.customer} untuk ${number(row.guests)} orang di ${row.table_name}, mulai ${when(row.starts_at)} hingga ${when(row.ends_at)}. Statusnya ${status(row.status)}; DP ${money(row.deposit_amount)} dan DP yang telah dikembalikan ${money(row.deposit_refunded)}.`
    if (read.source === 'stock_history') text = `Perubahan stok ${row.product_name} pada ${when(row.created_at)}: dari ${number(row.before_stock)} menjadi ${number(row.after_stock)} ${row.unit}.`
    const result = [{ ...fact(id, text), providerText: describe(row) }]
    if (name) result.push(fact(`${id}_name`, name))
    if ((read.source === 'catalog' || read.source === 'services') && row.price != null) result.push(fact(`${id}_price`, money(row.price)))
    if (read.source === 'services' && row.duration_minutes != null) result.push(fact(`${id}_duration`, `${number(row.duration_minutes)} menit`))
    for (const [key, value] of Object.entries(row)) {
      if (['name', 'price'].includes(key) || value == null || typeof value === 'object') continue
      const rendered = typeof value === 'boolean' ? value ? 'ya' : 'tidak' : typeof value === 'number' ? number(value) : String(value)
      result.push({ ...fact(`${id}_${key}`, rendered), providerText: `${labels[key] || key}: ${rendered}` })
    }
    if (Array.isArray(row.lines) && row.lines.length) {
      const items = row.lines.slice(0, 5).map(line => `${line.name}: ${number(line.quantity)} ${line.unit || 'porsi'}, senilai ${money(line.total)}.`).join('\n')
      result.push(fact(`${id}_items`, items + (row.lines.length > 5 ? '\nIni hanya lima baris awal dari rincian pesanan.' : '')))
    }
    return result
  })]
}
