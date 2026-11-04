import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { restaurantTestHours } from './fixtures/restaurant-hours'
import { reservationBalance, reservationIso, reservationLocalTime, reservationSchema } from '../lib/restaurant-reservations'

test('reservation dates use WIB, reject invalid calendars and preserve exact deposit arithmetic', () => {
  assert.equal(reservationIso('2026-11-03T19:00'), '2026-11-03T12:00:00.000Z')
  assert.equal(reservationLocalTime('2026-11-03T12:00:00Z'), '2026-11-03T19:00')
  assert.throws(() => reservationIso('2026-02-30T19:00'))
  assert.equal(reservationBalance(180000, 50000), 130000)
  assert.throws(() => reservationBalance(49000,50000))
  assert.equal(reservationSchema.safeParse({ tableId: randomUUID(), guests: 2, customer: 'Tamu', phone: '081234567890', notes: '', startsAt: '2026-11-03T19:00:00+07:00', endsAt: '2026-11-03T18:00:00+07:00' }).success, false)
})

test('restaurant reservations enforce slot/capacity, own cashier scope, atomic DP settlement/refund and preserve old sales', async () => {
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
    const [owner,a,b,other] = Array.from({length:4},()=>randomUUID())
    for(const id of [owner,a,b,other]) await db.query('insert into auth.users(id) values($1)',[id])
    const as = async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    const create = async(id:string)=>{await as(id);const bid=(await db.query<any>("select public.create_business_profile_for_category('restaurant','Resto','Owner','081234567890','Jalan','Bandung','Jawa Barat','') id")).rows[0].id;await db.query('select public.save_business_hours($1,0,$2)',[bid,restaurantTestHours()]);await db.query('select public.complete_business_onboarding($1)',[bid]);return bid}
    const bid=await create(owner),foreign=await create(other)
    await db.exec('reset role')
    for(const [uid,name] of [[a,'kasira'],[b,'kasirb']]) await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,$3,$3,'cashier',false)",[bid,uid,name])
    const tid=randomUUID(),mid=randomUUID()
    await as(owner)
    for(const [kind,id,details] of [['table',tid,{name:'Meja 1',capacity:4,active:true}],['menu',mid,{name:'Kopi',category:'Minuman',price:'30000',active:true,available:true}]] as const) await db.query('select public.save_restaurant_resource($1,$2,$3,null,$4,$5)',[bid,kind,id,randomUUID(),details])
    const now=(await db.query<any>('select now() value')).rows[0].value
    const date=new Date(now).getTime(),start=new Date(date+5*60000).toISOString(),end=new Date(date+95*60000).toISOString()
    const details={tableId:tid,guests:2,customer:'Tamu Reservasi',phone:'081234567890',notes:'Dekat jendela',startsAt:start,endsAt:end}
    const rid=randomUUID(),req=randomUUID()
    const save=(id=rid,rev:number|null=null,d=details,op=randomUUID())=>db.query<any>('select public.save_restaurant_reservation($1,$2,$3,$4,$5) value',[bid,id,rev,op,d]).then(r=>r.rows[0].value)
    await as(a);const r=await save(rid,null,details,req);assert.equal((await save(rid,null,details,req)).id,rid)
    await assert.rejects(db.query('select public.close_restaurant_reservation($1,$2,0,$3,$4,true,false)',[bid,rid,randomUUID(),'Belum datang']),/toleransi/)
    await assert.rejects(save(randomUUID()),/sudah memiliki reservasi/)
    await assert.rejects(save(randomUUID(),null,{...details,guests:5}),/Kapasitas/)
    await as(b);assert.equal((await db.query('select id from public.restaurant_reservations')).rows.length,0)
    await assert.rejects(save(rid,0),/access denied/)
    const availability=(await db.query<any>('select public.restaurant_reservation_availability($1,$2,$3,2,null) value',[bid,start,end])).rows[0].value
    assert.equal(availability[0].available,false);assert.equal('customer' in availability[0],false)
    await as(other);await assert.rejects(db.query('select public.read_restaurant_reservations($1,$2,0)',[bid,start.slice(0,10)]),/access denied/)
    await as(a);const dpReq=randomUUID()
    const deposit=(op=dpReq)=>db.query<any>("select public.record_restaurant_deposit($1,$2,0,$3,20000,'transfer',true) value",[bid,rid,op]).then(r=>r.rows[0].value)
    const withDp=await deposit();assert.equal(withDp.deposit_amount,20000);assert.equal((await deposit()).revision,1)
    await assert.rejects(deposit(randomUUID()),/changed/)
    await assert.rejects(db.query('select public.close_restaurant_reservation($1,$2,1,$3,$4,false,true)',[bid,rid,randomUUID(),'Batal pelanggan']),/Owner\/admin/)
    await as(owner);await assert.rejects(db.query("select public.save_restaurant_resource($1,'table',$2,0,$3,$4)",[bid,tid,randomUUID(),{name:'Meja 1',capacity:1,active:true}]),/reservasi aktif/)
    await assert.rejects(db.query('select public.close_restaurant_reservation($1,$2,1,$3,$4,false,false)',[bid,rid,randomUUID(),'Batal pelanggan']),/refund DP penuh/)
    assert.equal((await db.query<any>('select status from public.restaurant_reservations where id=$1',[rid])).rows[0].status,'reserved')
    const order={kind:'dine_in',tableId:tid,guests:2,customer:details.customer,notes:'',stage:'new',lines:[{id:mid,quantity:2}],reservationId:rid},oid=randomUUID(),orderReq=randomUUID()
    await as(a)
    await assert.rejects(db.query('select public.save_restaurant_order_before_reservations($1,$2,null,$3,$4)',[bid,randomUUID(),randomUUID(),order]),/permission denied/)
    await assert.rejects(db.query('select public.pay_restaurant_order_before_reservations($1,$2,0,$3,$4)',[bid,oid,randomUUID(),{}]),/permission denied/)
    await assert.rejects(db.query('select public.save_restaurant_order($1,$2,null,$3,$4)',[bid,randomUUID(),randomUUID(),{...order,reservationId:undefined}]),/reservasi/)
    const opened=(await db.query<any>('select public.save_restaurant_order($1,$2,null,$3,$4) value',[bid,oid,orderReq,order])).rows[0].value;assert.equal(opened.reservation_id,rid)
    await assert.rejects(db.query('select public.cancel_restaurant_order($1,$2,0,$3)',[bid,oid,'Tamu batal']),/Reservasi/)
    const payReq=randomUUID(),payment={payment:'cash',received:'50000',discountKind:'none',discountValue:'0',confirmed:true}
    const pay=()=>db.query<any>('select public.pay_restaurant_order($1,$2,1,$3,$4) value',[bid,oid,payReq,payment]).then(r=>r.rows[0].value)
    await assert.rejects(pay(),/Tandai pelanggan datang/)
    await db.query('select public.arrive_restaurant_reservation($1,$2,1,$3)',[bid,rid,randomUUID()])
    const paid=await pay();assert.equal(paid.sale.total,60000);assert.equal(paid.sale.received,70000);assert.equal(paid.sale.change,10000);assert.equal(paid.sale.balance_received,50000);assert.equal(paid.sale.deposit_payment,'transfer');assert.equal((await pay()).sale.id,paid.sale.id)
    assert.equal((await db.query<any>('select status from public.restaurant_reservations where id=$1',[rid])).rows[0].status,'completed')
    await as(b);assert.equal((await db.query('select id from public.pos_transactions')).rows.length,0)
    await as(owner);await db.query('select public.cancel_restaurant_sale($1,$2,$3,true,true)',[bid,paid.sale.id,'Refund penuh'])
    assert.equal(Number((await db.query<any>('select deposit_refunded from public.restaurant_reservations where id=$1',[rid])).rows[0].deposit_refunded),20000)
    await as(a);assert.equal((await pay()).sale.status,'cancelled');await as(owner)
    const rid2=randomUUID();await save(rid2);await db.query("select public.record_restaurant_deposit($1,$2,0,$3,10000,'qris',true)",[bid,rid2,randomUUID()])
    const closeReq=randomUUID();const close=()=>db.query<any>('select public.close_restaurant_reservation($1,$2,1,$3,$4,false,true) value',[bid,rid2,closeReq,'Batal dan refund']).then(r=>r.rows[0].value)
    assert.equal((await close()).deposit_refunded,10000);assert.equal((await close()).status,'cancelled')
    assert.equal(Number((await db.query<any>('select count(*) n from public.pos_transactions')).rows[0].n),1)
    assert.equal(Number((await db.query<any>('select count(*) n from public.restaurant_orders')).rows[0].n),1)
    assert.equal(Number((await db.query<any>('select count(*) n from public.catalog_products')).rows[0].n),0)
    assert.ok(foreign && r)
  } finally {await db.close()}
})
