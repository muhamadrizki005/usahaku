import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { checkoutQuote } from '../lib/product-pricing'
import { reportSummary } from '../lib/reports'

test('order discounts follow product discounts and precede tax with exact rupiah rounding', () => {
  const product = { price: 10000, discountKind: 'percent' as const, discountValue: 10 }
  assert.deepEqual(checkoutQuote([{ product, quantity: 2 }], 11, 'percent', '10'), { subtotal: 20000, productDiscount: 2000, orderDiscount: 1800, discount: 3800, net: 16200, tax: 1782, total: 17982 })
  assert.equal(checkoutQuote([{ product, quantity: 0.25 }], 11, 'amount', '1000').total, 1388)
  assert.equal(checkoutQuote([{ product, quantity: 1 }], 100, 'percent', '100').total, 0)
  assert.equal(checkoutQuote([{ product: { price: 999999999999 }, quantity: 1 }], 11, 'percent', '100').total, 0)
  assert.equal(checkoutQuote([{ product: { price: 1 }, quantity: 1 }], 11, 'percent', '50').total, 0)
  for (const [kind, value] of [['amount', '9001'], ['amount', '1.1'], ['percent', '100.01'], ['percent', '1e1'], ['percent', '-1'], ['none', '10'], ['unknown', '0']]) assert.throws(() => checkoutQuote([{ product, quantity: 1 }], 11, kind, value))
  assert.equal(checkoutQuote([]).total, 0)
})

test('stacked discounts preserve history, role/tenant boundaries, replay, receipts, refunds and report totals', async () => {
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
    const migration = '202611010005_pos_order_discounts.sql'
    for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql') && file < migration).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    const owner = randomUUID(), other = randomUUID(), admin = randomUUID(), cashier = randomUUID()
    for (const id of [owner, other, admin, cashier]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    const create = async (id: string) => { await as(id); const bid = (await db.query<any>("select public.create_business_profile('Toko Diskon','Owner','081234567890','Jalan Uji','Bandung','Jawa Barat','') id")).rows[0].id; await db.query('select public.complete_business_onboarding($1)', [bid]); return bid }
    const bid = await create(owner), foreign = await create(other), pid = randomUUID()
    await db.exec('reset role')
    for (const [uid, role] of [[admin, 'admin'], [cashier, 'cashier']]) await db.query('insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,$3,$3,$3)', [bid, uid, role])
    await as(owner)
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [bid, pid, randomUUID(), { name: 'Susu', category: 'Minuman', unit: 'kotak', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '100', active: true, discountKind: 'percent', discountValue: 10 }])
    await db.query('select public.save_store_tax($1,0,11)', [bid])
    const payload = { lines: [{ id: pid, quantity: '2', price: '10000', revision: 0 }], payment: 'cash', received: '20000', discountKind: 'none', discountValue: '0', taxRate: '11', taxRevision: 1, confirmed: true }
    const checkout = async (details: any = payload, key = randomUUID(), target = bid) => (await db.query<any>('select public.checkout_pos($1,$2,$3) sale', [target, key, details])).rows[0].sale
    const oldKey = randomUUID(), old = await checkout(payload, oldKey)
    await db.exec('reset role'); await db.exec(await readFile('supabase/migrations/' + migration, 'utf8')); await as(owner)
    const legacy = await checkout(payload, oldKey)
    assert.equal(legacy.product_discount, null); assert.equal(legacy.order_discount, null)
    for (const key of ['id', 'receipt_number', 'subtotal', 'discount', 'total', 'tax_amount']) assert.equal(legacy[key], old[key])
    const details = { ...payload, discountKind: 'percent', discountValue: '10' }, key = randomUUID(), sale = await checkout(details, key)
    for (const [field, expected] of Object.entries({ subtotal: 20000, product_discount: 2000, order_discount: 1800, discount: 3800, tax_amount: 1782, total: 17982, change: 2018 })) assert.equal(Number(sale[field]), expected, field)
    assert.equal(sale.lines[0].unit_price, 9000)
    assert.equal((await checkout(details, key)).receipt_number, sale.receipt_number)
    assert.equal(reportSummary({ sales: [sale], refunds: [], generatedAt: sale.created_at }).net, BigInt(16200))
    const fractional = await checkout({ ...payload, lines: [{ ...payload.lines[0], quantity: '0.25' }], discountKind: 'amount', discountValue: '1000', received: '2000' })
    assert.equal(fractional.total, 1388); assert.equal(fractional.product_discount, 250); assert.equal(fractional.order_discount, 1000)
    await assert.rejects(checkout({ ...details, product_discount: 0 }), /Invalid checkout/)
    await assert.rejects(checkout({ ...details, discountKind: 'amount', discountValue: '18001' }), /exceeds/)
    await assert.rejects(checkout({ ...details, discountValue: '100.01' }), /Invalid discount/)
    await assert.rejects(checkout({ ...details, received: '1' }), /received/)
    assert.equal((await checkout({ ...details, discountValue: '100', received: '0' })).total, 0)
    await as(admin)
    assert.equal((await checkout({ ...details, discountKind: 'amount', discountValue: '1000' })).order_discount, 1000)
    await as(cashier)
    await assert.rejects(checkout(details), /access denied/)
    assert.equal((await checkout()).order_discount, 0)
    assert.equal((await db.query<any>('select count(*) n from public.pos_transactions where id=$1', [sale.id])).rows[0].n, 0)
    await assert.rejects(db.query('update public.pos_transactions set discount=0'), /permission denied/)
    await as(other)
    await assert.rejects(checkout(details), /access denied/)
    assert.equal((await db.query<any>('select count(*) n from public.pos_transactions where business_id=$1', [bid])).rows[0].n, 0)
    await as(owner)
    await assert.rejects(checkout(details, randomUUID(), foreign), /access denied/)
    const cancelled = (await db.query<any>('select public.cancel_pos($1,$2,$3,true,true) sale', [bid, sale.id, 'Uji pengembalian penuh'])).rows[0].sale
    assert.equal(cancelled.refund_amount, 17982); assert.equal(cancelled.product_discount, 2000); assert.equal(cancelled.order_discount, 1800)
    assert.equal((await checkout(details, key)).status, 'cancelled')
    const report = reportSummary({ sales: [cancelled], refunds: [cancelled], generatedAt: sale.created_at })
    assert.equal(report.net, BigInt(0)); assert.equal(report.refund, BigInt(17982))
  } finally { await db.close() }
})
