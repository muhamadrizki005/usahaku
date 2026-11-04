'use server'
import { revalidatePath } from 'next/cache'
import { requireBusiness } from '@/lib/access'
import { restaurantBillingSchema, type RestaurantBilling } from '@/lib/restaurant-billing'
import { readRestaurantBilling } from '@/lib/restaurant-billing-server'

export async function saveRestaurantBilling(input: unknown, revision: number): Promise<{ value?: RestaurantBilling; error?: string; uncertain?: boolean }> {
  const { supabase, business } = await requireBusiness(['owner'])
  if (business.category !== 'restaurant') return { error: 'Pengaturan ini hanya tersedia untuk restoran.' }
  const parsed = restaurantBillingSchema.safeParse(input)
  if (!parsed.success || !Number.isSafeInteger(revision) || revision < 0) return { error: !parsed.success ? parsed.error.issues[0].message : 'Versi pengaturan tidak valid.' }
  const v = parsed.data
  const { data, error } = await supabase.rpc('save_restaurant_billing', { target_id: business.id, expected_revision: revision, details: v }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (data && !error) { revalidatePath('/dashboard', 'layout'); return { value: data } }
  if (error?.code === '42501') return { error: 'Hanya owner yang boleh mengubah pengaturan ini.' }
  if (error?.code === '22023') return { error: 'Periksa persentase dan dasar perhitungan tagihan.' }
  try {
    const current = await readRestaurantBilling(supabase, business.id)
    if (current.revision === revision + 1 && Number(current.tax_rate) === Number(v.taxRate) && Number(current.service_rate) === Number(v.serviceRate) && current.tax_base === v.taxBase && current.service_scope === v.serviceScope) { revalidatePath('/dashboard', 'layout'); return { value: current } }
    if (error?.code === 'PT409') return { error: 'Pengaturan berubah di tab lain. Muat ulang sebelum menyimpan.' }
  } catch {}
  return { error: 'Hasil penyimpanan belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.', uncertain: true }
}
