import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { dashboardHref } from '../lib/dashboard-href'

test('customer options: bounded initial list, one character, phone, points and restricted tenant projection', async () => {
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
    const migration = '202611090001_customer_search_options.sql'
    for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql') && file < migration).sort()) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    }
    const as = async (id: string) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec('set role authenticated')
    }
    const owner = randomUUID(), cashier = randomUUID(), other = randomUUID(), limited = randomUUID()
    for (const id of [owner, cashier, other, limited]) await db.query('insert into auth.users(id) values($1)', [id])
    await as(owner)
    const bid = (await db.query<any>("select public.create_business_profile_for_category('store','Search Store','Owner','081234567890','Jalan','Bandung','Jawa Barat','') id")).rows[0].id
    await db.query('select public.complete_business_onboarding($1)', [bid])
    await db.exec('reset role')
    for (const [id, role] of [[cashier, 'cashier'], [limited, 'admin']]) await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Test',$3,$4,false)", [bid, id, id.slice(0, 8), role])
    await db.query("update public.business_roles set permissions='[\"products:view\"]' where business_id=$1 and role_key='admin'", [bid])
    for (let i = 0; i < 25; i++) await db.query("insert into public.customers(id,business_id,name,phone,notes,active,points) values(gen_random_uuid(),$1,$2,$3,'Private notes',true,$4)", [bid, 'Alpha ' + String(i).padStart(2, '0'), '+6281234567' + String(i).padStart(2, '0'), i])
    await db.query("insert into public.customers(id,business_id,name,phone,notes,active,points) values(gen_random_uuid(),$1,'Zebra Last','+62999999999','Private',true,55),(gen_random_uuid(),$1,'Inactive','','Private',false,999)", [bid])
    const before = (await db.query('select * from public.customers order by id')).rows
    await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'))
    assert.deepEqual((await db.query('select * from public.customers order by id')).rows, before)
    const search = async (term: string | null, business = bid) => (await db.query<any>('select * from public.search_pos_customer_options($1,$2)', [business, term])).rows
    await as(cashier)
    assert.equal((await db.query('select * from public.customers')).rows.length, 0)
    const initial = await search('')
    assert.equal(initial.length, 20)
    assert.equal(initial[0].name, 'Alpha 00')
    assert.deepEqual(Object.keys(initial[0]).sort(), ['id', 'name', 'phone', 'points'])
    assert.equal(Number(initial[19].points), 19)
    assert.equal((await search('a')).length, 20)
    assert.equal((await search('z'))[0].name, 'Zebra Last')
    assert.ok((await search('9')).some(row => row.name === 'Zebra Last'))
    assert.equal((await search('0812')).length, 20)
    for (const term of ['inactive', '%_', "' or true --", 'a'.repeat(101), null]) assert.equal((await search(term)).length, 0)
    assert.equal((await search('   ')).length, 20)
    await as(limited); await assert.rejects(search(''), /access denied/i)
    await as(other); await assert.rejects(search('a'), /access denied/i)
    await db.exec('reset role'); await db.query('update public.business_members set active=false where user_id=$1', [cashier])
    await as(cashier); await assert.rejects(search(''), /access denied/i)
    await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(search(''), /permission denied/i)
    await db.exec('reset role')
    for (const category of ['restaurant', 'barbershop']) {
      const uid = randomUUID()
      await db.query('insert into auth.users(id) values($1)', [uid]); await as(uid)
      const id = (await db.query<any>("select public.create_business_profile_for_category($1,'Other Category','Owner','081234567890','Jalan','Bandung','Jawa Barat','') id", [category])).rows[0].id
      await db.query('select public.complete_business_onboarding($1)', [id])
      await db.exec('reset role'); await db.query("insert into public.customers(id,business_id,name,phone,active,points) values(gen_random_uuid(),$1,'Zed','',true,7)", [id])
      await as(uid); assert.equal((await search('z', id))[0].name, 'Zed')
      await assert.rejects(search('', bid), /access denied/i)
      await db.exec('reset role')
    }
  } finally { await db.close() }
})

test('prefetch and navigation resolve to the same category URL', () => {
  assert.equal(dashboardHref('/dashboard/pos', 'store'), '/dashboard/pos?category=toko')
  assert.equal(dashboardHref('/dashboard/pos', 'restaurant'), '/dashboard/pos?category=restoran')
  assert.equal(dashboardHref('/dashboard/salon/appointments', 'barbershop'), '/dashboard/salon/appointments?category=barbershop')
  assert.equal(dashboardHref('/account', 'store'), '/account')
})
