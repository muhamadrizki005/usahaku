import { z } from 'zod'

export type LoyaltyRedemptionType = 'voucher' | 'product' | 'service'

export interface LoyaltyRedemptionRule {
  id: string
  points_required: number
  reward_type: LoyaltyRedemptionType
  voucher_amount?: number
  product_id?: string
  product_name?: string
  service_id?: string
  service_name?: string
}

export const loyaltyRedemptionRuleSchema = z.object({
  id: z.string().min(1),
  points_required: z.coerce.number().int().min(1).max(1000000),
  reward_type: z.enum(['voucher', 'product', 'service']),
  voucher_amount: z.coerce.number().int().nonnegative().optional(),
  product_id: z.string().optional(),
  product_name: z.string().optional(),
  service_id: z.string().optional(),
  service_name: z.string().optional(),
})

export const loyaltySettingsSchema = z.object({
  active: z.boolean(),
  nominal: z.coerce.number().int().min(1).max(1000000000),
  redemptions: z.array(loyaltyRedemptionRuleSchema).optional().default([]),
}).strict()

export function loyaltySaveError(code?: string) {
  if (code === '42501') return 'Hanya pemilik yang dapat mengatur program poin.'
  if (code === '22023') return 'Isi nominal rupiah bulat antara Rp1 dan Rp1.000.000.000.'
  if (['PGRST202', '42703', '42P01'].includes(code || '')) return 'Program poin belum siap digunakan. Muat ulang atau hubungi pengelola aplikasi.'
  return 'Penyimpanan pengaturan poin belum dapat dipastikan. Muat ulang untuk memeriksa sebelum mencoba lagi.'
}

export function getLoyaltyRedemptions(businessId?: string, fallbackFromDb?: any): LoyaltyRedemptionRule[] {
  if (Array.isArray(fallbackFromDb) && fallbackFromDb.length > 0) {
    return fallbackFromDb as LoyaltyRedemptionRule[]
  }
  if (typeof window === 'undefined' || !businessId) {
    return Array.isArray(fallbackFromDb) ? (fallbackFromDb as LoyaltyRedemptionRule[]) : []
  }
  try {
    const raw = localStorage.getItem(`usahaku_loyalty_redemptions_${businessId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as LoyaltyRedemptionRule[]
      }
    }
  } catch {}
  return Array.isArray(fallbackFromDb) ? (fallbackFromDb as LoyaltyRedemptionRule[]) : []
}

export function saveLoyaltyRedemptions(businessId: string, redemptions: LoyaltyRedemptionRule[]): void {
  if (typeof window === 'undefined' || !businessId) return
  try {
    localStorage.setItem(`usahaku_loyalty_redemptions_${businessId}`, JSON.stringify(redemptions))
    window.dispatchEvent(new CustomEvent('usahaku:loyalty_redemptions_changed', { detail: { businessId, redemptions } }))
  } catch {}
}
