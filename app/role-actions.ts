'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBusiness } from '@/lib/access'
import { builtInRole, DEFAULT_ADMIN_PERMISSIONS, permissionDependencies, rolePermissionLimit, roleValue, normalizeRoleKey } from '@/lib/auth/rbac'

const roleFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Nama role minimal 2 karakter.')
    .max(60, 'Nama role maksimal 60 karakter.'),
  description: z.string().trim().max(255).default(''),
  permissions: z.string().transform((str, context) => {
    try {
      const parsed = JSON.parse(str)
      if (!Array.isArray(parsed)) throw new Error('Invalid permissions')
      return parsed
    } catch {
      context.addIssue({ code: 'custom', message: 'Daftar izin tidak valid.' })
      return z.NEVER
    }
  }).pipe(z.array(z.string().refine(value => DEFAULT_ADMIN_PERMISSIONS.includes(value), 'Izin ini hanya untuk owner atau tidak dikenal.')).max(50)).transform(values => [...new Set(values)]).refine(values => values.every(permission => permissionDependencies(permission).every(required => values.includes(required))), 'Sertakan izin melihat modul dan pasangan izin pembatalan/refund yang diperlukan.'),
})

export type RoleActionState = {
  error?: string
  success?: string
  role?: any
}

const MISSING_TABLE_MSG =
  'Pengaturan role belum siap digunakan. Hubungi pengelola aplikasi.'

export async function createBusinessRole(
  _prevState: RoleActionState,
  formData: FormData
): Promise<RoleActionState> {
  const { business, supabase } = await requireBusiness(['owner'])

  const rawName = String(formData.get('name') || '')
  const rawDescription = String(formData.get('description') || '')
  const rawPermissions = String(formData.get('permissions') || '[]')

  const parsed = roleFormSchema.safeParse({
    name: rawName,
    description: rawDescription,
    permissions: rawPermissions,
  })

  if (!parsed.success) {
    const firstErr = parsed.error.issues[0]?.message || 'Data role tidak valid.'
    return { error: firstErr }
  }

  const { name, description, permissions } = parsed.data
  const normName = normalizeRoleKey(name)

  // Prevent creating role named 'owner' or 'pemilik'
  if (builtInRole(normName)) {
    return { error: 'Nama role tidak boleh menggunakan nama khusus Pemilik.' }
  }

  // Check unique per business
  const { data: existing, error: checkError } = await supabase
    .from('business_roles')
    .select('id, name')
    .eq('business_id', business.id)

  if (checkError) {
    if (checkError.code === 'PGRST205' || checkError.message?.includes('schema cache')) {
      return { error: MISSING_TABLE_MSG }
    }
    return { error: 'Gagal memeriksa nama role. Coba lagi.' }
  }

  if (existing?.some(r => normalizeRoleKey(r.name) === normName)) {
    return { error: `Role dengan nama "${name}" sudah ada pada usaha ini.` }
  }

  const { data: created, error: insertError } = await supabase
    .from('business_roles')
    .insert({
      business_id: business.id,
      name,
      description,
      is_default: false,
      permissions,
    })
    .select('*')
    .single()

  if (insertError || !created) {
    if (insertError?.code === 'PGRST205' || insertError?.message?.includes('schema cache')) {
      return { error: MISSING_TABLE_MSG }
    }
    return { error: 'Gagal membuat role baru. Coba lagi.' }
  }

  revalidatePath('/dashboard/settings/staff')
  return { success: `Role "${name}" berhasil dibuat.`, role: created }
}

