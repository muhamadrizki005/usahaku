'use server'
import {revalidatePath} from 'next/cache'
import {z} from 'zod'
import {requireBusiness} from '@/lib/access'
import type {Sale} from '@/lib/pos'
export type PosResult={sale?:Sale;error?:string;uncertain?:boolean}
function failure(code?:string):PosResult{return{error:code==='PT409'?'Produk, harga, stok, atau pelanggan telah berubah. Muat ulang dan periksa keranjang sebelum menerima pembayaran.':code==='42501'?'Akses transaksi ditolak.':code==='22023'?'Periksa jumlah, pembayaran, diskon, dan konfirmasi.':code==='PGRST202'?'Migrasi POS belum terpasang di Supabase.':'Hasil penyimpanan belum pasti. Coba ulang dengan permintaan yang sama atau periksa riwayat transaksi sebelum mencatat pembayaran lain.',uncertain:!['PT409','42501','22023','PGRST202'].includes(code||'')}}
export async function checkoutPos(requestId:string,details:unknown):Promise<PosResult>{
  const {supabase,business}=await requireBusiness(['owner','admin','cashier'])
  if(!z.uuid().safeParse(requestId).success)return{error:'ID permintaan tidak valid.'}
  const {data,error}=await supabase.rpc('checkout_pos',{target_id:business.id,operation_id:requestId,details}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return failure(error?.code)
  revalidatePath('/dashboard','layout');return{sale:data as Sale}
}
export async function cancelPos(id:string,reason:string,goods:boolean,refund:boolean):Promise<PosResult>{
  const {supabase,business}=await requireBusiness(['owner','admin'])
  if(!z.uuid().safeParse(id).success||reason.trim().length<3||reason.length>300||!goods||!refund)return{error:'Isi alasan dan konfirmasi barang serta pengembalian dana.'}
  const {data,error}=await supabase.rpc('cancel_pos',{target_id:business.id,sale_id:id,explanation:reason,goods_returned:goods,refund_confirmed:refund}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return failure(error?.code)
  revalidatePath('/dashboard','layout');return{sale:data as Sale}
}
