import { createClient } from '@supabase/supabase-js'
import { randomUUID,randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})}}
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options)
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options)
const users=[],businesses=[],results=[];let stage='schema',before,originalIds,passed=false
const ok=({data,error})=>{if(error){const e=Error('Backend request failed');e.code=error.code||error.statusCode;throw e}return data}
const pass=s=>{results.push(s);console.log('PASS: '+s)}
async function snapshot(ids){const out={};for(const t of ['businesses','business_members','staff_audit_logs','catalog_products','stock_movements','catalog_audit','catalog_requests','product_image_assets','pos_transactions','pos_requests','customers','customer_audit','customer_requests']){const rows=[];for(let start=0;;start+=500){const data=ok(await admin.from(t).select('*').in(t==='businesses'?'id':'business_id',ids).order(['catalog_requests','pos_requests','customer_requests'].includes(t)?'request_id':'id').range(start,start+499));rows.push(...data);if(data.length<500)break}out[t]=rows}return JSON.stringify(out)}

async function user(label){const email=`usahaku-customers-${label}-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const u=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(u.id);const c=client();ok(await c.auth.signInWithPassword({email,password}));return{c,id:u.id}}
const details={name:'Beras Uji',category:'Sembako',unit:'kg',sku:'BRS-01',barcode:'00001234',price:'12000',minimum:'0.250',initialStock:'1.250',active:true}
try{
  ok(await admin.from('customers').select('id').limit(1))
  originalIds=ok(await admin.from('businesses').select('id')).map(b=>b.id);before=await snapshot(originalIds)
  const a=await user('a'),b=await user('b')
  for(const u of [a,b]){u.business=ok(await u.c.rpc('create_business_profile',{store_name:'Customer Test '+u.id.slice(0,5),owner_name:'Customer Owner',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));businesses.push(u.business)}
  const c=await user('cashier'),d=await user('cashier2'),manager=await user('admin')
  for(const [u,role] of [[c,'cashier'],[d,'cashier'],[manager,'admin']])ok(await admin.from('business_members').insert({business_id:a.business,user_id:u.id,name:'Test '+role,username:'cust'+u.id.slice(0,8),role,must_change_password:false}))
  const id=randomUUID(),foreign=randomUUID(),key=randomUUID(),profile={name:'Budi Uji',phone:'0812-3456-7890',notes:'Catatan privat owner',active:true}
  const save=(u=a,extra={})=>u.c.rpc('save_customer',{target_id:u.business||a.business,item_id:id,operation_id:randomUUID(),expected_version:null,details:profile,...extra})
  const search=(u=c,term='budi',business=a.business)=>u.c.rpc('search_pos_customers',{target_id:business,term})
  stage='create replay';const pair=await Promise.all([save(a,{operation_id:key}),save(a,{operation_id:key})]);const initial=ok(pair[0]);assert.equal(ok(pair[1]).id,id);assert.equal(initial.phone,'+6281234567890');assert.equal(ok(await admin.from('customer_audit').select('id').eq('customer_id',id)).length,1)
  assert.ok((await save(a,{operation_id:key,details:{...profile,name:'Changed'}})).error)
  assert.ok((await save(a,{item_id:randomUUID(),details:{...profile,phone:'bad'}})).error)
  ok(await save(b,{item_id:foreign}));assert.equal(ok(await b.c.from('customers').select('id')).length,1)
  pass('Pembuatan bersamaan/retry menghasilkan satu pelanggan dan audit; telepon dinormalisasi; nomor sama di usaha lain terpisah')
  stage='CAS';const edits=await Promise.all([save(a,{expected_version:0,details:{...profile,name:'Budi Owner'}}),save(manager,{expected_version:0,details:{...profile,name:'Budi Admin'}})]);assert.equal(edits.filter(r=>!r.error).length,1)
  let current=ok(await a.c.from('customers').select('*').eq('id',id).single());assert.equal(current.revision,1)
  ok(await save(manager,{expected_version:1,details:{...profile,name:'Budi Sebelum'}}));current=ok(await a.c.from('customers').select('*').eq('id',id).single())
  assert.ok((await save(c)).error);assert.ok((await c.c.from('customers').update({name:'Forged'}).eq('id',id)).error);assert.ok((await a.c.from('customers').delete().eq('id',id)).error)
  assert.equal(ok(await c.c.from('customers').select('*')).length,0);assert.equal(ok(await c.c.from('customer_audit').select('*')).length,0);assert.ok((await c.c.from('customer_requests').select('*')).error)
  const projected=ok(await search())[0];assert.deepEqual(Object.keys(projected).sort(),['id','name','phone']);assert.equal(projected.name,'Budi Sebelum');assert.equal(ok(await search(c,'0812')).length,1)
  assert.ok((await search(b)).error);assert.equal(ok(await search(b,'budi',b.business)).length,1);assert.ok((await save(b,{item_id:id})).error);assert.ok((await client().rpc('search_pos_customers',{target_id:a.business,term:'budi'})).error)
  pass('Owner/admin mengedit dengan CAS; kasir hanya memperoleh id/nama/telepon, tanpa catatan/audit; direct mutation, anonim dan lintas usaha ditolak')
  stage='limit';const seeded=Array.from({length:26},(_,i)=>({id:randomUUID(),business_id:a.business,name:'Searchlimit '+i,phone:'',notes:'Privat '+i}));ok(await admin.from('customers').insert(seeded));assert.equal(ok(await search(c,'searchlimit')).length,20);assert.equal(ok(await search(c,'b')).length,0);assert.equal(ok(await search(c,'%_')).length,0)
  pass('Pencarian minimal 2 karakter, maksimal 20 hasil; karakter wildcard diperlakukan sebagai teks')
  const product=randomUUID();ok(await a.c.rpc('save_catalog_product',{target_id:a.business,item_id:product,expected_version:null,operation_id:randomUUID(),details:{...details,sku:'CUSTOMER',barcode:'CUSTOMER',price:'1000',initialStock:'5'}}))
  const detail={lines:[{id:product,quantity:'1',price:'1000',revision:0}],payment:'cash',received:'1000',discountKind:'none',discountValue:'0',customer:'Forged display name',customerId:id,confirmed:true},request=randomUUID()
  const checkout=(u=c,data=detail,k=randomUUID())=>u.c.rpc('checkout_pos',{target_id:a.business,operation_id:k,details:data})
  stage='checkout';assert.ok((await checkout(c,{...detail,customerId:foreign})).error);assert.equal(Number(ok(await admin.from('catalog_products').select('stock').eq('id',product).single()).stock),5)
  const sale=ok(await checkout(c,detail,request));assert.equal(sale.customer_id,id);assert.equal(sale.customer,'Budi Sebelum')
  ok(await save(manager,{expected_version:2,details:{...profile,name:'Budi Sesudah',active:false}}))
  assert.equal(ok(await search()).length,0);assert.ok((await checkout()).error);assert.equal(ok(await checkout(c,detail,request)).id,sale.id)
  const history=ok(await a.c.from('pos_transactions').select('*').eq('customer_id',id));assert.equal(history.length,1);assert.equal(history[0].customer,'Budi Sebelum');assert.equal(ok(await d.c.from('pos_transactions').select('id').eq('customer_id',id)).length,0)
  const general=ok(await checkout(c,{...detail,customerId:null}));assert.equal(general.customer,'Pelanggan umum');assert.equal(general.customer_id,null)
  const legacy={...detail};delete legacy.customerId;const old=ok(await checkout(c,legacy));assert.equal(old.customer,'Pelanggan umum')
  pass('Pelanggan aktif ditautkan oleh ID; nama struk bersumber database dan tetap saat profil berubah; nonaktif/lintas usaha ditolak; retry lama dan pelanggan umum kompatibel')
  stage='history refund';ok(await manager.c.rpc('cancel_pos',{target_id:a.business,sale_id:sale.id,explanation:'Uji pembatalan pelanggan',goods_returned:true,refund_confirmed:true}));assert.equal(ok(await a.c.from('pos_transactions').select('*').eq('customer_id',id).single()).status,'cancelled')
  ok(await save(manager,{expected_version:3,details:{...profile,name:'Budi Aktif',active:true}}));assert.equal(ok(await search()).length,1)
  ok(await admin.from('business_members').update({must_change_password:true}).eq('user_id',c.id));assert.ok((await search()).error);assert.ok((await checkout()).error)
  ok(await admin.from('business_members').update({active:false}).eq('user_id',manager.id));assert.equal(ok(await manager.c.from('customers').select('*')).length,0);assert.ok((await save(manager,{expected_version:4})).error)
  pass('Riwayat pembatalan tetap terkait pelanggan; reaktivasi berhasil; wajib ganti sandi dan nonaktif langsung membatasi sesi lama');passed=true

}catch(e){if(stage==='schema'&&e.code==='PGRST205'){console.log('BLOCKED: migrasi 202610220005 belum tersedia melalui API; tidak membuat akun uji.');process.exitCode=2}else{console.log(`FAIL: ${stage}; code=${e.code||e.name}`);process.exitCode=1}}
finally{
  try{
    if(businesses.length){const assets=ok(await admin.from('product_image_assets').select('path').in('business_id',businesses));if(assets.length)ok(await admin.storage.from('product-images').remove(assets.map(a=>a.path)));ok(await admin.from('catalog_products').update({image_path:null}).in('business_id',businesses));ok(await admin.from('product_image_assets').delete().in('business_id',businesses));ok(await admin.from('staff_audit_logs').delete().in('business_id',businesses));ok(await admin.from('business_members').delete().in('business_id',businesses));ok(await admin.from('businesses').delete().in('id',businesses))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    if(before)assert.equal(await snapshot(originalIds),before)
    if(users.length)pass('Akun/file uji dibersihkan; seluruh data usaha yang ada sebelum tes tetap identik')
  }catch{console.log('FAIL: cleanup/preservation; test IDs='+JSON.stringify({users,businesses}));process.exitCode=1;passed=false}
  fs.mkdirSync('artifacts/customers',{recursive:true});fs.writeFileSync('artifacts/customers/backend-results.json',JSON.stringify({date:new Date().toISOString(),passed,stage,results,blocked:process.exitCode===2},null,2))
}
