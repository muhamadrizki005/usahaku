import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {Customer} from './customers'
import type {Sale} from './pos'
export async function readCustomers(client:SupabaseClient,businessId:string):Promise<Customer[]>{
  const rows:Customer[]=[]
  for(let start=0;;start+=500){
    const {data,error}=await client.from('customers').select('*').eq('business_id',businessId).order('name').order('id').range(start,start+499)
    if(error)throw Error('Data pelanggan belum dapat dibaca. Periksa koneksi dan migrasi 202610220005.')
    rows.push(...data as Customer[]);if(data.length<500)return rows
  }
}
export async function readCustomerSales(client:SupabaseClient,businessId:string,customerId:string):Promise<Sale[]>{
  const rows:Sale[]=[]
  let custPoints: number | undefined
  try {
    const { data: cust } = await client.from('customers').select('points').eq('id', customerId).maybeSingle()
    if (cust && cust.points != null) custPoints = Number(cust.points)
  } catch {}
  for(let start=0;;start+=500){
    const {data,error}=await client.from('pos_transactions').select('*').eq('business_id',businessId).eq('customer_id',customerId).order('created_at',{ascending:false}).order('id').range(start,start+499)
    if(error)throw Error('Riwayat pelanggan belum dapat dibaca. Coba muat ulang.')
    const batch = (data || []) as Sale[]
    if (custPoints !== undefined) {
      for (const s of batch) s.customer_points = custPoints
    }
    rows.push(...batch);if(data.length<500)return rows
  }
}
