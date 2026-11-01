'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseConfig } from '@/lib/supabase/config'
import { requireAccount, requireBusiness, redirectAfterLogin } from '@/lib/access'
import { clearRecovery, hasRecovery } from '@/lib/auth/recovery'
import { siteUrl } from '@/lib/auth/site-url'
import { businessSchema, ownerLoginSchema, passwordSchema, registerSchema, staffEmail, staffLoginSchema, staffSchema, type ActionState } from '@/lib/validation'
import { profileSchema, businessHoursSchema } from '@/lib/business-profile'
import { businessLocationProblem } from '@/lib/business-regions'
import { detailedLocationProblem } from '@/lib/business-region-details'
import { prepareBusinessLogo, uploadBusinessLogo, cleanupBusinessLogos } from '@/lib/business-logo-server'
import { businessCategorySchema, businessSlug } from '@/lib/business-categories'

const connectionError = { error: 'Layanan akun belum dapat dihubungi. Coba lagi sebentar.' }
function invalid(error: z.ZodError): ActionState { return { error: error.issues[0]?.message || 'Periksa kembali isian.' } }
function fields(form: FormData) { return Object.fromEntries(form.entries()) }
const passwordChangeSchema = z.object({ password: passwordSchema, confirmation: z.string() }).refine(d => d.password === d.confirmation, { message: 'Konfirmasi kata sandi belum sama.' })

export async function loginWithGoogle(_: ActionState, _form: FormData): Promise<ActionState> {
  let providerUrl: string | null = null
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl()}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error || !data.url) return { error: 'Login Google belum dapat dimulai. Coba lagi sebentar.' }
    providerUrl = data.url
  } catch { return connectionError }
  redirect(providerUrl)
}

export async function loginOwner(_: ActionState, form: FormData): Promise<ActionState> {
  if (!getSupabaseConfig()) return { error: 'Konfigurasi Supabase belum lengkap.' }
  const parsed = ownerLoginSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) return { error: 'Email atau kata sandi salah, atau email belum dikonfirmasi.' }
  } catch { return connectionError }
  return redirectAfterLogin()
}

export async function loginStaff(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = staffLoginSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email: staffEmail(parsed.data.code, parsed.data.username), password: parsed.data.password })
    if (error || !data.user) return { error: 'Kode toko, username, atau kata sandi salah.' }
  } catch { return connectionError }
  return redirectAfterLogin()
}

