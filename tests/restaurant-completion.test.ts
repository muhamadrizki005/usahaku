import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { restaurantQuote, restaurantBillingSchema } from '../lib/restaurant-billing'
import { depositMoney, depositReportCsv } from '../lib/restaurant-deposit-report'
import { restaurantTestHours } from './fixtures/restaurant-hours'

test('restaurant billing rounds per component, supports chosen tax bases and service scope, and bounds exact money',()=>{
 const settings={tax_rate:10,service_rate:5,tax_base:'net_service' as const,service_scope:'dine_in' as const,revision:1}
 assert.deepEqual(restaurantQuote(100000,'amount','10000','dine_in',settings),{discount:10000,net:90000,service:4500,serviceRate:5,tax:9450,taxBase:94500,total:103950})
 assert.equal(restaurantQuote(100000,'amount','10000','dine_in',{...settings,tax_base:'net'}).total,103500)
 assert.equal(restaurantQuote(100000,'amount','10000','takeaway',settings).total,99000)
 assert.equal(restaurantQuote(100000,'amount','10000','takeaway',{...settings,service_scope:'all'}).total,103950)
 assert.equal(restaurantQuote(100,'none','0','dine_in',{...settings,service_rate:0.5,tax_rate:0.5}).total,102)
 assert.equal(restaurantQuote(100000,'percent','100','dine_in',settings).total,0)
 assert.throws(()=>restaurantQuote(999999999999,'none','0','dine_in',settings),/batas/)
 assert.throws(()=>restaurantQuote(10,'amount','11','dine_in',settings),/melebihi/)
 assert.equal(restaurantBillingSchema.safeParse({taxRate:'100.01',serviceRate:'0',taxBase:'net',serviceScope:'all'}).success,false)
 assert.equal(depositMoney('9007199254740993'),'Rp9.007.199.254.740.993')
})

