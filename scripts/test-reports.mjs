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

async function user(label){const email=`usahaku-reports-${label}-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const u=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(u.id);const c=client();ok(await c.auth.signInWithPassword({email,password}));return{c,id:u.id}}
const details={name:'Beras Uji',category:'Sembako',unit:'kg',sku:'BRS-01',barcode:'00001234',price:'12000',minimum:'0.250',initialStock:'1.250',active:true}
try{
  const from='2026-10-21T17:00:00Z',to='2026-10-22T17:00:00Z'
  const probe=await admin.rpc('read_sales_report',{target_id:randomUUID(),from_ts:from,to_ts:to,payment_method:'all'});if(probe.error?.code!=='42501')ok(probe)
  originalIds=ok(await admin.from('businesses').select('id')).map(b=>b.id);before=await snapshot(originalIds)
  const a=await user('a'),b=await user('b')
  for(const u of [a,b]){u.business=ok(await u.c.rpc('create_business_profile',{store_name:'Report Test '+u.id.slice(0,5),owner_name:'Report Owner',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));businesses.push(u.business);u.product=randomUUID();ok(await u.c.rpc('save_catalog_product',{target_id:u.business,item_id:u.product,expected_version:null,operation_id:randomUUID(),details:{...details,price:'10000',initialStock:'100'}}))}
  const manager=await user('admin'),cashier=await user('cashier')
  for(const [u,role] of [[manager,'admin'],[cashier,'cashier']])ok(await admin.from('business_members').insert({business_id:a.business,user_id:u.id,name:'Report '+role,username:'rpt'+u.id.slice(0,8),role,must_change_password:false}))
  async function sale(u,method,qty,discount,date,cancelled=null){const subtotal=Math.round(Number(qty)*10000),total=subtotal-discount;const result=ok(await u.c.rpc('checkout_pos',{target_id:u.business,operation_id:randomUUID(),details:{lines:[{id:u.product,quantity:qty,price:'10000',revision:0}],payment:method,received:String(total),discountKind:discount?'amount':'none',discountValue:String(discount),customer:'Umum',confirmed:true}}));if(cancelled)ok(await u.c.rpc('cancel_pos',{target_id:u.business,sale_id:result.id,explanation:'Refund periode uji',goods_returned:true,refund_confirmed:true}));ok(await admin.from('pos_transactions').update({created_at:date,...(cancelled?{cancelled_at:cancelled}:{})}).eq('id',result.id).eq('business_id',u.business));return result}
  await sale(a,'cash','0.250',500,from);await sale(a,'qris','0.125',0,'2026-10-22T16:59:59.999Z');await sale(a,'transfer','0.500',0,'2026-10-20T01:00:00Z','2026-10-22T01:00:00Z');await sale(a,'cash','0.250',0,'2026-10-22T02:00:00Z','2026-10-23T01:00:00Z');await sale(a,'cash','0.250',0,to);await sale(a,'cash','0.250',0,'2026-10-21T16:59:59.999Z');await sale(b,'cash','0.250',0,'2026-10-22T01:00:00Z')
  const read=(u=a,method='all',business=a.business,start=from,end=to)=>u.c.rpc('read_sales_report',{target_id:business,from_ts:start,to_ts:end,payment_method:method})
  stage='WIB and totals';const report=ok(await read());assert.equal(report.sales.length,3);assert.equal(report.refunds.length,1);const completed=report.sales.filter(s=>s.status==='completed');assert.equal(completed.length,2);assert.equal(completed.reduce((n,s)=>n+Number(s.total),0),3250);assert.equal(completed.reduce((n,s)=>n+Number(s.discount),0),500);assert.equal(Number(report.refunds[0].refund_amount),5000)
  assert.equal(ok(await read(a,'qris')).sales.length,1);assert.equal(ok(await read(a,'transfer')).sales.length,0);assert.equal(ok(await read(a,'transfer')).refunds.length,1)
  pass('Batas tanggal WIB inklusif tepat; omzet 3250, diskon 500; refund 5000 dari transaksi periode lama tidak dikurangi ulang')
  stage='roles/isolation';assert.equal(ok(await read(manager)).sales.length,3);assert.ok((await read(cashier)).error);assert.ok((await read(b)).error);assert.equal(ok(await read(b,'all',b.business)).sales.length,1);assert.ok((await client().rpc('read_sales_report',{target_id:a.business,from_ts:from,to_ts:to,payment_method:'all'})).error)
  for(const args of [{payment_method:'wallet'},{from_ts:'2026-10-21T00:00:00Z'},{from_ts:to,to_ts:from},{from_ts:'2024-01-01T17:00:00Z'}])assert.ok((await a.c.rpc('read_sales_report',{target_id:a.business,from_ts:from,to_ts:to,payment_method:'all',...args})).error)
  pass('Admin diizinkan; kasir, anonim dan target usaha lain ditolak; metode/rentang/UTC-midnight palsu ditolak')
  stage='over 1000';const bulk=Array.from({length:1001},()=>({id:randomUUID(),business_id:a.business,actor_name:'Bulk fixture',customer:'Umum',lines:[],subtotal:1,discount_kind:'none',discount_value:0,discount:0,total:1,payment:'cash',received:1,change:0,created_at:'2026-10-24T01:00:00Z'}));ok(await admin.from('pos_transactions').insert(bulk));assert.equal(ok(await read(a,'all',a.business,'2026-10-23T17:00:00Z','2026-10-24T17:00:00Z')).sales.length,1001)
  pass('Laporan mengembalikan 1001 transaksi lengkap, melewati batas default REST tanpa terpotong')
  stage='deactivation';ok(await admin.from('business_members').update({active:false}).eq('user_id',manager.id));assert.ok((await read(manager)).error);ok(await admin.from('business_members').update({must_change_password:true}).eq('user_id',a.id));assert.ok((await read()).error)
  pass('Sesi admin nonaktif dan owner wajib ganti sandi tidak dapat membaca laporan');passed=true

}catch(e){if(stage==='schema'&&e.code==='PGRST202'){console.log('BLOCKED: migrasi 202610230001 belum tersedia melalui API; tidak membuat akun uji.');process.exitCode=2}else{console.log(`FAIL: ${stage}; code=${e.code||e.name}`);process.exitCode=1}}
finally{
  try{
    if(businesses.length){const assets=ok(await admin.from('product_image_assets').select('path').in('business_id',businesses));if(assets.length)ok(await admin.storage.from('product-images').remove(assets.map(a=>a.path)));ok(await admin.from('catalog_products').update({image_path:null}).in('business_id',businesses));ok(await admin.from('product_image_assets').delete().in('business_id',businesses));ok(await admin.from('staff_audit_logs').delete().in('business_id',businesses));ok(await admin.from('business_members').delete().in('business_id',businesses));ok(await admin.from('businesses').delete().in('id',businesses))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    if(before)assert.equal(await snapshot(originalIds),before)
    if(users.length)pass('Akun/file uji dibersihkan; seluruh data usaha yang ada sebelum tes tetap identik')
  }catch{console.log('FAIL: cleanup/preservation; test IDs='+JSON.stringify({users,businesses}));process.exitCode=1;passed=false}
  fs.mkdirSync('artifacts/reports',{recursive:true});fs.writeFileSync('artifacts/reports/backend-results.json',JSON.stringify({date:new Date().toISOString(),passed,stage,results,blocked:process.exitCode===2},null,2))
}
