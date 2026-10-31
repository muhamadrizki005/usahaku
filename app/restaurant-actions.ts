'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBusiness } from '@/lib/access'
import { restaurantMenuSchema, restaurantTableSchema, restaurantOrderSchema, restaurantPaymentSchema, restaurantOrderFilters, type RestaurantOrderPage, type RestaurantResult } from '@/lib/restaurant'
import { readRestaurantOrdersPage } from '@/lib/restaurant-server'
import { restaurantFailure as failure } from '@/lib/restaurant-errors'

const ids = z.object({ id: z.uuid(), request: z.uuid(), revision: z.number().int().nonnegative().nullable() }).strict()
export async function loadRestaurantOrders(input: unknown): Promise<{ data?: RestaurantOrderPage; error?: string }> {
  const { supabase, business } = await requireBusiness(['owner', 'admin', 'cashier'])
  if (business.category !== 'restaurant') return { error: 'Akses daftar pesanan ditolak.' }
  const parsed = restaurantOrderFilters.safeParse(input)
  if (!parsed.success) return { error: 'Filter pesanan tidak valid.' }
  try { return { data: await readRestaurantOrdersPage(supabase, business.id, parsed.data) } }
  catch { return { error: 'Daftar pesanan belum dapat dimuat. Coba lagi.' } }
}
export async function saveRestaurantResource(resource: 'menu' | 'table', input: unknown, details: unknown): Promise<RestaurantResult> {
  const { supabase, business } = await requireBusiness(['owner', 'admin'], true)
  if (business.category !== 'restaurant') return failure('42501')
  const parsed = ids.safeParse(input), values = (resource === 'menu' ? restaurantMenuSchema : restaurantTableSchema).safeParse(details)
  if (!['menu', 'table'].includes(resource) || !parsed.success || !values.success) return { error: !values.success ? values.error.issues[0].message : 'Permintaan tidak valid.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('save_restaurant_resource', { target_id: business.id, resource, item_id: p.id, expected_revision: p.revision, operation_id: p.request, details: values.data }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error, resource)
  revalidatePath('/dashboard', 'layout'); revalidatePath('/onboarding', 'layout')
  return { value: data }
}
export async function saveRestaurantOrder(input: unknown, details: unknown): Promise<RestaurantResult> {
  const { supabase, business } = await requireBusiness(['owner', 'admin', 'cashier'])
  if (business.category !== 'restaurant') return failure('42501')
  const parsed = ids.safeParse(input), values = restaurantOrderSchema.safeParse(details)
  if (!parsed.success || !values.success) return { error: !values.success ? values.error.issues[0].message : 'Permintaan tidak valid.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('save_restaurant_order', { target_id: business.id, item_id: p.id, expected_revision: p.revision, operation_id: p.request, details: values.data }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error, 'order')
  revalidatePath('/dashboard', 'layout'); return { value: data }
}
export async function payRestaurantOrder(input: unknown, details: unknown): Promise<RestaurantResult> {
  const { supabase, business } = await requireBusiness(['owner', 'admin', 'cashier'])
  if (business.category !== 'restaurant') return failure('42501')
  const parsed = ids.safeParse(input), values = restaurantPaymentSchema.safeParse(details)
  if (!parsed.success || !values.success) return { error: !values.success ? values.error.issues[0].message : 'Permintaan tidak valid.' }
  const p = parsed.data
  const { data, error } = await supabase.rpc('pay_restaurant_order', { target_id: business.id, item_id: p.id, expected_revision: p.revision, operation_id: p.request, details: values.data }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error, 'payment')
  revalidatePath('/dashboard', 'layout'); return { value: data }
}
export async function cancelRestaurantOrder(id: string, revision: number, reason: string): Promise<RestaurantResult> {
  const { supabase, business } = await requireBusiness(['owner', 'admin', 'cashier'])
  if (business.category !== 'restaurant') return failure('42501')
  if (!z.uuid().safeParse(id).success || !z.number().int().nonnegative().safeParse(revision).success || !z.string().trim().min(3).max(300).safeParse(reason).success) return failure('22023', 'cancel')
  const { data, error } = await supabase.rpc('cancel_restaurant_order', { target_id: business.id, item_id: id, expected_revision: revision, explanation: reason.trim() }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return failure(error, 'cancel')
  revalidatePath('/dashboard', 'layout'); return { value: data }
}
