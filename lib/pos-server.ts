import 'server-only'
import type {createClient} from '@/lib/supabase/server'
import type {Sale} from './pos'
type Client=Awaited<ReturnType<typeof createClient>>
export async function readSales(client:Client,businessId:string):Promise<Sale[]>{
  const result:Sale[]=[]
  for(let start=0;;start+=500){
    const {data,error}=await client.from('pos_transactions').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).order('id').range(start,start+499)
    if(error)throw Error('Transaksi POS belum dapat dibaca. Pastikan migrasi 202610220004 sudah terpasang dan muat ulang.')
    const batch = (data || []) as Sale[]
    const custIds = Array.from(new Set(batch.map(s => s.customer_id).filter(Boolean))) as string[]
    if (custIds.length > 0) {
      try {
        const { data: custs } = await client.from('customers').select('id, points').in('id', custIds)
        if (custs) {
          const map = new Map<string, number>()
          for (const c of custs) map.set(c.id, Number(c.points || 0))
          for (const s of batch) {
            if (s.customer_id && map.has(s.customer_id)) {
              s.customer_points = map.get(s.customer_id)
            }
          }
        }
      } catch {}
    }
    result.push(...batch);if(data.length<500)return result
  }
}
