import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { restaurantTestHours } from './fixtures/restaurant-hours'
import { PGlite } from '@electric-sql/pglite'

test('preorder migration preserves existing seated orders, reservation status and all sale values', async () => {
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
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && f < '202611030003').sort()) await db.exec(await readFile('supabase/migrations/' + file,'utf8'))

 const uid=randomUUID();await db.query('insert into auth.users(id) values($1)',[uid]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')
 const rpc=async(name:string,args:unknown[])=> (await db.query<any>('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
 const bid=await rpc('create_business_profile_for_category',['restaurant','Legacy Test','Owner','081234567890','Jalan','Bandung','Jawa Barat','']);await rpc('complete_business_onboarding',[bid])
 const tid=randomUUID(),mid=randomUUID(),rid=randomUUID(),oid=randomUUID()
 await rpc('save_restaurant_resource',[bid,'table',tid,null,randomUUID(),{name:'Legacy Table',capacity:4,active:true}])
 await rpc('save_restaurant_resource',[bid,'menu',mid,null,randomUUID(),{name:'Legacy Menu',category:'Minuman',price:'10000',active:true,available:true}])
 const now=Date.parse((await db.query<any>('select now() t')).rows[0].t)
 const details={tableId:tid,guests:2,customer:'Legacy Guest',phone:'081234567890',notes:'',startsAt:new Date(now+5*60000).toISOString(),endsAt:new Date(now+95*60000).toISOString()}
 await rpc('save_restaurant_reservation',[bid,rid,null,randomUUID(),details])
 await rpc('save_restaurant_order',[bid,oid,null,randomUUID(),{kind:'dine_in',tableId:tid,guests:2,customer:'Legacy Guest',notes:'',stage:'new',lines:[{id:mid,quantity:1}],reservationId:rid}])
 const paidId=randomUUID()
 await rpc('save_restaurant_order',[bid,paidId,null,randomUUID(),{kind:'takeaway',tableId:null,guests:1,customer:'Legacy Buyer',notes:'',stage:'new',lines:[{id:mid,quantity:2}]}])
 await rpc('pay_restaurant_order',[bid,paidId,0,randomUUID(),{payment:'cash',received:'25000',discountKind:'none',discountValue:'0',confirmed:true}])
 const beforeOrders=(await db.query('select to_jsonb(o) value from public.restaurant_orders o order by id')).rows
 const beforeReservations=(await db.query('select * from public.restaurant_reservations order by id')).rows
 const beforeSales=(await db.query('select * from public.pos_transactions order by id')).rows
 await db.exec('reset role');await db.exec(await readFile('supabase/migrations/202611030003_restaurant_preorders_table_locks.sql','utf8'))
 assert.deepEqual((await db.query("select to_jsonb(o)-'occupies_table' value from public.restaurant_orders o order by id")).rows,beforeOrders)
 assert.deepEqual((await db.query('select * from public.restaurant_reservations order by id')).rows,beforeReservations)
 assert.deepEqual((await db.query('select * from public.pos_transactions order by id')).rows,beforeSales)
 assert.equal((await db.query<any>('select bool_and(occupies_table) physical from public.restaurant_orders')).rows[0].physical,true)
 await db.exec('set role authenticated')
 assert.equal((await db.query<any>('select * from public.restaurant_table_usage($1)',[bid])).rows[0].occupied,true)
 const overview=await rpc('read_restaurant_overview',[bid]);assert.equal(overview.occupiedCount,1);assert.equal(overview.revenue,20000)
 }finally{await db.close()}
})


