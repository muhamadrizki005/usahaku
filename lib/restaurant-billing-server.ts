import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'
import { defaultRestaurantBilling, type RestaurantBilling } from './restaurant-billing'

export async function readRestaurantBilling(client: SupabaseClient, id: string): Promise<RestaurantBilling> {
  async function withLoyalty(settings:RestaurantBilling):Promise<RestaurantBilling>{
    const {data}=await client.from('businesses').select('loyalty_active,loyalty_point_nominal,loyalty_redemptions').eq('id',id).maybeSingle()
    return{...settings,loyalty_active:Boolean(data?.loyalty_active),earn_nominal:Number(data?.loyalty_point_nominal||10000),redemptions:Array.isArray(data?.loyalty_redemptions)?data.loyalty_redemptions:[]}
  }
  try {
    const { data, error } = await client.from('restaurant_billing_settings').select('*').eq('business_id', id).maybeSingle()
    if (!error && data) return withLoyalty(data)
    if (error) {
      try {
        const admin = createAdminClient()
        const fallback = await admin.from('restaurant_billing_settings').select('*').eq('business_id', id).maybeSingle()
        if (fallback.data) return withLoyalty(fallback.data)
      } catch {}
    }
    return withLoyalty(defaultRestaurantBilling)
  } catch {
    return defaultRestaurantBilling
  }
}
