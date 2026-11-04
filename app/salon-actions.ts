'use server'
import { revalidatePath } from 'next/cache'
import { requireSalon } from '@/lib/salon-server'
import { salonRequestSchema,salonServiceSchema,salonPractitionerSchema,salonFailure,type SalonResult } from '@/lib/salon'

export async function saveSalonResource(input:unknown,details:unknown):Promise<SalonResult> {
  const {supabase,business,member}=await requireSalon(true)
  if(!['owner','admin'].includes(member.role))return {error:'Hanya owner/admin salon yang boleh mengubah data ini.'}
  const request=salonRequestSchema.safeParse(input)
  if(!request.success)return {error:'Permintaan salon tidak valid.'}
  const parsed=(request.data.resource==='service'?salonServiceSchema:salonPractitionerSchema).safeParse(details)
  if(!parsed.success)return {error:parsed.error.issues[0].message}
  const p=request.data
  const {data,error}=await supabase.rpc('save_salon_resource',{target_id:business.id,resource:p.resource,item_id:p.id,expected_revision:p.revision,operation_id:p.request,details:parsed.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return salonFailure(error)
  revalidatePath('/dashboard','layout');revalidatePath('/onboarding/setup');revalidatePath('/onboarding/summary')
  return {value:data}
}
