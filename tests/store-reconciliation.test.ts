import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { parseQuantityInput } from '../lib/catalog'
import { loyaltySettingsSchema } from '../lib/loyalty'
import { parseReportFilter, reportSummary, reportCsv } from '../lib/reports'

test('fraction parser bounds input and rounds rational quantities exactly without non-finite results', () => {
  for (const text of ['1/2', '1/4', '1 1/2', '1/3', '2/3', '999999999999/1000']) assert.ok(parseQuantityInput(text).valid)
  assert.equal(parseQuantityInput('1/3').formatted, '0.333')
  assert.equal(parseQuantityInput('2/3').formatted, '0.667')
  for (const text of ['9'.repeat(400) + '/' + '9'.repeat(400), '1/0', '0/1', '-1/2', 'Infinity', 'NaN', '1e4', '1000000000', '1/99999999']) assert.equal(parseQuantityInput(text).valid, false)
  for (const nominal of [0, 0.1, Infinity, NaN, 1000000001]) assert.equal(loyaltySettingsSchema.safeParse({ active: true, nominal }).success, false)
  assert.equal(parseReportFilter({ payment: 'ewallet' }).payment, 'ewallet')
})

for (const partial of [false, true]) test(`reconciliation repairs ${partial ? 'partially installed' : 'fully installed'} schema and protects payments, points, roles, report and legacy data`, async () => {
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
    const migration = '202611020001_store_checkout_reconciliation.sql'
    for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql') && file < migration).sort()) {
      if (partial && ['202611010006_loyalty_points.sql', '202611010007_business_payments_ewallet.sql'].includes(file)) continue
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    }
    if (partial) await db.exec("alter table public.businesses add column loyalty_active boolean not null default false, add column loyalty_point_nominal numeric not null default 50000; alter table public.business_payments add column ewallet boolean not null default false,add column ewallets jsonb not null default '[]';")
    const owner = randomUUID(), admin = randomUUID(), cashier = randomUUID(), cashierB = randomUUID(), other = randomUUID()
    for (const id of [owner, admin, cashier, cashierB, other]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    await as(owner)
    const bid = (await db.query<any>("select public.create_business_profile('Toko Rekonsiliasi','Pemilik','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id
    await db.query('select public.complete_business_onboarding($1)', [bid])
    const product = randomUUID(), customer = randomUUID()
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, product, randomUUID(), { name: 'Produk Uji', category: 'Audit', unit: 'pcs', sku: '', barcode: '', price: '100000', minimum: '0', initialStock: '100', active: true }])
    await db.query('select public.save_customer($1,$2,null,$3,$4)', [bid, customer, randomUUID(), { name: 'Pelanggan Uji', phone: '', notes: '', active: true }])
    if (!partial) await db.query('select public.save_business_loyalty_settings($1,true,50000)', [bid])
    const payload = { lines: [{ id: product, quantity: '1', price: '100000', revision: 0 }], payment: 'cash', received: '100000', discountKind: 'none', discountValue: '0', confirmed: true, customerId: customer }
    const checkout = async (details: any = payload, request = randomUUID()) => (await db.query<any>('select public.checkout_pos($1,$2,$3) sale', [bid, request, details])).rows[0].sale
    const legacyKey = randomUUID(), legacy = await checkout(payload, legacyKey)
    const oldBalance = partial ? 0 : 2
    await db.exec('reset role'); await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'))
    for (const [id, name, role] of [[admin, 'Admin', 'admin'], [cashier, 'Kasir A', 'cashier'], [cashierB, 'Kasir B', 'cashier']]) await db.query("insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,lower(replace($3,' ','')),$4)", [bid, id, name, role])
    await as(owner)
    const preserved = await checkout(payload, legacyKey)
    for (const key of ['id', 'receipt_number', 'subtotal', 'discount', 'total', 'tax_amount', 'received', 'change']) assert.equal(preserved[key], legacy[key])
    assert.equal((await db.query<any>('select points from public.customers where id=$1', [customer])).rows[0].points, oldBalance)
    await db.query('select public.save_business_loyalty_settings($1,true,50000)', [bid])
    for (const nominal of ['0', '0.1', 'NaN', 'Infinity', '1000000001']) await assert.rejects(db.query('select public.save_business_loyalty_settings($1,true,$2)', [bid, nominal]), /Invalid loyalty/)
    await assert.rejects(checkout({ ...payload, payment: 'ewallet' }), /configured|payment/i)
    await db.query('select public.save_business_payments($1,0,$2,null)', [bid, { cash: true, qris: false, transfer: false, banks: [], ewallet: true, ewallets: [{ ewallet: 'DANA', holder: 'Uji', number: '081234567890' }] }])
    const ewPayload = { ...payload, payment: 'ewallet', paymentRevision: 1 }, request = randomUUID(), sale = await checkout(ewPayload, request)
    assert.equal(sale.payment, 'ewallet'); assert.equal(sale.points_earned, 2)
    assert.equal((await checkout(ewPayload, request)).id, sale.id)
    assert.equal((await db.query<any>('select points from public.customers where id=$1', [customer])).rows[0].points, oldBalance + 2)
    const day = new Date(new Date(sale.created_at).getTime() + 7 * 3600000).toISOString().slice(0, 10), start = new Date(day + 'T00:00:00+07:00'), end = new Date(start.getTime() + 86400000)
    const report = async () => (await db.query<any>('select public.read_sales_report($1,$2,$3,$4) report', [bid, start.toISOString(), end.toISOString(), 'ewallet'])).rows[0].report
    let data = await report(); assert.equal(data.sales.length, 1); assert.equal(reportSummary(data).net, BigInt(100000)); assert.match(reportCsv(data, { from: day, to: day, payment: 'ewallet' }, 'Audit'), /E-wallet/)
    await as(admin); await assert.rejects(db.query('select public.save_business_loyalty_settings($1,false,1)', [bid]), /access denied/)
    assert.ok((await db.query<any>('select * from public.customer_point_history')).rows.length > 0)
    await as(cashier); await assert.rejects(db.query('select public.save_business_loyalty_settings($1,false,1)', [bid]), /access denied/)
    const own = await checkout({ ...payload, paymentRevision: 1 }); assert.equal(own.points_earned, 2)
    assert.deepEqual((await db.query<any>('select id from public.pos_transactions')).rows.map(row => row.id), [own.id])
    assert.equal((await db.query<any>('select count(*) n from public.customer_point_history')).rows[0].n, 0)
    await as(cashierB); assert.equal((await db.query<any>('select count(*) n from public.customer_point_history')).rows[0].n, 0); await assert.rejects(report(), /access denied/)
    await as(other); assert.equal((await db.query<any>('select count(*) n from public.customer_point_history')).rows[0].n, 0); await assert.rejects(checkout(ewPayload), /access denied/)
    await as(owner)
    const cancel = async () => (await db.query<any>('select public.cancel_pos($1,$2,$3,true,true) sale', [bid, sale.id, 'Pengembalian uji'])).rows[0].sale
    await cancel(); await cancel(); data = await report(); assert.equal(reportSummary(data).net, BigInt(0)); assert.equal(reportSummary(data).refund, BigInt(100000))
    assert.equal((await db.query<any>('select points from public.customers where id=$1', [customer])).rows[0].points, oldBalance + 2)
    await db.query('select public.save_business_loyalty_settings($1,true,1)', [bid])
    const huge = randomUUID(); await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, huge, randomUUID(), { name: 'Batas Poin', category: 'Audit', unit: 'pcs', sku: '', barcode: '', price: '2147483648', minimum: '0', initialStock: '2', active: true }])
    const high = await checkout({ ...payload, lines: [{ id: huge, quantity: '1', price: '2147483648', revision: 0 }], received: '2147483648', paymentRevision: 1 })
    assert.equal(high.points_earned, 2147483648)
    await db.exec('reset role'); await db.query('update public.customers set points=9007199254740991 where id=$1', [customer]); await as(owner)
    await assert.rejects(checkout({ ...payload, paymentRevision: 1 }), /supported limit/)
  } finally { await db.close() }
})
