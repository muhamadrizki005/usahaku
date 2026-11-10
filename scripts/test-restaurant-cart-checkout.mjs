import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import sharp from 'sharp'

const base = process.env.TEST_BASE_URL || 'http://localhost:3236'
const manifestPath = process.env.TEST_ACTION_MANIFEST || '.cache/restaurant-salon-checkout-qa/.next/server/server-reference-manifest.json'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
const ok = response => { if (response.error) throw Error(response.error.code + ': ' + response.error.message); return response.data }
const users = [], businesses = [], uploads = []
const legacy = ok(await admin.from('businesses').select('id')).map(b => b.id)
async function snapshot() {
  const result = {}
  for (const [table, order] of [['businesses', 'id'], ['pos_transactions', 'id'], ['stock_movements', 'id'], ['customers', 'id'], ['customer_point_history', 'id'], ['business_payments', 'business_id'], ['restaurant_orders','id'], ['restaurant_requests','request_id'], ['restaurant_audit','id']]) {
    const rows = []
    if (legacy.length) for (let offset = 0; ; offset += 500) {
      const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order(order).range(offset, offset + 499))
      rows.push(...batch)
      if (batch.length < 500) break
    }
    result[table] = rows
  }
  return createHash('sha256').update(JSON.stringify(result)).digest('hex')
}
const before = await snapshot()
async function account() {
  const email = `usahaku-noncash-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
  const id = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
  users.push(id)
  const cookies = new Map()
  const client = createServerClient(url, key, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: batch => { for (const cookie of batch) cookies.set(cookie.name, cookie.value) },
  } })
  ok(await client.auth.signInWithPassword({ email, password }))
  return { id, client, cookie: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
}
let passed = false
try {
  const owner=await account(),cashier=await account(),other=await account()
  const bid=ok(await owner.client.rpc('create_business_profile_for_category',{business_category:'restaurant',store_name:'Resto Inline QA',owner_name:'Owner QA',store_phone:'081234567890',store_street:'Jalan QA',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}))
  businesses.push(bid);ok(await owner.client.rpc('complete_business_onboarding',{target_id:bid}))
  ok(await admin.from('business_members').insert({business_id:bid,user_id:cashier.id,name:'Kasir QA',username:'qa'+randomBytes(4).toString('hex'),role:'cashier',must_change_password:false}))
  const openHour=(new Date(Date.now()+7*3600000).getUTCHours()+12)%24
  const hours=Object.fromEntries(['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d=>[d,{open:String(openHour).padStart(2,'0')+':00',close:String((openHour+23)%24).padStart(2,'0')+':59',closed:false}]))
  ok(await owner.client.rpc('save_business_hours',{target_id:bid,expected_revision:0,schedule:hours}))
  const mid=randomUUID(),tid=randomUUID(),cid=randomUUID()
  for(const [resource,id,details] of [['menu',mid,{name:'Kopi QA',category:'Minuman',price:'50000',active:true,available:true}],['table',tid,{name:'Meja QA',capacity:4,active:true}]])ok(await owner.client.rpc('save_restaurant_resource',{target_id:bid,resource,item_id:id,expected_revision:null,operation_id:randomUUID(),details}))
  ok(await owner.client.rpc('save_customer',{target_id:bid,item_id:cid,expected_version:null,operation_id:randomUUID(),details:{name:'Member QA',phone:'081234567890',notes:'Privat QA',active:true}}))
  ok(await admin.from('customers').update({points:100}).eq('business_id',bid).eq('id',cid))
  ok(await owner.client.rpc('save_business_loyalty_settings',{target_id:bid,new_active:true,new_nominal:10000,new_redemptions:[{id:'voucherQA',points_required:10,reward_type:'voucher',voucher_amount:10000}]}))
  const billing=ok(await owner.client.rpc('save_restaurant_billing',{target_id:bid,expected_revision:0,details:{taxRate:'11',serviceRate:'0',taxBase:'net',serviceScope:'dine_in'}}))
  const page=await fetch(base+'/dashboard/pos',{headers:{Cookie:cashier.cookie()}});assert.equal(page.status,200);await page.text()
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
  async function action(account,name,args){
    const id=Object.entries(manifest.node).find(([,v])=>v.exportedName===name)?.[0];assert.ok(id,name+' not found')
    const r=await fetch(base+'/dashboard/pos',{method:'POST',headers:{Cookie:account.cookie(),Origin:base,'Next-Action':id,'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(args)})
    const line=(await r.text()).split('\n').filter(l=>l.startsWith('1:{')).at(-1);assert.ok(line,'Unexpected action response: '+r.status);return JSON.parse(line.slice(2))
  }
  const member=await action(cashier,'loadRestaurantMember',[cid]);assert.equal(member.member.name,'Member QA');assert.equal(member.member.notes,undefined)
  const input={id:randomUUID(),revision:null,request:randomUUID()}
  const details={kind:'dine_in',tableId:tid,guests:2,customer:'Member QA',customerId:cid,notes:'',stage:'new',lines:[{id:mid,quantity:2}]}
  const pay={payment:'cash',received:'99900',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,billingRevision:billing.revision,redeemPoints:'10',redemptionId:'voucherQA'}
  const failed=await action(cashier,'checkoutRestaurantCart',[input,details,{...pay,received:'1'},100000]);assert.ok(failed.error)
  assert.equal(ok(await admin.from('restaurant_orders').select('id').eq('id',input.id)).length,0)
  const paid=await action(cashier,'checkoutRestaurantCart',[input,details,pay,100000]);assert.ok(paid.value,paid.error);assert.equal(Number(paid.value.sale.total),99900);assert.equal(Number(paid.value.sale.tax_amount),9900)
  const retry=await action(cashier,'checkoutRestaurantCart',[input,details,pay,100000]);assert.equal(retry.value.sale.id,paid.value.sale.id)
  assert.equal(paid.value.sale.customer_id,cid)
  const next={id:randomUUID(),revision:null,request:randomUUID(),sourceId:input.id}
  const deferred=await action(cashier,'saveRestaurantOrder',[next,{...details,lines:[{id:mid,quantity:1}]}]);assert.ok(deferred.value,deferred.error);assert.equal(deferred.value.status,'open')
  const settled=await action(cashier,'checkoutRestaurantCart',[{id:next.id,revision:deferred.value.revision,request:randomUUID()},details,{...pay,redeemPoints:'0',redemptionId:undefined,received:'111000'},100000]);assert.ok(settled.value,settled.error)
  assert.equal(ok(await admin.from('pos_transactions').select('id').eq('business_id',bid)).length,2)
  assert.equal(Number(ok(await admin.from('customers').select('points').eq('id',cid).single()).points),110)
  assert.ok((await other.client.rpc('read_restaurant_member',{target_id:bid,customer_id:cid})).error)
  console.log('PASS: inline voucher checkout, retry, rollback, deferred/follow-up order, member and tenant isolation via production server actions')
  passed=true
}finally{
  for(const bid of businesses){ok(await admin.from('staff_audit_logs').delete().eq('business_id',bid));ok(await admin.from('business_members').delete().eq('business_id',bid));ok(await admin.from('businesses').delete().eq('id',bid))}
  for(const id of users)ok(await admin.auth.admin.deleteUser(id))
  const legacyUnchanged=before===await snapshot();assert.ok(legacyUnchanged,'Existing data changed during QA');console.log(JSON.stringify({passed,cleanup:true,legacyUnchanged}))
}
