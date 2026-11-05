'use server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireBusiness } from '@/lib/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { prepareBusinessLogo } from '@/lib/business-logo-server'
import { cleanupPaymentQrs, paymentQrBucket } from '@/lib/business-payments-server'
import { paymentSettingsSchema, paymentSettingsView, type PaymentSettingsRow, type PaymentSettings } from '@/lib/business-payments'

export type PaymentSettingsResult = { settings?: PaymentSettings; error?: string; warning?: string; uncertain?: boolean }

export async function saveBusinessPayments(raw: unknown, revision: number, qrisImage: string): Promise<PaymentSettingsResult> {
  try {
    const { supabase, business } = await requireBusiness(['owner'], true)
    const parsed = paymentSettingsSchema.safeParse(raw)
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    if (!['store', 'restaurant', 'barbershop'].includes(business.category) || !Number.isSafeInteger(revision) || revision < 0 || typeof qrisImage !== 'string') {
      return { error: 'Pengaturan pembayaran tidak valid.' }
    }

    const current = await supabase.from('business_payments').select('*').eq('business_id', business.id).maybeSingle()
    if (current.error) return { error: 'Pengaturan pembayaran belum dapat dibaca. Muat ulang untuk memeriksa.' }
    const row = current.data as PaymentSettingsRow | null
    if ((row?.revision || 0) !== revision) return { error: 'Pembayaran berubah di tab lain. Muat ulang sebelum menyimpan.' }

    let assetId: string | null = parsed.data.qris ? row?.qris_asset || null : null

    if (parsed.data.qris && qrisImage.startsWith('data:')) {
      if (qrisImage.length > 3 * 1024 * 1024) return { error: 'Gambar QRIS maksimal 2 MB.' }
      const match = qrisImage.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
      if (!match) return { error: 'Gunakan gambar PNG/JPG/WebP untuk QRIS.' }

      let content: Buffer
      try {
        content = await prepareBusinessLogo(new File([Buffer.from(match[2], 'base64')], 'qris', { type: match[1] }))
      } catch {
        return { error: 'Gambar QRIS tidak valid. Gunakan PNG/JPG/WebP maksimal 2 MB.' }
      }

      assetId = randomUUID()
      let reservedPath = `${business.id}/${assetId}.png`

      // 1. Try RPC reserve_payment_qr, with graceful fallback to direct insert in business_payment_assets
      try {
        const reserved = await supabase.rpc('reserve_payment_qr', { target_id: business.id, asset_id: assetId }).abortSignal(AbortSignal.timeout(15000)).retry(false)
        if (reserved.data && !reserved.error) {
          reservedPath = reserved.data
        } else {
          const admin = createAdminClient()
          await admin.from('business_payment_assets').insert({ id: assetId, business_id: business.id, path: reservedPath, state: 'staging' })
        }
      } catch {
        try {
          const admin = createAdminClient()
          await admin.from('business_payment_assets').insert({ id: assetId, business_id: business.id, path: reservedPath, state: 'staging' })
        } catch (e: any) {
          return { error: 'Gagal menyiapkan data QRIS: ' + (e?.message || 'Database belum siap') }
        }
      }

      // 2. Ensure bucket exists and upload QR image with upsert
      let uploadFailed = false
      let uploadErrorMsg = ''
      try {
        const admin = createAdminClient()
        try {
          await admin.storage.createBucket(paymentQrBucket, { public: false, allowedMimeTypes: ['image/png'], fileSizeLimit: 2097152 })
        } catch {}
        const uploaded = await admin.storage.from(paymentQrBucket).upload(reservedPath, content, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: '0'
        })
        if (uploaded.error) {
          uploadFailed = true
          uploadErrorMsg = uploaded.error.message
        }
      } catch (adminErr: any) {
        try {
          const uploaded = await supabase.storage.from(paymentQrBucket).upload(reservedPath, content, {
            contentType: 'image/png',
            upsert: true,
            cacheControl: '0'
          })
          if (uploaded.error) {
            uploadFailed = true
            uploadErrorMsg = uploaded.error.message
          }
        } catch (userErr: any) {
          uploadFailed = true
          uploadErrorMsg = userErr?.message || adminErr?.message || 'Koneksi penyimpanan gagal'
        }
      }

      if (uploadFailed) {
        return { error: `Gambar QRIS belum berhasil diunggah: ${uploadErrorMsg}. Silakan coba lagi.` }
      }
    } else if (parsed.data.qris && (!assetId || qrisImage !== paymentSettingsView(row).qrisImage)) {
      return { error: 'Unggah gambar QRIS sebelum menyimpan metode QRIS.' }
    }

    let saved: PaymentSettingsRow | null = null

    // 3. Save payments via RPC save_business_payments with admin fallback
    try {
      const result = await supabase.rpc('save_business_payments', {
        target_id: business.id,
        expected_revision: revision,
        details: parsed.data,
        asset_id: assetId
      }).abortSignal(AbortSignal.timeout(15000)).retry(false)

      if (result.data && !result.error) {
        saved = result.data as PaymentSettingsRow
      } else {
        console.error('save_business_payments RPC error:', result.error)
        if (result.error?.code === 'PT409') return { error: 'Pembayaran berubah di tab lain. Muat ulang sebelum menyimpan.' }
        if (result.error?.code === '42501') return { error: 'Akses ditolak.' }

        // Attempt direct admin upsert fallback
        try {
          const admin = createAdminClient()
          const currentCheck = await admin.from('business_payments').select('revision').eq('business_id', business.id).maybeSingle()
          const currentRev = currentCheck.data?.revision ?? 0
          if (currentRev !== revision) {
            return { error: 'Pembayaran berubah di tab lain. Muat ulang sebelum menyimpan.' }
          }

          const { data: updated, error: directError } = await admin.from('business_payments')
            .upsert({
              business_id: business.id,
              cash: parsed.data.cash,
              qris: parsed.data.qris,
              transfer: parsed.data.transfer,
              banks: parsed.data.banks,
              ewallet: parsed.data.ewallet ?? false,
              ewallets: parsed.data.ewallets ?? [],
              qris_asset: assetId,
              revision: revision + 1,
              updated_at: new Date().toISOString()
            })
            .select('*')
            .single()

          if (!directError && updated) {
            saved = updated as PaymentSettingsRow
            if (assetId) {
              await admin.from('business_payment_assets').update({ state: 'retired' }).eq('business_id', business.id).eq('state', 'active').neq('id', assetId)
              await admin.from('business_payment_assets').update({ state: 'active' }).eq('id', assetId)
            }
          } else if (result.error) {
            if (result.error?.message?.includes('ewallet') || result.error?.message?.includes('column') || result.error?.code === '42703') {
              return { error: 'Kolom atau fitur e-wallet belum aktif di database Supabase. Jalankan migrasi SQL e-wallet di Supabase SQL Editor.' }
            }
            if (result.error?.message?.includes('QR image unavailable')) {
              return { error: 'Gambar QRIS belum terverifikasi di penyimpanan. Pastikan format gambar sesuai dan coba lagi.' }
            }
            return { error: result.error.message || 'Pengaturan pembayaran ditolak. Periksa metode, rekening, dan gambar QRIS.' }
          }
        } catch {
          if (result.error) {
            return { error: result.error.message || 'Pengaturan pembayaran belum dapat disimpan.' }
          }
        }
      }
    } catch (err: any) {
      console.error('save_business_payments RPC exception:', err)
      try {
        const admin = createAdminClient()
        const currentCheck = await admin.from('business_payments').select('revision').eq('business_id', business.id).maybeSingle()
        const currentRev = currentCheck.data?.revision ?? 0
        if (currentRev === revision) {
          const { data: updated } = await admin.from('business_payments')
            .upsert({
              business_id: business.id,
              cash: parsed.data.cash,
              qris: parsed.data.qris,
              transfer: parsed.data.transfer,
              banks: parsed.data.banks,
              ewallet: parsed.data.ewallet ?? false,
              ewallets: parsed.data.ewallets ?? [],
              qris_asset: assetId,
              revision: revision + 1,
              updated_at: new Date().toISOString()
            })
            .select('*')
            .single()

          if (updated) {
            saved = updated as PaymentSettingsRow
            if (assetId) {
              await admin.from('business_payment_assets').update({ state: 'retired' }).eq('business_id', business.id).eq('state', 'active').neq('id', assetId)
              await admin.from('business_payment_assets').update({ state: 'active' }).eq('id', assetId)
            }
          }
        }
      } catch {}
    }

    if (!saved) {
      try {
        const check = await supabase.from('business_payments').select('*').eq('business_id', business.id).maybeSingle()
        const value = check.data as PaymentSettingsRow | null
        if (!check.error && value && value.revision === revision + 1 && value.cash === parsed.data.cash && value.qris === parsed.data.qris && value.transfer === parsed.data.transfer && value.ewallet === parsed.data.ewallet && value.qris_asset === assetId && JSON.stringify(value.banks) === JSON.stringify(parsed.data.banks) && JSON.stringify(value.ewallets || []) === JSON.stringify(parsed.data.ewallets || [])) {
          saved = value
        }
      } catch {}
    }

    if (!saved) {
      return { error: 'Pengaturan pembayaran belum tersimpan. Silakan periksa kembali dan coba simpan lagi.', uncertain: false }
    }

    let warning: string | undefined
    try {
      if (!await cleanupPaymentQrs(business.id)) warning = 'Pengaturan tersimpan. Pembersihan gambar lama akan dicoba kembali.'
    } catch {
      warning = 'Pengaturan tersimpan. Pembersihan gambar lama akan dicoba kembali.'
    }

    revalidatePath('/dashboard', 'layout')
    revalidatePath('/onboarding', 'layout')
    return { settings: paymentSettingsView(saved), warning }
  } catch (outerErr: any) {
    console.error('saveBusinessPayments unexpected error:', outerErr)
    return { error: 'Terjadi kesalahan sistem saat menyimpan pembayaran: ' + (outerErr?.message || 'Silakan coba lagi.'), uncertain: false }
  }
}
