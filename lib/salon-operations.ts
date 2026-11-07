import { z } from 'zod'
import { quote } from './pos'
import type { Sale } from './pos'
export const salonStatuses={scheduled:'Dijadwalkan',waiting:'Menunggu',in_service:'Sedang dilayani',finished:'Selesai',cancelled:'Dibatalkan',no_show:'Tidak hadir'} as const
export type SalonVisit={id:string;business_id:string;actor_id:string|null;actor_name:string;practitioner_id:string;practitioner_name:string;customer_id:string|null;customer:string;phone:string;notes:string;kind:'appointment'|'walk_in';starts_at:string;ends_at:string;busy_until:string;buffer_minutes:number;lines:(Sale['lines'][number]&{duration:number})[];subtotal:number;status:keyof typeof salonStatuses;revision:number;deposit_amount:number;deposit_payment:Sale['payment']|null;deposit_at:string|null;deposit_refunded:number;refunded_at:string|null;sale_id:string|null;cancellation_reason:string|null}
export type SalonVisitPage={items:SalonVisit[];total:number;page:number;pageSize:number}
export type SalonBusySlot={practitioner_id:string;starts_at:string;ends_at:string;in_service:boolean}
export type SalonSettings={buffer_minutes:number;tax_rate:number;revision:number}
export type SalonSummary=Record<keyof typeof salonStatuses,number>&{deposits:number;depositRefunds:number;practitioners:{practitioner_id:string;name:string;visits:number;revenue:number}[]}
export const salonActions=['save','arrive','start','finish','deposit','cancel','no_show','pay'] as const
export const salonOperationSchema=z.object({id:z.uuid(),revision:z.number().int().positive().nullable(),request:z.uuid(),action:z.enum(salonActions)}).strict()
export const salonDepositSchema=z.object({amount:z.string().regex(/^[1-9]\d{0,11}$/,'Isi DP rupiah bulat, minimal 1.'),payment:z.enum(['cash','qris','transfer','ewallet']),confirmed:z.literal(true,{error:'Konfirmasi pembayaran yang telah diperiksa.'}),paymentRevision:z.number().int().nonnegative()}).strict()
export const salonBookingSchema=z.object({practitionerId:z.uuid({error:'Pilih penata.'}),customerId:z.uuid().nullable(),customer:z.string().trim().min(1,'Isi nama pelanggan.').max(100),phone:z.string().max(40),notes:z.string().max(1000),kind:z.enum(['appointment','walk_in']),startsAt:z.iso.datetime({offset:true}),serviceIds:z.array(z.uuid()).min(1,'Pilih minimal satu layanan.').max(20).refine(ids=>new Set(ids).size===ids.length,'Layanan tidak boleh berulang.'),deposit:salonDepositSchema.nullable()}).strict()
export const salonPaymentSchema=z.object({payment:z.enum(['cash','qris','transfer','ewallet']),received:z.string().regex(/^(0|[1-9]\d{0,11})$/,'Isi nominal rupiah bulat.'),discountKind:z.enum(['none','amount','percent']),discountValue:z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/),confirmed:z.literal(true,{error:'Konfirmasi pembayaran dahulu.'}),paymentRevision:z.number().int().nonnegative(),settingsRevision:z.number().int().nonnegative()}).strict()
export function salonQuote(subtotal:number,kind:string,value:string,taxRate:number,deposit:number){
 if(!Number.isSafeInteger(subtotal)||subtotal<0||!Number.isSafeInteger(deposit)||deposit<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100||Math.abs(taxRate*100-Math.round(taxRate*100))>0.000001)throw Error('Nominal atau persentase pajak tidak valid.')
 const q=quote([{product:{price:subtotal},quantity:1}],kind,value),tax=Number((BigInt(q.total)*BigInt(Math.round(taxRate*100))+BigInt(5000))/BigInt(10000)),total=q.total+tax
 if(!Number.isSafeInteger(total)||total>999999999999||deposit>total)throw Error('DP melebihi tagihan atau total melampaui batas. Periksa diskon dan DP.')
 return{...q,tax,total,balance:total-deposit}
}
const knownMessages=['Jenis kunjungan','Hanya kunjungan','Penata tidak','Penata belum','Penata sudah','Penata masih','Penata sedang','Layanan tidak','Pilih jadwal','Walk-in memakai','Walk-in hanya','Slot dan','Tagihan lebih','DP tidak','DP sudah','DP harus','Kedatangan hanya','Mulai pelayanan','Selesaikan pelayanan','Tidak hadir hanya','Kunjungan sudah','Hanya owner/admin','Nominal pembayaran','Pembayaran non-tunai','Pengaturan pajak','Diskon melebihi','Tagihan/DP','Persempit rentang']
export function salonOperationFailure(error:{code?:string;message?:string}|null):{error:string;uncertain?:boolean}{
 if(error?.code==='PT409')return{error:'Kunjungan atau pengaturan berubah. Tutup formulir dan muat ulang sebelum menyimpan.'}
 if(error?.message&&knownMessages.some(prefix=>error.message!.startsWith(prefix)))return{error:error.message}
 if(error?.code==='42501')return{error:'Akses salon ditolak. Kasir hanya mengelola kunjungannya sendiri; refund DP memerlukan owner/admin.'}
 if(['22023','22P02','23514','23503','23505'].includes(error?.code||''))return{error:'Periksa layanan, penata, jadwal, pelanggan dan nominal pembayaran.'}
 if(error?.code==='PGRST202'||error?.code==='42P01')return{error:'Operasional salon belum tersedia. Hubungi pengelola untuk memeriksa migrasi.'}
 return{error:'Hasil penyimpanan belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.',uncertain:true}
}
