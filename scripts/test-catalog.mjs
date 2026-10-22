import { createClient } from '@supabase/supabase-js'
import { randomUUID,randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import fs from 'node:fs'

const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})}}
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options)
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options)
const users=[],businesses=[],results=[];let stage='schema',before,originalIds,passed=false
const ok=({data,error})=>{if(error){const e=Error('Backend request failed');e.code=error.code||error.statusCode;throw e}return data}
const pass=s=>{results.push(s);console.log('PASS: '+s)}
async function snapshot(ids){const out={};for(const t of ['businesses','business_members','staff_audit_logs','catalog_products','stock_movements','catalog_audit','catalog_requests','product_image_assets'])out[t]=ok(await admin.from(t).select('*').in(t==='businesses'?'id':'business_id',ids).order(t==='catalog_requests'?'request_id':'id'));return JSON.stringify(out)}
async function user(label){const email=`usahaku-catalog-${label}-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const u=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(u.id);const c=client();ok(await c.auth.signInWithPassword({email,password}));return{c,id:u.id}}
const details={name:'Beras Uji',category:'Sembako',unit:'kg',sku:'BRS-01',barcode:'00001234',price:'12000',minimum:'0.250',initialStock:'1.250',active:true}
try{
  const probe=await admin.from('catalog_products').select('id').limit(1)
  if(probe.error?.code==='PGRST205'){console.log('BLOCKED: migrasi 202610220001 belum tersedia melalui API. Tidak membuat akun uji.');process.exitCode=2}
  else{
    ok(probe);originalIds=ok(await admin.from('businesses').select('id')).map(b=>b.id);before=await snapshot(originalIds)
    const a=await user('a'),b=await user('b')
    for(const u of [a,b]){u.business=ok(await u.c.rpc('create_business_profile',{store_name:'Catalog Test '+u.id.slice(0,5),owner_name:'Catalog Owner',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));businesses.push(u.business)}
    const p=randomUUID(),key=randomUUID();const args={target_id:a.business,item_id:p,expected_version:null,operation_id:key,details}
    stage='create/replay';const original=ok(await a.c.rpc('save_catalog_product',args));assert.equal(Number(original.stock),1.25);assert.deepEqual(ok(await a.c.rpc('save_catalog_product',args)),original)
    assert.equal(ok(await admin.from('stock_movements').select('id').eq('product_id',p)).length,1)
    assert.ok((await a.c.rpc('save_catalog_product',{...args,details:{...details,name:'Different'}})).error)
    assert.equal(ok(await b.c.from('catalog_products').select('id')).length,0)
    assert.ok((await b.c.rpc('save_catalog_product',{...args,expected_version:0,operation_id:randomUUID(),target_id:b.business,details:{...details,initialStock:'0'}})).error)
    assert.ok((await a.c.from('catalog_products').update({stock:999}).eq('id',p)).error)
    assert.ok((await a.c.rpc('save_catalog_product',{...args,item_id:randomUUID(),operation_id:randomUUID(),details:{...details,barcode:'DIFFERENT'}})).error)
    assert.ok((await a.c.rpc('save_catalog_product',{...args,item_id:randomUUID(),operation_id:randomUUID(),details:{...details,sku:'DIFFERENT'}})).error)
    assert.equal(ok(await a.c.from('catalog_products').select('id')).length,1)
    assert.ok((await client().from('catalog_products').select('id')).error)
    pass('Produk dan stok awal atomik; pengiriman ulang tidak menggandakan stok; akses silang dan direct UPDATE ditolak')
    stage='fractional/concurrent stock';const movement={target_id:a.business,item_id:p,expected_version:0,operation_id:randomUUID(),change:'-0.250',movement_kind:'adjustment',explanation:'Hitung fisik rak'}
    const first=ok(await a.c.rpc('move_catalog_stock',movement));assert.equal(Number(first.stock),1);assert.deepEqual(ok(await a.c.rpc('move_catalog_stock',movement)),first)
    const results=await Promise.all(['0.125','-0.125'].map(change=>a.c.rpc('move_catalog_stock',{...movement,expected_version:1,operation_id:randomUUID(),change})))
    assert.equal(results.filter(r=>!r.error).length,1)
    let current=ok(await a.c.from('catalog_products').select('*').eq('id',p).single())
    for(const change of ['0.0001','NaN','-999'])assert.ok((await a.c.rpc('move_catalog_stock',{...movement,expected_version:current.stock_revision,operation_id:randomUUID(),change})).error)
    const history=ok(await a.c.from('stock_movements').select('*').eq('product_id',p));assert.equal(history.length,3);assert.ok(history.every(m=>m.actor_id===a.id&&m.actor_name==='Catalog Owner'))
    pass('Pecahan 3 desimal tepat; dua koreksi bersamaan hanya satu berhasil; stok negatif/precision berlebih ditolak; ledger beralasan dan berpelaku')
    stage='admin/cashier';const staff=await user('admin'),cashier=await user('cashier')
    for(const [u,role] of [[staff,'admin'],[cashier,'cashier']])ok(await admin.from('business_members').insert({business_id:a.business,user_id:u.id,name:'Test '+role,username:role,role,must_change_password:false,changed_by:a.id}))
    const updated=ok(await staff.c.rpc('save_catalog_product',{...args,operation_id:randomUUID(),expected_version:0,details:{...details,name:'Beras Admin',initialStock:'0'}}));assert.equal(updated.name,'Beras Admin')
    assert.ok((await cashier.c.rpc('move_catalog_stock',{...movement,expected_version:current.stock_revision,operation_id:randomUUID(),change:'1'})).error)
    assert.ok((await cashier.c.rpc('save_catalog_product',{...args,item_id:randomUUID(),operation_id:randomUUID()})).error)
    assert.equal(ok(await cashier.c.from('stock_movements').select('id')).length,0)
    pass('Admin mengelola katalog; kasir tidak dapat mengubah produk/stok atau membaca audit inventori')
    stage='image';const asset=randomUUID(),path=ok(await staff.c.rpc('reserve_product_image',{target_id:a.business,item_id:p,asset_id:asset}));assert.ok((await staff.c.rpc('set_product_image',{target_id:a.business,item_id:p,expected_version:1,asset_id:asset})).error)
    const png=await sharp({create:{width:20,height:20,channels:4,background:'#0f766e'}}).png().toBuffer();ok(await admin.storage.from('product-images').upload(path,png,{contentType:'image/png',cacheControl:'0',upsert:false}))
    const image=ok(await staff.c.rpc('set_product_image',{target_id:a.business,item_id:p,expected_version:1,asset_id:asset}));assert.equal(image.image_path,path)
    assert.ok(ok(await staff.c.storage.from('product-images').download(path,{cacheNonce:randomUUID()})));assert.ok((await b.c.storage.from('product-images').download(path,{cacheNonce:randomUUID()})).error)
    assert.ok((await client().storage.from('product-images').download(path,{cacheNonce:randomUUID()})).error)
    assert.equal(ok(await admin.rpc('claim_product_image_cleanup',{asset_id:asset})),null)
    pass('Gambar privat; kandidat belum diunggah ditolak, akses antarusaha/anonim ditolak, cleanup melindungi file aktif')
    stage='bulk atomicity';const q=randomUUID();ok(await a.c.rpc('save_catalog_product',{...args,item_id:q,operation_id:randomUUID(),details:{...details,sku:'SECOND',barcode:'SECOND'}}))
    const bulk={target_id:a.business,operation_id:randomUUID(),items:[{id:p,revision:2},{id:q,revision:99}],new_category:null,new_active:false}
    assert.ok((await staff.c.rpc('bulk_catalog_products',bulk)).error);assert.equal(ok(await a.c.from('catalog_products').select('active').eq('id',p).single()).active,true)
    ok(await staff.c.rpc('bulk_catalog_products',{...bulk,operation_id:randomUUID(),items:[{id:p,revision:2},{id:q,revision:0}]}));assert.equal(ok(await cashier.c.from('catalog_products').select('id')).length,0)
    pass('Perubahan massal atomik; konflik membatalkan seluruh pilihan; produk nonaktif tetap menyimpan stok dan tidak dibaca kasir')
    stage='deactivation';ok(await admin.from('business_members').update({active:false,changed_by:a.id}).eq('user_id',staff.id));assert.equal(ok(await staff.c.from('catalog_products').select('id')).length,0)
    assert.ok((await staff.c.rpc('move_catalog_stock',{...movement,expected_version:current.stock_revision,operation_id:randomUUID(),change:'1'})).error)
    pass('Penonaktifan membatasi sesi staf yang sudah terbuka');passed=true
  }
}catch(e){console.log(`FAIL: ${stage}; code=${e.code||e.name}`);process.exitCode=1}
finally{
  try{
    if(businesses.length){const assets=ok(await admin.from('product_image_assets').select('path').in('business_id',businesses));if(assets.length)ok(await admin.storage.from('product-images').remove(assets.map(a=>a.path)));ok(await admin.from('catalog_products').update({image_path:null}).in('business_id',businesses));ok(await admin.from('product_image_assets').delete().in('business_id',businesses));ok(await admin.from('staff_audit_logs').delete().in('business_id',businesses));ok(await admin.from('business_members').delete().in('business_id',businesses));ok(await admin.from('businesses').delete().in('id',businesses))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    if(before)assert.equal(await snapshot(originalIds),before)
    if(users.length)pass('Akun/file uji dibersihkan; seluruh data usaha yang ada sebelum tes tetap identik')
  }catch{console.log('FAIL: cleanup/preservation; test IDs='+JSON.stringify({users,businesses}));process.exitCode=1;passed=false}
  fs.mkdirSync('artifacts/catalog',{recursive:true});fs.writeFileSync('artifacts/catalog/backend-results.json',JSON.stringify({date:new Date().toISOString(),passed,stage,results,blocked:process.exitCode===2},null,2))
}
