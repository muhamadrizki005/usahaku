import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('store RBAC preserves legacy data, repairs role labels and enforces granular RPC/RLS permissions', async () => {
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
    const migration = '202611030001_store_rbac_enforcement.sql'
    for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql') && file < migration).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    const owner = randomUUID(), manager = randomUUID(), cashier = randomUUID(), custom = randomUUID(), other = randomUUID()
    for (const id of [owner, manager, cashier, custom, other]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    await as(owner)
    const bid = (await db.query<any>("select public.create_business_profile('Toko RBAC','Owner','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id
    await db.query('select public.complete_business_onboarding($1)', [bid])
    const product = randomUUID()
    const details = { name: 'Produk RBAC', category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '10', active: true }
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, product, randomUUID(), details])
    await db.exec('reset role')
    for (const [uid, role] of [[manager, 'admin'], [cashier, 'Petugas Kasir']]) await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Staf',$3,$4,false)", [bid, uid, uid.slice(0,8), role])
    const rid = (await db.query<any>("insert into public.business_roles(business_id,name,permissions) values($1,'Pengamat','[\"products:view\"]') returning id", [bid])).rows[0].id
    await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Pengamat','pengamat','Pengamat',false)", [bid, custom])
    await db.query("update public.business_roles set permissions='[\"products:view\"]' where business_id=$1 and name='Admin Toko'", [bid])
    await db.query('select public.checkout_pos($1,$2,$3)', [bid, randomUUID(), { lines: [{ id: product, quantity: '1', price: '10000', revision: 0 }], payment: 'cash', received: '10000', discountKind: 'none', discountValue: '0', confirmed: true, taxRate: '0', taxRevision: 0, paymentRevision: 0 }])
    const oldSales = (await db.query('select * from public.pos_transactions')).rows
    const old = (await db.query('select id,name,stock,price,sku from public.catalog_products')).rows
    await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'))
    assert.deepEqual((await db.query('select id,name,stock,price,sku from public.catalog_products')).rows, old)
    assert.deepEqual((await db.query('select * from public.pos_transactions')).rows, oldSales)
    assert.equal((await db.query<any>('select role from public.business_members where user_id=$1', [cashier])).rows[0].role, 'cashier')
    assert.equal((await db.query<any>('select role from public.business_members where user_id=$1', [custom])).rows[0].role, rid)
    await as(custom)
    assert.equal((await db.query('select id from public.businesses')).rows.length, 1)
    assert.equal((await db.query('select id from public.catalog_products')).rows.length, 1)
    assert.equal((await db.query<any>("select public.has_business_permission($1,'products:view') allowed", [bid])).rows[0].allowed, true)
    const save = () => db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, randomUUID(), randomUUID(), details])
    await assert.rejects(save(), /permission denied/i)
    await as(manager)
    await assert.rejects(save(), /permission denied/i)
    assert.equal((await db.query('select id from public.stock_movements')).rows.length, 0)
    await as(cashier)
    await assert.rejects(save(), /permission denied/i)
    assert.equal((await db.query("update public.business_roles set permissions='[\"products:create\"]' where business_id=$1 returning id", [bid])).rows.length, 0)
    await as(owner)
    await assert.rejects(db.query('delete from public.business_roles where id=$1', [rid]), /still assigned/i)
    await assert.rejects(db.query("update public.business_roles set permissions='[\"products:create\"]' where business_id=$1 and role_key='cashier'", [bid]), /not assignable/i)
    await assert.rejects(db.query("update public.business_roles set role_key='cashier' where id=$1", [rid]), /immutable/i)
    await db.query("update public.business_roles set permissions='[\"products:view\",\"products:create\",\"pos:view\",\"pos:create\",\"transactions:view\"]' where id=$1", [rid])
    await as(custom)
    const ownProduct = randomUUID()
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, ownProduct, randomUUID(), details])
    await assert.rejects(db.query('select public.save_catalog_product($1,$2,0,$3,$4)', [bid, product, randomUUID(), { ...details, initialStock: '0' }]), /permission denied/i)
    const payload = { lines: [{ id: product, quantity: '1', price: '10000', revision: 0 }], payment: 'cash', received: '10000', discountKind: 'none', discountValue: '0', customer: 'Umum', confirmed: true, taxRate: '0', taxRevision: 0, paymentRevision: 0 }
    const request = randomUUID()
    const sale = (await db.query<any>('select public.checkout_pos($1,$2,$3) sale', [bid, request, payload])).rows[0].sale
    assert.equal(sale.total, 10000)
    assert.equal((await db.query<any>('select public.checkout_pos($1,$2,$3) sale', [bid, request, payload])).rows[0].sale.id, sale.id)
    await assert.rejects(db.query('select public.checkout_pos($1,$2,$3)', [bid, randomUUID(), { ...payload, discountKind: 'percent', discountValue: '10' }]), /permission denied/i)
    await as(cashier)
    assert.equal((await db.query('select id from public.pos_transactions')).rows.length, 0)
    await as(other)
    assert.equal((await db.query('select id from public.catalog_products')).rows.length, 0)
    assert.equal((await db.query('select id from public.business_roles')).rows.length, 0)
    await assert.rejects(save(), /permission denied/i)
    await as(owner)
    await db.query("update public.business_roles set permissions='[]' where id=$1", [rid])
    await as(custom)
    await assert.rejects(db.query('select public.checkout_pos($1,$2,$3)', [bid, request, payload]), /permission denied/i)
    await assert.rejects(db.query('select public.save_business_loyalty_settings($1,true,1000)', [bid]), /access denied/i)
    assert.equal((await db.query('select id from public.catalog_products')).rows.length, 0)
  } finally { await db.close() }
})
