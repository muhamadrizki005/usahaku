import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {lineAmount,quote,salesSummary,type Sale} from '../lib/pos'
test('rupiah rounds each fractional line half up; percent discounts and WIB days match database rules',()=>{
  assert.equal(lineAmount(1,0.5),1)
  assert.equal(lineAmount(10001,0.25),2500)
  assert.deepEqual(quote([{product:{price:10001},quantity:0.25}],'percent','10'),{subtotal:2500,discount:250,total:2250})
  assert.throws(()=>quote([{product:{price:1},quantity:1}],'percent','100.01'))
  assert.throws(()=>quote([{product:{price:1},quantity:1}],'amount','1.01'))
  assert.throws(()=>quote([{product:{price:999999999999},quantity:2}],'none','0'))
  const base={status:'completed',lines:[{id:'p',name:'A',quantity:0.125,total:1250}],total:1000} as Sale
  const summary=salesSummary([{...base,created_at:'2026-10-21T17:01:00Z'},{...base,created_at:'2026-10-21T16:59:00Z'},{...base,status:'cancelled',created_at:'2026-10-22T10:00:00Z'}],new Date('2026-10-22T12:00:00Z'))
  assert.equal(summary.revenue,1000);assert.equal(summary.count,1);assert.equal(summary.units,0.125);assert.equal(summary.daily[5],1000);assert.equal(summary.daily[6],1000);assert.equal(summary.best[0].units,0.25)
})
test('POS atomic checkout, payment, own-history isolation, idempotency and cancellation',async()=>{const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)
    for(const file of ['202610200001_foundation.sql','202610210001_profile_setup.sql','202610220001_catalog_inventory.sql','202610220002_bulk_catalog.sql','202610220003_product_image_policy.sql','202610220004_pos_transactions.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'))

    const owner=randomUUID(),other=randomUUID(),cashier=randomUUID(),cashier2=randomUUID(),admin=randomUUID()
    for(const id of [owner,other,cashier,cashier2,admin])await db.query('insert into auth.users(id) values($1)',[id])
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    await as(owner);const bid=(await db.query<any>("select public.create_business('POS A','Owner') id")).rows[0].id
    await as(other);const bid2=(await db.query<any>("select public.create_business('POS B','Other') id")).rows[0].id
    await db.exec('reset role');for(const [id,role,name] of [[cashier,'cashier','Kasir 1'],[cashier2,'cashier','Kasir 2'],[admin,'admin','Admin']])await db.query("insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,replace(lower($3),' ',''),$4)",[bid,id,name,role])
    const p=randomUUID(),q=randomUUID();await as(owner)
    for(const [id,sku] of [[p,'P'],[q,'Q']])await db.query('select public.save_catalog_product($1,$2,null,$3,$4)',[bid,id,randomUUID(),{name:sku,category:'A',unit:'kg',sku,barcode:sku,price:'10001',initialStock:'2',minimum:'0',active:true}])
    const detail=(payment='cash',qty='0.250')=>({lines:[{id:p,quantity:qty,price:'10001',revision:0}],payment,received:payment==='cash'?'3000':'2500',discountKind:'none',discountValue:'0',customer:'Umum',confirmed:true})
    const checkout=(d=detail(),key=randomUUID(),business=bid)=>db.query<any>('select public.checkout_pos($1,$2,$3) sale',[business,key,d])
    const cancel=(id:string,goods=true,refund=true,business=bid)=>db.query<any>('select public.cancel_pos($1,$2,$3,$4,$5) sale',[business,id,'Salah pindai',goods,refund])
    await as(cashier);const key=randomUUID();const sale=(await checkout(detail(),key)).rows[0].sale
    assert.equal(Number(sale.total),2500);assert.equal(Number(sale.change),500);assert.equal(sale.actor_name,'Kasir 1')
    assert.equal((await checkout(detail(),key)).rows[0].sale.id,sale.id)
    assert.equal(Number((await db.query<any>('select stock from public.catalog_products where id=$1',[p])).rows[0].stock),1.75)
    await assert.rejects(checkout({...detail(),discountKind:'amount',discountValue:'1'}),/Discount access denied/)
    await assert.rejects(checkout({...detail(),received:'2499'}),/received/)
    await assert.rejects(checkout({...detail(),confirmed:false}),/Invalid checkout/)
    await assert.rejects(checkout({...detail(),lines:[{id:p,quantity:'0.2501',price:'10001',revision:0}]}),/3 decimal/)
    await assert.rejects(checkout({...detail(),lines:[{id:p,quantity:'9',price:'10001',revision:0}]}),/Insufficient stock/)
    await assert.rejects(checkout({...detail(),lines:[{id:p,quantity:'1',price:'1',revision:0}]}),/Price changed/)
    await assert.rejects(cancel(sale.id),/access denied/)
    await assert.rejects(db.query('update public.pos_transactions set total=0'),/permission denied/)
    await as(cashier2);assert.equal((await db.query('select * from public.pos_transactions')).rows.length,0)
    await assert.rejects(checkout(detail(),key),/Request ID/)
    await checkout(detail('qris'));assert.equal((await db.query('select * from public.pos_transactions')).rows.length,1)
    await as(other);assert.equal((await db.query('select * from public.pos_transactions')).rows.length,0)
    await assert.rejects(checkout(detail(),randomUUID(),bid),/access denied/)
    await assert.rejects(cancel(sale.id,true,true,bid2),/access denied/)
    await as(admin);assert.equal((await db.query('select * from public.pos_transactions')).rows.length,2)
    await assert.rejects(cancel(sale.id,false),/Confirm/)
    await assert.rejects(cancel(sale.id,true,false),/Confirm/)
    const cancelled=(await cancel(sale.id)).rows[0].sale;assert.equal(cancelled.status,'cancelled');assert.equal(Number(cancelled.refund_amount),2500)
    await cancel(sale.id);assert.equal(Number((await db.query<any>('select stock from public.catalog_products where id=$1',[p])).rows[0].stock),1.75)
    await as(cashier);assert.equal((await checkout(detail(),key)).rows[0].sale.status,'cancelled');await as(admin)
    const transfer=(await checkout({...detail('transfer'),discountKind:'percent',discountValue:'10',received:'2250'})).rows[0].sale
    assert.equal(Number(transfer.discount),250);assert.equal(Number(transfer.total),2250)
    const multi={...detail(),lines:[{id:p,quantity:'0.125',price:'10001',revision:0},{id:q,quantity:'0.125',price:'10001',revision:0}],received:'3000'}
    const m=(await checkout(multi)).rows[0].sale;assert.equal(m.lines.length,2);assert.equal(Number(m.total),2500)
    await assert.rejects(checkout({...multi,lines:[multi.lines[0],multi.lines[0]]}),/Duplicate/)
    const stockBefore=(await db.query<any>('select stock from public.catalog_products where id=$1',[p])).rows[0].stock
    await assert.rejects(checkout({...multi,lines:[multi.lines[0],{...multi.lines[1],quantity:'99'}]}),/Insufficient/)
    assert.equal((await db.query<any>('select stock from public.catalog_products where id=$1',[p])).rows[0].stock,stockBefore)
    await db.exec('reset role');assert.equal((await db.query("select * from public.stock_movements where sale_id is not null")).rows.length,6)
    await as(owner);await db.query('select public.save_catalog_product($1,$2,0,$3,$4)',[bid,p,randomUUID(),{name:'New name',category:'A',unit:'kg',sku:'P',barcode:'P',price:'12345',initialStock:'0',minimum:'0',active:true}])
    assert.equal((await db.query<any>('select lines from public.pos_transactions where id=$1',[sale.id])).rows[0].lines[0].name,'P')
    await assert.rejects(checkout(),/Price changed/)
    await db.exec('reset role');await db.query('update public.catalog_products set stock=999999999.999 where id=$1',[p]);await as(owner)
    await assert.rejects(cancel(transfer.id),/exceeds limit/)
    assert.equal((await db.query<any>('select status from public.pos_transactions where id=$1',[transfer.id])).rows[0].status,'completed')
    await db.exec('reset role')
    await db.query('update public.business_members set active=false where user_id=$1',[cashier])
    await as(cashier);assert.equal((await db.query('select * from public.pos_transactions')).rows.length,0);await assert.rejects(checkout(),/access denied/)
  }finally{await db.close()}})

