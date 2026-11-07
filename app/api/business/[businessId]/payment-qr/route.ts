import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { paymentQrBucket } from '@/lib/business-payments-server'

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  const { businessId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return new Response(null, { status: 404, headers })

  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return new Response(null, { status: 401, headers })

  const { data: member, error: memberError } = await client.from('business_members').select('role,active,must_change_password').eq('business_id', businessId).eq('user_id', user.id).maybeSingle()
  if (memberError) return new Response(null, { status: 502, headers })
  if (!member || !member.active || member.must_change_password) return new Response(null, { status: 404, headers })
  const { data: business, error: businessError } = await client.from('businesses').select('category,onboarding_completed_at').eq('id', businessId).maybeSingle()
  if (businessError) return new Response(null, { status: 502, headers })
  if (!business || !['store','restaurant','barbershop'].includes(business.category)) return new Response(null, { status: 404, headers })
  if (member.role !== 'owner') {
    if (!business.onboarding_completed_at) return new Response(null, { status: 404, headers })
    if (business.category === 'store') {
      const permission = await client.rpc('has_business_permission', { target_id: businessId, permission: 'pos:view' })
      if (permission.error) return new Response(null, { status: 502, headers })
      if (!permission.data) return new Response(null, { status: 404, headers })
    } else if (!['admin','cashier'].includes(member.role)) return new Response(null, { status: 404, headers })
  }

  let qrisAssetId: string | null = null
  const { data: settings } = await client.from('business_payments').select('qris_asset').eq('business_id', businessId).maybeSingle()
  qrisAssetId = settings?.qris_asset || null

  if (!qrisAssetId) {
    try {
      const admin = createAdminClient()
      const { data: adminSettings } = await admin.from('business_payments').select('qris_asset').eq('business_id', businessId).maybeSingle()
      qrisAssetId = adminSettings?.qris_asset || null
    } catch {}
  }
  if (!qrisAssetId) return new Response(null, { status: 404, headers })

  let assetPath: string | null = null
  const { data: asset } = await client.from('business_payment_assets').select('path').eq('id', qrisAssetId).eq('business_id', businessId).eq('state','active').maybeSingle()
  assetPath = asset?.path || null

  if (!assetPath) {
    try {
      const admin = createAdminClient()
      const { data: adminAsset } = await admin.from('business_payment_assets').select('path').eq('id', qrisAssetId).eq('business_id', businessId).eq('state','active').maybeSingle()
      assetPath = adminAsset?.path || null
    } catch {}
  }
  if (!assetPath || !assetPath.startsWith(businessId+'/')) return new Response(null, { status: 404, headers })

  let file = await client.storage.from(paymentQrBucket).download(assetPath)
  if (file.error || !file.data) {
    try {
      const admin = createAdminClient()
      file = await admin.storage.from(paymentQrBucket).download(assetPath)
    } catch {}
  }

  if (file.error || !file.data) return new Response(null, { status: 404, headers })
  return new Response(await file.data.arrayBuffer(), { headers: { ...headers, 'Content-Type': 'image/png' } })
}
