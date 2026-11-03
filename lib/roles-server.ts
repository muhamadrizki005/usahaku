import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { builtInRole, type BusinessRole } from './auth/rbac'

export async function readBusinessRoles(
  supabase: SupabaseClient,
  businessId: string
): Promise<BusinessRole[]> {
  const { data, error } = await supabase
    .from('business_roles')
    .select('*')
    .eq('business_id', businessId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw new Error('Daftar role belum dapat dibaca. Muat ulang atau hubungi pengelola aplikasi.')

  return (data || []).map(r => ({
    ...r,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
  })) as BusinessRole[]
}

export async function readRoleMemberCounts(
  supabase: SupabaseClient,
  businessId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)


  if (error) throw new Error('Jumlah anggota role belum dapat dibaca. Muat ulang halaman.')
  if (!data) return {}

  const counts: Record<string, number> = {}
  for (const row of data) {
    const roleKey = builtInRole(row.role) || row.role
    counts[roleKey] = (counts[roleKey] || 0) + 1
  }
  return counts
}
