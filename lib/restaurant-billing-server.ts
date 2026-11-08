import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'
import { defaultRestaurantBilling, type RestaurantBilling } from './restaurant-billing'

export async function readRestaurantBilling(client: SupabaseClient, id: string): Promise<RestaurantBilling> {
  try {
    const { data, error } = await client.from('restaurant_billing_settings').select('*').eq('business_id', id).maybeSingle()
    if (!error && data) return data
    if (error) {
      try {
        const admin = createAdminClient()
        const fallback = await admin.from('restaurant_billing_settings').select('*').eq('business_id', id).maybeSingle()
        if (fallback.data) return fallback.data
      } catch {}
    }
    return defaultRestaurantBilling
  } catch {
    return defaultRestaurantBilling
  }
}
