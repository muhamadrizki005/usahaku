import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {paymentSettingsSchema,paymentSettingsView} from '../lib/business-payments'

test('payment configuration validates usable methods and preserves legacy manual defaults',()=>{
  assert.equal(paymentSettingsView(null).configured,false);assert.equal(paymentSettingsView(null).qris,true)
  assert.equal(paymentSettingsSchema.safeParse({cash:false,qris:false,transfer:false,banks:[]}).success,true)
  assert.equal(paymentSettingsSchema.safeParse({cash:true,qris:false,transfer:true,banks:[]}).success,false)
  assert.equal(paymentSettingsSchema.safeParse({cash:true,qris:false,transfer:false,banks:[],ewallet:true}).success,false)
  assert.equal(paymentSettingsSchema.safeParse({cash:true,qris:false,transfer:false,banks:[],ewallet:true,ewallets:[{ewallet:'GoPay',holder:'Owner',number:'08123456789'}]}).success,true)
})

test('server payment settings isolate owner writes, assets, revisions, failed saves and checkout/replay',async()=>{
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
    for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
    const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),cashier=randomUUID()
    for(const id of [owner,other,admin,cashier])await db.query('insert into auth.users(id) values($1)',[id])
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    const create=async()=>{const id=(await db.query<any>("select public.create_business_profile('Audit Store','Owner','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id;await db.query('select public.complete_business_onboarding($1)',[id]);return id}
    await as(owner);const bid=await create();await as(other);const bid2=await create();await db.exec('reset role')
    for(const [id,role]of [[admin,'admin'],[cashier,'cashier']])await db.query('insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,$3,$3)',[bid,id,role])
    await as(owner);const product=randomUUID();await db.query('select public.save_catalog_product($1,$2,null,$3,$4)',[bid,product,randomUUID(),{name:'Susu',category:'Minuman',unit:'pcs',sku:'',barcode:'',price:'10000',minimum:'0',initialStock:'10',active:true}])
    const cash={cash:true,qris:false,transfer:false,banks:[]},save=(details:any=cash,revision=0,asset:string|null=null,target=bid)=>db.query<any>('select public.save_business_payments($1,$2,$3,$4) settings',[target,revision,details,asset])
    const payload={lines:[{id:product,price:'10000',quantity:'1',revision:0}],payment:'qris',received:'10000',discountKind:'none',discountValue:'0',confirmed:true}
    const checkout=(details:any=payload,key=randomUUID())=>db.query<any>('select public.checkout_pos($1,$2,$3) sale',[bid,key,details])
    const request=randomUUID(),legacy=(await checkout(payload,request)).rows[0].sale
    await save();assert.equal((await checkout(payload,request)).rows[0].sale.id,legacy.id)
    await assert.rejects(checkout(),/Payment methods changed/)
    await assert.rejects(checkout({...payload,paymentRevision:1}),/disabled/)
    await assert.rejects(save(cash,0),/changed/)
    const qr=randomUUID();const path=(await db.query<any>('select public.reserve_payment_qr($1,$2) path',[bid,qr])).rows[0].path
    await assert.rejects(save({...cash,qris:true},1,qr),/unavailable/)
    assert.equal((await db.query<any>('select revision from public.business_payments where business_id=$1',[bid])).rows[0].revision,1)
    await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name) values('business-payment-qr',$1)",[path]);await as(owner)
    const enabled=(await save({...cash,qris:true},1,qr)).rows[0].settings;assert.equal(enabled.revision,2)
    await assert.rejects(save({...cash,transfer:true},2,qr),/Complete/)
    await assert.rejects(save({...cash,transfer:true,banks:[{bank:'B',holder:'',account:'1'}]},2,null),/bank/)
    await as(admin);await assert.rejects(save(cash,2),/access denied/);await assert.rejects(db.query('select public.reserve_payment_qr($1,$2)',[bid,randomUUID()]),/access denied/)
    await as(cashier);await assert.rejects(save(cash,2),/access denied/);assert.equal((await db.query('select * from public.business_payment_assets')).rows.length,1)
    await checkout({...payload,paymentRevision:2})
    await assert.rejects(db.query('update public.business_payments set cash=false'),/permission denied/)
    await assert.rejects(db.query('select public.claim_payment_qr_cleanup($1)',[qr]),/permission denied/)
    await as(other);assert.equal((await db.query('select * from public.business_payments')).rows.length,0);await assert.rejects(save(cash,2),/access denied/);await assert.rejects(save({...cash,qris:true},0,qr,bid2),/unavailable/)
    await as(owner);await save(cash,2);assert.equal((await db.query('select * from public.business_payment_assets')).rows.length,0)
    await db.exec('reset role');await db.exec('set role service_role');assert.equal((await db.query<any>('select public.claim_payment_qr_cleanup($1) path',[qr])).rows[0].path,path)
    await as(owner);await assert.rejects(save({...cash,qris:true},3,qr),/unavailable/)
    const draft=randomUUID();await db.query('select public.reserve_payment_qr($1,$2)',[bid,draft]);await db.exec('reset role');await db.exec('set role service_role');assert.equal((await db.query<any>('select public.claim_payment_qr_cleanup($1) path',[draft])).rows[0].path,null)
    await as(owner);await save({cash:false,qris:false,transfer:false,banks:[]},3);await assert.rejects(checkout({...payload,payment:'cash',paymentRevision:4}),/disabled/)
    await save({cash:false,qris:false,transfer:false,banks:[],ewallet:true,ewallets:[{ewallet:'GoPay',holder:'Owner',number:'08123456789'}]},4);
    const ewSale=(await checkout({...payload,payment:'ewallet',paymentRevision:5})).rows[0].sale;
    assert.equal(ewSale.payment,'ewallet');
  }finally{await db.close()}
})
