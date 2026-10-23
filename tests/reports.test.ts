import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {defaultReportFilter,parseReportFilter,reportBounds,reportSummary,rankProducts,reportCsv,reportUnits,type ReportData} from '../lib/reports'
import type {Sale} from '../lib/pos'
test('report SQL snapshot, WIB boundaries, refund timing, role/tenant and row limit',async()=>{const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)
    for(const file of ['202610200001_foundation.sql','202610210001_profile_setup.sql','202610220001_catalog_inventory.sql','202610220002_bulk_catalog.sql','202610220003_product_image_policy.sql','202610220004_pos_transactions.sql','202610220005_customers.sql','202610230001_sales_reports.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
    const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),cashier=randomUUID()
    for(const id of [owner,other,admin,cashier])await db.query('insert into auth.users(id) values($1)',[id])
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    await as(owner);const bid=(await db.query<any>("select public.create_business('Report A','Owner') id")).rows[0].id
    await as(other);const bid2=(await db.query<any>("select public.create_business('Report B','Other') id")).rows[0].id
    await db.exec('reset role');for(const [id,role] of [[admin,'admin'],[cashier,'cashier']])await db.query('insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,$3,$3)',[bid,id,role])
    const p=randomUUID()
    const seed=async(date:string,payment='cash',business=bid,cancelled:string|null=null)=>db.query(`insert into public.pos_transactions(business_id,actor_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,created_at,status,cancelled_at,cancellation_reason,refund_amount) values($1,$2,'Owner','Umum',$3,1000,'amount',100,100,900,$4,900,0,$5,$6,$7,$8,$9)`,[business,owner,[{id:p,name:'A',sku:'A',unit:'kg',price:4000,quantity:0.25,total:1000}],payment,date,cancelled?'cancelled':'completed',cancelled,cancelled?'Uji pembatalan':null,cancelled?900:null])
    await seed('2026-10-21T16:59:59.999Z');await seed('2026-10-21T17:00:00Z');await seed('2026-10-22T16:59:59.999Z','qris');await seed('2026-10-22T17:00:00Z');await seed('2026-10-22T02:00:00Z','cash',bid,'2026-10-23T01:00:00Z');await seed('2026-10-20T01:00:00Z','cash',bid,'2026-10-22T01:00:00Z');await seed('2026-10-22T01:00:00Z','cash',bid2)
    const start='2026-10-21T17:00:00Z',end='2026-10-22T17:00:00Z'
    const read=(business=bid,method='all',from=start,to=end)=>db.query<any>('select public.read_sales_report($1,$2,$3,$4) report',[business,from,to,method])
    await as(owner);const result=(await read()).rows[0].report as ReportData
    assert.equal(result.sales.length,3);assert.equal(result.refunds.length,1)
    const summary=reportSummary(result);assert.equal(summary.net,BigInt(1800));assert.equal(summary.discount,BigInt(200));assert.equal(summary.units,BigInt(500));assert.equal(summary.refund,BigInt(900));assert.equal(summary.cancelled,1)
    assert.equal((await read(bid,'qris')).rows[0].report.sales.length,1);assert.equal((await read(bid,'transfer')).rows[0].report.sales.length,0)
    await as(admin);assert.equal((await read()).rows[0].report.sales.length,3)
    await assert.rejects(read(bid,'all','2026-10-21T00:00:00Z'),/Invalid report/)
    await assert.rejects(read(bid,'all',end,start),/Invalid report/)
    await assert.rejects(read(bid,'all','2024-01-01T17:00:00Z',end),/Invalid report/)
    await assert.rejects(read(bid,'unknown'),/Invalid report/)
    await as(cashier);await assert.rejects(read(),/access denied/)
    await as(other);await assert.rejects(read(),/access denied/);assert.equal((await read(bid2)).rows[0].report.sales.length,1)
    await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[admin]);await as(admin);await assert.rejects(read(),/access denied/)
    await db.exec('reset role');await db.query('update public.business_members set must_change_password=true where user_id=$1',[owner]);await as(owner);await assert.rejects(read(),/access denied/)
    await db.exec('reset role');await db.exec('set role anon');await assert.rejects(read(),/permission denied/)
    await db.exec('reset role');await db.query('update public.business_members set must_change_password=false where user_id=$1',[owner])
    await db.query(`insert into public.pos_transactions(business_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,created_at) select $1,'Bulk','Umum','[]',1,'none',0,0,1,'transfer',1,0,'2026-10-22T01:00:00Z' from generate_series(1,1001)`,[bid])
    await as(owner);assert.equal((await read(bid,'transfer')).rows[0].report.sales.length,1001)
    await db.exec('reset role');await db.query(`insert into public.pos_transactions(business_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,created_at) select $1,'Bulk','Umum','[]',1,'none',0,0,1,'transfer',1,0,'2026-10-22T01:00:00Z' from generate_series(1,19000)`,[bid]);await as(owner);await assert.rejects(read(bid,'transfer'),/too large/)
  }finally{await db.close()}})

test('report filters, exact money/quantities, ranking and CSV formula injection',()=>{
  assert.deepEqual(defaultReportFilter(new Date('2026-10-22T17:01:00Z')),{from:'2026-10-17',to:'2026-10-23',payment:'all'})
  assert.deepEqual(reportBounds(parseReportFilter({from:'2026-10-22',to:'2026-10-22'})),{start:'2026-10-21T17:00:00.000Z',end:'2026-10-22T17:00:00.000Z'})
  for(const query of [{from:'2026-02-30'},{from:'2026-13-01'},{from:'2026-10-23',to:'2026-10-22'},{from:['2026-01-01']},{payment:'wallet'},{from:'2024-01-01',to:'2026-01-01'}])assert.throws(()=>parseReportFilter(query))
  const make=(id:string,total:number,qty:number,name:string)=>({id,created_at:'2026-10-22T00:00:00Z',status:'completed',subtotal:total,discount:0,total,payment:'cash',actor_name:'=HYPERLINK("x")',customer:'\t@SUM(1)',lines:[{id,name,sku:'-2+1',unit:'kg',quantity:qty,price:total, total}]} as Sale)
  const data:ReportData={generatedAt:'2026-10-22T00:00:00Z',sales:[make('a',100,0.25,'=CMD()'),make('b',200,0.125,'A, "quoted"')],refunds:[]}
  assert.equal(rankProducts(data,'quantity')[0].id,'a');assert.equal(rankProducts(data,'gross')[0].id,'b');assert.equal(reportUnits(reportSummary(data).units),'0,375')
  const huge:ReportData={...data,sales:Array.from({length:10000},()=>make('p',999999999999,999999999.999,'P'))}
  assert.equal(reportSummary(huge).net,BigInt('9999999999990000'));assert.equal(reportSummary(huge).units,BigInt('9999999999990000'))
  const csv=reportCsv(data,parseReportFilter({from:'2026-10-22',to:'2026-10-22'}),'Usaha')
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=CMD()"'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"A, ""quoted"""'));assert.ok(csv.includes('"\'\t@SUM(1)"'))
})
