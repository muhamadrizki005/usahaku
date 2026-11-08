import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('manual table release: payment holds table, staff release, guards, retry and tenant isolation',async()=>{
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
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'202611080002').sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'))

 const [owner,cashier,other,manager]=Array.from({length:4},()=>randomUUID())
 for(const u of [owner,cashier,other,manager])await db.query('insert into auth.users(id) values($1)',[u])
 const as=async(u:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated')}
 const rpc=async(n:string,args:unknown[])=> (await db.query<any>('select public.'+n+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
 await as(owner);const bid=await rpc('create_business_profile_for_category',['restaurant','Manual Cafe','Owner','081234567890','Jalan','Bandung','Jawa Barat','']);await rpc('complete_business_onboarding',[bid])
 await db.exec('reset role');for(const [u,role]of [[cashier,'cashier'],[manager,'admin']])await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Petugas',$3,$4,false)",[bid,u,u.slice(0,8),role]);await as(owner)
 const mid=randomUUID(),tid=randomUUID()
 await rpc('save_restaurant_resource',[bid,'menu',mid,null,randomUUID(),{name:'Kopi',category:'Minuman',price:'10000',active:true,available:true}])
 await rpc('save_restaurant_resource',[bid,'table',tid,null,randomUUID(),{name:'Meja 1',capacity:4,active:true}])
 const legacy=await rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),{kind:'dine_in',tableId:tid,guests:1,customer:'Legacy',notes:'',stage:'new',lines:[{id:mid,quantity:1}]}])
 await rpc('pay_restaurant_order',[bid,legacy.id,0,randomUUID(),{payment:'cash',received:'10000',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,billingRevision:0,redeemPoints:'0'}])
 const legacySales=(await db.query('select * from public.pos_transactions order by id')).rows,legacyTable=(await db.query<any>('select * from public.restaurant_tables where id=$1',[tid])).rows[0]
 await db.exec('reset role');for(const f of ['202611080002_restaurant_manual_table_release.sql','202611080003_restaurant_reserved_table_release.sql'])await db.exec(await readFile('supabase/migrations/'+f,'utf8'));await as(owner)
 assert.deepEqual((await db.query('select * from public.pos_transactions order by id')).rows,legacySales)
 const afterMigration=(await db.query<any>('select * from public.restaurant_tables where id=$1',[tid])).rows[0];assert.equal(afterMigration.occupied_until_released,false);delete afterMigration.occupied_until_released;assert.deepEqual(afterMigration,legacyTable)
 const table=async()=> (await db.query<any>('select * from public.restaurant_tables where id=$1',[tid])).rows[0]
 const mark=async(available:boolean,revision?:number,req=randomUUID())=>rpc('set_restaurant_table_availability',[bid,tid,revision??(await table()).revision,req,available])
 const details={kind:'dine_in',tableId:tid,guests:2,customer:'Umum',notes:'',stage:'new',lines:[{id:mid,quantity:1}]}
 const order=()=>rpc('save_restaurant_order',[bid,randomUUID(),null,randomUUID(),details])
 const usage=async()=> (await rpc('read_restaurant_table_state',[bid]))[0].occupied
 await as(cashier);const first=await order();assert.equal(await usage(),true)
 await assert.rejects(mark(true),/Unpaid order locks table/)
 const beforeFailure=await table();await assert.rejects(rpc('pay_restaurant_order',[bid,first.id,first.revision,randomUUID(),{payment:'cash',received:'0',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,billingRevision:0,redeemPoints:'0'}]));assert.deepEqual(await table(),beforeFailure)
 await mark(false);const modified=await rpc('save_restaurant_order',[bid,first.id,first.revision,randomUUID(),{...details,stage:'preparing'}]);assert.equal(modified.stage,'preparing')
 const payment={payment:'cash',received:'10000',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,billingRevision:0,redeemPoints:'0'},payReq=randomUUID()
 const paid=await rpc('pay_restaurant_order',[bid,first.id,modified.revision,payReq,payment]);assert.equal(paid.sale.total,10000);assert.equal(await usage(),true);assert.equal((await table()).occupied_until_released,true)
 const tableRevision=(await table()).revision
 await rpc('pay_restaurant_order',[bid,first.id,modified.revision,payReq,payment]);assert.equal((await table()).revision,tableRevision)
 await assert.rejects(order(),/Table awaits manual release/)
 await assert.rejects(rpc('delete_restaurant_table',[bid,tid,tableRevision,randomUUID()]),/access denied/)
 await as(owner);await assert.rejects(rpc('delete_restaurant_table',[bid,tid,tableRevision,randomUUID()]),/Table awaits manual release/)
 await assert.rejects(rpc('save_restaurant_resource',[bid,'table',tid,tableRevision,randomUUID(),{name:'Meja 1',capacity:4,active:false}]),/Table awaits manual release/)
 await as(other);await assert.rejects(rpc('set_restaurant_table_availability',[bid,tid,tableRevision,randomUUID(),true]),/access denied/)
 await as(cashier);const req=randomUUID(),released=await mark(true,tableRevision,req);assert.equal(released.occupied_until_released,false);assert.equal(await usage(),false)
 await mark(false);const replay=await mark(true,tableRevision,req);assert.equal(replay.revision,released.revision);assert.equal((await table()).occupied_until_released,true)
 await assert.rejects(mark(true,tableRevision),/Table changed/);await assert.rejects(mark(false,tableRevision,req),/Request ID already used/)
 await as(manager);await mark(true);assert.equal(await usage(),false)
 const second=await order();await rpc('cancel_restaurant_order',[bid,second.id,second.revision,'Uji pembatalan']);assert.equal(await usage(),false)
 await mark(false);await as(owner)
 await db.exec('reset role');await db.query("update public.businesses set operating_hours=$2::jsonb where id=$1",[bid,Object.fromEntries(['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d=>[d,{closed:false,open:'00:00',close:'23:59'}]))]);await as(owner)
 const date=new Date(Date.now()+48*3600000).toISOString().slice(0,10),start=date+'T10:00:00+07:00',end=date+'T11:30:00+07:00'
 const reservation=await rpc('save_restaurant_reservation',[bid,randomUUID(),null,randomUUID(),{tableId:tid,guests:2,customer:'Tamu',phone:'081234567890',startsAt:start,endsAt:end,notes:''}])
 await db.exec('reset role');await db.query("update public.restaurant_reservations set starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hours' where id=$1",[reservation.id]);await as(owner)
 await assert.rejects(rpc('arrive_restaurant_reservation',[bid,reservation.id,reservation.revision,randomUUID()]),/Table awaits manual release/)
 await mark(true);assert.equal((await rpc('read_restaurant_table_state',[bid]))[0].reserved,true);await assert.rejects(order(),/dikunci|reservasi/)
 const arrived=await rpc('arrive_restaurant_reservation',[bid,reservation.id,reservation.revision,randomUUID()]);assert.equal(arrived.status,'seated');await assert.rejects(mark(true),/Reservation locks table/)
 await db.exec('reset role');await db.query("update public.restaurant_reservations set status='cancelled',cancellation_reason='Uji selesai' where id=$1",[reservation.id]);await as(owner);await mark(true)
 await db.exec('reset role');await db.query("update public.business_members set active=false where business_id=$1 and user_id=$2",[bid,cashier]);await as(cashier);await assert.rejects(mark(false,0),/access denied/)
 await as(manager);await assert.rejects(db.query('update public.restaurant_tables set occupied_until_released=false where id=$1',[tid]),/permission denied/)
 const sale=await db.query<any>('select total,status from public.pos_transactions where id=$1',[paid.sale.id]);assert.equal(Number(sale.rows[0].total),10000);assert.equal(sale.rows[0].status,'completed')
 }finally{await db.close()}
})
