import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'
import { replaceLogoSafely } from './logo-lifecycle'
import type { CatalogRow } from './catalog'

export async function cleanupProductImages(productId?:string){
  const admin=createAdminClient();let query=admin.from('product_image_assets').select('id,state,created_at').in('state',['staging','retired','deleting']).order('created_at').limit(50)
  if(productId)query=query.eq('product_id',productId)
  const {data,error}=await query;if(error)return false
  let success=true
  for(const asset of data||[]){
    if(asset.state==='staging'&&Date.parse(asset.created_at)>Date.now()-900000)continue
    const {data:path,error:claim}=await admin.rpc('claim_product_image_cleanup',{asset_id:asset.id});if(claim){success=false;continue}if(!path)continue
    const {error:remove}=await admin.storage.from('product-images').remove([path]);if(remove){success=false;continue}
    const {error:mark}=await admin.from('product_image_assets').update({state:'deleted',updated_at:new Date().toISOString()}).eq('id',asset.id).eq('state','deleting');if(mark)success=false
  }
  return success
}
export async function replaceProductImage(client:SupabaseClient,p:CatalogRow,buffer:Buffer){
  const result=await replaceLogoSafely<CatalogRow>({
    reserve:async()=>{const id=randomUUID();const {data,error}=await client.rpc('reserve_product_image',{target_id:p.business_id,item_id:p.id,asset_id:id}).abortSignal(AbortSignal.timeout(15000)).retry(false);if(error||!data)throw Error('reserve');return{id,path:data}},
    upload:async path=>{const {error}=await createAdminClient().storage.from('product-images').upload(path,buffer,{contentType:'image/png',upsert:false,cacheControl:'0'});if(error)throw Error('upload')},
    activate:async id=>{const {data,error}=await client.rpc('set_product_image',{target_id:p.business_id,item_id:p.id,expected_version:p.revision,asset_id:id}).abortSignal(AbortSignal.timeout(15000)).retry(false);if(error||!data)throw Error('activate');return data},
    reconcile:async path=>{const {data,error}=await client.from('catalog_products').select('*').eq('id',p.id).eq('business_id',p.business_id).single();return !error&&data?.image_path===path?data as CatalogRow:null},
    cleanup:()=>cleanupProductImages(p.id),
  })
  return{...result,error:result.error?.replaceAll('Logo','Gambar produk').replaceAll('logo','gambar produk'),warning:result.warning?.replaceAll('Logo','Gambar produk').replaceAll('logo','gambar produk')}
}
