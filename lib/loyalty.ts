import { z } from 'zod'

export const loyaltySettingsSchema = z.object({
  active: z.boolean(),
  nominal: z.coerce.number().int().min(1).max(1000000000),
}).strict()

export function loyaltySaveError(code?: string) {
  if (code === '42501') return 'Hanya pemilik yang dapat mengatur program poin.'
  if (code === '22023') return 'Isi nominal rupiah bulat antara Rp1 dan Rp1.000.000.000.'
  if (['PGRST202', '42703', '42P01'].includes(code || '')) return 'Program poin belum siap digunakan. Muat ulang atau hubungi pengelola aplikasi.'
  return 'Penyimpanan pengaturan poin belum dapat dipastikan. Muat ulang untuk memeriksa sebelum mencoba lagi.'
}
