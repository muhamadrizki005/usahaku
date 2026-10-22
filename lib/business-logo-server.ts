import 'server-only'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { replaceLogoSafely } from '@/lib/logo-lifecycle'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Business } from '@/lib/validation'

export const logoBucket = 'business-logos'
export async function prepareBusinessLogo(entry: FormDataEntryValue | null): Promise<Buffer> {
  if (!(entry instanceof File) || !['image/png', 'image/jpeg'].includes(entry.type) || entry.size < 1 || entry.size > 2 * 1024 * 1024) throw new Error('Logo harus PNG/JPG, maksimal 2 MB.')
  try {
    const input = Buffer.from(await entry.arrayBuffer())
    const image = sharp(input, { limitInputPixels: 4096 * 4096, animated: false })
    const metadata = await image.metadata()
    if (!['png', 'jpeg'].includes(metadata.format || '') || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages || 1) > 1) throw new Error('Invalid image')
    const output = await image.rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    if (output.length > 2 * 1024 * 1024) throw new Error('Image too large')
    return output
  } catch { throw new Error('Isi gambar tidak valid. Gunakan PNG/JPG statis dengan dimensi maksimal 4096×4096.') }
}

export async function cleanupBusinessLogos(businessId?: string) {
  const admin = createAdminClient()
  let query = admin.from('business_logo_assets').select('id,state,created_at').in('state', ['retired', 'deleting', 'staging']).order('created_at').limit(25)
  if (businessId) query = query.eq('business_id', businessId)
  const { data, error } = await query
  if (error) return false
  let clean = true
  for (const asset of data || []) {
    if (asset.state === 'staging' && Date.parse(asset.created_at) > Date.now() - 15 * 60 * 1000) continue
    const { data: path, error: claimError } = await admin.rpc('claim_business_logo_cleanup', { asset_id: asset.id })
    if (claimError) { clean = false; continue }
    if (!path) continue
    const { error: deleteError } = await admin.storage.from(logoBucket).remove([path])
    if (deleteError) { clean = false; continue }
    const { error: markError } = await admin.from('business_logo_assets').update({ state: 'deleted', updated_at: new Date().toISOString() }).eq('id', asset.id).eq('state', 'deleting')
    if (markError) clean = false
  }
  return clean
}

export async function uploadBusinessLogo(supabase: SupabaseClient, business: Business, content: Buffer) {
  return replaceLogoSafely<Business>({
    reserve: async () => {
      const id = randomUUID()
      const { data: path, error } = await supabase.rpc('reserve_business_logo', { target_id: business.id, asset_id: id }).abortSignal(AbortSignal.timeout(15000)).retry(false)
      if (error || !path) throw new Error('Unable to reserve logo')
      return { id, path }
    },
    upload: async path => {
      const admin = createAdminClient()
      const { error } = await admin.storage.from(logoBucket).upload(path, content, { contentType: 'image/png', upsert: false, cacheControl: '0' })
      if (error) throw new Error('Unable to upload logo')
    },
    activate: async id => {
      const { data, error } = await supabase.rpc('set_business_logo', { target_id: business.id, expected_revision: business.profile_revision, asset_id: id }).abortSignal(AbortSignal.timeout(15000)).retry(false)
      if (error || !data) throw new Error('Unable to activate logo')
      return data as Business
    },
    reconcile: async path => {
      const { data, error } = await supabase.from('businesses').select('*').eq('id', business.id).single()
      if (error || data?.logo_path !== path) return null
      return data as Business
    },
    cleanup: () => cleanupBusinessLogos(business.id),
  })
}
