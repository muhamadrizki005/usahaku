import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'
import { paymentSettingsView, type PaymentSettingsRow } from './business-payments'

export const paymentQrBucket = 'business-payment-qr'

export async function readBusinessPayments(client: SupabaseClient, businessId: string) {
  try {
    const { data, error } = await client.from('business_payments').select('*').eq('business_id', businessId).maybeSingle()
    if (!error && data) {
      return paymentSettingsView(data as PaymentSettingsRow)
    }
    if (error) {
      console.error('readBusinessPayments client query error:', error)
      try {
        const admin = createAdminClient()
        const fallback = await admin.from('business_payments').select('*').eq('business_id', businessId).maybeSingle()
        if (fallback.data) {
          return paymentSettingsView(fallback.data as PaymentSettingsRow)
        }
      } catch (adminErr) {
        console.error('readBusinessPayments admin fallback error:', adminErr)
      }
    }
    return paymentSettingsView(data as PaymentSettingsRow | null)
  } catch (err) {
    console.error('readBusinessPayments exception:', err)
    return paymentSettingsView(null)
  }
}

export async function cleanupPaymentQrs(businessId: string) {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('business_payment_assets').select('id').eq('business_id', businessId).in('state', ['staging', 'retired', 'deleting']).order('created_at').limit(25)
    if (error) return false
    let clean = true
    for (const asset of data || []) {
      const claim = await admin.rpc('claim_payment_qr_cleanup', { asset_id: asset.id })
      if (claim.error) { clean = false; continue }
      if (!claim.data) continue
      const removed = await admin.storage.from(paymentQrBucket).remove([claim.data])
      if (removed.error) { clean = false; continue }
      const mark = await admin.from('business_payment_assets').update({ state: 'deleted' }).eq('id', asset.id).eq('state', 'deleting')
      if (mark.error) clean = false
    }
    return clean
  } catch {
    return false
  }
}
