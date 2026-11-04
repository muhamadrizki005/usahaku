import 'server-only'
import { redirect } from 'next/navigation'
import { requireBusiness } from './access'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalonFoundation } from './salon'

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
