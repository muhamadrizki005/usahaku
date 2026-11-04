import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { reservationBookingExtras } from '../lib/reservation-booking'

test('reservation booking accepts optional food and DP and rejects forged totals, partial portions and unconfirmed money',()=>{
 assert.equal(reservationBookingExtras.safeParse({meal:null,deposit:null}).success,true)
 const meal={lines:[{id:randomUUID(),quantity:2}],notes:''},deposit={amount:'20000',payment:'cash',confirmed:true}
 assert.equal(reservationBookingExtras.safeParse({meal,deposit}).success,true)
 for(const extras of [{meal:{...meal,total:1},deposit:null},{meal:{...meal,lines:[]},deposit:null},{meal:{...meal,lines:[{id:randomUUID(),quantity:0.5}]},deposit:null},{meal:null,deposit:{...deposit,confirmed:false}},{meal:null,deposit:{...deposit,amount:'0'}},{meal:null,deposit:null,businessId:randomUUID()}])assert.equal(reservationBookingExtras.safeParse(extras).success,false)
})

test('reservation booking atomically saves meals and DP, rolls back failures, retries once and preserves access and legacy data',async()=>{
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
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/' + file,'utf8'))

 const people=Array.from({length:5},()=>randomUUID()),[owner,a,b,other,manager]=people
 for(const uid of people)await db.query('insert into auth.users(id) values($1)',[uid])
 const as=async(uid:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')}
 const rpc=async(name:string,args:unknown[])=> (await db.query<any>('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
 const create=async(uid:string)=>{await as(uid);const id=await rpc('create_business_profile_for_category',['restaurant','Booking Test','Owner','081234567890','Jalan','Bandung','Jawa Barat','']);await rpc('complete_business_onboarding',[id]);return id}
 const bid=await create(owner),foreign=await create(other)
 await db.exec('reset role')
 for(const [uid,role] of [[a,'cashier'],[b,'cashier'],[manager,'admin']])await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Staff',$3,$4,false)",[bid,uid,uid!.slice(0,8),role])
 await as(owner)
 const tid=randomUUID(),mid=randomUUID()
 await rpc('save_restaurant_resource',[bid,'table',tid,null,randomUUID(),{name:'Meja Booking',capacity:4,active:true}])
 await rpc('save_restaurant_resource',[bid,'menu',mid,null,randomUUID(),{name:'Kopi',category:'Minuman',price:'30000',active:true,available:true}])
 const now=Date.parse((await db.query<any>('select now() t')).rows[0].t)
 const details=(offset:number)=>({tableId:tid,guests:2,customer:'Tamu',phone:'081234567890',notes:'Catatan reservasi',startsAt:new Date(now+offset*60000).toISOString(),endsAt:new Date(now+(offset+90)*60000).toISOString()})
 const meal={lines:[{id:mid,quantity:2}],notes:'Tanpa es'},deposit={amount:'20000',payment:'transfer',confirmed:true}
 const bundle=(id:string,offset:number,m:unknown=meal,d:unknown=deposit,op=randomUUID())=>rpc('create_restaurant_reservation_bundle',[bid,id,op,details(offset),m,d])
 const state=async()=>{await db.exec('reset role');const result:any={};for(const table of ['restaurant_reservations','restaurant_orders','restaurant_requests','restaurant_audit','pos_transactions'])result[table]=(await db.query('select to_jsonb(t) v from public.'+table+" t order by to_jsonb(t)::text")).rows;await db.exec('set role authenticated');return result}
 await as(a)
 const rid=randomUUID(),req=randomUUID(),first=await bundle(rid,10,meal,deposit,req)
 assert.equal(first.status,'reserved');assert.equal(Number(first.deposit_amount),20000);assert.equal(first.revision,1)
 assert.deepEqual(await bundle(rid,10,meal,deposit,req),first)
 const orders=(await db.query<any>('select * from public.restaurant_orders')).rows
 assert.equal(orders.length,1);assert.equal(orders[0].actor_id,a);assert.equal(orders[0].reservation_id,rid);assert.equal(orders[0].occupies_table,false);assert.equal(Number(orders[0].subtotal),60000);assert.equal(orders[0].notes,'Tanpa es')
 assert.equal((await db.query('select id from public.pos_transactions')).rows.length,0)
 assert.equal((await rpc('read_restaurant_table_state',[bid]))[0].occupied,false)
 await assert.rejects(bundle(rid,10,meal,deposit,randomUUID()),/changed/)
 await assert.rejects(bundle(rid,10,{...meal,notes:'Changed'},deposit,req),/reused/)
 await as(b);assert.equal((await db.query('select id from public.restaurant_orders')).rows.length,0)
 await assert.rejects(bundle(rid,10,meal,deposit,req),/reused/)
 await assert.rejects(rpc('arrive_restaurant_reservation',[bid,rid,1,randomUUID()]),/access denied/)
 await as(other);await assert.rejects(bundle(randomUUID(),500),/access denied/)
 await as(owner)
 for(const [m,d,pattern]of [
 [{...meal,lines:[{id:randomUUID(),quantity:1}]},deposit,/Menu unavailable/],
 [meal,{...deposit,payment:'invalid'},/Invalid deposit/],
 [meal,{...deposit,amount:'60001'},/DP tidak boleh melebihi/],
 [{...meal,total:1},deposit,/Invalid meal/],
 [meal,{...deposit,confirmed:false},/Invalid deposit/],
 [{...meal,lines:[{id:mid,quantity:0}]},deposit,/Invalid menu quantity/],
 ] as const){const before=await state();await assert.rejects(bundle(randomUUID(),500,m,d),pattern);assert.deepEqual(await state(),before)}
 // A sold-out menu must roll the reservation and all audit/request writes back too.
 await rpc('save_restaurant_resource',[bid,'menu',mid,0,randomUUID(),{name:'Kopi',category:'Minuman',price:'30000',active:true,available:false}])
 const before=await state();await assert.rejects(bundle(randomUUID(),500),/Menu unavailable/);assert.deepEqual(await state(),before)
 await rpc('save_restaurant_resource',[bid,'menu',mid,1,randomUUID(),{name:'Kopi',category:'Minuman',price:'30000',active:true,available:true}])
 await as(a)
 await rpc('arrive_restaurant_reservation',[bid,rid,1,randomUUID()])
 assert.equal((await bundle(rid,10,meal,deposit,req)).status,'seated')
 await rpc('pay_restaurant_order',[bid,orders[0].id,1,randomUUID(),{payment:'cash',received:'40000',discountKind:'none',discountValue:'0',confirmed:true}])
 assert.equal((await bundle(rid,10,meal,deposit,req)).status,'completed')
 const sale=(await db.query<any>('select * from public.pos_transactions')).rows[0]
 assert.equal(Number(sale.total),60000);assert.equal(Number(sale.deposit_amount),20000);assert.equal(Number(sale.change),0)
 await as(manager)
 const tableOnly=await bundle(randomUUID(),500,null,null);assert.equal(tableOnly.deposit_amount,0)
 const depositOnly=await bundle(randomUUID(),800,null,deposit);assert.equal(Number(depositOnly.deposit_amount),20000)
 const foodOnly=await bundle(randomUUID(),1100,meal,null);assert.equal(foodOnly.deposit_amount,0)
 const beforeRace=await state(),raceId=randomUUID(),raceReq=randomUUID()
 const parallel=await Promise.all([bundle(raceId,1400,meal,null,raceReq),bundle(raceId,1400,meal,null,raceReq)])
 assert.equal(parallel[0].id,parallel[1].id)
 const afterRace=await state();assert.equal(afterRace.restaurant_orders.length,beforeRace.restaurant_orders.length+1)
 assert.equal((await db.query<any>('select count(*) n from public.restaurant_orders where reservation_id=$1',[tableOnly.id])).rows[0].n,0)
 assert.equal((await db.query<any>('select count(*) n from public.restaurant_orders where reservation_id=$1',[depositOnly.id])).rows[0].n,0)
 await as(owner)
 const immutableBefore=await state()
 await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[a]);await as(a)
 await assert.rejects(bundle(randomUUID(),1800),/access denied/)
 await as(owner);assert.deepEqual(await state(),immutableBefore)
 assert.ok(foreign)
 }finally{await db.close()}
})