test('restaurant completion preserves legacy finances, enforces hours/payments/billing and reports DP without double counting',async()=>{
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
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && f < '202611040001').sort()) await db.exec(await readFile('supabase/migrations/' + file,'utf8'))

 const [owner,manager,a,b,other]=Array.from({length:5},()=>randomUUID())
 for(const uid of [owner,manager,a,b,other])await db.query('insert into auth.users(id) values($1)',[uid])
 const as=async(uid:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')}
 const rpc=async(name:string,args:unknown[])=> (await db.query<any>('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
 const create=async(uid:string)=>{await as(uid);const bid=await rpc('create_business_profile_for_category',['restaurant','Completion Test','Owner','081234567890','Jalan','Bandung','Jawa Barat','']);await rpc('complete_business_onboarding',[bid]);return bid}
 const bid=await create(owner),foreign=await create(other)
 await db.exec('reset role')
 for(const [uid,role]of [[manager,'admin'],[a,'cashier'],[b,'cashier']])await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Staff',$3,$4,false)",[bid,uid,uid!.slice(0,8),role])
 await as(owner)
 const tables=Array.from({length:4},()=>randomUUID()),mid=randomUUID()
 for(const [i,tid]of tables.entries())await rpc('save_restaurant_resource',[bid,'table',tid,null,randomUUID(),{name:'Meja '+i,capacity:4,active:true}])
 await rpc('save_restaurant_resource',[bid,'menu',mid,null,randomUUID(),{name:'Kopi',category:'Minuman',price:'30000',active:true,available:true}])
 const details=(tid:string|null,customer='Tamu',reservationId?:string)=>({kind:tid?'dine_in':'takeaway',tableId:tid,guests:2,customer,notes:'',stage:'new',lines:[{id:mid,quantity:2}],...(reservationId?{reservationId}:{})})
 const oid=randomUUID();await rpc('save_restaurant_order',[bid,oid,null,randomUUID(),details(null)])
 const legacy=(await rpc('pay_restaurant_order',[bid,oid,0,randomUUID(),{payment:'cash',received:'100000',discountKind:'none',discountValue:'0',confirmed:true}])).sale
 const before=(await db.query('select * from public.pos_transactions order by id')).rows
 await db.exec('reset role');await db.exec(await readFile('supabase/migrations/202611040001_restaurant_completion.sql','utf8'))
 const after=(await db.query<any>('select * from public.pos_transactions order by id')).rows.map(({service_rate,service_amount,tax_base,billing_revision,...row})=>row)
 assert.deepEqual(after,before)
 await as(owner)
 const now=Date.now(),iso=(mins:number)=>new Date(now+mins*60000).toISOString()
 const reserve=(id:string,tid:string,start:string,end:string)=>rpc('save_restaurant_reservation',[bid,id,null,randomUUID(),{tableId:tid,guests:2,customer:'Tamu',phone:'081234567890',notes:'',startsAt:start,endsAt:end}])
 await assert.rejects(reserve(randomUUID(),tables[0],iso(10),iso(100)),/jam operasional/)
 const weekdays=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']
 const hours:any=Object.fromEntries(weekdays.map(d=>[d,{open:'09:00',close:'21:00',closed:true}]))
 hours.Senin={open:'18:00',close:'02:00',closed:false}
 await rpc('save_business_hours',[bid,0,hours])
 let monday=new Date(now+86400000);while(new Date(monday.getTime()+7*3600000).getUTCDay()!==1)monday=new Date(monday.getTime()+86400000)
 const day=new Date(monday.getTime()+7*3600000).toISOString().slice(0,10),nextDay=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 const ridHours=randomUUID();await reserve(ridHours,tables[0],day+'T23:30:00+07:00',nextDay+'T01:00:00+07:00')
 await reserve(randomUUID(),tables[1],nextDay+'T00:30:00+07:00',nextDay+'T02:00:00+07:00')
 await assert.rejects(reserve(randomUUID(),tables[2],nextDay+'T02:00:00+07:00',nextDay+'T03:00:00+07:00'),/jam operasional/)
 await assert.rejects(reserve(randomUUID(),tables[2],day+'T17:30:00+07:00',day+'T19:00:00+07:00'),/jam operasional/)
 hours.Senin.close='22:00';await rpc('save_business_hours',[bid,1,hours])
 await rpc('save_restaurant_reservation',[bid,ridHours,0,randomUUID(),{tableId:tables[0],guests:2,customer:'Tamu',phone:'081234567890',notes:'Tetap tersimpan',startsAt:day+'T23:30:00+07:00',endsAt:nextDay+'T01:00:00+07:00'}])
 const available=await rpc('restaurant_reservation_availability',[bid,day+'T23:30:00+07:00',nextDay+'T01:00:00+07:00',2,ridHours])
 assert.equal(available.find((t:any)=>t.id===tables[0]).available,true);assert.equal(available.find((t:any)=>t.id===tables[2]).available,false)
 const beforePrivate=(await db.query<any>('select status from public.restaurant_reservations where id=$1',[ridHours])).rows[0].status
 assert.equal(beforePrivate,'reserved')
 await assert.rejects(rpc('restaurant_slot_within_hours',[bid,iso(10),iso(100)]),/permission denied/)
 hours.Senin.closed=true;hours.Minggu={open:'18:00',close:'02:00',closed:false};await rpc('save_business_hours',[bid,2,hours])
 const sunday=new Date(Date.parse(day+'T00:00:00Z')+6*86400000).toISOString().slice(0,10),afterSunday=new Date(Date.parse(sunday+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 assert.equal((await rpc('restaurant_reservation_availability',[bid,sunday+'T23:30:00+07:00',afterSunday+'T02:00:00+07:00',2,null])).find((t:any)=>t.id===tables[2]).available,true)
 await assert.rejects(rpc('restaurant_reservation_availability',[bid,afterSunday+'T02:00:00+07:00',afterSunday+'T03:00:00+07:00',2,null]),/jam operasional/)
 await rpc('save_business_hours',[bid,3,restaurantTestHours()])
 const settings={taxRate:'10',serviceRate:'5',taxBase:'net_service',serviceScope:'dine_in'}
 await rpc('save_restaurant_billing',[bid,0,settings])
 for(const uid of [a,b,manager,other]){await as(uid);await assert.rejects(rpc('save_restaurant_billing',[bid,1,settings]),/Owner access/)}
 await as(owner);await assert.rejects(db.query('update public.restaurant_billing_settings set tax_rate=0'),/permission denied/)
 const payments={cash:false,qris:false,transfer:false,banks:[],ewallet:true,ewallets:[{ewallet:'Dompet Uji',holder:'Restoran Uji',number:'081234567890'}]}
 await rpc('save_business_payments',[bid,0,payments,null])
 const rid=randomUUID(),request=randomUUID(),reservationDetails={tableId:tables[2],guests:2,customer:'Tamu',phone:'081234567890',notes:'',startsAt:iso(10),endsAt:iso(100)}
 await as(a)
 const booking=()=>rpc('create_restaurant_reservation_bundle',[bid,rid,request,reservationDetails,{lines:[{id:mid,quantity:2}],notes:''},{amount:'20000',payment:'ewallet',paymentRevision:1,confirmed:true}])
 const booked=await booking();assert.equal(booked.deposit_payment,'ewallet');assert.equal((await booking()).deposit_amount,20000)
 const order=(await db.query<any>('select * from public.restaurant_orders where reservation_id=$1',[rid])).rows[0]
 await rpc('arrive_restaurant_reservation',[bid,rid,1,randomUUID()])
 const payment={payment:'ewallet',received:'37750',discountKind:'amount',discountValue:'10000',confirmed:true,paymentRevision:1,billingRevision:1}
 await assert.rejects(rpc('pay_restaurant_order',[bid,order.id,1,randomUUID(),payment]),/Discount access denied/)
 await as(manager)
 await assert.rejects(rpc('pay_restaurant_order',[bid,order.id,1,randomUUID(),{...payment,paymentRevision:0}]),/Metode pembayaran berubah/)
 await assert.rejects(rpc('pay_restaurant_order',[bid,order.id,1,randomUUID(),{...payment,billingRevision:0}]),/pajak atau biaya layanan berubah/)
 const payReq=randomUUID(),paid=await rpc('pay_restaurant_order',[bid,order.id,1,payReq,payment])
 assert.equal(paid.sale.total,57750);assert.equal(paid.sale.service_amount,2500);assert.equal(paid.sale.tax_amount,5250);assert.equal(paid.sale.deposit_amount,20000);assert.equal(paid.sale.balance_received,37750)
 assert.equal((await rpc('pay_restaurant_order',[bid,order.id,1,payReq,payment])).sale.id,paid.sale.id)
 await as(owner);await rpc('cancel_restaurant_sale',[bid,paid.sale.id,'Refund penuh',true,true])
 const refunded=(await db.query<any>('select refund_amount from public.pos_transactions where id=$1',[paid.sale.id])).rows[0];assert.equal(Number(refunded.refund_amount),57750)
 const rid2=randomUUID();await reserve(rid2,tables[3],iso(20),iso(110))
 await assert.rejects(rpc('record_restaurant_deposit_checked',[bid,rid2,0,randomUUID(),10000,'cash',true,1]),/tidak aktif/)
 await rpc('save_business_payments',[bid,1,{...payments,cash:true},null])
 await assert.rejects(rpc('record_restaurant_deposit_checked',[bid,rid2,0,randomUUID(),10000,'cash',true,1]),/berubah/)
 await rpc('record_restaurant_deposit_checked',[bid,rid2,0,randomUUID(),10000,'cash',true,2])
 await rpc('close_restaurant_reservation',[bid,rid2,1,randomUUID(),'Refund DP',false,true])
 await db.exec('reset role')
 await db.query("update public.restaurant_reservations set deposit_at='2026-11-02T16:59:00Z',refunded_at='2026-11-04T03:00:00Z' where id=$1",[rid])
 await db.query("update public.pos_transactions set created_at='2026-11-02T17:01:00Z',cancelled_at='2026-11-04T03:00:00Z' where id=$1",[paid.sale.id])
 await db.query("update public.restaurant_reservations set deposit_at='2026-11-03T02:00:00Z',refunded_at='2026-11-04T04:00:00Z' where id=$1",[rid2])
 await as(owner)
 const report=(from:string,to:string,method='all')=>rpc('read_restaurant_deposit_report',[bid,from,to,method])
 const d3=await report('2026-11-03T00:00:00+07:00','2026-11-04T00:00:00+07:00')
 assert.deepEqual(d3.summary,{opening:'20000',closing:'10000',received:'10000',applied:'20000',refundReservation:'0',refundSale:'0',cashNet:'10000'})
 assert.equal(d3.outstanding[0].reservation_id,rid2);assert.equal(d3.outstanding[0].status,'cancelled')
 const d4=await report('2026-11-04T00:00:00+07:00','2026-11-05T00:00:00+07:00')
 assert.deepEqual(d4.summary,{opening:'10000',closing:'0',received:'0',applied:'0',refundReservation:'10000',refundSale:'20000',cashNet:'-30000'})
 const ewallet=await report('2026-11-03T00:00:00+07:00','2026-11-05T00:00:00+07:00','ewallet')
 assert.equal(ewallet.summary.refundReservation,'0');assert.equal(ewallet.summary.applied,'20000');assert.equal(ewallet.summary.closing,'0')
 const csv=depositReportCsv(d4,{from:'2026-11-04',to:'2026-11-04',payment:'all'},'=Unsafe name');assert.ok(csv.includes("'=Unsafe name"));assert.ok(csv.includes('Bagian DP dalam refund penjualan'))
 for(const uid of [a,b,other]){await as(uid);await assert.rejects(report('2026-11-03T00:00:00+07:00','2026-11-05T00:00:00+07:00'),/access denied/)}
 await as(owner)
 await rpc('save_restaurant_billing',[bid,1,{...settings,taxBase:'net',serviceScope:'all'}])
 const take=randomUUID();await rpc('save_restaurant_order',[bid,take,null,randomUUID(),details(null)])
 await assert.rejects(rpc('pay_restaurant_order',[bid,take,0,randomUUID(),{...payment,discountKind:'none',discountValue:'0',received:'69000',paymentRevision:2,billingRevision:1}]),/pajak atau biaya layanan berubah/)
 const takeSale=(await rpc('pay_restaurant_order',[bid,take,0,randomUUID(),{...payment,discountKind:'none',discountValue:'0',received:'69000',paymentRevision:2,billingRevision:2}])).sale
 assert.equal(takeSale.service_amount,3000);assert.equal(takeSale.tax_amount,6000);assert.equal(takeSale.total,69000)
 assert.equal(Number((await db.query<any>('select total from public.pos_transactions where id=$1',[legacy.id])).rows[0].total),60000)
 await rpc('save_business_payments',[bid,2,{...payments,cash:false,ewallet:false},null])
 const blocked=randomUUID();await rpc('save_restaurant_order',[bid,blocked,null,randomUUID(),details(null)])
 await assert.rejects(rpc('pay_restaurant_order',[bid,blocked,0,randomUUID(),{...payment,received:'69000',discountKind:'none',discountValue:'0',paymentRevision:3,billingRevision:2}]),/tidak aktif/)
 await db.exec('reset role')
 const seed="insert into public.restaurant_reservations(id,business_id,actor_id,actor_name,table_id,table_name,guests,customer,phone,starts_at,ends_at,deposit_amount,deposit_payment,deposit_at) select gen_random_uuid(),$1,$2,'Owner',$3,'Meja 0',1,'Bulk','081234567890','2030-01-02T00:00:00Z','2030-01-02T02:00:00Z',900000000000,'cash','2030-01-01T00:00:00Z' from generate_series(1,11000)"
 await db.query(seed,[bid,owner,tables[0]]);await as(owner)
 const large=await report('2030-01-01T00:00:00+07:00','2030-01-02T00:00:00+07:00')
 assert.equal(large.summary.received,'9900000000000000');assert.equal(large.summary.closing,'9900000000000000');assert.equal(large.outstanding.length,11000)
 await db.exec('reset role');await db.query(seed,[bid,owner,tables[0]]);await as(owner)
 await assert.rejects(report('2030-01-01T00:00:00+07:00','2030-01-02T00:00:00+07:00'),/Report too large/)
 assert.ok(foreign)
 }finally{await db.close()}
})
