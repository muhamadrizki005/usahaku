import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseConfig } from '@/lib/supabase/config'
import { homeForRole } from '@/lib/auth/permissions'
import { resolveMemberPermissions, hasPermission } from '@/lib/auth/rbac'
import { readBusinessRoles } from '@/lib/roles-server'
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

export async function requireBusiness(roles?: string[], allowDraft = false, requiredPermission?: string) {
  const context = await requireAccount()
  const { member: rawMember, user, supabase } = context
  if (!rawMember) redirect(user.app_metadata.account_type === 'staff' ? '/account' : '/onboarding')
  if (!rawMember.active) redirect('/account')
  if (rawMember.must_change_password) redirect('/account/password')

  // Resolve member permissions from business_roles
  let permissions: string[] = []
  try {
    const businessRoles = await readBusinessRoles(supabase, rawMember.business_id)
    permissions = resolveMemberPermissions(rawMember.role, businessRoles)
  } catch (err) {
    console.error('Error loading roles in requireBusiness:', err)
    permissions = resolveMemberPermissions(rawMember.role, [])
  }
  const member: Member = { ...rawMember, permissions }

  // 1. If explicit permission is required, check permission
  if (requiredPermission && !hasPermission(member.role, permissions, requiredPermission)) {
    redirect(homeForRole(member.role, permissions))
  }

  // 2. If legacy roles array is provided:
  // Owner always passes.
  // Otherwise, if role is directly in roles, pass.
  // If role is custom, check if the member has appropriate module permission for that path
  if (roles && member.role !== 'owner') {
    const isDirectMatch = roles.includes(member.role)
    if (!isDirectMatch) {
      redirect(homeForRole(member.role, permissions))
    }
  }

  const { data, error } = await supabase.from('businesses').select('*').eq('id', member.business_id).single()
  if (error || !data) throw new Error('Profil usaha belum dapat dibaca. Coba muat ulang halaman.')
  if (!data.onboarding_completed_at && (!allowDraft || member.role !== 'owner')) redirect(member.role === 'owner' ? '/onboarding/summary' : '/account?notice=setup')
  return { ...context, member, business: data as Business }
}

export async function requirePermission(permission: string, allowDraft = false) {
  return requireBusiness(undefined, allowDraft, permission)
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

export async function requireOnboardingDraft() {
  const context = await requireAccount()
  const { member, user, supabase } = context
  if (member) {
    if (!member.active || member.must_change_password || member.role !== 'owner') return redirectAfterLogin()
    const { data: business, error } = await supabase.from('businesses').select('*').eq('id', member.business_id).single()
    if (error || !business) throw new Error('Profil usaha belum dapat dibaca. Coba muat ulang halaman.')
    if (business.onboarding_completed_at) redirect('/dashboard')
    return { ...context, member, business: business as Business }
  }
  if (user.app_metadata.account_type === 'staff') redirect('/account')
  return { ...context, member: null, business: null }
}
