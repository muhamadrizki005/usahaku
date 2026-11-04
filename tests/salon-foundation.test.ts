import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir,readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { salonServiceSchema,salonPractitionerSchema,salonFailure } from '../lib/salon'
import { categoryFromSlug,businessSlug } from '../lib/business-categories'
import { defaultBusinessHours } from '../lib/business-profile'

test('salon category, prices, durations, optional schedule and safe retry messages',()=>{
  assert.equal(categoryFromSlug('barbershop'),'barbershop');assert.equal(businessSlug('barbershop'),'barbershop')
  const service={name:' Potong rambut ',price:'50000',duration:'30',active:true}
  assert.equal(salonServiceSchema.parse(service).name,'Potong rambut')
  for(const change of [{price:''},{price:'1.25'},{duration:'0'},{duration:'721'},{duration:'2.5'}])assert.equal(salonServiceSchema.safeParse({...service,...change}).success,false)
  assert.equal(salonServiceSchema.safeParse({...service,price:'0',duration:'720'}).success,true)
  const schedule=defaultBusinessHours();schedule.Senin={open:'18:00',close:'02:00',closed:false}
  assert.equal(salonPractitionerSchema.safeParse({name:'A',active:true,serviceIds:[],schedule}).success,true)
  schedule.Selasa={open:'01:00',close:'03:00',closed:false}
  assert.equal(salonPractitionerSchema.safeParse({name:'A',active:true,serviceIds:[],schedule}).success,false)
  assert.equal(salonPractitionerSchema.safeParse({name:'A',active:true,serviceIds:[],schedule:null}).success,true)
  assert.equal(salonFailure({code:'ETIMEDOUT'}).uncertain,true)
  assert.equal(salonFailure({code:'PT409'}).uncertain,undefined)
  assert.match(salonFailure({code:'23505',message:'salon_service_name'}).error!,/Nama sudah/)
})

