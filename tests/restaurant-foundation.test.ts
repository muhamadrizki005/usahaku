import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { businessCategorySchema, businessSlug, categoryFromSlug } from '../lib/business-categories'

test('restaurant categories are explicit and do not silently turn unsupported categories into stores', () => {
  assert.equal(categoryFromSlug('restoran'), 'restaurant')
  assert.equal(categoryFromSlug('toko'), 'store')
  assert.equal(categoryFromSlug('barbershop'), null)
  assert.equal(categoryFromSlug(['restoran']), null)
  assert.equal(businessSlug('restaurant'), 'restoran')
  assert.equal(businessCategorySchema.safeParse('barbershop').success, false)
  assert.throws(() => businessSlug('unknown'))
})

test('restaurant foundation preserves stores and enforces category, draft, resource revisions, idempotency and tenant/role isolation', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated;
      grant all on storage.objects,storage.buckets to service_role;`)
    for (const migration of ['202610200001_foundation.sql', '202610210001_profile_setup.sql', '202610220001_catalog_inventory.sql', '202610220002_bulk_catalog.sql', '202610220003_product_image_policy.sql', '202610220004_pos_transactions.sql', '202610220005_customers.sql', '202610230001_sales_reports.sql', '202610230002_onboarding_completion.sql', '202610230003_auto_product_sku.sql']) {
      await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'))
    }
    const owner = randomUUID(), other = randomUUID(), storeOwner = randomUUID(), admin = randomUUID(), cashier = randomUUID(), staff = randomUUID()
    for (const uid of [owner, other, storeOwner, admin, cashier, staff]) await db.query('insert into auth.users(id) values($1)', [uid])
    await db.query(`update auth.users set raw_app_meta_data='{"account_type":"staff"}' where id=$1`, [staff])
    const as = async (uid: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]); await db.exec('set role authenticated') }
    const create = async (category: string) => (await db.query<{ id: string }>("select public.create_business_profile_for_category($1,'Usaha Uji','Pemilik','081234567890','Jalan Uji','Bandung','Jawa Barat','') id", [category])).rows[0].id
    await as(storeOwner)
    const store = (await db.query<{ id: string }>("select public.create_business_profile('Toko Lama','Pemilik','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id
    await db.query('select public.complete_business_onboarding($1)', [store])
    await db.exec('reset role')
    const before = (await db.query('select * from public.businesses where id=$1', [store])).rows
    await db.exec(await readFile('supabase/migrations/202610310001_restaurant_foundation.sql', 'utf8'))
    assert.deepEqual((await db.query('select * from public.businesses where id=$1', [store])).rows, before)
    await as(owner)
    await assert.rejects(create('barbershop'), /Unsupported/)
    const a = await create('restaurant')
    assert.equal((await db.query<{ category: string }>('select category from public.businesses where id=$1', [a])).rows[0].category, 'restaurant')
    await assert.rejects(create('restaurant'), /already belongs/)
    await assert.rejects(db.query("update public.businesses set category='store' where id=$1", [a]), /permission denied/)
    const menuId = randomUUID(), tableId = randomUUID(), operation = randomUUID()
    const menu = { name: 'Kopi Susu', category: 'Minuman', price: '15000', active: true, available: true }
    const save = (bid: string, resource: string, id: string, revision: number | null, request: string, details: unknown) => db.query<{ result: any }>('select public.save_restaurant_resource($1,$2,$3,$4,$5,$6) result', [bid, resource, id, revision, request, JSON.stringify(details)])
    const first = (await save(a, 'menu', menuId, null, operation, menu)).rows[0].result
    assert.deepEqual((await save(a, 'menu', menuId, null, operation, menu)).rows[0].result, first)
    await assert.rejects(save(a, 'menu', menuId, null, operation, { ...menu, price: '100' }), /already used/)
    await assert.rejects(save(a, 'menu', randomUUID(), null, randomUUID(), { ...menu, stock: '5' }), /Invalid menu/)
    await save(a, 'table', tableId, null, randomUUID(), { name: 'Meja 1', capacity: 4, active: true })
    await assert.rejects(save(a, 'table', randomUUID(), null, randomUUID(), { name: 'Meja 2', capacity: 0, active: true }), /Invalid table/)
    await assert.rejects(save(a, 'table', randomUUID(), null, randomUUID(), { name: 'MEJA 1', capacity: 4, active: true }), /duplicate key/)
    await as(other); const b = await create('restaurant')
    await assert.rejects(save(a, 'menu', menuId, 0, randomUUID(), menu), /access denied/)
    assert.equal((await db.query('select id from public.restaurant_menu where business_id=$1', [a])).rows.length, 0)
    await assert.rejects(save(b, 'menu', menuId, null, randomUUID(), menu), /access denied/)
    await db.exec('reset role')
    await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Admin','admin','admin',false),($1,$3,'Kasir','kasir','cashier',false)", [a, admin, cashier])
    await as(admin); await assert.rejects(save(a, 'menu', menuId, 0, randomUUID(), menu), /access denied/)
    await as(owner); await db.query('select public.complete_business_onboarding($1)', [a])
    await as(admin)
    await save(a, 'menu', menuId, 0, randomUUID(), { ...menu, available: false })
    await assert.rejects(save(a, 'menu', menuId, 0, randomUUID(), menu), /changed/)
    await assert.rejects(save(a, 'menu', menuId, null, operation, menu), /already used/)
    await as(cashier)
    assert.equal((await db.query('select id from public.restaurant_menu')).rows.length, 1)
    assert.equal((await db.query('select id from public.restaurant_audit')).rows.length, 0)
    await assert.rejects(save(a, 'menu', menuId, 1, randomUUID(), menu), /access denied/)
    await assert.rejects(db.query("update public.restaurant_menu set price=1 where id=$1", [menuId]), /permission denied/)
    await as(owner)
    await save(a, 'menu', menuId, 1, randomUUID(), { ...menu, active: false })
    await as(cashier); assert.equal((await db.query('select id from public.restaurant_menu')).rows.length, 0)
    await as(storeOwner); await assert.rejects(save(store, 'table', randomUUID(), null, randomUUID(), { name: 'Toko', capacity: 2, active: true }), /access denied/)
    await as(staff); await assert.rejects(create('restaurant'), /Staff cannot/)
    await db.exec('reset role'); await db.query('update public.business_members set active=false where user_id=$1', [owner])
    await as(owner); await assert.rejects(save(a, 'menu', menuId, null, operation, menu), /access denied/)
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from public.businesses where id=$1', [store])).rows, before)
  } finally { await db.close() }
})
