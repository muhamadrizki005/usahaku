'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireBusiness } from '@/lib/access'
import { reservationSchema, type Reservation, type ReservationAvailability, type ReservationPage } from '@/lib/restaurant-reservations'
import { readReservations } from '@/lib/restaurant-reservations-server'
import { reservationBookingExtras } from '@/lib/reservation-booking'
import { restaurantFailure } from '@/lib/restaurant-errors'

const ids = z.object({ id: z.uuid(), revision: z.number().int().nonnegative().nullable(), request: z.uuid() }).strict()
export type ReservationResult = { value?: Reservation; error?: string; uncertain?: boolean }
export async function createReservationBooking(input: unknown, details: unknown, extras: unknown): Promise<ReservationResult> {
  const { supabase, business } = await context(), parsed = ids.safeParse(input), values = reservationSchema.safeParse(details), options = reservationBookingExtras.safeParse(extras)
  if (!parsed.success || parsed.data.revision !== null) return { error: 'Permintaan reservasi baru tidak valid.' }
  if (!values.success) return { error: values.error.issues[0].message }
  if (!options.success) return { error: options.error.issues[0].message }
  const p = parsed.data
  const { data, error } = await supabase.rpc('create_restaurant_reservation_bundle', { target_id: business.id, item_id: p.id, operation_id: p.request, details: values.data, meal: options.data.meal, deposit: options.data.deposit }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) {
    if (error?.details && error.code === 'PT409') { const result = restaurantFailure(error, 'order'); return { error: result.error, uncertain: result.uncertain } }
    if (error?.code === 'PGRST202') return { error: 'Reservasi belum dapat disimpan. Hubungi pengelola untuk memeriksa layanan.' }
    return failure(error)
  }
  revalidatePath('/dashboard', 'layout'); return { value: data }
}
export async function arriveReservation(input: unknown): Promise<ReservationResult> {
  const { supabase, business } = await context(), parsed = ids.safeParse(input)
  if (!parsed.success || parsed.data.revision === null) return { error: 'Permintaan kedatangan tidak valid.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('arrive_restaurant_reservation', { target_id: business.id, item_id: p.id, expected_revision: p.revision, operation_id: p.request }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error)
  revalidatePath('/dashboard', 'layout'); return { value: data }
}
export async function saveReservationLockSettings(input: unknown): Promise<{ value?: { minutes: number; revision: number; conflicts: number }; error?: string; uncertain?: boolean }> {
  const { supabase, business } = await requireBusiness(['owner'])
  if (business.category !== 'restaurant') return { error: 'Pengaturan hanya tersedia untuk restoran.' }
  const parsed = z.object({ revision: z.number().int().nonnegative(), request: z.uuid(), minutes: z.number().int().min(0).max(720) }).strict().safeParse(input)
  if (!parsed.success) return { error: 'Isi waktu penguncian 0–720 menit.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('save_restaurant_lock_settings', { target_id: business.id, expected_revision: p.revision, operation_id: p.request, minutes: p.minutes }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) { const result = failure(error); return { error: result.error, uncertain: result.uncertain } }
  revalidatePath('/dashboard', 'layout'); return { value: data }
}
function failure(error: { code?: string; message?: string } | null): ReservationResult {
  if (error?.code === 'P0001') return { error: error.message }
  if (error?.code === '42501') return { error: 'Akses reservasi ditolak. Periksa izin staf atau usaha yang digunakan.' }
  if (error?.code === 'PT409' || error?.code === '23505') return { error: 'Reservasi atau DP sudah berubah. Tutup formulir dan muat ulang sebelum melanjutkan.' }
  if (['22023','22007','22008','22P02','23514'].includes(error?.code || '')) return { error: 'Data tidak valid. Periksa jadwal mendatang, durasi maksimal 12 jam, meja, kontak, serta nominal.' }
  return { error: 'Hasil belum dapat dipastikan. Ulangi permintaan yang sama atau periksa setelah muat ulang.', uncertain: true }
}
async function context() {
  const value = await requireBusiness(['owner','admin','cashier'])
  if (value.business.category !== 'restaurant') throw Error('Reservasi hanya tersedia untuk restoran.')
  return value
}
export async function loadReservations(day: string, page: number): Promise<{ data?: ReservationPage; error?: string }> {
  const { supabase, business } = await context()
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(page) || page < 0 || page > 1000000) return { error: 'Filter tanggal tidak valid.' }
  try { return { data: await readReservations(supabase, business.id, day, page) } } catch { return { error: 'Reservasi belum dapat dimuat. Coba lagi.' } }
}
export async function loadReservationAvailability(input: unknown): Promise<{ items?: ReservationAvailability[]; error?: string }> {
  const { supabase, business } = await context()
  const parsed = z.object({ startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), guests: z.number().int().min(1).max(1000), exclude: z.uuid().nullable() }).strict().safeParse(input)
  if (!parsed.success) return { error: 'Isi jadwal dan jumlah tamu terlebih dahulu.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('restaurant_reservation_availability', { target_id: business.id, from_ts: p.startsAt, to_ts: p.endsAt, guest_count: p.guests, exclude_id: p.exclude }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  return error ? { error: 'Ketersediaan meja belum dapat diperiksa. Periksa jadwal lalu coba lagi.' } : { items: data }
}
export async function saveReservation(input: unknown, details: unknown): Promise<ReservationResult> {
  const { supabase, business } = await context(), parsed = ids.safeParse(input), values = reservationSchema.safeParse(details)
  if (!parsed.success || !values.success) return { error: !values.success ? values.error.issues[0].message : 'Permintaan tidak valid.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('save_restaurant_reservation', { target_id: business.id, item_id: p.id, expected_revision: p.revision, operation_id: p.request, details: values.data }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error)
  revalidatePath('/dashboard','layout'); return { value: data }
}
export async function recordReservationDeposit(input: unknown, details: unknown): Promise<ReservationResult> {
  const { supabase, business } = await context(), parsed = ids.safeParse(input)
  const values = z.object({ amount: z.string().regex(/^[1-9]\d{0,11}$/), payment: z.enum(['cash','qris','transfer']), confirmed: z.literal(true) }).strict().safeParse(details)
  if (!parsed.success || parsed.data.revision === null || !values.success) return { error: 'Isi nominal DP rupiah bulat dan konfirmasikan pembayaran yang telah diterima.' }
  const p = parsed.data, v = values.data
  const { data, error } = await supabase.rpc('record_restaurant_deposit', { target_id: business.id, item_id: p.id, expected_revision: p.revision, operation_id: p.request, amount: v.amount, payment_method: v.payment, confirmed: v.confirmed }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error)
  revalidatePath('/dashboard','layout'); return { value: data }
}
export async function closeReservation(input: unknown, details: unknown): Promise<ReservationResult> {
  const { supabase, business } = await context(), parsed = ids.safeParse(input)
  const values = z.object({ reason: z.string().trim().min(3).max(300), noShow: z.boolean(), refund: z.boolean() }).strict().safeParse(details)
  if (!parsed.success || parsed.data.revision === null || !values.success) return { error: 'Isi alasan minimal 3 karakter dan konfirmasi refund bila ada DP.' }
  const p = parsed.data, v = values.data
  const { data, error } = await supabase.rpc('close_restaurant_reservation', { target_id: business.id, item_id: p.id, expected_revision: p.revision, operation_id: p.request, reason: v.reason, no_show: v.noShow, refund_confirmed: v.refund }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error)
  revalidatePath('/dashboard','layout'); return { value: data }
}
