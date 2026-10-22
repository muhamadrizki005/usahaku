import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogView, type CatalogRow, type StockRow } from './catalog'

async function allRows(client:SupabaseClient,table:string,businessId:string,order:string){
  const rows:any[]=[]
  for(let start=0;;start+=500){const {data,error}=await client.from(table).select('*').eq('business_id',businessId).order(order).order('id').range(start,start+499);if(error)throw Error('Data produk/inventori belum dapat dimuat. Periksa koneksi dan migrasi katalog.');rows.push(...data);if(data.length<500)return rows}
}
export async function readProducts(client:SupabaseClient,businessId:string){return (await allRows(client,'catalog_products',businessId,'name') as CatalogRow[]).map(catalogView)}
export async function readStockHistory(client:SupabaseClient,businessId:string){return (await allRows(client,'stock_movements',businessId,'created_at') as StockRow[]).reverse()}
