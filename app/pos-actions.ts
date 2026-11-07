'use server'
import {revalidatePath} from 'next/cache'
import {z} from 'zod'
import {requireBusiness} from '@/lib/access'
import type {Sale} from '@/lib/pos'
import {restaurantFailure} from '@/lib/restaurant-errors'
import {salonOperationFailure} from '@/lib/salon-operations'
export type PosResult={sale?:Sale;error?:string;uncertain?:boolean}
function failure(code?:string):PosResult{return{error:code==='PT409'?'Produk, harga, stok, atau pelanggan telah berubah. Muat ulang dan periksa keranjang sebelum menerima pembayaran.':code==='42501'?'Akses transaksi ditolak.':code==='22023'?'Periksa jumlah, pembayaran, diskon, dan konfirmasi.':code==='PGRST202'?'Migrasi POS belum terpasang di Supabase.':'Hasil penyimpanan belum pasti. Coba ulang dengan permintaan yang sama atau periksa riwayat transaksi sebelum mencatat pembayaran lain.',uncertain:!['PT409','42501','22023','PGRST202'].includes(code||'')}}
export async function checkoutPos(requestId:string,details:unknown):Promise<PosResult>{
  const {supabase,business}=await requireBusiness(undefined, false, ['pos:view', 'pos:create'])
  if(!z.uuid().safeParse(requestId).success)return{error:'ID permintaan tidak valid.'}
  const {data,error}=await supabase.rpc('checkout_pos',{target_id:business.id,operation_id:requestId,details}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return failure(error?.code)
  const sale = data as Sale
  if (sale.customer_id) {
    try {
      const { data: cust } = await supabase.from('customers').select('points').eq('id', sale.customer_id).maybeSingle()
      if (cust && cust.points != null) {
        sale.customer_points = Number(cust.points)
      }
    } catch {}
  }
  revalidatePath('/dashboard','layout');return{sale}
}
export async function cancelPos(id:string,reason:string,goods:boolean,refund:boolean):Promise<PosResult>{
  const {supabase,business}=await requireBusiness(undefined, false, ['transactions:view', 'transactions:cancel', 'transactions:refund'])
  if(!z.uuid().safeParse(id).success||reason.trim().length<3||reason.length>300||!goods||!refund)return{error:'Isi alasan dan konfirmasi barang serta pengembalian dana.'}
  const {data,error}=await supabase.rpc(business.category==='barbershop'?'cancel_salon_sale':business.category==='restaurant'?'cancel_restaurant_sale':'cancel_pos',{target_id:business.id,sale_id:id,explanation:reason,goods_returned:goods,refund_confirmed:refund}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return business.category==='barbershop'?salonOperationFailure(error):business.category==='restaurant'?restaurantFailure(error,'refund'):failure(error?.code)
  revalidatePath('/dashboard','layout');return{sale:data as Sale}
}
