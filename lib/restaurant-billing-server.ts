import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultRestaurantBilling, type RestaurantBilling } from './restaurant-billing'

export async function readRestaurantBilling(client: SupabaseClient, id: string): Promise<RestaurantBilling> {
  const { data, error } = await client.from('restaurant_billing_settings').select('tax_rate,service_rate,tax_base,service_scope,revision').eq('business_id', id).maybeSingle()
  if (error) throw Error('Pengaturan pajak dan biaya layanan belum dapat dimuat. Periksa layanan lalu coba lagi.')
  return data || defaultRestaurantBilling
}