test('salon migration preserves existing data and enforces canonical category, resources, atomic skills/schedules, replay and role/tenant boundaries',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
  alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
  grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)
  const migration='202611040002_salon_foundation.sql'
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
  const [owner,manager,cashier,other,storeOwner,restaurantOwner,staff,custom]=Array.from({length:8},()=>randomUUID())
  for(const id of [owner,manager,cashier,other,storeOwner,restaurantOwner,staff,custom])await db.query('insert into auth.users(id) values($1)',[id])
  await db.query(`update auth.users set raw_app_meta_data='{"account_type":"staff"}' where id=$1`,[staff])
  const as=async(id:string,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)}
  const rpc=async(name:string,args:unknown[])=> (await db.query<any>('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
  const create=async(category:string)=>rpc('create_business_profile_with_map',[category,'Usaha Uji','Pemilik','081234567890','Jalan Uji','Bandung','Jawa Barat','','','',null,null])
  await as(storeOwner);const store=await create('store');await rpc('complete_business_onboarding',[store])
  await as(restaurantOwner);const restaurant=await create('restaurant');await rpc('complete_business_onboarding',[restaurant])
  await db.exec('reset role');const before=(await db.query('select * from public.businesses order by id')).rows
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'))
  assert.deepEqual((await db.query('select * from public.businesses order by id')).rows,before)
  await as(staff);await assert.rejects(create('barbershop'),/Staff/)
  await as(owner);const bid=await create('barbershop');assert.equal((await rpc('read_salon_foundation',[bid])).services.length,0)
  const save=async(resource:string,id:string,revision:number|null,details:unknown,request=randomUUID())=>rpc('save_salon_resource',[bid,resource,id,revision,request,details])
  const sid=randomUUID(),pid=randomUUID(),s={name:'Potong Rambut',price:'50000',duration:'30',active:true}
  await save('service',sid,null,s)
  await db.exec('reset role');await db.query("insert into public.business_roles(business_id,name,permissions) values($1,'Pengamat','[\"products:view\"]')",[bid]);for(const [id,role]of [[manager,'admin'],[cashier,'cashier'],[custom,'Pengamat']])await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Uji',$3,$4,false)",[bid,id,id.slice(0,8),role])
  await as(manager);await assert.rejects(rpc('read_salon_foundation',[bid]),/access denied/)
  await as(owner);await rpc('complete_business_onboarding',[bid]);await assert.rejects(create('store'),/already belongs/)
  const schedule=defaultBusinessHours();schedule.Minggu={open:'18:00',close:'02:00',closed:false}
  const p={name:'Rina',active:true,serviceIds:[sid],schedule},request=randomUUID()
  const created=await save('practitioner',pid,null,p,request);assert.equal(created.revision,1);assert.deepEqual(created.service_ids,[sid])
  assert.deepEqual(await save('practitioner',pid,null,p,request),created)
  await assert.rejects(save('practitioner',pid,null,{...p,name:'Lain'},request),/Request ID/)
  const invalidHours=structuredClone(schedule);invalidHours.Senin={open:'01:00',close:'03:00',closed:false}
  await assert.rejects(save('practitioner',pid,1,{...p,name:'Tidak Boleh Tersimpan',schedule:invalidHours}),/schedule/)
  assert.equal((await rpc('read_salon_foundation',[bid])).practitioners[0].name,'Rina')
  await assert.rejects(save('practitioner',pid,1,{...p,serviceIds:[randomUUID()]}),/services/)
  await assert.rejects(save('practitioner',pid,1,{...p,serviceIds:[sid,sid]}),/services/)
  await assert.rejects(save('service',randomUUID(),null,{...s,name:'potong rambut'}),/salon_service_name/)
  await as(manager);await save('service',sid,1,{...s,price:'60000'});await save('practitioner',pid,1,{...p,schedule:null})
  await assert.rejects(save('service',sid,1,s),/changed/)
  await as(cashier);assert.equal((await rpc('read_salon_foundation',[bid])).services[0].price,60000)
  await assert.rejects(save('service',randomUUID(),null,s),/access denied/)
  await assert.rejects(save('practitioner',pid,2,p),/access denied/)
  await assert.rejects(db.query('update public.salon_services set price=1 where id=$1',[sid]),/permission denied/)
  assert.equal((await db.query('select * from public.salon_audit')).rows.length,0)
  await as(custom);await assert.rejects(rpc('read_salon_foundation',[bid]),/access denied/)
  await as(other);const otherBid=await create('barbershop');await rpc('complete_business_onboarding',[otherBid])
  await assert.rejects(rpc('read_salon_foundation',[bid]),/access denied/);assert.equal((await db.query('select * from public.salon_services where business_id=$1',[bid])).rows.length,0)
  await assert.rejects(save('service',sid,2,s),/access denied/)
  const foreign=await rpc('save_salon_resource',[otherBid,'service',randomUUID(),null,randomUUID(),{...s,name:'Layanan Luar'}])
  await as(owner);await assert.rejects(save('practitioner',pid,2,{...p,serviceIds:[foreign.id]}),/services/)
  await save('service',sid,2,{...s,active:false});await as(cashier);assert.equal((await rpc('read_salon_foundation',[bid])).services.length,0);assert.deepEqual((await rpc('read_salon_foundation',[bid])).practitioners[0].service_ids,[])
  await as(owner);assert.deepEqual((await rpc('read_salon_foundation',[bid])).practitioners[0].service_ids,[sid]);await save('service',sid,3,s)
  await save('practitioner',pid,2,{...p,active:false});await as(cashier);assert.equal((await rpc('read_salon_foundation',[bid])).practitioners.length,0)
  await db.exec('reset role');await db.query('update public.business_members set must_change_password=true where user_id=$1',[manager]);await as(manager);await assert.rejects(rpc('read_salon_foundation',[bid]),/access denied/)
  await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[cashier]);await as(cashier);await assert.rejects(rpc('read_salon_foundation',[bid]),/access denied/)
  await as(storeOwner);await assert.rejects(rpc('save_salon_resource',[store,'service',randomUUID(),null,randomUUID(),s]),/access denied/)
  await as(restaurantOwner);await assert.rejects(rpc('read_salon_foundation',[restaurant]),/access denied/)
  await db.exec('reset role');await db.query("insert into public.salon_services(id,business_id,name,price,duration_minutes,active) select gen_random_uuid(),$1,'Layanan '||v,1,1,true from generate_series(1,1005) v",[bid])
  await as(owner);assert.equal((await rpc('read_salon_foundation',[bid])).services.length,1006)
  await db.exec('reset role');await db.query("insert into public.salon_services(id,business_id,name,price,duration_minutes,active) select gen_random_uuid(),$1,'Batas '||v,1,1,true from generate_series(1,3994) v",[bid]);await as(owner)
  await assert.rejects(save('service',randomUUID(),null,{...s,name:'Melebihi batas'}),/limit reached/)
  assert.equal((await rpc('read_salon_foundation',[bid])).services.length,5000)
  await db.exec('reset role');assert.deepEqual((await db.query('select * from public.businesses where id=any($1) order by id',[[store,restaurant]])).rows,before)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from public.salon_audit where business_id=$1',[bid])).rows[0].n,7)
 }finally{await db.close()}
})
