import { z } from 'zod'

export const reservationSchema = z.object({
  tableId: z.uuid(), guests: z.number().int().min(1).max(1000),
  customer: z.string().trim().min(1, 'Isi nama pelanggan.').max(100),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,30}$/, 'Isi nomor kontak 8–30 karakter.'),
  notes: z.string().trim().max(300), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
}).strict().refine(v => Date.parse(v.endsAt) > Date.parse(v.startsAt) && Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 12 * 3600000, 'Durasi reservasi harus lebih dari 0 hingga 12 jam.')
export type Reservation = { id: string; business_id: string; actor_id: string | null; actor_name: string; table_id: string; table_name: string; guests: number; customer: string; phone: string; notes: string; starts_at: string; ends_at: string; status: 'reserved' | 'seated' | 'completed' | 'cancelled' | 'no_show'; deposit_amount: number; deposit_payment: 'cash' | 'qris' | 'transfer' | 'ewallet' | null; deposit_at: string | null; deposit_refunded: number; refunded_at: string | null; cancellation_reason: string | null; revision: number }
export type ReservationPage = { items: Reservation[]; total: number; page: number; pageSize: number }
export type ReservationAvailability = { id: string; name: string; capacity: number; available: boolean }
export const reservationStatus = { reserved: 'Dijadwalkan', seated: 'Sudah datang', completed: 'Selesai', cancelled: 'Dibatalkan', no_show: 'Tidak hadir' }
export const reservationLocalTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16)
export function reservationIso(local: string) {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw Error('Isi tanggal dan jam WIB yang valid.')
  const date = new Date(local + ':00+07:00')
  if (!Number.isFinite(date.getTime()) || reservationLocalTime(date.toISOString()) !== local) throw Error('Tanggal atau jam tidak valid.')
  return date.toISOString()
}
export function reservationBalance(total: number, deposit: number) {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(deposit) || deposit < 0 || deposit > total) throw Error('DP melebihi tagihan. Sesuaikan pesanan/diskon atau batalkan reservasi dengan refund penuh dahulu.')
  return total - deposit
}
