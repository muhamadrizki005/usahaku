import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {normalizeCustomerPhone,matchesCustomer} from '../lib/customers'
test('customer isolation, guarded edits, scoped POS projection and immutable sales snapshots',async()=>{const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)
    for(const file of ['202610200001_foundation.sql','202610210001_profile_setup.sql','202610220001_catalog_inventory.sql','202610220002_bulk_catalog.sql','202610220003_product_image_policy.sql','202610220004_pos_transactions.sql','202610220005_customers.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
    for(const phone of ['', '  ', '0812-3456-7890','62 812 3456 7890','+6281234567890','+1 (202) 555-0123'])assert.equal((await db.query<any>('select public.normalize_customer_phone($1) phone',[phone])).rows[0].phone,normalizeCustomerPhone(phone))
    for(const phone of ['abc','+62abc','1e10','123','+0123456789','0'.repeat(41)]){assert.throws(()=>normalizeCustomerPhone(phone));await assert.rejects(db.query('select public.normalize_customer_phone($1)',[phone]))}
    assert.equal(matchesCustomer({id:'a',name:'Budi Santoso',phone:'+6281234567890'},'0812'),true)
    assert.equal(matchesCustomer({id:'a',name:'Budi Santoso',phone:'+6281234567890'},'budi santo'),true)

    const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),cashier=randomUUID(),cashier2=randomUUID()
    for(const id of [owner,other,admin,cashier,cashier2])await db.query('insert into auth.users(id) values($1)',[id])
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    await as(owner);const bid=(await db.query<any>("select public.create_business('Customer A','Owner') id")).rows[0].id
    await as(other);const bid2=(await db.query<any>("select public.create_business('Customer B','Other') id")).rows[0].id
    await db.exec('reset role');for(const [id,role,name] of [[admin,'admin','Manager'],[cashier,'cashier','Kasir'],[cashier2,'cashier','Kasir2']])await db.query('insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,$3,$4)',[bid,id,name.toLowerCase(),role])
    const id=randomUUID(),key=randomUUID();const profile={name:'Budi',phone:'0812-3456-7890',notes:'Catatan privat',active:true}
    const save=(details=profile,rev:number|null=null,request=randomUUID(),item=id,business=bid)=>db.query<any>('select public.save_customer($1,$2,$3,$4,$5) item',[business,item,rev,request,details])
    const search=(term='bu',business=bid)=>db.query<any>('select * from public.search_pos_customers($1,$2)',[business,term])
    await as(owner);assert.equal((await save(profile,null,key)).rows[0].item.phone,'+6281234567890');await save(profile,null,key)
    assert.equal((await db.query('select * from public.customers')).rows.length,1);assert.equal((await db.query('select * from public.customer_audit')).rows.length,1)
    await assert.rejects(save({...profile,name:'Different'},null,key),/Request ID/)
    await assert.rejects(save({...profile,phone:'abc'}),/Invalid phone/)
    await assert.rejects(save({...profile,notes:'a'.repeat(1001)}),/Invalid customer/)
    await assert.rejects(db.query("update public.customers set name='Forged'"),/permission denied/)
    await assert.rejects(db.query('delete from public.customers'),/permission denied/)
    await as(admin);const changed=(await save({...profile,name:'Budi Baru'},0)).rows[0].item;assert.equal(changed.revision,1)
    await assert.rejects(save(profile,0),/changed/)
    await as(cashier);assert.equal((await db.query('select * from public.customers')).rows.length,0);assert.equal((await db.query('select * from public.customer_audit')).rows.length,0)
    const projection=(await search()).rows[0];assert.deepEqual(Object.keys(projection).sort(),['id','name','phone']);assert.equal(projection.name,'Budi Baru');assert.equal((await search('0812')).rows.length,1)
    assert.equal((await search('b')).rows.length,0);assert.equal((await search('%_')).rows.length,0)
    await assert.rejects(save(),/access denied/)
    await as(other);assert.equal((await db.query('select * from public.customers')).rows.length,0);await assert.rejects(search('bu',bid),/access denied/)
    assert.equal((await search('bu',bid2)).rows.length,0);await assert.rejects(save(profile,null,randomUUID(),id,bid2),/access denied/)
    const product=randomUUID();await as(owner);await db.query('select public.save_catalog_product($1,$2,null,$3,$4)',[bid,product,randomUUID(),{name:'A',category:'A',unit:'pcs',sku:'A',barcode:'',price:'1000',initialStock:'5',minimum:'0',active:true}])
    const detail={lines:[{id:product,quantity:'1',price:'1000',revision:0}],payment:'cash',received:'1000',discountKind:'none',discountValue:'0',customer:'Forged client name',customerId:id,confirmed:true}
    const request=randomUUID();const checkout=(d:unknown=detail,k=randomUUID(),business=bid)=>db.query<any>('select public.checkout_pos($1,$2,$3) sale',[business,k,d])
    await as(cashier);const sale=(await checkout(detail,request)).rows[0].sale;assert.equal(sale.customer,'Budi Baru');assert.equal(sale.customer_id,id)
    await as(admin);await save({...profile,name:'Budi Setelah',active:false},1)
    assert.equal((await db.query<any>('select customer from public.pos_transactions where id=$1',[sale.id])).rows[0].customer,'Budi Baru')
    await as(cashier);assert.equal((await search()).rows.length,0);assert.equal((await checkout(detail,request)).rows[0].sale.id,sale.id)
    await assert.rejects(checkout(),/Customer unavailable/)
    await assert.rejects(checkout({...detail,customerId:randomUUID()}),/Customer unavailable/)
    await assert.rejects(checkout({...detail,customerId:'bad'}),/Invalid customer/)
    const general=(await checkout({...detail,customerId:null})).rows[0].sale;assert.equal(general.customer,'Pelanggan umum');assert.equal(general.customer_id,null)
    await as(cashier2);assert.equal((await db.query('select * from public.pos_transactions')).rows.length,0)
    await as(owner);await save({...profile,active:true},2);const empty=(await save({name:'Tanpa telepon',phone:'',notes:'',active:true},null,randomUUID(),randomUUID())).rows[0].item;assert.equal(empty.phone,'')
    await db.exec('reset role');await db.query('update public.business_members set must_change_password=true where user_id=$1',[cashier]);await as(cashier);await assert.rejects(search(),/access denied/);await assert.rejects(checkout(),/access denied/)
    await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[admin]);await as(admin);assert.equal((await db.query('select * from public.customers')).rows.length,0);await assert.rejects(save(),/access denied/)
    await db.exec('reset role');await db.exec('set role anon');await assert.rejects(search(),/permission denied/);await db.exec('reset role');await db.query('delete from public.staff_audit_logs where business_id=$1',[bid]);await db.query('delete from public.business_members where business_id=$1',[bid]);await db.query('delete from public.businesses where id=$1',[bid])
  }finally{await db.close()}})
