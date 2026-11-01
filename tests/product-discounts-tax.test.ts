import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {discountedPrice,productQuote} from '../lib/product-pricing'
import {reportSummary,reportCsv} from '../lib/reports'
import {salesSummary,type Sale} from '../lib/pos'

test('per-unit discounts and tax use integer rupiah half-up rounding',()=>{
  assert.equal(discountedPrice({price:10000,discountKind:'percent',discountValue:10}),9000)
  assert.equal(discountedPrice({price:10001,discountKind:'percent',discountValue:50}),5000)
  assert.deepEqual(productQuote([{product:{price:10000,discountKind:'percent',discountValue:10},quantity:2}],11),{subtotal:20000,discount:2000,net:18000,tax:1980,total:19980})
  assert.deepEqual(productQuote([{product:{price:10001,discountKind:'amount',discountValue:1000},quantity:0.25}],11),{subtotal:2500,discount:250,net:2250,tax:248,total:2498})
  for(const p of [{price:100,discountKind:'amount' as const,discountValue:101},{price:100,discountKind:'percent' as const,discountValue:100.01}])assert.throws(()=>discountedPrice(p))
  assert.equal(productQuote([{product:{price:10,discountKind:'percent',discountValue:100},quantity:1}],11).total,0)
  assert.throws(()=>productQuote([{product:{price:999999999999},quantity:1}],11))
  const sale={id:'test',status:'completed',created_at:'2026-11-01T03:00:00Z',payment:'cash',subtotal:10000,discount:1000,total:9990,tax_rate:11,tax_amount:990,lines:[{id:'p',name:'Susu',sku:'S',unit:'kotak',price:10000,unit_price:9000,quantity:1,total:9000,original_total:10000}]} as Sale
  const report={sales:[sale],refunds:[],generatedAt:sale.created_at}
  assert.equal(reportSummary(report).net,BigInt(9000));assert.equal(reportSummary(report).best[0].gross,BigInt(10000))
  assert.equal(salesSummary([sale],new Date(sale.created_at)).revenue,9000)
  assert.match(reportCsv(report,{from:'2026-11-01',to:'2026-11-01',payment:'all'},'Uji'),/Pajak rupiah/)
})

