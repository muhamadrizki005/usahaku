import {notFound} from 'next/navigation'
import {z} from 'zod'
import {requireBusiness} from '@/lib/access'
import {readCustomerSales} from '@/lib/customers-server'
import type {Customer} from '@/lib/customers'
import {TransactionHistory} from '@/components/transaction-management'
import {readSalonVisits} from '@/lib/salon-server'
import SalonCustomerHistory from '@/components/salon-customer-history'
export default async function CustomerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {supabase,business,member}=await requireBusiness(undefined, false, 'customers:view')
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound()
  const {data,error}=await supabase.from('customers').select('*').eq('business_id',business.id).eq('id',id).maybeSingle()
  if(error)throw Error('Pelanggan belum dapat dibaca. Coba muat ulang.')
  if(!data)notFound()
  const query=await searchParams,year=typeof query.year==='string'&&/^(20\d{2}|2100)$/.test(query.year)?Number(query.year):Number(new Date(Date.now()+7*3600000).toISOString().slice(0,4)),page=typeof query.visitPage==='string'&&/^\d{1,5}$/.test(query.visitPage)?Number(query.visitPage):0
  const visits=business.category==='barbershop'?await readSalonVisits(supabase,business.id,new Date(year+'-01-01T00:00:00+07:00').toISOString(),new Date((year+1)+'-01-01T00:00:00+07:00').toISOString(),page,id):null
  return <><TransactionHistory member={member} business={business} customer={data as Customer} sales={await readCustomerSales(supabase,business.id,id)}/>{visits&&<SalonCustomerHistory data={visits} customerId={id} year={year}/>}</>
}
