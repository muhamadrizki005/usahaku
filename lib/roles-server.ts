import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'
import { builtInRole, type BusinessRole, DEFAULT_ADMIN_PERMISSIONS, DEFAULT_CASHIER_PERMISSIONS } from './auth/rbac'

export function defaultBuiltInRoles(businessId: string): BusinessRole[] {
  return [
    {
      id: 'default-admin-' + businessId,
      business_id: businessId,
      name: 'Admin Toko',
      description: 'Akses operasional penuh ke produk, stok, kasir, pelanggan, dan laporan.',
      is_default: true,
      role_key: 'admin',
      permissions: DEFAULT_ADMIN_PERMISSIONS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'default-cashier-' + businessId,
      business_id: businessId,
      name: 'Petugas Kasir',
      description: 'Akses operasional kasir (POS) dan riwayat transaksi untuk melayani pelanggan.',
      is_default: true,
      role_key: 'cashier',
      permissions: DEFAULT_CASHIER_PERMISSIONS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]
}

export async function readBusinessRoles(
  supabase: SupabaseClient,
  businessId: string
): Promise<BusinessRole[]> {
  try {
    const { data, error } = await supabase
      .from('business_roles')
      .select('*')
      .eq('business_id', businessId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (!error && data && data.length > 0) {
      return data.map(r => ({
        ...r,
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
      })) as BusinessRole[]
    }

    if (error) {
      console.warn('readBusinessRoles client error, trying admin fallback:', error.message)
      try {
        const admin = createAdminClient()
        const fallback = await admin
          .from('business_roles')
          .select('*')
          .eq('business_id', businessId)
          .order('is_default', { ascending: false })
          .order('name', { ascending: true })

        if (!fallback.error && fallback.data && fallback.data.length > 0) {
          return fallback.data.map(r => ({
            ...r,
            permissions: Array.isArray(r.permissions) ? r.permissions : [],
          })) as BusinessRole[]
        }
      } catch (adminErr) {
        console.warn('readBusinessRoles admin fallback failed:', adminErr)
      }
    }

    return defaultBuiltInRoles(businessId)
  } catch (err) {
    console.warn('readBusinessRoles exception:', err)
    return defaultBuiltInRoles(businessId)
  }
}

export async function readRoleMemberCounts(
  supabase: SupabaseClient,
  businessId: string
): Promise<Record<string, number>> {
  try {
    let { data, error } = await supabase
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)

    if (error) {
      try {
        const admin = createAdminClient()
        const fallback = await admin
          .from('business_members')
          .select('role')
          .eq('business_id', businessId)
        if (!fallback.error) {
          data = fallback.data
          error = null
        }
      } catch {}
    }

    if (error || !data) return {}

    const counts: Record<string, number> = {}
    for (const row of data) {
      const roleKey = builtInRole(row.role) || row.role
      counts[roleKey] = (counts[roleKey] || 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}
