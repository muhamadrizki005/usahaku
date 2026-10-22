import {notFound} from 'next/navigation'
import {z} from 'zod'
import {requireBusiness} from '@/lib/access'
import {readCustomerSales} from '@/lib/customers-server'
import type {Customer} from '@/lib/customers'
import {TransactionHistory} from '@/components/transaction-management'
export default async function CustomerPage({params}:{params:Promise<{id:string}>}){
  const {supabase,business,member}=await requireBusiness(['owner','admin'])
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound()
  const {data,error}=await supabase.from('customers').select('*').eq('business_id',business.id).eq('id',id).maybeSingle()
  if(error)throw Error('Pelanggan belum dapat dibaca. Coba muat ulang.')
  if(!data)notFound()
  return <TransactionHistory member={member} customer={data as Customer} sales={await readCustomerSales(supabase,business.id,id)}/>
}