test('preorders, arrival, exact table locks, buffered slots, owner settings and tenant isolation', async () => {
 const db = new PGlite()
 try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/' + file,'utf8'))

 const people=Array.from({length:5},()=>randomUUID()),[owner,admin,a,b,other]=people
 for(const id of people)await db.query('insert into auth.users(id) values($1)',[id])
 const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const rpc=async(name:string,args:unknown[])=>{const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query<any>('select public.'+name+'('+placeholders+') value',args)).rows[0].value}
 await as(owner)
 const bid=await rpc('create_business_profile_for_category',['restaurant','Preorder Test','Owner','081234567890','Jalan','Bandung','Jawa Barat',''])
 await rpc('save_business_hours',[bid,0,restaurantTestHours()])
 await rpc('complete_business_onboarding',[bid])
 await db.exec('reset role')
 for(const [id,role] of [[admin,'admin'],[a,'cashier'],[b,'cashier']])await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Test',$3,$4,false)",[bid,id,id!.slice(0,8),role])
 await as(owner)
 const tables=Array.from({length:4},()=>randomUUID()),mid=randomUUID()
 for(const [i,id]of tables.entries())await rpc('save_restaurant_resource',[bid,'table',id,null,randomUUID(),{name:'Meja '+i,capacity:4,active:true}])
 await rpc('save_restaurant_resource',[bid,'menu',mid,null,randomUUID(),{name:'Kopi',category:'Minuman',price:'30000',active:true,available:true}])
 const now=Date.parse((await db.query<any>('select statement_timestamp() t')).rows[0].t),iso=(minutes:number)=>new Date(now+minutes*60000).toISOString()
 const reserve=(tid:string,start:number,end:number,id=randomUUID())=>rpc('save_restaurant_reservation',[bid,id,null,randomUUID(),{tableId:tid,guests:2,customer:'Tamu',phone:'081234567890',notes:'',startsAt:iso(start),endsAt:iso(end)}])
 const details=(tid:string,rid?:string)=>({kind:'dine_in',tableId:tid,guests:2,customer:'Tamu',notes:'',stage:'new',lines:[{id:mid,quantity:2}],...(rid?{reservationId:rid}:{})})
 const save=(id:string,rev:number|null,d:unknown,request=randomUUID())=>rpc('save_restaurant_order',[bid,id,rev,request,d])
 const usage=()=>rpc('read_restaurant_table_state',[bid])
 const pay=(id:string,rev:number,received='60000',op=randomUUID())=>rpc('pay_restaurant_order',[bid,id,rev,op,{payment:'cash',received,discountKind:'none',discountValue:'0',confirmed:true}])
 const r=await reserve(tables[0],122,212)
 await as(a)
 const walkId=randomUUID();await save(walkId,null,details(tables[0]))
 await as(owner)
 const preorderId=randomUUID(),op=randomUUID(),d=details(tables[0],r.id)
 const pre=await save(preorderId,null,d,op)
 assert.equal(pre.occupies_table,false)
 assert.equal((await save(preorderId,null,d,op)).id,preorderId)
 assert.equal((await usage()).find((v:any)=>v.id===tables[0]).locked,false)
 await assert.rejects(pay(preorderId,0),/Tandai pelanggan datang/)
 await assert.rejects(rpc('arrive_restaurant_reservation',[bid,r.id,0,randomUUID()]),/sejak waktu penguncian/)
 await db.exec('reset role')
 await db.query("update public.restaurant_reservations set starts_at=$1,ends_at=$2 where id=$3",[iso(119),iso(209),r.id])
 await as(owner)
 let state=(await usage()).find((v:any)=>v.id===tables[0])
 assert.equal(state.locked,true);assert.equal(state.occupied,true);assert.equal(state.conflict,true)
 assert.equal('customer'in state,false)
 await assert.rejects(save(randomUUID(),null,details(tables[0])),/dikunci/)
 await assert.rejects(rpc('arrive_restaurant_reservation',[bid,r.id,0,randomUUID()]),/masih terpakai/)
 await as(a)
 await save(walkId,0,{...details(tables[0]),stage:'preparing'})
 await pay(walkId,1)
 await as(owner)
 await save(preorderId,0,{...d,notes:'Tambah catatan'})
 assert.equal((await usage()).find((v:any)=>v.id===tables[0]).occupied,true)
 const tableRevision=(await db.query<any>('select revision from public.restaurant_tables where id=$1',[tables[0]])).rows[0].revision
 await rpc('set_restaurant_table_availability',[bid,tables[0],tableRevision,randomUUID(),true])
 assert.equal((await usage()).find((v:any)=>v.id===tables[0]).occupied,false)
 const arrivalOp=randomUUID()
 const arrived=await rpc('arrive_restaurant_reservation',[bid,r.id,0,arrivalOp])
 assert.equal(arrived.status,'seated')
 assert.equal((await rpc('arrive_restaurant_reservation',[bid,r.id,0,arrivalOp])).revision,1)
 assert.equal((await save(preorderId,null,d,op)).occupies_table,true)
 assert.equal((await usage()).find((v:any)=>v.id===tables[0]).occupied,true)
 await assert.rejects(save(preorderId,1,d),/changed/)
 const paid=await pay(preorderId,2)
 assert.equal(paid.sale.total,60000)
 // Half-open hold ranges allow the preceding reservation to end exactly at the next hold start.
 const future=await reserve(tables[1],600,690)
 await assert.rejects(reserve(tables[1],450,481),/sudah memiliki reservasi/)
 const earlier=await reserve(tables[1],450,480)
 const settingsOp=randomUUID(),settings=await rpc('save_restaurant_lock_settings',[bid,0,settingsOp,180])
 assert.equal(settings.conflicts,1)
 assert.equal((await rpc('save_restaurant_lock_settings',[bid,0,settingsOp,180])).revision,1)
 assert.equal((await db.query<any>('select status from public.restaurant_reservations where id=$1',[earlier.id])).rows[0].status,'reserved')
 // Changing metadata in a grandfathered slot must not discard that reservation.
 await rpc('save_restaurant_reservation',[bid,future.id,0,randomUUID(),{tableId:tables[1],guests:2,customer:'Tamu Baru',phone:'081234567890',notes:'Tetap',startsAt:iso(600),endsAt:iso(690)}])
 await assert.rejects(reserve(tables[1],800,890),/sudah memiliki reservasi/)
 for(const id of [admin,a,b,other]){
 await as(id);await assert.rejects(rpc('save_restaurant_lock_settings',[bid,1,randomUUID(),30]),/access required/)
 }
 await as(b);await assert.rejects(pay(preorderId,2),/access denied/)
 await assert.rejects(rpc('arrive_restaurant_reservation',[bid,earlier.id,0,randomUUID()]),/access denied/)
 await assert.rejects(rpc('save_restaurant_order_core_v2',[bid,randomUUID(),null,randomUUID(),details(tables[2]),true]),/permission denied/)
 await as(other);await assert.rejects(usage(),/access denied/)
 await as(owner)
 const empty=await reserve(tables[2],10,100)
 await rpc('arrive_restaurant_reservation',[bid,empty.id,0,randomUUID()])
 assert.equal((await usage()).find((v:any)=>v.id===tables[2]).occupied,true)
 await assert.rejects(save(randomUUID(),null,details(tables[2])),/dipakai/)
 const emptyOrder=randomUUID();assert.equal((await save(emptyOrder,null,details(tables[2],empty.id))).occupies_table,true)
 // Preorder metadata follows reservation edits, with a new order revision.
 const next=await reserve(tables[3],900,990),nextId=randomUUID()
 await save(nextId,null,details(tables[3],next.id))
 await rpc('save_restaurant_reservation',[bid,next.id,0,randomUUID(),{tableId:tables[3],guests:3,customer:'Diubah',phone:'081234567890',notes:'',startsAt:iso(910),endsAt:iso(1000)}])
 const synced=(await db.query<any>('select * from public.restaurant_orders where id=$1',[nextId])).rows[0]
 assert.equal(synced.customer,'Diubah');assert.equal(synced.guests,3);assert.equal(synced.revision,1);assert.equal(Number(synced.subtotal),60000)
 await db.exec('reset role');await db.query("update public.restaurant_reservations set starts_at=$1,ends_at=$2 where id=$3",[iso(-20),iso(70),next.id]);await as(owner)
 const closed=await rpc('close_restaurant_reservation',[bid,next.id,1,randomUUID(),'Tidak hadir',true,false])
 assert.equal(closed.status,'no_show')
 assert.equal((await db.query<any>('select status from public.restaurant_reservations where id=$1',[next.id])).rows[0].status,'no_show')
 }finally{await db.close()}
})
