import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseConfig } from '@/lib/supabase/config'
import { homeForRole } from '@/lib/auth/permissions'
import { findBusinessRole, hasPermission, resolveMemberPermissions, roleValue } from '@/lib/auth/rbac'
import { readBusinessRoles } from '@/lib/roles-server'
import type { Business, Member } from '@/lib/validation'

export const requireAccount = cache(async function requireAccount() {
  if (!getSupabaseConfig()) redirect('/login?notice=configuration')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { data, error: memberError } = await supabase.from('business_members').select('*').eq('user_id', user.id).maybeSingle()
  if (memberError) throw new Error('Data akses usaha belum dapat dibaca. Periksa koneksi dan schema Supabase.')
  return { supabase, user, member: data as Member | null }
})

export const resolveAccessMember = cache(async function resolveAccessMember(supabase: Awaited<ReturnType<typeof createClient>>, member: Member): Promise<Member> {
  if (member.role === 'owner') return { ...member, permissions: resolveMemberPermissions('owner') }
  const roles = await readBusinessRoles(supabase, member.business_id)
  const configured = findBusinessRole(member.role, roles)
  return { ...member, role: configured ? roleValue(configured) : member.role, role_name: configured?.name, permissions: resolveMemberPermissions(member.role, roles) }
})

// Share reads only within one server render; permissions are still checked by each caller.
const readAccessBusiness = cache(async (supabase: Awaited<ReturnType<typeof createClient>>, businessId: string) =>
  supabase.from('businesses').select('*').eq('id', businessId).single()
)

export async function requireBusiness(roles?: string[], allowDraft = false, requiredPermission?: string | string[]) {
  const context = await requireAccount()
  const { member: rawMember, user, supabase } = context
  if (!rawMember) redirect(user.app_metadata.account_type === 'staff' ? '/account' : '/onboarding')
  if (!rawMember.active) redirect('/account')
  if (rawMember.must_change_password) redirect('/account/password')
  const member = await resolveAccessMember(supabase, rawMember)
  const home = homeForRole(member.role, member.permissions)
  const { data, error } = await readAccessBusiness(supabase, member.business_id)
  if (error || !data) throw new Error('Profil usaha belum dapat dibaca. Coba muat ulang halaman.')
  const business = data as Business
  if (!business.onboarding_completed_at && (!allowDraft || member.role !== 'owner')) redirect(member.role === 'owner' ? '/onboarding/summary' : '/account?notice=setup')
  if (business.category !== 'store' && !['owner', 'admin', 'cashier'].includes(member.role)) redirect('/account?notice=permissions')
  const needed = requiredPermission ? (Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]) : []
  if (business.category === 'barbershop' && needed.some(p => /^(products|inventory):/.test(p))) redirect('/dashboard/salon/services')
  if (needed.some(permission => !hasPermission(member.role, member.permissions, permission))) redirect(home)
  if (roles && !roles.includes(member.role)) redirect(home)
  return { ...context, member, business }
}

export async function requirePermission(permission: string | string[], allowDraft = false) {
  return requireBusiness(undefined, allowDraft, permission)
}

export async function redirectAfterLogin(): Promise<never> {
  const { member: rawMember, user, supabase } = await requireAccount()
  if (!rawMember) redirect(user.app_metadata.account_type === 'staff' ? '/account' : '/onboarding')
  if (!rawMember.active) redirect('/account')
  if (rawMember.must_change_password) redirect('/account/password')
  const member = await resolveAccessMember(supabase, rawMember)
  const { data: business, error } = await supabase.from('businesses').select('onboarding_completed_at').eq('id', member.business_id).single()
  if (error || !business) throw new Error('Status pengaturan usaha belum dapat dibaca.')
  if (!business.onboarding_completed_at) redirect(member.role === 'owner' ? '/onboarding/summary' : '/account?notice=setup')
  redirect(homeForRole(member.role, member.permissions))
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
