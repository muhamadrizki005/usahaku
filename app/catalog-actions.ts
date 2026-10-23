'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBusiness } from '@/lib/access'
import { catalogView, productSchema, quantity, type CatalogRow, type CatalogResult } from '@/lib/catalog'
import { prepareBusinessLogo } from '@/lib/business-logo-server'
import { replaceProductImage,cleanupProductImages } from '@/lib/product-images'

function refresh(){revalidatePath('/dashboard','layout');revalidatePath('/onboarding','layout')}
function failure(code?:string):CatalogResult{return{error:code==='23505'?'SKU atau barcode sudah dipakai produk lain di usaha ini.':code==='PT409'?'Data telah berubah di tab lain. Muat ulang sebelum menyimpan.':code==='22023'?'Data tidak valid. Periksa jumlah, alasan, dan satuan produk; satuan tetap setelah dibuat.':'Penyimpanan belum dapat dipastikan. Muat ulang untuk memeriksa; jangan kirim operasi baru sebelum hasilnya jelas.'}}
export async function saveCatalogProduct(form:FormData):Promise<CatalogResult>{
  const {supabase,business}=await requireBusiness(['owner','admin'], true)
  const ids=z.object({id:z.uuid(),request:z.uuid(),revision:z.number().int().nonnegative().nullable()}).safeParse({id:form.get('id'),request:form.get('request'),revision:form.get('revision')===''?null:Number(form.get('revision'))})
  if(!ids.success)return{error:'Identitas permintaan tidak valid. Muat ulang formulir.'}
  let raw:unknown;try{raw=JSON.parse(String(form.get('details')))}catch{return{error:'Data produk tidak valid.'}}
  const parsed=productSchema.safeParse(raw);if(!parsed.success)return{error:parsed.error.issues[0].message}
  const imageAction=z.enum(['keep','replace','remove']).safeParse(form.get('imageAction')||'keep');if(!imageAction.success)return{error:'Pilihan gambar tidak valid.'}
  let buffer:Buffer|undefined
  try{if(imageAction.data==='replace')buffer=await prepareBusinessLogo(form.get('image'))}catch(e){return{error:(e as Error).message.replaceAll('Logo','Gambar produk').replaceAll('logo','gambar produk')}}
  const {data,error}=await supabase.rpc('save_catalog_product',{target_id:business.id,item_id:ids.data.id,operation_id:ids.data.request,expected_version:ids.data.revision,details:parsed.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return failure(error?.code)
  // Read the current row after idempotent replay: its saved response may precede
  // a subsequent image commit, and must not accidentally clear that image.
  const current=await supabase.from('catalog_products').select('*').eq('id',ids.data.id).eq('business_id',business.id).single()
  if(current.data&&current.data.revision!==data.revision&&imageAction.data!=='keep')return{success:'Produk sudah tersimpan.',warning:'Versi produk/gambar sudah berubah. Periksa data terbaru sebelum mengganti gambar.',product:catalogView(current.data)}
  let saved=data as CatalogRow;let warning:string|undefined
  if(buffer){const result=await replaceProductImage(supabase,saved,buffer);saved=result.value||saved;warning=result.error||result.warning}
  else if(imageAction.data==='remove'&&saved.image_path){
    const result=await supabase.rpc('set_product_image',{target_id:business.id,item_id:saved.id,expected_version:saved.revision,asset_id:null}).abortSignal(AbortSignal.timeout(15000)).retry(false)
    if(result.error||!result.data)warning='Produk tersimpan; penghapusan gambar belum pasti. Muat ulang untuk memeriksa.';else saved=result.data
  }
  try{if(!await cleanupProductImages(saved.id))warning||='Produk tersimpan; pembersihan gambar lama akan dicoba kembali.'}catch{warning||='Produk tersimpan; pembersihan gambar lama akan dicoba kembali.'}
  refresh();return{success:'Produk berhasil disimpan.',warning,product:catalogView(saved)}
}
export async function moveCatalogStock(form:FormData):Promise<CatalogResult>{
  const {supabase,business}=await requireBusiness(['owner','admin'], true)
  const parsed=z.object({id:z.uuid(),request:z.uuid(),revision:z.coerce.number().int().nonnegative(),kind:z.enum(['in','out','adjustment']),reason:z.string().trim().min(3,'Alasan minimal 3 karakter.').max(300)}).safeParse(Object.fromEntries(form))
  if(!parsed.success)return{error:parsed.error.issues[0].message}
  let delta:string;try{delta=quantity(form.get('delta'),true);if(Number(delta)===0)throw Error('Perubahan stok tidak boleh nol.')}catch(e){return{error:(e as Error).message}}
  const p=parsed.data
  const {data,error}=await supabase.rpc('move_catalog_stock',{target_id:business.id,item_id:p.id,expected_version:p.revision,operation_id:p.request,change:delta,movement_kind:p.kind,explanation:p.reason}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error||!data)return failure(error?.code)
  const current=await supabase.from('catalog_products').select('*').eq('id',p.id).eq('business_id',business.id).single()
  refresh();return{success:'Perubahan stok berhasil disimpan.',product:catalogView(current.data||data)}
}

export async function bulkCatalogProducts(form:FormData):Promise<CatalogResult>{
  const {supabase,business}=await requireBusiness(['owner','admin'], true)
  let raw:unknown;try{raw={request:form.get('request'),items:JSON.parse(String(form.get('items'))),category:JSON.parse(String(form.get('category'))),active:JSON.parse(String(form.get('active')))}}catch{return{error:'Pilihan tidak valid.'}}
  const parsed=z.object({request:z.uuid(),items:z.array(z.object({id:z.uuid(),revision:z.number().int().nonnegative()})).min(1).max(500),category:z.string().trim().min(1).max(100).nullable(),active:z.boolean().nullable()}).safeParse(raw)
  if(!parsed.success)return{error:parsed.error.issues[0].message}
  const p=parsed.data;const {error}=await supabase.rpc('bulk_catalog_products',{target_id:business.id,operation_id:p.request,items:p.items,new_category:p.category,new_active:p.active}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error)return failure(error.code)
  refresh();return{success:'Produk terpilih berhasil diperbarui.'}
}
