import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RestaurantMenu, RestaurantTable, RestaurantOrderFilters, RestaurantOrderPage, RestaurantOverviewData } from './restaurant'

async function rows<T>(client: SupabaseClient, table: string, businessId: string, order: string): Promise<T[]> {
  const result: T[] = []
  for (let start = 0; start <= 5000; start += 500) {
    const { data, error } = await client.from(table).select('*').eq('business_id', businessId).order(order).order('id').range(start, start + 499).abortSignal(AbortSignal.timeout(15000))
    if (error || !data) throw Error('Data restoran belum dapat dimuat. Periksa koneksi dan migrasi restoran.')
    result.push(...data as T[])
    if (result.length > 5000) throw Error('Data restoran melebihi batas tampilan 5.000 baris. Hubungi pengelola sebelum melanjutkan.')
    if (data.length < 500) return result
  }
  return result
}
export const readRestaurantMenu = (client: SupabaseClient, id: string) => rows<RestaurantMenu>(client, 'restaurant_menu', id, 'name')
export const readRestaurantTables = (client: SupabaseClient, id: string) => rows<RestaurantTable>(client, 'restaurant_tables', id, 'name')
export async function readRestaurantOrdersPage(client: SupabaseClient, id: string, filters: RestaurantOrderFilters = { status: 'open', query: '', page: 0 }): Promise<RestaurantOrderPage> {
  const { data, error } = await client.rpc('read_restaurant_orders_page', { target_id: id, order_status: filters.status, search_text: filters.query, requested_page: filters.page }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) throw Error('Daftar pesanan belum dapat dibaca. Periksa koneksi dan migrasi pembacaan restoran.')
  return data
}
export async function readRestaurantOverview(client: SupabaseClient, id: string): Promise<RestaurantOverviewData> {
  const { data, error } = await client.rpc('read_restaurant_overview', { target_id: id }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) throw Error('Ringkasan restoran belum dapat dibaca. Periksa koneksi dan migrasi pembacaan restoran.')
  return data
}
export async function readRestaurantUsage(client: SupabaseClient, id: string): Promise<{ id: string; occupied: boolean }[]> {
  const { data, error } = await client.rpc('restaurant_table_usage', { target_id: id }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) throw Error('Ketersediaan meja belum dapat dibaca. Muat ulang sebelum menerima pesanan.')
  return data
}
