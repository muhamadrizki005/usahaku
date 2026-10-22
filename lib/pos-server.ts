import 'server-only'
import type {createClient} from '@/lib/supabase/server'
import type {Sale} from './pos'
type Client=Awaited<ReturnType<typeof createClient>>
export async function readSales(client:Client,businessId:string):Promise<Sale[]>{
  const result:Sale[]=[]
  for(let start=0;;start+=500){
    const {data,error}=await client.from('pos_transactions').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).order('id').range(start,start+499)
    if(error)throw Error('Transaksi POS belum dapat dibaca. Pastikan migrasi 202610220004 sudah terpasang dan muat ulang.')
    result.push(...data as Sale[]);if(data.length<500)return result
  }
}
