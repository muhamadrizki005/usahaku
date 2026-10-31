import { z } from 'zod'
import type { Sale, SaleLine } from './pos'

const money = z.string().regex(/^(0|[1-9]\d{0,11})$/, 'Gunakan rupiah bulat, tanpa pemisah ribuan.')
export const restaurantMenuSchema = z.object({ name: z.string().trim().min(1, 'Isi nama menu.').max(100, 'Nama menu maksimal 100 karakter.'), category: z.string().trim().min(1, 'Isi kategori menu.').max(100, 'Kategori menu maksimal 100 karakter.'), price: money, available: z.boolean(), active: z.boolean() }).strict()
export const restaurantTableSchema = z.object({ name: z.string().trim().min(1, 'Isi nama/nomor meja.').max(60, 'Nama/nomor meja maksimal 60 karakter.'), capacity: z.number({ error: 'Isi kapasitas meja dengan angka.' }).int('Kapasitas meja harus bilangan bulat.').min(1, 'Kapasitas meja minimal 1 orang.').max(1000, 'Kapasitas meja maksimal 1.000 orang.'), active: z.boolean() }).strict()
export const restaurantOrderSchema = z.object({
  kind: z.enum(['dine_in', 'takeaway'], { error: 'Pilih makan di tempat atau bawa pulang.' }), tableId: z.uuid({ error: 'Pilihan meja tidak valid. Pilih kembali dari daftar meja.' }).nullable(), guests: z.number({ error: 'Isi jumlah tamu dengan angka.' }).int('Jumlah tamu harus bilangan bulat.').min(1, 'Jumlah tamu minimal 1 orang.').max(1000, 'Jumlah tamu maksimal 1.000 orang.'),
  customer: z.string().trim().min(1, 'Isi nama pelanggan atau gunakan Pelanggan umum.').max(100, 'Nama pelanggan maksimal 100 karakter.'), notes: z.string().trim().max(300, 'Catatan pesanan maksimal 300 karakter.'), stage: z.enum(['new', 'preparing', 'ready', 'served'], { error: 'Pilih proses pesanan yang tersedia.' }),
  lines: z.array(z.object({ id: z.uuid({ error: 'Menu tidak valid. Pilih kembali dari daftar menu.' }), quantity: z.number({ error: 'Isi jumlah menu dengan angka.' }).int('Jumlah menu harus berupa porsi utuh.').min(1, 'Jumlah menu minimal 1 porsi.').max(9999, 'Jumlah menu maksimal 9.999 porsi per baris.') }).strict()).min(1, 'Tambahkan minimal satu menu ke pesanan.').max(100, 'Maksimal 100 jenis menu per pesanan.'),
}).strict().refine(v => v.kind === 'dine_in' ? v.tableId !== null : v.tableId === null, 'Pilih meja untuk makan di tempat; bawa pulang tidak memakai meja.')
export const restaurantPaymentSchema = z.object({ payment: z.enum(['cash', 'qris', 'transfer'], { error: 'Pilih tunai, QRIS, atau transfer.' }), received: money, discountKind: z.enum(['none', 'amount', 'percent'], { error: 'Pilih jenis diskon yang tersedia.' }), discountValue: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, 'Isi nilai diskon dengan angka, maksimal dua desimal menggunakan titik.'), confirmed: z.literal(true, { error: 'Konfirmasi bahwa pembayaran sudah diterima dan diperiksa.' }) }).strict()
export type RestaurantMenu = { id: string; business_id: string; name: string; category: string; price: number; active: boolean; available: boolean; revision: number }
export type RestaurantTable = { id: string; business_id: string; name: string; capacity: number; active: boolean; revision: number }
export type RestaurantOrder = {
  id: string; business_id: string; actor_id: string | null; actor_name: string; kind: 'dine_in' | 'takeaway'; table_id: string | null; table_name: string | null;
  guests: number; customer: string; notes: string; lines: SaleLine[]; subtotal: number; status: 'open' | 'paid' | 'cancelled';
  stage: 'new' | 'preparing' | 'ready' | 'served'; revision: number; sale_id: string | null; cancellation_reason: string | null; created_at: string; updated_at: string;
}
export type RestaurantResult = { value?: RestaurantMenu | RestaurantTable | RestaurantOrder | { order: RestaurantOrder; sale: Sale }; error?: string; uncertain?: boolean }
export const restaurantStages = { new: 'Baru', preparing: 'Diproses', ready: 'Siap', served: 'Disajikan / diserahkan' } as const
export const restaurantOrderCode = (id: string) => 'PSN-' + id.slice(0, 8).toUpperCase()
export const restaurantOrderFilters = z.object({ status: z.enum(['open', 'paid', 'cancelled', 'all']), query: z.string().trim().max(100), page: z.number().int().min(0).max(1000000) }).strict()
export type RestaurantOrderFilters = z.infer<typeof restaurantOrderFilters>
export type RestaurantOrderPage = { orders: RestaurantOrder[]; total: number; page: number; pageSize: 25 }
export type RestaurantOverviewData = { revenue: number; saleCount: number; openCount: number; occupiedCount: number; menuCount: number; tableCount: number; recent: Pick<RestaurantOrder, 'id' | 'table_name' | 'stage' | 'subtotal' | 'created_at'>[] }
export function restaurantCashAmount(value: string): number | null {
  return /^(0|[1-9]\d{0,11})$/.test(value) ? Number(value) : null
}
