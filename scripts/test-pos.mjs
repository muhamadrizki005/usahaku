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
async function snapshot(ids){const out={};for(const t of ['businesses','business_members','staff_audit_logs','catalog_products','stock_movements','catalog_audit','catalog_requests','product_image_assets','pos_transactions','pos_requests'])out[t]=ok(await admin.from(t).select('*').in(t==='businesses'?'id':'business_id',ids).order(['catalog_requests','pos_requests'].includes(t)?'request_id':'id'));return JSON.stringify(out)}
async function user(label){const email=`usahaku-pos-${label}-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const u=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(u.id);const c=client();ok(await c.auth.signInWithPassword({email,password}));return{c,id:u.id}}
const details={name:'Beras Uji',category:'Sembako',unit:'kg',sku:'BRS-01',barcode:'00001234',price:'12000',minimum:'0.250',initialStock:'1.250',active:true}
try{
  ok(await admin.from('pos_transactions').select('id').limit(1))
  originalIds=ok(await admin.from('businesses').select('id')).map(b=>b.id);before=await snapshot(originalIds)
  const a=await user('a'),b=await user('b')
  for(const u of [a,b]){u.business=ok(await u.c.rpc('create_business_profile',{store_name:'POS Test '+u.id.slice(0,5),owner_name:'POS Owner',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));businesses.push(u.business)}
  const c=await user('cashier'),d=await user('cashier2'),manager=await user('admin')
  for(const [u,role] of [[c,'cashier'],[d,'cashier'],[manager,'admin']])ok(await admin.from('business_members').insert({business_id:a.business,user_id:u.id,name:'POS '+role,username:'pos'+u.id.slice(0,8),role,must_change_password:false}))
  const p=randomUUID(),q=randomUUID()
  for(const [id,sku,stock] of [[p,'P','4'],[q,'Q','1']])ok(await a.c.rpc('save_catalog_product',{target_id:a.business,item_id:id,expected_version:null,operation_id:randomUUID(),details:{...details,sku,barcode:sku,price:'10001',initialStock:stock}}))
  const detail=(payment='cash',qty='0.250',id=p)=>({lines:[{id,quantity:qty,price:'10001',revision:0}],payment,received:payment==='cash'?'3000':'2500',discountKind:'none',discountValue:'0',customer:'Pelanggan umum',confirmed:true})
  const checkout=(u=c,data=detail(),key=randomUUID(),business=a.business)=>u.c.rpc('checkout_pos',{target_id:business,operation_id:key,details:data})
  const cancel=(u,id,extra={})=>u.c.rpc('cancel_pos',{target_id:a.business,sale_id:id,explanation:'Salah pindai uji',goods_returned:true,refund_confirmed:true,...extra})
  stage='idempotency';const key=randomUUID();const replay=await Promise.all([checkout(c,detail(),key),checkout(c,detail(),key)]);const sale=ok(replay[0]);assert.equal(ok(replay[1]).id,sale.id);assert.equal(Number(sale.total),2500);assert.equal(Number(sale.change),500)
  assert.equal(ok(await admin.from('pos_transactions').select('id').eq('business_id',a.business)).length,1)
  assert.equal(Number(ok(await admin.from('catalog_products').select('stock').eq('id',p).single()).stock),3.75)
  assert.ok((await checkout(c,{...detail(),customer:'Changed'},key)).error)
  pass('Dua checkout bersamaan dengan request sama mencatat satu transaksi dan satu pengurangan stok; payload berbeda ditolak')
  stage='payments/discounts';for(const method of ['qris','transfer'])assert.equal(ok(await checkout(d,detail(method))).payment,method)
  const discounted=ok(await checkout(manager,{...detail('transfer'),discountKind:'percent',discountValue:'10',received:'2250'}));assert.equal(Number(discounted.discount),250)
  const nominal=ok(await checkout(a,{...detail(),discountKind:'amount',discountValue:'500',received:'2000'}));assert.equal(Number(nominal.total),2000)
  for(const data of [{...detail(),discountKind:'amount',discountValue:'1'},{...detail(),received:'1'},{...detail(),confirmed:false},{...detail(),payment:'wallet'},{...detail(),lines:[{...detail().lines[0],price:'1'}]},{...detail(),lines:[{...detail().lines[0],quantity:'0.0001'}]}])assert.ok((await checkout(c,data)).error)
  pass('Tunai/QRIS/transfer manual, persen dan nominal owner/admin berhasil; kasir memalsukan diskon/harga, uang kurang, precision berlebih, tanpa konfirmasi ditolak')
  stage='isolation';assert.equal(ok(await c.c.from('pos_transactions').select('id')).length,1);assert.equal(ok(await d.c.from('pos_transactions').select('id')).length,2)
  assert.equal(ok(await b.c.from('pos_transactions').select('id')).length,0);assert.equal(ok(await manager.c.from('pos_transactions').select('id')).length,5)
  assert.ok((await checkout(b,detail())).error);assert.ok((await checkout(c,detail(),randomUUID(),b.business)).error);assert.ok((await client().from('pos_transactions').select('*')).error)
  assert.ok((await c.c.from('pos_transactions').update({total:0}).eq('id',sale.id)).error);assert.ok((await c.c.from('pos_transactions').delete().eq('id',sale.id)).error)
  assert.ok((await c.c.from('pos_requests').select('*')).error)
  pass('Owner/admin membaca seluruh transaksi; dua kasir hanya membaca transaksi sendiri; usaha lain, anonim, direct mutation dan request ledger ditolak')
  stage='last stock concurrency';const concurrent=await Promise.all([checkout(c,{...detail('cash','0.750',q),received:'10000'}),checkout(d,{...detail('cash','0.750',q),received:'10000'})]);assert.equal(concurrent.filter(r=>!r.error).length,1);assert.equal(Number(ok(await admin.from('catalog_products').select('stock').eq('id',q).single()).stock),0.25)
  const beforeCount=ok(await admin.from('pos_transactions').select('id').eq('business_id',a.business)).length;const stockBefore=ok(await admin.from('catalog_products').select('stock').eq('id',p).single()).stock
  assert.ok((await checkout(c,{...detail(),received:'99999',lines:[...detail().lines,{id:q,quantity:'2',price:'10001',revision:0}]})).error)
  assert.equal(ok(await admin.from('pos_transactions').select('id').eq('business_id',a.business)).length,beforeCount);assert.equal(ok(await admin.from('catalog_products').select('stock').eq('id',p).single()).stock,stockBefore)
  pass('Dua kasir berebut stok terakhir hanya satu berhasil; kegagalan satu baris membatalkan seluruh transaksi/ledger/stok')
  stage='cancellation';assert.ok((await cancel(c,sale.id)).error);assert.ok((await cancel(a,sale.id,{goods_returned:false})).error);assert.ok((await cancel(a,sale.id,{refund_confirmed:false})).error)
  const reversed=await Promise.all([cancel(manager,sale.id),cancel(a,sale.id)]);assert.equal(ok(reversed[0]).status,'cancelled');assert.equal(ok(reversed[1]).status,'cancelled')
  assert.equal(Number(ok(await admin.from('catalog_products').select('stock').eq('id',p).single()).stock),Number(stockBefore)+0.25)
  const ledger=ok(await admin.from('stock_movements').select('*').eq('sale_id',sale.id));assert.equal(ledger.length,2);assert.equal(ledger[1].actor_name,'POS admin');assert.equal(Number(ok(reversed[0]).refund_amount),2500)
  const ownCancelled=ok(await c.c.from('pos_transactions').select('*').eq('id',sale.id).single());assert.equal(ownCancelled.status,'cancelled')
  pass('Pembatalan owner/admin beralasan dan berkonfirmasi manual; pengulangan/concurrency mengembalikan stok sekali; audit dan struk tetap ada')
  stage='deactivation';ok(await admin.from('business_members').update({active:false}).eq('user_id',c.id));assert.equal(ok(await c.c.from('pos_transactions').select('id')).length,0);assert.ok((await checkout()).error)
  pass('Sesi kasir yang dinonaktifkan langsung kehilangan akses baca dan checkout');passed=true

}catch(e){console.log(`FAIL: ${stage}; code=${e.code||e.name}`);process.exitCode=1}
finally{
  try{
    if(businesses.length){const assets=ok(await admin.from('product_image_assets').select('path').in('business_id',businesses));if(assets.length)ok(await admin.storage.from('product-images').remove(assets.map(a=>a.path)));ok(await admin.from('catalog_products').update({image_path:null}).in('business_id',businesses));ok(await admin.from('product_image_assets').delete().in('business_id',businesses));ok(await admin.from('staff_audit_logs').delete().in('business_id',businesses));ok(await admin.from('business_members').delete().in('business_id',businesses));ok(await admin.from('businesses').delete().in('id',businesses))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    if(before)assert.equal(await snapshot(originalIds),before)
    if(users.length)pass('Akun/file uji dibersihkan; seluruh data usaha yang ada sebelum tes tetap identik')
  }catch{console.log('FAIL: cleanup/preservation; test IDs='+JSON.stringify({users,businesses}));process.exitCode=1;passed=false}
  fs.mkdirSync('artifacts/pos',{recursive:true});fs.writeFileSync('artifacts/pos/backend-results.json',JSON.stringify({date:new Date().toISOString(),passed,stage,results,blocked:process.exitCode===2},null,2))
}