export async function updateBusinessRole(
  _prevState: RoleActionState,
  formData: FormData
): Promise<RoleActionState> {
  const { business, supabase } = await requireBusiness(['owner'])

  const rawId = String(formData.get('id') || '')
  const rawName = String(formData.get('name') || '')
  const rawDescription = String(formData.get('description') || '')
  const rawPermissions = String(formData.get('permissions') || '[]')

  const parsed = roleFormSchema.safeParse({
    id: rawId,
    name: rawName,
    description: rawDescription,
    permissions: rawPermissions,
  })

  if (!parsed.success || !parsed.data.id) {
    const firstErr = parsed.error?.issues[0]?.message || 'Data role tidak valid.'
    return { error: firstErr }
  }

  const { id, name, description, permissions } = parsed.data
  const normName = normalizeRoleKey(name)

  // Fetch current role
  const { data: targetRole, error: fetchError } = await supabase
    .from('business_roles')
    .select('*')
    .eq('id', id)
    .eq('business_id', business.id)
    .single()

  if (fetchError || !targetRole) {
    if (fetchError?.code === 'PGRST205' || fetchError?.message?.includes('schema cache')) {
      return { error: MISSING_TABLE_MSG }
    }
    return { error: 'Role tidak ditemukan pada usaha ini.' }
  }

  if (permissions.some(permission => !rolePermissionLimit(roleValue(targetRole)).includes(permission))) return { error: 'Izin tersebut tidak tersedia untuk role ini. Kasir hanya dapat memakai kasir dan transaksi sendiri.' }

  // If default role, preserve its original name so system roles stay consistent
  const finalName = targetRole.is_default ? targetRole.name : name

  // Check unique name if custom role name changed
  if (!targetRole.is_default && normalizeRoleKey(targetRole.name) !== normName) {
    if (normName === 'owner' || normName === 'pemilik') {
      return { error: 'Nama role tidak boleh menggunakan nama khusus Pemilik.' }
    }

    const { data: existing } = await supabase
      .from('business_roles')
      .select('id, name')
      .eq('business_id', business.id)
      .neq('id', id)

    if (existing?.some(r => normalizeRoleKey(r.name) === normName)) {
      return { error: `Role dengan nama "${name}" sudah ada pada usaha ini.` }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('business_roles')
    .update({
      name: finalName,
      description,
      permissions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', business.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    if (updateError?.code === 'PGRST205' || updateError?.message?.includes('schema cache')) {
      return { error: MISSING_TABLE_MSG }
    }
    return { error: 'Gagal memperbarui role. Coba lagi.' }
  }

  revalidatePath('/dashboard/settings/staff')
  return { success: `Role "${finalName}" berhasil diperbarui.`, role: updated }
}

export async function deleteBusinessRole(roleId: string): Promise<{ error?: string; success?: string }> {
  const { business, supabase } = await requireBusiness(['owner'])

  if (!roleId || typeof roleId !== 'string') {
    return { error: 'ID role tidak valid.' }
  }

  // 1. Fetch target role
  const { data: targetRole, error: fetchError } = await supabase
    .from('business_roles')
    .select('*')
    .eq('id', roleId)
    .eq('business_id', business.id)
    .single()

  if (fetchError || !targetRole) {
    if (fetchError?.code === 'PGRST205' || fetchError?.message?.includes('schema cache')) {
      return { error: MISSING_TABLE_MSG }
    }
    return { error: 'Role tidak ditemukan pada usaha ini.' }
  }

  // 2. Reject deletion of default roles
  if (targetRole.is_default) {
    return { error: 'Role bawaan sistem tidak dapat dihapus.' }
  }

  // 3. Check if any staff members are currently using this role (by name or ID)
  const norm = normalizeRoleKey(targetRole.name)
  const { data: members, error: memberError } = await supabase
    .from('business_members')
    .select('id, name, role')
    .eq('business_id', business.id)

  if (memberError) {
    return { error: 'Gagal memeriksa penggunaan role pada anggota staf.' }
  }

  const assignedMembers = (members || []).filter(
    m => m.role === roleValue(targetRole) || m.role === targetRole.id || normalizeRoleKey(m.role) === norm
  )

  if (assignedMembers.length > 0) {
    return {
      error: `Role "${targetRole.name}" sedang digunakan oleh ${assignedMembers.length} staf (${assignedMembers.map(m => m.name).join(', ')}). Pindahkan role staf terlebih dahulu sebelum menghapus role ini.`,
    }
  }

  // 4. Safe to delete
  const { error: deleteError } = await supabase
    .from('business_roles')
    .delete()
    .eq('id', roleId)
    .eq('business_id', business.id)

  if (deleteError) {
    if (deleteError?.code === 'PGRST205' || deleteError?.message?.includes('schema cache')) {
      return { error: MISSING_TABLE_MSG }
    }
    return { error: 'Gagal menghapus role. Coba lagi.' }
  }

  revalidatePath('/dashboard/settings/staff')
  return { success: `Role "${targetRole.name}" berhasil dihapus.` }
}
