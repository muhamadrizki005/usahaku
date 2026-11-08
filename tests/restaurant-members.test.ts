import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('restaurant member checkout: optional table, points, retry/refund, deletion, roles and tenant isolation',async()=>{
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
 const id=randomUUID(),req=randomUUID();const order=await rpc('save_restaurant_order',[bid,id,null,req,details]);assert.equal(order.customer,'Member Satu');assert.equal(order.customer_id,cid);assert.equal(order.table_id,null)
 const retry=await rpc('save_restaurant_order',[bid,id,null,req,details]);assert.equal(retry.id,id)
 const payment={payment:'cash',received:'100000',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,billingRevision:1,redeemPoints:'0'}
 const payReq=randomUUID();const paid=await rpc('pay_restaurant_order',[bid,id,order.revision,payReq,payment]);assert.equal(paid.sale.total,100000);assert.equal(paid.sale.customer_id,cid);assert.equal(paid.sale.points_earned,10)
 await rpc('pay_restaurant_order',[bid,id,order.revision,payReq,payment]);assert.equal((await db.query<any>('select points from public.customers where id=$1',[cid])).rows[0].points,10)
 await rpc('save_restaurant_loyalty',[bid,1,{active:true,nominal:'10000',redemption:true,pointValue:'1000'}])
 const second=await rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),details])
 const paid2=await rpc('pay_restaurant_order',[bid,second.id,second.revision,randomUUID(),{...payment,billingRevision:2,redeemPoints:'5'}]);assert.equal(paid2.sale.total,95000);assert.equal(paid2.sale.points_redeemed,5);assert.equal(paid2.sale.points_earned,9);assert.equal(paid2.sale.point_discount,5000)
 assert.equal((await db.query<any>('select points from public.customers where id=$1',[cid])).rows[0].points,14)
 const cancelled=await rpc('cancel_restaurant_sale',[bid,paid2.sale.id,'Refund penuh manual',true,true]);assert.equal(cancelled.status,'cancelled');assert.equal((await db.query<any>('select points from public.customers where id=$1',[cid])).rows[0].points,10)
 await rpc('cancel_restaurant_sale',[bid,paid2.sale.id,'Refund penuh manual',true,true]);assert.equal((await db.query<any>('select points from public.customers where id=$1',[cid])).rows[0].points,10)
 await as(cashier);await assert.rejects(rpc('save_restaurant_loyalty',[bid,2,{active:false,nominal:'10000',redemption:false,pointValue:'0'}]),/Owner access/)
 await assert.rejects(rpc('delete_restaurant_table',[bid,tid,0,randomUUID()]),/access denied/)
 await assert.rejects(rpc('pay_restaurant_order',[bid,second.id,second.revision,randomUUID(),{...payment,billingRevision:2}]),/access denied/)
 await as(other);await assert.rejects(rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),details]),/access denied/)
 await as(owner);const wrong={...details,customerId:randomUUID()};await assert.rejects(rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),wrong]),/Member tidak aktif/)
 const bad=await rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),details]);await assert.rejects(rpc('pay_restaurant_order',[bid,bad.id,bad.revision,randomUUID(),{...payment,billingRevision:2,redeemPoints:'11'}]),/Saldo poin tidak cukup/)
 assert.equal((await db.query<any>('select status from public.restaurant_orders where id=$1',[bad.id])).rows[0].status,'open')
 const seated=await rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),{...details,tableId:tid}]);await assert.rejects(rpc('delete_restaurant_table',[bid,tid,0,randomUUID()]),/pesanan atau reservasi aktif/)
 await rpc('cancel_restaurant_order',[bid,seated.id,seated.revision,'Batal uji meja'])
 const deleted=await rpc('delete_restaurant_table',[bid,tid,0,randomUUID()]);assert.ok(deleted.deleted_at);assert.equal(deleted.active,false)
 await assert.rejects(rpc('save_restaurant_resource',[bid,'table',tid,deleted.revision,randomUUID(),{name:'Meja 1',capacity:4,active:true}]),/deleted/)
 assert.equal((await db.query<any>('select table_name from public.restaurant_orders where id=$1',[seated.id])).rows[0].table_name,'Meja 1')
 }finally{await db.close()}
})
