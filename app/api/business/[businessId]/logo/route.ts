import { createClient } from '@/lib/supabase/server'
import { logoBucket } from '@/lib/business-logo-server'

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  const { businessId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return new Response(null, { status: 404, headers })
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new Response(null, { status: 401, headers })
  const { data: member } = await supabase.from('business_members').select('business_id,active,must_change_password').eq('user_id', user.id).single()
  if (!member || !member.active || member.must_change_password || member.business_id !== businessId) return new Response(null, { status: 403, headers })
  const { data: business } = await supabase.from('businesses').select('logo_path').eq('id', businessId).single()
  if (!business?.logo_path) return new Response(null, { status: 404, headers })
  // User JWT + Storage RLS, rather than public or bearer signed URLs. Revocation
  // takes effect on every request, including for an old image URL after logout.
  const { data, error } = await supabase.storage.from(logoBucket).download(business.logo_path)
  if (error || !data) return new Response(null, { status: 404, headers })
  return new Response(await data.arrayBuffer(), { headers: { ...headers, 'Content-Type': 'image/png' } })
}
