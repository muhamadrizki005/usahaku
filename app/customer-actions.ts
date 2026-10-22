'use server'
import {revalidatePath} from 'next/cache'
import {z} from 'zod'
import {requireBusiness} from '@/lib/access'
import {customerSchema,normalizeCustomerPhone,type CustomerResult,type PosCustomer} from '@/lib/customers'
export async function saveCustomer(form:FormData):Promise<CustomerResult>{
  const {supabase,business}=await requireBusiness(['owner','admin'])
  const ids=z.object({id:z.uuid(),request:z.uuid(),revision:z.number().int().nonnegative().nullable()}).safeParse({id:form.get('id'),request:form.get('request'),revision:form.get('revision')===''?null:Number(form.get('revision'))})
  if(!ids.success)return{error:'ID permintaan tidak valid. Muat ulang formulir.'}
  let details:unknown;try{details=JSON.parse(String(form.get('details')))}catch{return{error:'Data pelanggan tidak valid.'}}
  const parsed=customerSchema.safeParse(details);if(!parsed.success)return{error:parsed.error.issues[0].message}
  try{normalizeCustomerPhone(parsed.data.phone)}catch(e){return{error:(e as Error).message}}
  const {data,error}=await supabase.rpc('save_customer',{target_id:business.id,item_id:ids.data.id,operation_id:ids.data.request,expected_version:ids.data.revision,details:parsed.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return{error:error?.code==='PT409'?'Pelanggan telah berubah di tab lain. Tutup editor dan muat ulang sebelum menyimpan.':error?.code==='42501'?'Akses pelanggan ditolak.':error?.code==='22023'?'Periksa nama, nomor telepon, dan catatan pelanggan.':error?.code==='PGRST202'?'Migrasi pelanggan belum terpasang.':'Hasil penyimpanan belum pasti. Coba ulang permintaan yang sama atau muat ulang untuk memeriksa.',uncertain:!['PT409','42501','22023','PGRST202'].includes(error?.code||'')}
  revalidatePath('/dashboard','layout');return{customer:data}
}
export async function searchPosCustomers(term:string):Promise<{customers:PosCustomer[];error?:string}>{
  const {supabase,business}=await requireBusiness(['owner','admin','cashier'])
  if(typeof term!=='string'||term.trim().length<2||term.trim().length>100)return{customers:[]}
  const {data,error}=await supabase.rpc('search_pos_customers',{target_id:business.id,term:term.trim()}).abortSignal(AbortSignal.timeout(10000)).retry(false)
  if(error)return{customers:[],error:'Pencarian pelanggan belum dapat dilakukan. Coba lagi.'}
  return{customers:data as PosCustomer[]}
}
