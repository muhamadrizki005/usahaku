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

export async function deleteRestaurantTable(input:unknown):Promise<RestaurantResult>{
 const {supabase,business}=await requireBusiness(['owner','admin'])
 const p=ids.safeParse(input)
 if(business.category!=='restaurant'||!p.success||p.data.revision===null)return failure('42501')
 const {data,error}=await supabase.rpc('delete_restaurant_table',{target_id:business.id,item_id:p.data.id,expected_revision:p.data.revision,operation_id:p.data.request}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return failure(error,'table')
 revalidatePath('/dashboard','layout');return{value:data}
}

export async function loadRestaurantMember(id:string):Promise<{member?:import('@/lib/customers').PosCustomer;error?:string}>{
 const {supabase,business}=await requireBusiness(['owner','admin','cashier'],false,'pos:view')
 if(business.category!=='restaurant'||!z.uuid().safeParse(id).success)return{error:'Member tidak valid.'}
 const {data,error}=await supabase.from('customers').select('id,name,phone,points').eq('business_id',business.id).eq('id',id).eq('active',true).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
 if(error||!data)return{error:'Member tidak aktif atau belum dapat dimuat. Muat ulang sebelum pembayaran.'}
 return{member:{...data,points:Number(data.points)}}
}

export async function saveRestaurantLoyalty(details:unknown,revision:number):Promise<{value?:import('@/lib/restaurant-billing').RestaurantBilling;error?:string}>{
 const {supabase,business}=await requireBusiness(['owner'])
 const p=z.object({active:z.boolean(),nominal:z.string().regex(/^[1-9]\d{0,9}$/).refine(v=>Number(v)<=1000000000),redemption:z.boolean(),pointValue:z.string().regex(/^(0|[1-9]\d{0,9})$/).refine(v=>Number(v)<=1000000000)}).strict().safeParse(details)
 if(business.category!=='restaurant'||!p.success||!Number.isSafeInteger(revision)||revision<0)return{error:'Periksa nominal perolehan dan nilai rupiah per poin.'}
 const {data,error}=await supabase.rpc('save_restaurant_loyalty',{target_id:business.id,expected_revision:revision,details:p.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return{error:error?.code==='PT409'?'Pengaturan berubah. Muat ulang sebelum menyimpan.':error?.code==='22023'?'Isi nominal valid; penukaran aktif memerlukan nilai minimal Rp1 per poin.':'Hasil penyimpanan belum pasti. Muat ulang untuk memeriksa.'}
 revalidatePath('/dashboard','layout');return{value:data}
}

export async function setRestaurantTableAvailability(input:unknown,available:boolean):Promise<RestaurantResult>{
 const {supabase,business}=await requireBusiness(['owner','admin','cashier'])
 const parsed=ids.safeParse(input)
 if(business.category!=='restaurant'||!parsed.success||parsed.data.revision===null||typeof available!=='boolean')return failure('22023','table')
 const p=parsed.data
 const {data,error}=await supabase.rpc('set_restaurant_table_availability',{target_id:business.id,item_id:p.id,expected_revision:p.revision,operation_id:p.request,available}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return failure(error,'table')
 revalidatePath('/dashboard','layout');return{value:data}
}
