import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { productSkuPrefix } from '../lib/product-sku'

test('automatic SKUs preserve idempotency, manual codes, revisions and business/role boundaries', async () => {
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
    for (const file of ['202610200001_foundation.sql', '202610210001_profile_setup.sql', '202610220001_catalog_inventory.sql']) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    const owner = randomUUID(), other = randomUUID(), cashier = randomUUID()
    for (const id of [owner, other, cashier]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    await as(owner)
    const business = (await db.query<any>("select public.create_business('SKU A','Owner') as id")).rows[0].id
    await as(other)
    const businessB = (await db.query<any>("select public.create_business('SKU B','Owner B') as id")).rows[0].id
    await db.exec('reset role')
    await db.query("insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,'Kasir','kasir','cashier')", [business, cashier])
    const details = { name: 'Kopi Susu', category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price: '12000', minimum: '0', initialStock: '2.500', active: true }
    const save = async (bid = business, value = details, id = randomUUID(), request = randomUUID(), revision: number | null = null) => (await db.query<any>('select public.save_catalog_product($1,$2,$3,$4,$5) as p', [bid, id, revision, request, value])).rows[0].p
    await as(owner)
    const legacy = await save(business, { ...details, sku: 'min-ks-001' })
    await db.exec('reset role')
    await db.exec(await readFile('supabase/migrations/202610230003_auto_product_sku.sql', 'utf8'))
    assert.deepEqual((await db.query<any>('select to_jsonb(p) as p from public.catalog_products p where id=$1', [legacy.id])).rows[0].p, legacy)
    for (const [category, name] of [['Minuman', 'Kopi Susu'], ['Makanan', 'Nasi-Goreng'], ['Bahan Pokok', 'Beras 5 kg'], ['Alat Tulis', 'Buku & Pensil'], ['!!!', '...'], ['constructor', 'Kopi Susu'], ['Minuman', Array(50).fill('a').join(' ')]]) {
      assert.equal((await db.query<any>('select public.catalog_sku_prefix($1,$2) as prefix', [category, name])).rows[0].prefix, productSkuPrefix(category, name))
    }
    await as(owner)
    const id = randomUUID(), request = randomUUID()
    const first = await save(business, details, id, request)
    assert.equal(first.id, id)
    assert.equal(first.sku, 'MIN-KS-002')
    assert.equal((await save(business, { ...details, name: 'Kopi Segar' })).sku, 'MIN-KS-003')
    assert.deepEqual(await save(business, details, id, request), first)
    assert.equal((await db.query<any>('select count(*)::int as n from public.stock_movements where product_id=$1', [id])).rows[0].n, 1)
    const renamed = await save(business, { ...details, name: 'Nama Baru', category: 'Makanan', initialStock: '0' }, id, randomUUID(), 0)
    assert.equal(renamed.sku, first.sku)
    const custom = await save(business, { ...details, sku: 'KOPI-CUSTOM', initialStock: '0' }, id, randomUUID(), 1)
    assert.equal(custom.sku, 'KOPI-CUSTOM')
    await assert.rejects(save(business, { ...details, sku: 'kopi-custom' }), /unique/)
    await save(business, { ...details, sku: 'MIN-KS-999', active: false })
    assert.equal((await save()).sku, 'MIN-KS-1000')
    assert.equal((await save(business, { ...details, category: 'Makanan', name: 'Nasi Goreng' })).sku, 'MAK-NG-001')
    await assert.rejects(save(businessB), /access denied/)
    await assert.rejects(db.query('select public.next_catalog_sku($1,$2,$3)', [business, 'Minuman', 'Kopi Susu']), /permission denied/)
    await as(other)
    assert.equal((await save(businessB)).sku, 'MIN-KS-001')
    await as(cashier)
    await assert.rejects(save(), /access denied/)
  } finally { await db.close() }
})
