import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { saleCode } from '../lib/pos'

test('display receipt numbers use the persisted value and preserve legacy UUID references', () => {
  assert.equal(saleCode({ id: 'abc-def', receipt_number: 'TRX-ABCD1234-20261101-0001' }), 'TRX-ABCD1234-20261101-0001')
  assert.equal(saleCode({ id: 'abc-def', receipt_number: null }), 'TRX-ABC-DEF')
})

test('receipt numbers preserve history, isolate daily counters, survive retries and cancellations, and roll back with checkout', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,service_role; grant select,insert,update,delete on storage.objects to authenticated;
      grant all on storage.objects,storage.buckets to service_role;`)
    const migration = '202611010004_receipt_numbers.sql'
    for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql') && file < migration).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    const owner = randomUUID(), other = randomUUID(), cashier = randomUUID()
    for (const id of [owner, other, cashier]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    const business = async (user: string) => {
      await as(user)
      const bid = (await db.query<any>("select public.create_business_profile('Toko Uji','Owner','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id
      await db.query('select public.complete_business_onboarding($1)', [bid])
      const product = randomUUID()
      await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, product, randomUUID(), { name: 'Susu', category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price: '1000', minimum: '0', initialStock: '100', active: true }])
      const code = (await db.query<any>('select code from public.businesses where id=$1', [bid])).rows[0].code
      return { bid, product, code }
    }
    const a = await business(owner), b = await business(other)
    const checkout = async (target = a, key = randomUUID()) => (await db.query<any>('select public.checkout_pos($1,$2,$3) sale', [target.bid, key, { lines: [{ id: target.product, quantity: '1', price: '1000', revision: 0 }], discountKind: 'none', discountValue: '0', payment: 'cash', received: '1000', confirmed: true }])).rows[0].sale
    await as(owner)
    const legacy = await checkout()
    await db.exec('reset role')
    await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'))
    const legacyAfter = (await db.query<any>('select * from public.pos_transactions where id=$1', [legacy.id])).rows[0]
    assert.equal(legacyAfter.receipt_number, null)
    for (const key of ['subtotal', 'discount', 'total', 'received', 'change']) assert.equal(Number(legacyAfter[key]), Number(legacy[key]))
    await db.query("insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,'Kasir','kasir','cashier')", [a.bid, cashier])
    await as(owner)
    const key = randomUUID(), first = await checkout(a, key)
    assert.match(first.receipt_number, new RegExp(`^TRX-${a.code}-[0-9]{8}-0001$`))
    assert.equal((await checkout(a, key)).receipt_number, first.receipt_number)
    await db.exec('begin')
    assert.match((await checkout()).receipt_number, /-0002$/)
    await db.exec('rollback')
    await as(cashier)
    const second = await checkout()
    assert.match(second.receipt_number, /-0002$/)
    assert.deepEqual((await db.query<any>('select id from public.pos_transactions')).rows.map(row => row.id), [second.id])
    await assert.rejects(db.query('select * from public.receipt_counters'), /permission denied/)
    await assert.rejects(db.query('update public.receipt_counters set last_number=0'), /permission denied/)
    await assert.rejects(db.query('select public.assign_receipt_number()'), /permission denied/)
    await assert.rejects(checkout(b), /access denied/)
    await as(other)
    assert.match((await checkout(b)).receipt_number, new RegExp(`^TRX-${b.code}-[0-9]{8}-0001$`))
    assert.equal((await db.query<any>('select count(*) n from public.pos_transactions where business_id=$1', [a.bid])).rows[0].n, 0)
    await as(owner)
    await db.query('select public.cancel_pos($1,$2,$3,true,true)', [a.bid, first.id, 'Uji pembatalan'])
    assert.equal((await checkout(a, key)).receipt_number, first.receipt_number)
    await db.exec('reset role')
    await assert.rejects(db.query("update public.pos_transactions set receipt_number='TRX-FORGED' where id=$1", [first.id]), /immutable/)
    const insert = async (date: string) => (await db.query<any>(`insert into public.pos_transactions(business_id,actor_name,customer,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,created_at,receipt_number)
      values($1,'Uji','Umum','[]',0,'none',0,0,0,'cash',0,0,$2,'FORGED') returning receipt_number`, [a.bid, date])).rows[0].receipt_number
    assert.equal(await insert('2030-11-01T16:59:59Z'), `TRX-${a.code}-20301101-0001`)
    assert.equal(await insert('2030-11-01T17:00:00Z'), `TRX-${a.code}-20301102-0001`)
    await db.query("update public.receipt_counters set last_number=9999 where business_id=$1 and receipt_day='2030-11-02'", [a.bid])
    assert.equal(await insert('2030-11-01T17:00:01Z'), `TRX-${a.code}-20301102-10000`)
    assert.equal((await db.query<any>('select receipt_number from public.pos_transactions where id=$1', [legacy.id])).rows[0].receipt_number, null)
  } finally { await db.close() }
})
