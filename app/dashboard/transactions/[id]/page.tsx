import {notFound} from 'next/navigation'
import {z} from 'zod'
import {requireBusiness} from '@/lib/access'
import {TransactionDetail} from '@/components/transaction-management'
import type {Sale} from '@/lib/pos'
export default async function SalePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params
  if(!z.uuid().safeParse(id).success)notFound()
  const {supabase,business,member}=await requireBusiness(['owner','admin','cashier'])
  const {data,error}=await supabase.from('pos_transactions').select('*').eq('business_id',business.id).eq('id',id).maybeSingle()
  if(error)throw Error('Transaksi belum dapat dibaca. Coba muat ulang.')
  if(!data)notFound()
  return <TransactionDetail initialSale={data as Sale} business={business} member={member} />
}
