import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('restaurant inline checkout is atomic, supports deferred/follow-up orders and verifies voucher rewards',async()=>{
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
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'))
 const [owner,cashier,other]=Array.from({length:3},()=>randomUUID())
 for(const u of [owner,cashier,other])await db.query('insert into auth.users(id) values($1)',[u])
 const as=async(u:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated')}
 const rpc=async(n:string,args:unknown[])=> (await db.query<any>('select public.'+n+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
 await as(owner);const bid=await rpc('create_business_profile_for_category',['restaurant','Member Cafe','Owner','081234567890','Jalan','Bandung','Jawa Barat','']);await rpc('complete_business_onboarding',[bid])
 await db.exec('reset role');await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Kasir','kasir','cashier',false)",[bid,cashier]);await as(owner)
 const mid=randomUUID(),tid=randomUUID(),cid=randomUUID()
 await rpc('save_restaurant_resource',[bid,'menu',mid,null,randomUUID(),{name:'Kopi',category:'Minuman',price:'50000',active:true,available:true}])
 await rpc('save_restaurant_resource',[bid,'table',tid,null,randomUUID(),{name:'Meja 1',capacity:4,active:true}])
 await rpc('save_customer',[bid,cid,null,randomUUID(),{name:'Member Satu',phone:'081234567890',notes:'',active:true}])
 const settings=await rpc('save_restaurant_loyalty',[bid,0,{active:true,nominal:'10000',redemption:false,pointValue:'0'}]);assert.equal(settings.revision,1)
 const details={kind:'dine_in',tableId:null,guests:2,customer:'Nama tidak dipercaya',customerId:cid,notes:'',stage:'new',lines:[{id:mid,quantity:2}]}

 await rpc('save_business_loyalty_settings',[bid,true,10000,[{id:'voucher',points_required:10,reward_type:'voucher',voucher_amount:10000}]])
 await db.exec('reset role');await db.query('update public.customers set points=100 where id=$1',[cid]);await as(cashier)
 const profile=await rpc('read_restaurant_member',[bid,cid]);assert.equal(profile.name,'Member Satu');assert.equal(profile.notes,undefined)
 const payment={payment:'qris',received:'90000',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,billingRevision:1,redeemPoints:'10',redemptionId:'voucher'}
 const orderId=randomUUID(),request=randomUUID(),bundle=(id:string,rev:number|null,key:string,order:any,pay:any=payment,subtotal=100000,source:string|null=null)=>rpc('checkout_restaurant_cart',[bid,id,rev,key,order,pay,subtotal,source])
 await assert.rejects(bundle(orderId,null,request,details,{...payment,received:'1'}),/Pembayaran|payment|received|sesuai/)
 assert.equal((await db.query('select * from public.restaurant_orders where id=$1',[orderId])).rows.length,0)
 await assert.rejects(bundle(orderId,null,request,details,payment,99999),/Harga menu berubah/)
 const paid=await bundle(orderId,null,request,{...details,tableId:tid});assert.equal(paid.sale.total,90000);assert.equal(paid.sale.point_discount,10000);assert.equal(paid.sale.points_redeemed,10);assert.equal(paid.order.status,'paid')
 assert.equal((await bundle(orderId,null,request,{...details,tableId:tid})).sale.id,paid.sale.id)
 assert.equal((await rpc('read_restaurant_member',[bid,cid])).points,99)
 const nextId=randomUUID(),nextReq=randomUUID(),nextDetails={...details,tableId:tid,lines:[{id:mid,quantity:1}]}
 await assert.rejects(rpc('save_restaurant_order',[bid,nextId,null,nextReq,nextDetails]),/manual|release|Meja/)
 const deferred=await rpc('save_restaurant_followup',[bid,nextId,null,nextReq,nextDetails,orderId]);assert.equal(deferred.status,'open');assert.equal(deferred.subtotal,50000)
 assert.equal((await rpc('save_restaurant_followup',[bid,nextId,null,nextReq,nextDetails,orderId])).id,nextId)
 const addItems={...nextDetails,lines:[{id:mid,quantity:2}]}
 const settled=await bundle(nextId,deferred.revision,randomUUID(),addItems,{...payment,redeemPoints:'0',redemptionId:undefined,received:'100000'});assert.equal(settled.sale.total,100000)
 assert.equal((await db.query<any>('select count(*) n from public.pos_transactions')).rows[0].n,2)
 await as(other);await assert.rejects(rpc('read_restaurant_member',[bid,cid]),/denied/);await assert.rejects(bundle(randomUUID(),null,randomUUID(),details),/denied/)
 await as(owner);await assert.rejects(rpc('save_business_loyalty_settings',[bid,true,10000,[{id:'bad',points_required:1,reward_type:'product',product_id:randomUUID()}]]),/unavailable/)
 await rpc('save_business_loyalty_settings',[bid,true,10000,[{id:'coffee',points_required:10,reward_type:'product',product_id:mid}]])
 const menuGift=await bundle(randomUUID(),null,randomUUID(),details,{...payment,redemptionId:'coffee',received:'50000'});assert.equal(menuGift.sale.point_discount,50000)
 await rpc('cancel_restaurant_sale',[bid,menuGift.sale.id,'Refund hadiah QA',true,true])
 }finally{await db.close()}
})