test('discount and tax migration preserves history and enforces checkout, replay, revisions and role/tenant boundaries',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)
    const migration='202611010001_product_discounts_tax.sql'
    for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
    const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),cashier=randomUUID()
    for(const id of [owner,other,admin,cashier])await db.query('insert into auth.users(id) values($1)',[id])
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    await as(owner);const bid=(await db.query<any>("select public.create_business_profile('Discount A','Owner','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id
    await db.query('select public.complete_business_onboarding($1)',[bid])
    await as(other);const bid2=(await db.query<any>("select public.create_business_profile('Discount B','Other','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id;await db.query('select public.complete_business_onboarding($1)',[bid2])
    await db.exec('reset role')
    for(const [id,role]of [[admin,'admin'],[cashier,'cashier']])await db.query('insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,$3,$3)',[bid,id,role])
    await as(owner)
    const pid=randomUUID(),details={name:'Susu UHT',category:'Minuman',unit:'kotak',sku:'',barcode:'',price:'10000',initialStock:'20',minimum:'0',active:true}
    const save=(d:any,revision:number|null,id=pid,key=randomUUID(),business=bid)=>db.query<any>('select public.save_catalog_product($1,$2,$3,$4,$5) product',[business,id,revision,key,d])
    await save(details,null)
    const payload=(revision=0,taxRate='0',taxRevision=0,received='10000')=>({lines:[{id:pid,quantity:'1',price:'10000',revision}],payment:'cash',received,discountKind:'none',discountValue:'0',customer:'Umum',confirmed:true,taxRate,taxRevision})
    const checkout=(d:any,key=randomUUID(),business=bid)=>db.query<any>('select public.checkout_pos($1,$2,$3) sale',[business,key,d])
    const oldKey=randomUUID(),{taxRate:unusedRate,taxRevision:unusedRevision,...oldPayload}=payload(),legacy=(await checkout(oldPayload,oldKey)).rows[0].sale
    await db.exec('reset role');await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));await as(owner)
    assert.equal((await checkout(oldPayload,oldKey)).rows[0].sale.total,legacy.total)
    const discount={...details,initialStock:'0',discountKind:'percent',discountValue:'10'},saveKey=randomUUID()
    const p=(await save(discount,0,pid,saveKey)).rows[0].product;assert.equal(p.discount_kind,'percent');assert.equal(Number(p.discount_value),10)
    assert.equal((await save(discount,0,pid,saveKey)).rows[0].product.revision,p.revision)
    await assert.rejects(save({...discount,discountValue:'101'},1),/discount/i)
    const tax=(rate=11,rev=0,business=bid)=>db.query('select public.save_store_tax($1,$2,$3)',[business,rev,rate])
    await tax();await assert.rejects(tax(),/changed/);await assert.rejects(tax(100.001,1),/Invalid tax/)
    await assert.rejects(checkout(payload(0,'11',1)),/Price changed/)
    await assert.rejects(checkout(payload(1)),/Tax changed/)
    await assert.rejects(checkout({...payload(1,'11',1),discountKind:'amount',discountValue:'1'}),/product discounts/)
    await as(admin);await assert.rejects(tax(0,1),/access denied/)
    await save({...discount,discountKind:'amount',discountValue:'1000'},1)
    await as(cashier);await assert.rejects(tax(0,1),/access denied/);await assert.rejects(save(discount,2),/access denied/)
    const request=randomUUID(),data=payload(2,'11',1),sale=(await checkout(data,request)).rows[0].sale
    assert.equal(Number(sale.subtotal),10000);assert.equal(Number(sale.discount),1000);assert.equal(Number(sale.tax_amount),990);assert.equal(Number(sale.total),9990);assert.equal(Number(sale.change),10)
    assert.equal(Number(sale.lines[0].price),10000);assert.equal(Number(sale.lines[0].unit_price),9000)
    assert.equal((await checkout(data,request)).rows[0].sale.id,sale.id)
    await assert.rejects(checkout({...data,received:'9990'},request),/Request ID/)
    await assert.rejects(checkout({...data,received:'9989'}),/received/)
    await assert.rejects(db.query('update public.businesses set tax_rate=0 where id=$1',[bid]),/permission denied/)
    await assert.rejects(db.query('update public.catalog_products set discount_value=0 where id=$1',[pid]),/permission denied/)
    await as(other);await assert.rejects(tax(0,1),/access denied/);await assert.rejects(save(discount,2,pid,randomUUID(),bid2),/access denied/);await assert.rejects(checkout(data),/access denied/)
    assert.equal((await db.query('select * from public.pos_transactions')).rows.length,0)
    await as(owner);await tax(0,1);await save({...discount,discountKind:'none',discountValue:'0'},2)
    const saved=(await db.query<any>('select * from public.pos_transactions where id=$1',[sale.id])).rows[0];assert.equal(Number(saved.total),9990)
    const cancelled=(await db.query<any>("select public.cancel_pos($1,$2,'Uji pembatalan',true,true) sale",[bid,sale.id])).rows[0].sale;assert.equal(Number(cancelled.refund_amount),9990)
    assert.equal(Number((await db.query<any>('select stock from public.catalog_products where id=$1',[pid])).rows[0].stock),19)
    const zero=(await checkout(payload(3,'0',2))).rows[0].sale;assert.equal(Number(zero.total),10000)
    let revision=3,taxRevision=2
    for(const [kind,value,price,rate] of [['percent',10,10000,11],['percent',50,10001,9.5],['percent',100,10001,11],['amount',333,10001,0]] as const){
      const savedProduct=(await save({...details,price:String(price),initialStock:'0',discountKind:kind,discountValue:String(value)},revision++)).rows[0].product
      await tax(rate,taxRevision++)
      const expected=productQuote([{product:{price,discountKind:kind,discountValue:value},quantity:0.25}],rate)
      const result=(await checkout({...payload(savedProduct.revision,String(rate),taxRevision,String(expected.total)),payment:'qris',lines:[{id:pid,quantity:'0.25',price:String(price),revision:savedProduct.revision}]})).rows[0].sale
      assert.equal(Number(result.subtotal),expected.subtotal);assert.equal(Number(result.discount),expected.discount);assert.equal(Number(result.tax_amount),expected.tax);assert.equal(Number(result.total),expected.total)
    }
  }finally{await db.close()}
})
