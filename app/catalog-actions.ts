'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBusiness } from '@/lib/access'
import { catalogView, defaultProductUnits, productCategories, productSchema, quantity, type CatalogRow, type CatalogResult } from '@/lib/catalog'
import { prepareBusinessLogo } from '@/lib/business-logo-server'
import { replaceProductImage,cleanupProductImages } from '@/lib/product-images'

function refresh(){revalidatePath('/dashboard','layout');revalidatePath('/onboarding','layout')}
function failure(code?:string):CatalogResult{return{error:code==='42501'?'Akses produk atau stok ditolak. Muat ulang untuk memeriksa izin terbaru.':code==='23505'?'SKU atau barcode sudah dipakai produk lain di usaha ini.':code==='PT409'?'Data telah berubah di tab lain. Muat ulang sebelum menyimpan.':code==='22023'?'Data tidak valid. Periksa jumlah, alasan, dan satuan produk; satuan tetap setelah dibuat.':'Penyimpanan belum dapat dipastikan. Muat ulang untuk memeriksa; jangan kirim operasi baru sebelum hasilnya jelas.'}}
export async function saveCatalogProduct(form:FormData):Promise<CatalogResult>{
  const {supabase,business,member,user}=await requireBusiness(undefined, true, ['products:view', form.get('revision') === '' ? 'products:create' : 'products:edit'])
  const ids=z.object({id:z.uuid(),request:z.uuid(),revision:z.number().int().nonnegative().nullable()}).safeParse({id:form.get('id'),request:form.get('request'),revision:form.get('revision')===''?null:Number(form.get('revision'))})
  if(!ids.success)return{error:'Identitas permintaan tidak valid. Muat ulang formulir.'}
  let raw:unknown;try{raw=JSON.parse(String(form.get('details')))}catch{return{error:'Data produk tidak valid.'}}
  const parsed=productSchema.safeParse(raw);if(!parsed.success)return{error:parsed.error.issues[0].message}
  const imageAction=z.enum(['keep','replace','remove']).safeParse(form.get('imageAction')||'keep');if(!imageAction.success)return{error:'Pilihan gambar tidak valid.'}
  let buffer:Buffer|undefined
  try{if(imageAction.data==='replace')buffer=await prepareBusinessLogo(form.get('image'))}catch(e){return{error:(e as Error).message.replaceAll('Logo','Gambar produk').replaceAll('logo','gambar produk')}}
  let data: any = null
  let error: any = null

  if (business.category === 'store') {
    const res = await supabase.rpc('save_catalog_product',{target_id:business.id,item_id:ids.data.id,operation_id:ids.data.request,expected_version:ids.data.revision,details:parsed.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
    data = res.data
    error = res.error
  } else {
    try {
      const admin = createAdminClient()
      const existing = await admin.from('catalog_products').select('*').eq('id', ids.data.id).eq('business_id', business.id).maybeSingle()
      const cost = Number(parsed.data.price)
      const minimum = Number(parsed.data.minimum || 0)
      const initialStock = Number(parsed.data.initialStock || 0)
      const discountKind = parsed.data.discountKind || 'none'
      const discountValue = Number(parsed.data.discountValue || 0)

      if (!existing.data) {
        const sku = parsed.data.sku?.trim() || ('SKU-' + Math.random().toString(36).slice(2, 8).toUpperCase())
        const insertRow = {
          id: ids.data.id,
          business_id: business.id,
          name: parsed.data.name.trim(),
          category: parsed.data.category.trim(),
          unit: parsed.data.unit.trim(),
          sku,
          barcode: parsed.data.barcode?.trim() || '',
          price: cost,
          stock: initialStock,
          minimum_stock: minimum,
          active: parsed.data.active,
          revision: 0,
          stock_revision: 0,
          discount_kind: discountKind,
          discount_value: discountValue
        }
        const insertRes = await admin.from('catalog_products').insert(insertRow).select().single()
        if (insertRes.error) {
          error = insertRes.error
        } else {
          data = insertRes.data
          if (initialStock > 0) {
            try {
              await admin.from('stock_movements').insert({
                business_id: business.id,
                product_id: ids.data.id,
                request_id: ids.data.request,
                kind: 'initial',
                quantity: initialStock,
                before_stock: 0,
                after_stock: initialStock,
                product_name: parsed.data.name.trim(),
                unit: parsed.data.unit.trim(),
                reason: 'Stok awal',
                actor_id: user.id,
                actor_name: member.name
              })
            } catch {}
          }
        }
      } else {
        if (ids.data.revision !== null && ids.data.revision !== existing.data.revision) {
          return failure('PT409')
        }
        const updateRow = {
          name: parsed.data.name.trim(),
          category: parsed.data.category.trim(),
          sku: parsed.data.sku?.trim() || existing.data.sku,
          barcode: parsed.data.barcode?.trim() || '',
          price: cost,
          minimum_stock: minimum,
          active: parsed.data.active,
          revision: (existing.data.revision || 0) + 1,
          discount_kind: discountKind,
          discount_value: discountValue,
          updated_at: new Date().toISOString()
        }
        const updateRes = await admin.from('catalog_products').update(updateRow).eq('id', existing.data.id).eq('business_id', business.id).select().single()
        if (updateRes.error) {
          error = updateRes.error
        } else {
          data = updateRes.data
        }
      }
    } catch (e: any) {
      error = { code: '500', message: e.message }
    }
  }
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

  // Gracefully persist custom category and unit if not present
  try {
    const cat = parsed.data.category.trim()
    if (cat && !productCategories.some(c => c.toLowerCase() === cat.toLowerCase())) {
      const client = business.category === 'store' ? supabase : createAdminClient()
      await client.from('product_categories').insert({ business_id: business.id, name: cat })
    }
  } catch {}
  try {
    const un = parsed.data.unit.trim()
    if (un && !defaultProductUnits.some(u => u.toLowerCase() === un.toLowerCase())) {
      const client = business.category === 'store' ? supabase : createAdminClient()
      await client.from('product_units').insert({ business_id: business.id, name: un })
    }
  } catch {}

  refresh();return{success:'Produk berhasil disimpan.',warning,product:catalogView(saved)}
}
export async function moveCatalogStock(form:FormData):Promise<CatalogResult>{
  const {supabase,business,member,user}=await requireBusiness(undefined, true, ['inventory:view', form.get('kind') === 'adjustment' ? 'inventory:edit' : 'inventory:create'])
  const parsed=z.object({id:z.uuid(),request:z.uuid(),revision:z.coerce.number().int().nonnegative(),kind:z.enum(['in','out','adjustment']),reason:z.string().trim().min(3,'Alasan minimal 3 karakter.').max(300)}).safeParse(Object.fromEntries(form))
  if(!parsed.success)return{error:parsed.error.issues[0].message}
  let delta:string;try{delta=quantity(form.get('delta'),true);if(Number(delta)===0)throw Error('Perubahan stok tidak boleh nol.')}catch(e){return{error:(e as Error).message}}
  const p=parsed.data
  let data: any = null
  let error: any = null

  if (business.category === 'store') {
    const res = await supabase.rpc('move_catalog_stock',{target_id:business.id,item_id:p.id,expected_version:p.revision,operation_id:p.request,change:delta,movement_kind:p.kind,explanation:p.reason}).abortSignal(AbortSignal.timeout(15000)).retry(false)
    data = res.data
    error = res.error
  } else {
    try {
      const admin = createAdminClient()
      const current = await admin.from('catalog_products').select('*').eq('id', p.id).eq('business_id', business.id).single()
      if (current.data) {
        const deltaNum = Number(delta)
        const nextStock = Math.max(0, Number(current.data.stock) + deltaNum)
        const updateRes = await admin.from('catalog_products').update({
          stock: nextStock,
          stock_revision: (current.data.stock_revision || 0) + 1,
          updated_at: new Date().toISOString()
        }).eq('id', current.data.id).select().single()
        data = updateRes.data
        error = updateRes.error
        if (data) {
          try {
            await admin.from('stock_movements').insert({
              business_id: business.id,
              product_id: current.data.id,
              request_id: p.request,
              kind: p.kind,
              quantity: deltaNum,
              before_stock: current.data.stock,
              after_stock: nextStock,
              product_name: current.data.name,
              unit: current.data.unit,
              reason: p.reason,
              actor_id: user.id,
              actor_name: member.name
            })
          } catch {}
        }
      } else {
        error = { code: 'PT409' }
      }
    } catch (e: any) {
      error = { code: '500', message: e.message }
    }
  }
  if(error||!data)return failure(error?.code)
  const moveClient = business.category === 'store' ? supabase : createAdminClient()
  const current = await moveClient.from('catalog_products').select('*').eq('id',p.id).eq('business_id',business.id).single()
  refresh();return{success:'Perubahan stok berhasil disimpan.',product:catalogView(current.data||data)}
}

export async function bulkCatalogProducts(form:FormData):Promise<CatalogResult>{
  const {supabase,business}=await requireBusiness(undefined, true, ['products:view', form.get('active') === 'null' ? 'products:edit' : 'products:delete'])
  let raw:unknown;try{raw={request:form.get('request'),items:JSON.parse(String(form.get('items'))),category:JSON.parse(String(form.get('category'))),active:JSON.parse(String(form.get('active')))}}catch{return{error:'Pilihan tidak valid.'}}
  const parsed=z.object({request:z.uuid(),items:z.array(z.object({id:z.uuid(),revision:z.number().int().nonnegative()})).min(1).max(500),category:z.string().trim().min(1).max(100).nullable(),active:z.boolean().nullable()}).safeParse(raw)
  if(!parsed.success)return{error:parsed.error.issues[0].message}
  const p=parsed.data;const {error}=await supabase.rpc('bulk_catalog_products',{target_id:business.id,operation_id:p.request,items:p.items,new_category:p.category,new_active:p.active}).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if(error)return failure(error.code)
  refresh();return{success:'Produk terpilih berhasil diperbarui.'}
}
