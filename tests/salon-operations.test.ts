import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir,readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('salon operations preserve other businesses, serialize schedules and enforce visit, payment, retry, refund and privacy rules',async()=>{
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
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'202611070001').sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
  const owner=randomUUID(),admin=randomUUID(),cashier=randomUUID(),other=randomUUID(),storeOwner=randomUUID()
  for(const uid of [owner,admin,cashier,other,storeOwner])await db.query('insert into auth.users(id) values($1)',[uid])
  const as=async(uid:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')}
  const rpc=async(name:string,args:unknown[])=> (await db.query<any>('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
  const create=async(category:string)=>rpc('create_business_profile_for_category',[category,'Usaha Uji','Owner','081234567890','Jalan','Bandung','Jawa Barat',''])
  await as(storeOwner);const store=await create('store');await rpc('complete_business_onboarding',[store])
  const legacyProduct=randomUUID();await rpc('save_catalog_product',[store,legacyProduct,null,randomUUID(),{name:'Produk lama',category:'Minuman',unit:'pcs',sku:'LEGACY',barcode:'',price:'10000',minimum:'0',initialStock:'10',active:true,discountKind:'none',discountValue:0}])
  await rpc('checkout_pos',[store,randomUUID(),{lines:[{id:legacyProduct,quantity:'1',price:'10000',revision:0}],payment:'cash',received:'10000',discountKind:'none',discountValue:'0',taxRate:'0',taxRevision:0,paymentRevision:0,confirmed:true}])
  await db.exec('reset role');const before=(await db.query('select * from public.businesses where id=$1',[store])).rows,legacySales=(await db.query('select * from public.pos_transactions where business_id=$1',[store])).rows,legacyStock=(await db.query('select * from public.stock_movements where business_id=$1 order by id',[store])).rows
  await db.exec(await readFile('supabase/migrations/202611070001_salon_operations.sql','utf8'))
  await db.exec(await readFile('supabase/migrations/202611070002_salon_preparation_slots.sql','utf8'))
  await db.exec(await readFile('supabase/migrations/202611070003_salon_walkin_queue.sql','utf8'))
  await as(owner);const bid=await create('barbershop');await rpc('complete_business_onboarding',[bid])
  const hours=Object.fromEntries(['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d=>[d,{open:'00:00',close:'23:59',closed:false}]))
  await rpc('save_business_hours',[bid,0,hours]);const sid=randomUUID(),sid2=randomUUID(),pid=randomUUID(),pid2=randomUUID()
  await rpc('save_salon_resource',[bid,'service',sid,null,randomUUID(),{name:'Potong',price:'50000',duration:'30',active:true}])
  await rpc('save_salon_resource',[bid,'service',sid2,null,randomUUID(),{name:'Keramas',price:'10000',duration:'15',active:true}])
  await rpc('save_salon_resource',[bid,'practitioner',pid,null,randomUUID(),{name:'Rina',active:true,serviceIds:[sid,sid2],schedule:hours}])
  await rpc('save_salon_resource',[bid,'practitioner',pid2,null,randomUUID(),{name:'Penata kedua',active:true,serviceIds:[sid,sid2],schedule:hours}])
  await db.exec('reset role');for(const [uid,role]of [[admin,'admin'],[cashier,'cashier']])await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Staf',$3,$4,false)",[bid,uid,uid.slice(0,8),role])
  await as(owner);const settings=await rpc('save_salon_settings',[bid,0,{buffer:'10',taxRate:'10'}]);assert.equal(settings.revision,1)
  const cid=randomUUID();await rpc('save_customer',[bid,cid,null,randomUUID(),{name:'Pelanggan',phone:'081234567890',notes:'Preferensi pribadi',active:true}])
  const now=Date.parse((await db.query<any>('select now() t')).rows[0].t),start=new Date(now-60000).toISOString(),future=new Date(now+86400000).toISOString()
  const details={practitionerId:pid,customerId:cid,customer:'Pelanggan',phone:'',notes:'Potongan pendek',kind:'walk_in',startsAt:start,serviceIds:[sid,sid2],deposit:null}
  const operation=async(id:string,revision:number|null,action:string,d:unknown={},request=randomUUID())=>rpc('salon_visit_operation',[bid,id,revision,request,action,d])
  const vid=randomUUID(),request=randomUUID();let visit=await operation(vid,null,'save',details,request);assert.equal(visit.subtotal,60000);assert.equal(visit.lines.length,2);assert.equal(visit.status,'waiting')
  assert.deepEqual(await operation(vid,null,'save',details,request),visit);await assert.rejects(operation(vid,null,'save',{...details,notes:'Berubah'},request),/Request ID/)
  await assert.rejects(operation(randomUUID(),null,'save',details),/slot/);await assert.rejects(operation(vid,0,'start'),/changed/)
  const editId=randomUUID(),editDetails={...details,startsAt:new Date(now+4*86400000).toISOString(),kind:'appointment'}
  await operation(editId,null,'save',editDetails);let edited=await operation(editId,1,'save',{...editDetails,notes:'Preferensi baru'});assert.equal(edited.notes,'Preferensi baru');assert.equal(edited.revision,2)
  await assert.rejects(operation(editId,2,'save',{...editDetails,kind:'walk_in'}),/Jenis kunjungan/)
  await assert.rejects(operation(randomUUID(),null,'save',{...editDetails,startsAt:new Date(Date.parse(edited.ends_at)).toISOString()}),/slot/)
  const adjacent=await operation(randomUUID(),null,'save',{...editDetails,startsAt:edited.busy_until});assert.equal(adjacent.starts_at,edited.busy_until)
  await operation(editId,2,'cancel',{reason:'Batal uji',refundConfirmed:false});await operation(adjacent.id,1,'cancel',{reason:'Batal uji',refundConfirmed:false})
  const invalidBundle=randomUUID();await assert.rejects(operation(invalidBundle,null,'save',{...editDetails,deposit:{amount:'999999',payment:'cash',confirmed:true,paymentRevision:0}}),/DP/);assert.equal((await db.query('select id from public.salon_visits where id=$1',[invalidBundle])).rows.length,0)
  await assert.rejects(operation(randomUUID(),null,'save',{...editDetails,serviceIds:[sid,sid]}),/berulang/)
  await assert.rejects(operation(vid,1,'pay',{}),/Selesaikan/)
  const dp={amount:'10000',payment:'cash',confirmed:true,paymentRevision:0},dpRequest=randomUUID();visit=await operation(vid,1,'deposit',dp,dpRequest);assert.equal(visit.deposit_amount,10000);assert.equal((await operation(vid,1,'deposit',dp,dpRequest)).revision,2)
  visit=await operation(vid,2,'start')
  const queued=await operation(randomUUID(),null,'save',{...details,startsAt:visit.busy_until});assert.equal(queued.status,'waiting');assert.ok(queued.arrived_at);await assert.rejects(operation(queued.id,1,'start'),/slot/);await operation(queued.id,1,'cancel',{reason:'Batal antrean uji',refundConfirmed:false})
  await assert.rejects(operation(randomUUID(),null,'save',{...details,startsAt:new Date(now+25*3600000).toISOString()}),/Walk-in/)
  visit=await operation(vid,3,'finish');assert.equal(visit.status,'finished')
  await assert.rejects(operation(randomUUID(),null,'save',details),/slot/)
  const prepSlots=await rpc('salon_busy_slots',[bid,start,new Date(now+3600000).toISOString()]);assert.ok(prepSlots.some((s:any)=>s.practitioner_id===pid&&Date.parse(s.ends_at)-Date.parse(s.starts_at)===10*60000))
  const pay={payment:'cash',received:'60000',discountKind:'percent',discountValue:'10',confirmed:true,paymentRevision:0,settingsRevision:1},payRequest=randomUUID();visit=await operation(vid,4,'pay',pay,payRequest);assert.ok(visit.sale_id)
  assert.equal((await operation(vid,4,'pay',pay,payRequest)).sale_id,visit.sale_id)
  let sale=(await db.query<any>('select * from public.pos_transactions where id=$1',[visit.sale_id])).rows[0];assert.equal(Number(sale.total),59400);assert.equal(Number(sale.tax_amount),5400);assert.equal(Number(sale.change),10600);assert.equal(Number(sale.deposit_amount),10000);assert.match(sale.receipt_number,/^TRX-/)
  await as(cashier);await assert.rejects(operation(vid,5,'save',details),/access denied/);assert.equal((await rpc('read_salon_visits',[bid,new Date(now-86400000).toISOString(),new Date(now+86400000).toISOString(),0,null])).total,0)
  assert.equal((await db.query('select * from public.customers where id=$1',[cid])).rows.length,0);await assert.rejects(rpc('salon_report_summary',[bid,start,future]),/access denied/);await assert.rejects(rpc('save_salon_settings',[bid,1,{buffer:'0',taxRate:'0'}]),/access denied/)
  const cashId=randomUUID();let cv=await operation(cashId,null,'save',{...details,customerId:null,startsAt:future,kind:'appointment'});assert.equal(cv.status,'scheduled')
  await assert.rejects(operation(cashId,1,'start'),/slot/);await assert.rejects(operation(cashId,1,'no_show',{reason:'Belum datang'}),/15 menit/)
  await as(admin);const busy=await rpc('salon_busy_slots',[bid,future,new Date(now+2*86400000).toISOString()]);assert.ok(busy.length);assert.equal(busy[0].customer,undefined);await assert.rejects(rpc('save_salon_settings',[bid,1,{buffer:'0',taxRate:'0'}]),/access denied/)
  await as(owner);await rpc('cancel_salon_sale',[bid,visit.sale_id,'Refund penuh',true,true]);sale=(await db.query<any>('select * from public.pos_transactions where id=$1',[visit.sale_id])).rows[0];assert.equal(sale.status,'cancelled');assert.equal(Number(sale.refund_amount),59400)
  await rpc('cancel_salon_sale',[bid,visit.sale_id,'Refund penuh',true,true]);assert.equal((await rpc('read_sales_report',[bid,new Date(new Date(now+7*3600000).toISOString().slice(0,10)+'T00:00:00+07:00').toISOString(),new Date(Date.parse(new Date(now+7*3600000).toISOString().slice(0,10)+'T00:00:00+07:00')+86400000).toISOString(),'all'])).refunds.length,1)
  const withDP=randomUUID();cv=await operation(withDP,null,'save',{...details,startsAt:new Date(now+2*86400000).toISOString(),kind:'appointment',deposit:dp})
  await assert.rejects(operation(withDP,1,'cancel',{reason:'Batal',refundConfirmed:false}),/refund|dikembalikan/);cv=await operation(withDP,1,'cancel',{reason:'Batal dengan refund',refundConfirmed:true});assert.equal(cv.deposit_refunded,10000)
  await as(other);const otherBid=await create('barbershop');await rpc('complete_business_onboarding',[otherBid]);await assert.rejects(rpc('read_salon_visits',[bid,start,future,0,null]),/denied/);await assert.rejects(operation(randomUUID(),null,'save',details),/denied/);await assert.rejects(rpc('salon_busy_slots',[bid,start,future]),/denied/)
  await assert.rejects(rpc('save_salon_resource',[otherBid,'practitioner',randomUUID(),null,randomUUID(),{name:'Foreign skill',active:true,serviceIds:[sid],schedule:hours}]),/services/)
  await as(cashier);await assert.rejects(db.query('update public.salon_visits set subtotal=1 where id=$1',[cashId]),/permission denied/)
  cv=await operation(randomUUID(),null,'save',{...details,practitionerId:pid2,customerId:null,kind:'walk_in'});cv=await operation(cv.id,1,'start');cv=await operation(cv.id,2,'finish')
  await assert.rejects(operation(cv.id,3,'pay',pay),/owner\/admin/)
  await assert.rejects(operation(cv.id,3,'pay',{...pay,discountKind:'none',discountValue:'0',received:'1000'}),/mencukupi/)
  const cashSale=await operation(cv.id,3,'pay',{...pay,discountKind:'none',discountValue:'0',received:'70000'});assert.ok(cashSale.sale_id)
  assert.equal((await db.query('select id from public.pos_transactions')).rows.length,1)
  await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[cashier]);await as(cashier);await assert.rejects(rpc('salon_busy_slots',[bid,start,future]),/denied/)
  await db.exec('reset role');assert.deepEqual((await db.query('select * from public.businesses where id=$1',[store])).rows,before)
  assert.deepEqual((await db.query('select * from public.pos_transactions where business_id=$1',[store])).rows,legacySales);assert.deepEqual((await db.query('select * from public.stock_movements where business_id=$1 order by id',[store])).rows,legacyStock)
  await db.query(`insert into public.salon_visits(id,business_id,actor_id,actor_name,practitioner_id,practitioner_name,customer_id,customer,kind,starts_at,ends_at,busy_until,buffer_minutes,lines,subtotal,status,finished_at)
   select gen_random_uuid(),$1,$2,'Owner',$3,'Rina',$4,'Pelanggan','appointment',$5::timestamptz,$5::timestamptz+interval '30 minutes',$5::timestamptz+interval '30 minutes',0,$6::jsonb,60000,'finished',$5::timestamptz+interval '30 minutes' from generate_series(1,1005)`,[bid,owner,pid,cid,start,JSON.stringify(visit.lines)])
  await as(owner);const history=await rpc('read_salon_visits',[bid,new Date(now-86400000).toISOString(),new Date(now+7*86400000).toISOString(),0,cid]);assert.ok(history.total>1000);assert.equal(history.items.length,50);const next=await rpc('read_salon_visits',[bid,new Date(now-86400000).toISOString(),new Date(now+7*86400000).toISOString(),1,cid]);assert.equal(next.items.length,50);assert.equal(next.items.some((v:any)=>history.items.some((old:any)=>old.id===v.id)),false)
  await db.exec('reset role')
  const overnight={...hours,Minggu:{open:'18:00',close:'02:00',closed:false},Senin:{open:'09:00',close:'17:00',closed:false}}
  assert.equal((await db.query<any>("select public.salon_hours_cover($1,'2026-11-08T23:00:00+07:00','2026-11-09T01:00:00+07:00') v",[overnight])).rows[0].v,true)
  assert.equal((await db.query<any>("select public.salon_hours_cover($1,'2026-11-09T01:00:00+07:00','2026-11-09T03:00:00+07:00') v",[overnight])).rows[0].v,false)
 }finally{await db.close()}
})
