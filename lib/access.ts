import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseConfig } from '@/lib/supabase/config'
import { homeForRole, type Role } from '@/lib/auth/permissions'
import type { Business, Member } from '@/lib/validation'

export async function requireAccount() {
  if (!getSupabaseConfig()) redirect('/login?notice=configuration')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { data, error: memberError } = await supabase.from('business_members').select('*').eq('user_id', user.id).maybeSingle()
  if (memberError) throw new Error('Data akses usaha belum dapat dibaca. Periksa koneksi dan schema Supabase.')
  return { supabase, user, member: data as Member | null }
}

export async function requireBusiness(roles?: Role[], allowDraft = false) {
  const context = await requireAccount()
  const { member, user, supabase } = context
  if (!member) redirect(user.app_metadata.account_type === 'staff' ? '/account' : '/onboarding')
  if (!member.active) redirect('/account')
  if (member.must_change_password) redirect('/account/password')
  if (roles && !roles.includes(member.role)) redirect(homeForRole(member.role))
  const { data, error } = await supabase.from('businesses').select('*').eq('id', member.business_id).single()
  if (error || !data) throw new Error('Profil usaha belum dapat dibaca. Coba muat ulang halaman.')
  if (!data.onboarding_completed_at && (!allowDraft || member.role !== 'owner')) redirect(member.role === 'owner' ? '/onboarding/summary' : '/account?notice=setup')
  return { ...context, member, business: data as Business }
}

export async function redirectAfterLogin(): Promise<never> {
  const { member, user, supabase } = await requireAccount()
  if (!member) redirect(user.app_metadata.account_type === 'staff' ? '/account' : '/onboarding')
  if (!member.active) redirect('/account')
  if (member.must_change_password) redirect('/account/password')
  const { data: business, error } = await supabase.from('businesses').select('onboarding_completed_at').eq('id', member.business_id).single()
  if (error || !business) throw new Error('Status pengaturan usaha belum dapat dibaca.')
  if (!business.onboarding_completed_at) redirect(member.role === 'owner' ? '/onboarding/summary' : '/account?notice=setup')
  redirect(homeForRole(member.role))
}
