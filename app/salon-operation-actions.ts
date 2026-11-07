'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSalon } from '@/lib/salon-server'
import { salonOperationSchema,salonBookingSchema,salonPaymentSchema,salonDepositSchema,salonOperationFailure,type SalonVisit,type SalonSettings } from '@/lib/salon-operations'
export async function salonVisitOperation(input:unknown,details:unknown):Promise<{value?:SalonVisit;error?:string;uncertain?:boolean}>{
 const {business,supabase}=await requireSalon()
 const p=salonOperationSchema.safeParse(input)
 if(!p.success)return{error:'Permintaan kunjungan tidak valid.'}
 const closeSchema=z.object({reason:z.string().trim().min(3,'Isi alasan minimal 3 karakter.').max(300),refundConfirmed:z.boolean().optional()}).strict()
 const schema=p.data.action==='save'?salonBookingSchema:p.data.action==='pay'?salonPaymentSchema:p.data.action==='deposit'?salonDepositSchema:p.data.action==='cancel'||p.data.action==='no_show'?closeSchema:z.object({}).strict()
 const d=schema.safeParse(details);if(!d.success)return{error:d.error.issues[0].message}
 const {data,error}=await supabase.rpc('salon_visit_operation',{target_id:business.id,item_id:p.data.id,expected_revision:p.data.revision,operation_id:p.data.request,action:p.data.action,details:d.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return salonOperationFailure(error)
 revalidatePath('/dashboard','layout');return{value:data}
}
export async function saveSalonSettings(input:unknown,revision:number):Promise<{value?:SalonSettings;error?:string;uncertain?:boolean}>{
 const {business,supabase}=await requireSalon()
 const schema=z.object({buffer:z.string().regex(/^(0|[1-9]\d{0,2})$/).refine(v=>Number(v)<=120),taxRate:z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/).refine(v=>Number(v)<=100)}).strict(),p=schema.safeParse(input)
 if(!p.success||!Number.isSafeInteger(revision)||revision<0)return{error:'Isi jeda 0–120 menit dan pajak 0–100% (maksimal 2 desimal).'}
 const {data,error}=await supabase.rpc('save_salon_settings',{target_id:business.id,expected_revision:revision,details:p.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return salonOperationFailure(error)
 revalidatePath('/dashboard','layout');return{value:data}
}
