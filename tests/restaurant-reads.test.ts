import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { restaurantCashAmount, restaurantOrderFilters } from '../lib/restaurant'

test('restaurant read filters and cash values reject malformed or excessive input', () => {
  assert.ok(restaurantOrderFilters.safeParse({ status: 'all', query: ' %,()_ ', page: 3 }).success)
  for (const input of [{ status: 'x', query: '', page: 0 }, { status: 'open', query: '', page: -1 }, { status: 'open', query: '', page: 0, businessId: randomUUID() }, { status: 'open', query: 'x'.repeat(101), page: 0 }]) assert.equal(restaurantOrderFilters.safeParse(input).success, false)
  for (const value of ['', 'abc', 'NaN', 'Infinity', '1e4', '-1', '1.5', '15.000', ' 15000', '001', '1000000000000']) assert.equal(restaurantCashAmount(value), null)
  for (const value of ['0', '15000', '999999999999']) assert.equal(restaurantCashAmount(value), Number(value))
})

test('paged restaurant reads handle 5000+ history, clamp pages, preserve RLS, and aggregate today in WIB', async () => {
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
    for (const name of (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/' + name, 'utf8'))
    const owner = randomUUID(), other = randomUUID(), manager = randomUUID(), a = randomUUID(), b = randomUUID(), menuId = randomUUID()
    for (const id of [owner, other, manager, a, b]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    const create = async (user: string) => { await as(user); const id = (await db.query<{ id: string }>("select public.create_business_profile_for_category('restaurant','Restoran Baca Uji','Pemilik','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id; await db.query('select public.complete_business_onboarding($1)', [id]); return id }
    const bid = await create(owner), foreign = await create(other)
    await db.exec('reset role')
    for (const [user, role, name] of [[manager, 'admin', 'manager'], [a, 'cashier', 'kasira'], [b, 'cashier', 'kasirb']]) await db.query('insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,$3,$3,$4,false)', [bid, user, name, role])
    const line = JSON.stringify([{ id: menuId, name: 'Kopi Uji', sku: '', unit: 'porsi', price: 15000, quantity: 1, total: 15000 }])
    await db.query(`insert into public.restaurant_orders(id,business_id,actor_id,actor_name,kind,guests,customer,lines,subtotal,status,cancellation_reason)
      select gen_random_uuid(),$1,$2,'Owner','takeaway',1,'Riwayat '||n,$3::jsonb,15000,'cancelled','Riwayat audit' from generate_series(1,5001) n`, [bid, owner, line])
    await db.query(`insert into public.restaurant_orders(id,business_id,actor_id,actor_name,kind,guests,customer,lines,subtotal,created_at)
      select gen_random_uuid(),$1,case when n%2=0 then $2::uuid else $3::uuid end,case when n%2=0 then 'kasira' else 'kasirb' end,'takeaway',1,'Pelanggan '||n,$4::jsonb,15000,now()+n*interval '1 microsecond' from generate_series(1,26) n`, [bid, a, b, line])
    const special = randomUUID()
    await db.query("insert into public.restaurant_orders(id,business_id,actor_id,actor_name,kind,guests,customer,lines,subtotal) values($1,$2,$3,'kasira','takeaway',1,'Pelanggan %,()_',$4::jsonb,15000)", [special, bid, a, line])
    const page = async (target = bid, status = 'open', query = '', n = 0) => (await db.query<any>('select public.read_restaurant_orders_page($1,$2,$3,$4) data', [target, status, query, n])).rows[0].data
    const overview = async (target = bid) => (await db.query<any>('select public.read_restaurant_overview($1) data', [target])).rows[0].data
    await as(owner)
    let result = await page(); assert.equal(result.total, 27); assert.equal(result.orders.length, 25)
    const second = await page(bid, 'open', '', 1); assert.equal(second.orders.length, 2)
    assert.equal(new Set([...result.orders, ...second.orders].map(o => o.id)).size, 27)
    assert.equal((await page(bid, 'all')).total, 5028)
    assert.equal((await page(bid, 'all', '', 1000000)).orders.length, 3)
    assert.equal((await page(bid, 'open', '%,()_')).orders[0].id, special)
    assert.equal((await page(bid, 'open', 'PSN-' + special.slice(0, 8))).total, 1)
    assert.equal((await page(bid, 'open', 'tidak ditemukan', 9)).page, 0)
    for (const row of second.orders) await db.query('select public.cancel_restaurant_order($1,$2,$3,$4)', [bid, row.id, row.revision, 'Pembatalan uji halaman'])
    result = await page(bid, 'open', '', 1); assert.equal(result.page, 0); assert.equal(result.total, 25); assert.equal(result.orders.length, 25)
    await assert.rejects(page(foreign), (e: any) => e.code === '42501')
    await assert.rejects(overview(foreign), (e: any) => e.code === '42501')
    for (const args of [[bid, 'wrong', '', 0], [bid, 'open', '', -1], [bid, 'open', 'x'.repeat(101), 0]]) await assert.rejects(db.query('select public.read_restaurant_orders_page($1,$2,$3,$4)', args), (e: any) => e.code === '22023')
    await as(a); const own = await page(bid, 'all'); assert.ok(own.orders.every((o: { actor_id: string }) => o.actor_id === a)); assert.equal(own.total, 14)
    await assert.rejects(overview(), (e: any) => e.code === '42501')
    await as(b); assert.equal((await page(bid, 'all')).total, 13)
    await as(manager); assert.equal((await page(bid, 'all')).total, 5028)
    await db.exec('reset role')
    await db.query(`insert into public.pos_transactions(business_id,actor_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,created_at)
      select $1,$2,'Owner','Uji',$3::jsonb,15000,'none',0,0,15000,'cash',15000,0,
        (date_trunc('day',statement_timestamp() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')+offset_seconds*interval '1 second'
        from unnest(array[-1,0,86399,86400]) offset_seconds`, [bid, owner, line])
    await as(owner); const summary = await overview(); assert.equal(summary.revenue, 30000); assert.equal(summary.saleCount, 2); assert.equal(summary.openCount, 25); assert.equal(summary.recent.length, 10)
    await db.exec('reset role'); await db.query('update public.business_members set active=false where user_id=$1', [a]); await as(a)
    await assert.rejects(page(), (e: any) => e.code === '42501')
    await db.exec('reset role'); await db.exec('set role anon')
    await assert.rejects(page(), (e: any) => e.code === '42501')
  } finally { await db.close() }
})
