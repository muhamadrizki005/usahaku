import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { quantity, adjustedStock, productSchema } from '../lib/catalog'

test('quantity parsing rejects rounding, exponent and non-finite input; decimal addition stays exact',()=>{
  assert.equal(quantity('0,250'),'0.250');assert.equal(adjustedStock(0.1,'0.2'),0.3)
  for(const value of ['0.0001','1e3','NaN','Infinity','-1','9999999999'])assert.throws(()=>quantity(value))
  assert.equal(quantity('-0.125',true),'-0.125')
  assert.equal(productSchema.safeParse({name:'A',category:'B',unit:'kg',sku:'',barcode:'0001',price:'1.5',minimum:0,initialStock:0,active:true}).success,false)
})

test('catalog SQL enforces exact stock, idempotency, revisions, audit and tenant/role boundaries',async()=>{
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
    for(const file of ['202610200001_foundation.sql','202610210001_profile_setup.sql','202610220001_catalog_inventory.sql','202610220002_bulk_catalog.sql','202610220003_product_image_policy.sql','202610230003_auto_product_sku.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
    const a=randomUUID(),b=randomUUID(),admin=randomUUID(),cashier=randomUUID()
    for(const id of [a,b,admin,cashier])await db.query('insert into auth.users(id) values($1)',[id])
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    await as(a);const bidA=(await db.query<any>("select public.create_business('A Store','Owner A') as id")).rows[0].id
    await as(b);const bidB=(await db.query<any>("select public.create_business('B Store','Owner B') as id")).rows[0].id
    await db.exec('reset role')
    for(const [id,role] of [[admin,'admin'],[cashier,'cashier']])await db.query("insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,$3,$4)",[bidA,id,role,role])
    const p=randomUUID(),key=randomUUID()
    const details={name:'Beras',category:'Sembako',unit:'kg',sku:'BRS',barcode:'00123',price:'12000',minimum:'0.250',initialStock:'1.250',active:true}
    const save=(bid:string,id:string,rev:number|null,k:string,d=details)=>db.query<any>('select public.save_catalog_product($1,$2,$3,$4,$5) as p',[bid,id,rev,k,d])
    const move=(rev:number,k:string,amount:string,kind='adjustment',bid=bidA)=>db.query<any>('select public.move_catalog_stock($1,$2,$3,$4,$5,$6,$7) as p',[bid,p,rev,k,amount,kind,'Hitung ulang rak'])
    await as(a);const initial=(await save(bidA,p,null,key)).rows[0].p
    assert.equal(Number(initial.stock),1.25)
    assert.deepEqual((await save(bidA,p,null,key)).rows[0].p,initial)
    assert.equal((await db.query('select * from public.stock_movements')).rows.length,1)
    await assert.rejects(save(bidA,p,null,key,{...details,name:'Other'}),/Request ID already used/)
    const mk=randomUUID();assert.equal(Number((await move(0,mk,'-0.250')).rows[0].p.stock),1)
    assert.equal(Number((await move(0,mk,'-0.250')).rows[0].p.stock),1)
    await assert.rejects(move(0,randomUUID(),'0.5'),/Stock changed/)
    await assert.rejects(move(1,randomUUID(),'-1.001'),/negative/)
    await assert.rejects(move(1,randomUUID(),'0.0001'),/3 decimal/)
    await assert.rejects(move(1,randomUUID(),'NaN'),/3 decimal/)
    await assert.rejects(move(1,randomUUID(),'-1','in'),/Invalid stock/)
    await assert.rejects(db.query("update public.catalog_products set stock=999"),/permission denied/)
    await assert.rejects(db.query("delete from public.stock_movements"),/permission denied/)
    await assert.rejects(save(bidA,p,0,randomUUID(),{...details,initialStock:'1'}),/use inventory/)
    await assert.rejects(save(bidA,p,0,randomUUID(),{...details,unit:'pcs',initialStock:'0'}),/Unit is fixed/)
    await assert.rejects(save(bidA,randomUUID(),null,randomUUID(),{...details,sku:'brs'}),/unique/)
    await assert.rejects(save(bidA,randomUUID(),null,randomUUID(),{...details,sku:'Other'}),/unique/)
    await as(admin);const updated=(await save(bidA,p,0,randomUUID(),{...details,name:'Beras Baru',initialStock:'0'})).rows[0].p
    assert.equal(updated.name,'Beras Baru');await move(1,randomUUID(),'0,125','in')
    assert.equal(Number((await move(2,randomUUID(),'-0.125','out')).rows[0].p.stock),1)
    await assert.rejects(save(bidA,p,0,randomUUID(),{...details,initialStock:'0'}),/Product changed/)
    await as(b);assert.equal((await db.query('select * from public.catalog_products')).rows.length,0)
    await assert.rejects(move(2,randomUUID(),'1'),/access denied/)
    await assert.rejects(save(bidB,p,1,randomUUID(),{...details,initialStock:'0'}),/access denied/)
    await as(cashier);assert.equal((await db.query('select * from public.catalog_products')).rows.length,1)
    assert.equal((await db.query('select * from public.stock_movements')).rows.length,0)
    await assert.rejects(move(2,randomUUID(),'1'),/access denied/)
    await as(a)
    const image=randomUUID();const path=(await db.query<any>('select public.reserve_product_image($1,$2,$3) as path',[bidA,p,image])).rows[0].path
    await assert.rejects(db.query('select public.set_product_image($1,$2,$3,$4)',[bidA,p,1,image]),/not uploaded/)
    await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('product-images',$1,'{\"mimetype\":\"image/png\",\"size\":10}')",[path])
    await as(admin);await db.query('select public.set_product_image($1,$2,$3,$4)',[bidA,p,1,image])
    assert.equal((await db.query("select * from storage.objects where bucket_id='product-images'")).rows.length,1)
    await as(b);assert.equal((await db.query("select * from storage.objects where bucket_id='product-images'")).rows.length,0)
    await as(cashier);assert.equal((await db.query("select * from storage.objects where bucket_id='product-images'")).rows.length,1)
    await db.exec('reset role');await db.exec('set role service_role')
    assert.equal((await db.query<any>('select public.claim_product_image_cleanup($1) as path',[image])).rows[0].path,null)
    await as(a);await db.query('select public.set_product_image($1,$2,$3,null)',[bidA,p,2])
    await db.exec('reset role');await db.exec('set role service_role')
    assert.equal((await db.query<any>('select public.claim_product_image_cleanup($1) as path',[image])).rows[0].path,path)
    await as(a);await assert.rejects(db.query('select public.set_product_image($1,$2,$3,$4)',[bidA,p,3,image]),/Invalid image candidate/)
    const q=randomUUID();await save(bidA,q,null,randomUUID(),{...details,sku:'Q',barcode:'Q'})
    await assert.rejects(db.query('select public.bulk_catalog_products($1,$2,$3,null,false)',[bidA,randomUUID(),[{id:p,revision:3},{id:q,revision:99}]]),/Product changed/)
    assert.equal((await db.query<any>('select active from public.catalog_products where id=$1',[p])).rows[0].active,true)
    await db.query('select public.bulk_catalog_products($1,$2,$3,null,false)',[bidA,randomUUID(),[{id:p,revision:3},{id:q,revision:0}]])
    await as(cashier);assert.equal((await db.query('select * from public.catalog_products')).rows.length,0)
    await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[admin])
    await as(admin);assert.equal((await db.query('select * from public.catalog_products')).rows.length,0)
    await assert.rejects(move(2,randomUUID(),'1'),/access denied/)
  }finally{await db.close()}
})
