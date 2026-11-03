import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Reservation, ReservationPage } from './restaurant-reservations'

export async function readReservations(client: SupabaseClient, business: string, day: string, page = 0): Promise<ReservationPage> {
  const { data, error } = await client.rpc('read_restaurant_reservations', { target_id: business, day_text: day, requested_page: page }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) throw Error('Reservasi belum dapat dimuat. Periksa koneksi dan migrasi reservasi.')
  return data
}
export async function readReservation(client: SupabaseClient, business: string, id: string): Promise<Reservation | null> {
  const { data, error } = await client.from('restaurant_reservations').select('*').eq('business_id', business).eq('id', id).maybeSingle()
  if (error) throw Error('Reservasi belum dapat dibaca.')
  return data
}
