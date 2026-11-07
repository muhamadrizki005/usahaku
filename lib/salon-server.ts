import 'server-only'
import { redirect } from 'next/navigation'
import { requireBusiness } from './access'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalonFoundation } from './salon'
import type { SalonVisitPage,SalonSettings,SalonBusySlot,SalonSummary } from './salon-operations'

export async function requireSalon(allowDraft=false) {
  const context=await requireBusiness(['owner','admin','cashier'],allowDraft)
  if(context.business.category!=='barbershop')redirect('/dashboard')
  return context
}
export async function readSalonFoundation(client:SupabaseClient,businessId:string):Promise<SalonFoundation> {
  const {data,error}=await client.rpc('read_salon_foundation',{target_id:businessId}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)throw Error(error?.code==='54000'?'Data salon melewati batas tampilan. Hubungi pengelola.':'Data salon belum dapat dimuat. Periksa koneksi dan migrasi salon.')
  return data
}
export async function readSalonSettings(client:SupabaseClient,businessId:string):Promise<SalonSettings>{
 const {data,error}=await client.from('salon_settings').select('buffer_minutes,tax_rate,revision').eq('business_id',businessId).maybeSingle()
 if(error)throw Error('Pengaturan salon belum dapat dibaca. Periksa koneksi dan migrasi.')
 return data||{buffer_minutes:0,tax_rate:0,revision:0}
}
export async function readSalonVisits(client:SupabaseClient,bid:string,from:string,to:string,page=0,customerId:string|null=null):Promise<SalonVisitPage>{
 const {data,error}=await client.rpc('read_salon_visits',{target_id:bid,from_ts:from,to_ts:to,page_number:page,customer_key:customerId}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)throw Error('Janji temu belum dapat dimuat. Periksa koneksi dan migrasi salon.')
 return data
}
export async function readSalonBusy(client:SupabaseClient,bid:string,from:string,to:string):Promise<SalonBusySlot[]>{
 const {data,error}=await client.rpc('salon_busy_slots',{target_id:bid,from_ts:from,to_ts:to}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)throw Error('Ketersediaan penata belum dapat dimuat. Coba lagi.')
 return data
}
export async function readSalonSummary(client:SupabaseClient,bid:string,from:string,to:string):Promise<SalonSummary>{
 const {data,error}=await client.rpc('salon_report_summary',{target_id:bid,from_ts:from,to_ts:to}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)throw Error('Ringkasan salon belum dapat dibaca.')
 return data
}
