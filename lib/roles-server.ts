import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type BusinessRole,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_CASHIER_PERMISSIONS,
  normalizeRoleKey,
} from './auth/rbac'

export async function seedDefaultBusinessRoles(
  supabase: SupabaseClient,
  businessId: string
): Promise<void> {
  const adminRole = {
    business_id: businessId,
    name: 'Admin Toko',
    description: 'Akses operasional toko termasuk produk, stok, kasir, transaksi, pelanggan, dan laporan.',
    is_default: true,
    permissions: DEFAULT_ADMIN_PERMISSIONS,
  }

  const cashierRole = {
    business_id: businessId,
    name: 'Petugas Kasir',
    description: 'Akses transaksi penjualan di kasir (POS) dan melihat transaksi sendiri.',
    is_default: true,
    permissions: DEFAULT_CASHIER_PERMISSIONS,
  }

  await supabase
    .from('business_roles')
    .upsert([adminRole, cashierRole], {
      onConflict: 'business_id,name',
      ignoreDuplicates: true,
    })
}

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

  if (error) {
    console.error('Error fetching business roles:', error)
    return []
  }

  if (!data || data.length === 0) {
    // If not seeded yet, seed and re-query
    await seedDefaultBusinessRoles(supabase, businessId)
    const { data: reloaded } = await supabase
      .from('business_roles')
      .select('*')
      .eq('business_id', businessId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    return (reloaded || []).map(r => ({
      ...r,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
    })) as BusinessRole[]
  }

  return data.map(r => ({
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
    .eq('active', true)

  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const row of data) {
    const roleKey = normalizeRoleKey(row.role)
    counts[roleKey] = (counts[roleKey] || 0) + 1
  }
  return counts
}

