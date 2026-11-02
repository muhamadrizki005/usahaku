'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBusiness } from '@/lib/access'
import { normalizeRoleKey } from '@/lib/auth/rbac'

const roleFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Nama role minimal 2 karakter.')
    .max(60, 'Nama role maksimal 60 karakter.'),
  description: z.string().trim().max(255).default(''),
  permissions: z.string().transform(str => {
    try {
      const parsed = JSON.parse(str)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }),
})

export type RoleActionState = {
  error?: string
  success?: string
  role?: any
}

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
  if (normName === 'owner' || normName === 'pemilik') {
    return { error: 'Nama role tidak boleh menggunakan nama khusus Pemilik.' }
  }

  // Check unique per business
  const { data: existing, error: checkError } = await supabase
    .from('business_roles')
    .select('id, name')
    .eq('business_id', business.id)

  if (checkError) {
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
    return { error: 'Role tidak ditemukan pada usaha ini.' }
  }

  // If default role, preserve its original name so system roles stay consistent
  const finalName = targetRole.is_default ? targetRole.name : name

  if (!targetRole.is_default) {
    // Check duplicate name on other roles in same business
    const { data: others } = await supabase
      .from('business_roles')
      .select('id, name')
      .eq('business_id', business.id)
      .neq('id', id)

    if (others?.some(r => normalizeRoleKey(r.name) === normName)) {
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
    return { error: 'Gagal memperbarui role. Coba lagi.' }
  }

  revalidatePath('/dashboard/settings/staff')
  return { success: `Hak akses role "${finalName}" berhasil diperbarui.`, role: updated }
}

export async function deleteBusinessRole(roleId: string): Promise<{ error?: string; success?: string }> {
  const { business, supabase } = await requireBusiness(['owner'])

  if (!roleId) return { error: 'ID role tidak valid.' }

  // 1. Fetch role
  const { data: targetRole, error: fetchError } = await supabase
    .from('business_roles')
    .select('*')
    .eq('id', roleId)
    .eq('business_id', business.id)
    .single()

  if (fetchError || !targetRole) {
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
    m => m.role === targetRole.id || normalizeRoleKey(m.role) === norm
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
    return { error: 'Gagal menghapus role. Coba lagi.' }
  }

  revalidatePath('/dashboard/settings/staff')
  return { success: `Role "${targetRole.name}" berhasil dihapus.` }
}

