import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('location migration persists atomic profile changes and preserves owner, tenant, revision and legacy boundaries', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,service_role; grant select,insert,update,delete on storage.objects to authenticated;
      grant all on storage.objects,storage.buckets to service_role;`)
    for (const file of ['202610200001_foundation.sql', '202610210001_profile_setup.sql', '202610230002_onboarding_completion.sql', '202610310001_restaurant_foundation.sql']) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    const owner = randomUUID(), other = randomUUID(), staff = randomUUID(), cashier = randomUUID()
    await db.query('insert into auth.users(id) values($1),($2),($3),($4)', [owner, other, staff, cashier])
    const asUser = async (id: string) => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]); await db.exec('set role authenticated') }
    await asUser(owner)
    const old = (await db.query<{ id: string }>(`select public.create_business_profile('Toko Lama','Owner','0812','Jalan','Bandung','Jawa Barat','') as id`)).rows[0].id
    await db.exec('reset role')
    const before = (await db.query(`select row_to_json(b) as data from public.businesses b where id=$1`, [old])).rows[0] as { data: Record<string, unknown> }
    await db.exec(await readFile('supabase/migrations/202610310005_business_location_details.sql', 'utf8'))
    const after = (await db.query(`select row_to_json(b) as data from public.businesses b where id=$1`, [old])).rows[0] as { data: Record<string, unknown> }
    const revision = Number(after.data.profile_revision)
    assert.deepEqual(after.data, { ...before.data, district: '', village: '' })
    await asUser(owner)
    const save = (revision: number, district = 'Coblong', village = 'Dago') => db.query(`select * from public.save_business_profile_with_location($1,$2,'Toko Lama','0812','Jalan','Kota Bandung','Jawa Barat','',$3,$4)`, [old, revision, district, village])
    const saved = (await save(revision)).rows[0] as Record<string, unknown>
    assert.equal(saved.district, 'Coblong'); assert.equal(saved.village, 'Dago'); assert.equal(saved.address, 'Jalan, Dago, Coblong, Kota Bandung, Jawa Barat')
    await assert.rejects(save(revision))
    await assert.rejects(save(Number(saved.profile_revision), '', 'Dago'))
    await assert.rejects(save(Number(saved.profile_revision), 'x'.repeat(101), 'Dago'))
    await assert.rejects(db.query(`select public.save_business_profile_with_location($1,$2,'Gagal Total','0812',$3,$4,$5,'',$6,$7)`, [old, saved.profile_revision, 's'.repeat(290), 'c'.repeat(90), 'p'.repeat(90), 'd'.repeat(100), 'v'.repeat(100)]))
    assert.deepEqual((await db.query('select name,address,profile_revision from public.businesses where id=$1', [old])).rows[0], { name: saved.name, address: saved.address, profile_revision: saved.profile_revision })
    await db.exec('reset role')
    await db.query(`insert into public.business_members(business_id,user_id,name,role,username) values($1,$2,'Admin','admin','ujiadmin'),($1,$3,'Kasir','cashier','ujikasir')`, [old, staff, cashier])
    for (const user of [other, staff, cashier]) { await asUser(user); await assert.rejects(save(Number(saved.profile_revision))) }
    await asUser(other)
    await assert.rejects(db.query(`select public.create_business_profile_with_location('store','Uji','Owner','0812','Jalan','Kota Bandung','Jawa Barat','','','Dago')`))
    assert.equal((await db.query(`select id from public.businesses where owner_id=$1`, [other])).rows.length, 0)
    const created = (await db.query<{ id: string }>(`select public.create_business_profile_with_location('restaurant','Resto Uji','Owner','0812','Jalan','Kota Bandung','Jawa Barat','','Coblong','Dago') as id`)).rows[0].id
    const restaurant = (await db.query(`select category,district,village,onboarding_completed_at from public.businesses where id=$1`, [created])).rows[0] as Record<string, unknown>
    assert.deepEqual(restaurant, { category: 'restaurant', district: 'Coblong', village: 'Dago', onboarding_completed_at: null })
    await db.exec('reset role')
    await db.exec(await readFile('supabase/migrations/202610310006_business_map_coordinates.sql', 'utf8'))
    assert.equal((await db.query('select id from public.businesses where latitude is not null or longitude is not null')).rows.length, 0)
    await asUser(owner)
    const saveMap = (latitude: number | null, longitude: number | null, version = Number(saved.profile_revision)) => db.query(`select * from public.save_business_profile_with_map($1,$2,'Toko Lama','0812','Jalan','Kota Bandung','Jawa Barat','','Coblong','Dago',$3,$4)`, [old, version, latitude, longitude])
    await assert.rejects(saveMap(-6.89, null))
    await assert.rejects(saveMap(-6.89, 200))
    const mapped = (await saveMap(-6.89, 107.61)).rows[0] as Record<string, unknown>
    assert.equal(mapped.latitude, -6.89); assert.equal(mapped.longitude, 107.61)
    await assert.rejects(saveMap(-6.8, 107.6))
    for (const user of [other, staff, cashier]) { await asUser(user); await assert.rejects(saveMap(-6.8, 107.6, Number(mapped.profile_revision))) }
    await asUser(owner)
    const removed = (await saveMap(null, null, Number(mapped.profile_revision))).rows[0] as Record<string, unknown>
    assert.equal(removed.latitude, null); assert.equal(removed.longitude, null)
    const fresh = randomUUID(); await db.exec('reset role'); await db.query('insert into auth.users(id) values($1)', [fresh]); await asUser(fresh)
    await assert.rejects(db.query(`select public.create_business_profile_with_map('store','Toko Peta','Owner','0812','Jalan','Kota Bandung','Jawa Barat','','Coblong','Dago',-6.89,null)`))
    assert.equal((await db.query('select id from public.businesses where owner_id=$1', [fresh])).rows.length, 0)
    const mapCreated = (await db.query<{ id: string }>(`select public.create_business_profile_with_map('store','Toko Peta','Owner','0812','Jalan','Kota Bandung','Jawa Barat','','Coblong','Dago',-6.89,107.61) as id`)).rows[0].id
    assert.deepEqual((await db.query('select latitude,longitude from public.businesses where id=$1', [mapCreated])).rows[0], { latitude: -6.89, longitude: 107.61 })
  } finally { await db.close() }
})