export async function registerOwner(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  let session = false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/onboarding`, data: { name: parsed.data.name, full_name: parsed.data.name, phone: parsed.data.phone || '' } } })
    if (error) {
      console.error('AUTH_SIGNUP_FAILED', { code: error.code, status: error.status })
      return { error: error.code === 'over_email_send_rate_limit' ? 'Batas pengiriman email tercapai. Tunggu beberapa saat, lalu coba lagi.' : 'Pendaftaran belum berhasil. Periksa data atau coba lagi nanti; jika sudah terdaftar, gunakan halaman masuk.' }
    }
    session = Boolean(data.session)
  } catch { return connectionError }
  if (session) return redirectAfterLogin()
  return { success: 'Periksa email untuk kode aktivasi akun. Jika alamat sudah terdaftar, gunakan halaman masuk atau pemulihan akun.' }
}

export async function resendConfirmation(_: ActionState, form: FormData): Promise<ActionState> {
  const email = z.email().max(254).safeParse(form.get('email'))
  if (!email.success) return { error: 'Isi alamat email yang valid.' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.data, options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/onboarding` } })
    if (error) return { error: 'Email konfirmasi belum dapat dikirim. Tunggu sebentar lalu coba lagi.' }
    return { success: 'Jika akun perlu konfirmasi, email konfirmasi akan dikirim. Periksa inbox dan spam.' }
  } catch { return connectionError }
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  const email = z.email().max(254).safeParse(form.get('email'))
  if (!email.success || email.data.endsWith('@staff.usahaku.invalid')) return { error: 'Gunakan email pemilik. Untuk akun staf, minta reset kepada owner.' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${siteUrl()}/auth/callback?next=/account/reset-password` })
    if (error) {
      console.error('AUTH_RECOVERY_EMAIL_FAILED', { code: error.code, status: error.status })
      return { error: 'Email pemulihan belum dapat dikirim. Tunggu sebentar lalu coba lagi.' }
    }
    return { success: 'Jika email terdaftar, tautan pemulihan akan dikirim. Periksa inbox dan spam.' }
  } catch { return connectionError }
}

export async function createBusiness(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user, member } = await requireAccount()
  if (member) return redirectAfterLogin()
  if (user.app_metadata.account_type === 'staff') return { error: 'Akun staf tidak dapat membuat usaha. Hubungi owner.' }
  const category = businessCategorySchema.safeParse(form.get('category') || 'store')
  if (!category.success) return { error: 'Kategori usaha belum didukung.' }
  const parsed = profileSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  const locationError = businessLocationProblem(parsed.data) || detailedLocationProblem(parsed.data)
  if (locationError) return { error: locationError }
  let logo: Buffer | undefined
  try { if (form.get('logoOperation') === 'replace') logo = await prepareBusinessLogo(form.get('logo')) } catch (error) { return { error: (error as Error).message } }
  const p = parsed.data
  const profile = { store_name: p.name, owner_name: String(user.user_metadata.full_name || user.user_metadata.name || 'Pemilik usaha'), store_phone: p.phone, store_street: p.address, store_city: p.city, store_province: p.province, store_description: p.description }
  const { data: id, error } = await supabase.rpc('create_business_profile_with_map', { ...profile, business_category: category.data, store_district: p.district, store_village: p.village, store_latitude: p.latitude, store_longitude: p.longitude }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error) {
    const { data } = await supabase.from('business_members').select('id').eq('user_id', user.id).maybeSingle()
    if (data) return redirectAfterLogin()
    return { error: 'Usaha belum dapat dipastikan tersimpan. Muat ulang untuk memeriksa hasil sebelum mencoba lagi.' }
  }
  let notice = ''
  if (logo) {
    const { data: business } = await supabase.from('businesses').select('*').eq('id', id).single()
    if (!business) notice = 'logo'
    else { const result = await uploadBusinessLogo(supabase, business, logo); if (result.error || result.warning) notice = 'logo' }
  }
  refreshBusinessViews()
  redirect(`/onboarding/setup?category=${businessSlug(category.data)}${notice ? '&notice=logo' : ''}`)
}

function refreshBusinessViews() {
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/onboarding', 'layout')
}

export async function saveBusinessProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, business } = await requireBusiness(['owner'], true)
  const parsed = profileSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  const locationError = businessLocationProblem(parsed.data, business) || detailedLocationProblem(parsed.data, business)
  if (locationError) return { error: locationError }
  const revision = z.coerce.number().int().nonnegative().safeParse(form.get('revision'))
  if (!revision.success || form.get('revision') === null) return { error: 'Muat ulang profil sebelum menyimpan.' }
  const operation = z.enum(['keep', 'replace', 'remove']).safeParse(form.get('logoOperation') || 'keep')
  if (!operation.success) return { error: 'Pilihan logo tidak valid.' }
  let logo: Buffer | undefined
  try { if (operation.data === 'replace') logo = await prepareBusinessLogo(form.get('logo')) } catch (error) { return { error: (error as Error).message } }
  const p = parsed.data
  const { data, error } = await supabase.rpc('save_business_profile_with_map', { target_id: business.id, expected_revision: revision.data, new_name: p.name, new_phone: p.phone, new_street: p.address, new_city: p.city, new_province: p.province, new_description: p.description, new_district: p.district, new_village: p.village, new_latitude: p.latitude, new_longitude: p.longitude }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return { error: 'Profil belum dapat dipastikan tersimpan atau telah diubah di tab lain. Muat ulang sebelum mencoba lagi.' }
  let saved = data
  let warning: string | undefined
  if (logo) {
    const result = await uploadBusinessLogo(supabase, saved, logo)
    saved = result.value || saved
    warning = result.error || result.warning
  } else if (operation.data === 'remove' && saved.logo_path) {
    const result = await supabase.rpc('set_business_logo', { target_id: business.id, expected_revision: saved.profile_revision, asset_id: null }).abortSignal(AbortSignal.timeout(15000)).retry(false)
    if (result.error || !result.data) {
      const current = await supabase.from('businesses').select('*').eq('id', business.id).single()
      if (current.data && !current.data.logo_path) saved = current.data
      else warning = 'Profil tersimpan; penghapusan logo belum dapat dipastikan. Muat ulang untuk memeriksa.'
    } else saved = result.data
  }
  try { if (!await cleanupBusinessLogos(business.id)) warning ||= 'Profil tersimpan. Pembersihan logo lama akan dicoba kembali.' } catch { warning ||= 'Profil tersimpan. Pembersihan logo lama akan dicoba kembali.' }
  refreshBusinessViews()
  if (form.get('next') === 'setup') redirect(`/onboarding/setup?category=${businessSlug(saved.category)}${warning ? '&notice=logo' : ''}`)
  return { success: 'Profil usaha tersimpan.', business: saved, warning }
}

export async function completeOnboarding(_: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase, business } = await requireBusiness(['owner'], true)
  const { data, error } = await supabase.rpc('complete_business_onboarding', { target_id: business.id }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data?.onboarding_completed_at) return { error: 'Pengaturan belum dapat dikonfirmasi selesai. Coba lagi; data yang tersimpan tetap aman.' }
  refreshBusinessViews()
  redirect('/dashboard')
}

export async function saveBusinessHours(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, business } = await requireBusiness(['owner'], true)
  let raw: unknown
  try { raw = JSON.parse(String(form.get('schedule'))) } catch { return { error: 'Format jam tidak valid.' } }
  const parsed = businessHoursSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  const revision = z.coerce.number().int().nonnegative().safeParse(form.get('revision'))
  if (!revision.success || form.get('revision') === null) return { error: 'Muat ulang jam sebelum menyimpan.' }
  const { data, error } = await supabase.rpc('save_business_hours', { target_id: business.id, expected_revision: revision.data, schedule: parsed.data }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return { error: 'Jam belum dapat dipastikan tersimpan atau telah diubah di tab lain. Muat ulang sebelum mencoba lagi.' }
  refreshBusinessViews()
  return { success: 'Jam operasional tersimpan.', business: data }
}

export async function createStaff(_: ActionState, form: FormData): Promise<ActionState> {
  const { business, user } = await requireBusiness(['owner'], true)
  const parsed = staffSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Pengelolaan staf belum dikonfigurasi pada server.' }
  const admin = createAdminClient()
  const temporaryPassword = randomBytes(18).toString('base64url')
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail(business.code, parsed.data.username), password: temporaryPassword, email_confirm: true, app_metadata: { account_type: 'staff' } })
  if (error || !data.user) return { error: 'Akses belum dibuat. Username mungkin sudah dipakai atau layanan sedang bermasalah. Periksa daftar staf sebelum mencoba lagi.' }
  const { error: insertError } = await admin.from('business_members').insert({ business_id: business.id, user_id: data.user.id, ...parsed.data, must_change_password: true, changed_by: user.id })
  if (insertError) {
    const { data: existing, error: lookupError } = await admin.from('business_members').select('id').eq('user_id', data.user.id).maybeSingle()
    if (lookupError) return { error: 'Status pembuatan staf belum pasti. Hubungi pengelola sebelum mencoba lagi.' }
    if (!existing) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id)
      if (cleanupError) console.error('STAFF_ORPHAN_CLEANUP_REQUIRED', { userId: data.user.id, businessId: business.id })
      return { error: cleanupError ? 'Akses staf gagal disimpan dan pembersihan akun memerlukan pengelola.' : 'Data staf gagal disimpan. Tidak ada akses staf baru yang aktif.' }
    }
  }
  revalidatePath('/dashboard/settings/staff')
  revalidatePath('/onboarding/setup')
  revalidatePath('/onboarding/summary')
  return { success: `Akses ${parsed.data.username} dibuat. Berikan kode toko ${business.code} dan sandi sementara secara pribadi.`, temporaryPassword }
}

export async function manageStaff(_: ActionState, form: FormData): Promise<ActionState> {
  const { business, user } = await requireBusiness(['owner'], true)
  const parsed = z.object({ id: z.uuid(), operation: z.enum(['activate', 'deactivate', 'reset']) }).safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  const admin = createAdminClient()
  const { data: target, error } = await admin.from('business_members').select('id,user_id,role,active').eq('id', parsed.data.id).eq('business_id', business.id).neq('role', 'owner').single()
  if (error || !target) return { error: 'Staf tidak ditemukan pada usaha ini.' }
  if (parsed.data.operation === 'reset') {
    const { error: blockError } = await admin.from('business_members').update({ must_change_password: true, changed_by: user.id }).eq('id', target.id).eq('business_id', business.id)
    if (blockError) return { error: 'Reset belum berhasil; kata sandi belum diganti.' }
    const temporaryPassword = randomBytes(18).toString('base64url')
    const { error: resetError } = await admin.auth.admin.updateUserById(target.user_id, { password: temporaryPassword })
    revalidatePath('/onboarding/setup')
    revalidatePath('/onboarding/summary')
    revalidatePath('/dashboard/settings/staff')
    if (resetError) return { error: 'Akses telah dibatasi, tetapi sandi belum berhasil direset. Ulangi reset.' }
    return { success: 'Sandi direset. Staf wajib masuk dengan sandi sementara lalu menggantinya.', temporaryPassword }
  }
  const { error: updateError } = await admin.from('business_members').update({ active: parsed.data.operation === 'activate', changed_by: user.id }).eq('id', target.id).eq('business_id', business.id)
  if (updateError) return { error: 'Status staf belum berhasil diperbarui.' }
  revalidatePath('/onboarding/setup')
  revalidatePath('/onboarding/summary')
  revalidatePath('/dashboard/settings/staff')
  return { success: 'Status akses staf diperbarui.' }
}

export async function changePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user, member } = await requireAccount()
  if (member && !member.active) return { error: 'Akses dinonaktifkan. Hubungi owner.' }
  const parsed = passwordChangeSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  const current = z.string().min(1).max(128).safeParse(form.get('currentPassword'))
  if (!current.success || !user.email) return { error: 'Isi kata sandi saat ini atau sementara.' }
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: current.data })
  if (verifyError) return { error: 'Kata sandi saat ini tidak sesuai.' }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: 'Sandi belum diperbarui. Gunakan sandi baru yang berbeda, minimal 10 karakter.' }
  if (member?.must_change_password) {
    const admin = createAdminClient()
    const { data, error: updateError } = await admin.from('business_members').update({ must_change_password: false, changed_by: user.id }).eq('id', member.id).eq('user_id', user.id).eq('active', true).select('id').maybeSingle()
    if (updateError || !data) return { error: 'Sandi tersimpan, tetapi akses belum aktif. Hubungi owner.' }
  }
  return redirectAfterLogin()
}

export async function recoverPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { user, member, supabase } = await requireAccount()
  if (user.app_metadata.account_type === 'staff' || (member && member.role !== 'owner')) return { error: 'Reset akun staf dilakukan oleh owner.' }
  if (!(await hasRecovery(user.id))) return { error: 'Tautan pemulihan tidak valid atau kedaluwarsa. Minta tautan baru.' }
  const parsed = passwordChangeSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: 'Sandi belum diperbarui. Gunakan sandi baru yang berbeda.' }
  await clearRecovery()
  await supabase.auth.signOut()
  redirect('/login?notice=password-updated')
}

export async function signOut() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error('Logout belum berhasil. Coba lagi; sesi belum dapat dipastikan berakhir.')
  await clearRecovery()
  redirect('/login')
}

export async function updateAccountProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user, member } = await requireAccount()
  if (member && !member.active) return { error: 'Akses dinonaktifkan. Hubungi owner.' }

  const rawName = form.get('name')
  const rawPhone = form.get('phone')

  const name = typeof rawName === 'string' ? rawName.trim() : ''
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''

  if (!name || name.length < 2) {
    return { error: 'Nama lengkap minimal 2 karakter.' }
  }
  if (name.length > 100) {
    return { error: 'Nama lengkap maksimal 100 karakter.' }
  }
  if (phone && !/^(\+62|62|0)[0-9]{8,13}$/.test(phone.replace(/[\s-]/g, ''))) {
    return { error: 'Format nomor telepon belum sesuai (contoh: 081234567890).' }
  }

  const updatedMetadata: Record<string, any> = {
    ...user.user_metadata,
    full_name: name,
    name: name,
    phone: phone || null,
  }

  const { error: userError } = await supabase.auth.updateUser({
    data: updatedMetadata,
  })

  if (userError) {
    return { error: 'Gagal memperbarui profil: ' + userError.message }
  }

  if (member) {
    const admin = createAdminClient()
    await admin.from('business_members').update({ name }).eq('id', member.id)
  }

  revalidatePath('/account')
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard')

  return { success: 'Informasi profil berhasil disimpan.' }
}

const accountPasswordSchema = z
  .string()
  .min(8, 'Kata sandi minimal 8 karakter.')
  .max(128, 'Maksimal 128 karakter.')
  .refine((v) => /[a-zA-Z]/.test(v), { message: 'Kata sandi harus mengandung huruf.' })
  .refine((v) => /[0-9]/.test(v), { message: 'Kata sandi harus mengandung angka.' })
  .refine((v) => /[^a-zA-Z0-9]/.test(v), { message: 'Kata sandi harus mengandung simbol / karakter khusus.' })

const accountPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Isi kata sandi saat ini atau sementara.').max(128),
    password: accountPasswordSchema,
    confirmation: z.string(),
  })
  .refine((d) => d.password === d.confirmation, {
    message: 'Konfirmasi kata sandi belum sama.',
    path: ['confirmation'],
  })

export async function updateAccountPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user, member } = await requireAccount()
  if (member && !member.active) return { error: 'Akses dinonaktifkan. Hubungi owner.' }

  const parsed = accountPasswordChangeSchema.safeParse(fields(form))
  if (!parsed.success) return invalid(parsed.error)

  const current = z.string().min(1).max(128).safeParse(form.get('currentPassword'))
  if (!current.success || !user.email) return { error: 'Isi kata sandi saat ini atau sementara.' }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current.data,
  })
  if (verifyError) return { error: 'Kata sandi saat ini tidak sesuai.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: 'Sandi belum diperbarui. Gunakan sandi baru minimal 8 karakter dengan huruf, angka, dan simbol.' }

  if (member?.must_change_password) {
    const admin = createAdminClient()
    await admin
      .from('business_members')
      .update({ must_change_password: false, changed_by: user.id })
      .eq('id', member.id)
      .eq('user_id', user.id)
  }

  revalidatePath('/account')
  return { success: 'Kata sandi berhasil diperbarui.' }
}

export async function updateAccountAvatar(avatarUrl: string | null): Promise<ActionState> {
  const { supabase, user, member } = await requireAccount()
  if (member && !member.active) return { error: 'Akses dinonaktifkan. Hubungi owner.' }

  const updatedMetadata: Record<string, any> = {
    ...user.user_metadata,
    avatar_url: avatarUrl,
  }

  const { error } = await supabase.auth.updateUser({
    data: updatedMetadata,
  })

  if (error) return { error: 'Gagal memperbarui foto profil: ' + error.message }

  revalidatePath('/account')
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/dashboard')

  return { success: avatarUrl ? 'Foto profil berhasil diperbarui.' : 'Foto profil berhasil dihapus.' }
}

