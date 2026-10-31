import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { restaurantOrderSchema, restaurantPaymentSchema } from '../lib/restaurant'

test('restaurant payload validation rejects fractional portions, forged totals and invalid dining modes', () => {
  const data = { kind: 'takeaway', tableId: null, guests: 1, customer: 'Pelanggan umum', notes: '', stage: 'new', lines: [{ id: randomUUID(), quantity: 2 }] }
  assert.ok(restaurantOrderSchema.safeParse(data).success)
  assert.equal(restaurantOrderSchema.safeParse({ ...data, kind: 'dine_in' }).success, false)
  assert.equal(restaurantOrderSchema.safeParse({ ...data, lines: [{ id: randomUUID(), quantity: 0.5 }] }).success, false)
  assert.equal(restaurantOrderSchema.safeParse({ ...data, subtotal: 1 }).success, false)
  assert.equal(restaurantPaymentSchema.safeParse({ payment: 'qris', received: '15000', discountKind: 'none', discountValue: '0', confirmed: false }).success, false)
})

test('restaurant orders, occupied tables, exact payments, cancellation and reports preserve store stock and cashier/tenant boundaries', async () => {
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
    const owner = randomUUID(), other = randomUUID(), storeOwner = randomUUID(), admin = randomUUID(), a = randomUUID(), b = randomUUID()
    for (const id of [owner, other, storeOwner, admin, a, b]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    const create = async (id: string, category: string) => { await as(id); const result = (await db.query<{ id: string }>("select public.create_business_profile_for_category($1,'Usaha Uji','Pemilik','081234567890','Jalan Uji','Bandung','Jawa Barat','') id", [category])).rows[0].id; await db.query('select public.complete_business_onboarding($1)', [result]); return result }
    const store = await create(storeOwner, 'store'), restaurant = await create(owner, 'restaurant'), foreign = await create(other, 'restaurant')
    await db.exec('reset role')
    for (const [id, role, name] of [[admin, 'admin', 'admin'], [a, 'cashier', 'kasira'], [b, 'cashier', 'kasirb']]) await db.query('insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,$3,$3,$4,false)', [restaurant, id, name, role])
    const menuId = randomUUID(), tableId = randomUUID(), productId = randomUUID()
    const resource = (kind: string, id: string, revision: number | null, details: unknown) => db.query('select public.save_restaurant_resource($1,$2,$3,$4,$5,$6)', [restaurant, kind, id, revision, randomUUID(), JSON.stringify(details)])
    const menu = { name: 'Kopi Susu', category: 'Minuman', price: '15000', active: true, available: true }
    await as(owner); await resource('menu', menuId, null, menu); await resource('table', tableId, null, { name: 'Meja 1', capacity: 4, active: true })
    await as(storeOwner)
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [store, productId, randomUUID(), JSON.stringify({ name: 'Beras', category: 'Bahan Pokok', unit: 'kg', sku: '', barcode: '', price: '20000', minimum: '1', initialStock: '10', active: true })])
    const checkoutStore = { lines: [{ id: productId, quantity: '0.25', price: '20000', revision: 0 }], payment: 'cash', received: '5000', discountKind: 'none', discountValue: '0', customer: 'Pelanggan umum', confirmed: true }
    await db.query('select public.checkout_pos($1,$2,$3)', [store, randomUUID(), JSON.stringify(checkoutStore)])
    const storeReport = (await db.query<{ value: any }>("select public.read_sales_report($1,date_trunc('day',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta',(date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '1 day') at time zone 'Asia/Jakarta') value", [store])).rows[0].value
    assert.equal(storeReport.sales.length, 1); assert.equal(storeReport.sales[0].total, 5000)
    await db.exec('reset role')
    const stockBefore = (await db.query('select * from public.catalog_products order by id')).rows
    const ledgerBefore = (await db.query('select * from public.stock_movements order by id')).rows
    const order = { kind: 'dine_in', tableId: tableId as string | null, guests: 2, customer: 'Pelanggan umum', notes: 'Tanpa gula', stage: 'new', lines: [{ id: menuId, quantity: 2 }] }
    const save = async (id: string, revision: number | null, details = order, request = randomUUID(), bid = restaurant) => (await db.query<{ value: any }>('select public.save_restaurant_order($1,$2,$3,$4,$5) value', [bid, id, revision, request, JSON.stringify(details)])).rows[0].value
    const payDetails = { payment: 'cash', received: '50000', discountKind: 'none', discountValue: '0', confirmed: true }
    const pay = async (id: string, revision: number, details = payDetails, request = randomUUID()) => (await db.query<{ value: any }>('select public.pay_restaurant_order($1,$2,$3,$4,$5) value', [restaurant, id, revision, request, JSON.stringify(details)])).rows[0].value
    await as(a)
    await assert.rejects(db.query("select public.restaurant_require_open('open',0,0)"), /permission denied/)
    const id = randomUUID(), request = randomUUID(), first = await save(id, null, order, request)
    assert.equal(first.subtotal, 30000)
    assert.deepEqual(await save(id, null, order, request), first)
    await assert.rejects(save(id, null, { ...order, guests: 3 }, request), /already used/)
    await assert.rejects(save(randomUUID(), null, { ...order, guests: 5 }), (e: any) => e.code === 'PT409' && JSON.parse(e.detail).reason === 'table_capacity' && JSON.parse(e.detail).capacity === 4 && JSON.parse(e.detail).guests === 5)
    await assert.rejects(save(id, 0, { ...order, lines: [...order.lines, ...order.lines] }), /Duplicate/)
    await assert.rejects(save(randomUUID(), null, order), (e: any) => e.code === 'PT409' && JSON.parse(e.detail).reason === 'table_occupied')
    await as(b)
    assert.equal((await db.query('select id from public.restaurant_orders')).rows.length, 0)
    assert.equal((await db.query<any>('select * from public.restaurant_table_usage($1)', [restaurant])).rows[0].occupied, true)
    await assert.rejects(save(id, 0), /access denied/)
    await assert.rejects(pay(id, 0), /access denied/)
    await as(other); await assert.rejects(save(randomUUID(), null, order, randomUUID(), foreign), /unavailable/)
    await as(owner)
    await assert.rejects(resource('table', tableId, 0, { name: 'Meja 1', capacity: 1, active: true }), (e: any) => JSON.parse(e.detail).reason === 'table_busy_capacity')
    await assert.rejects(resource('table', tableId, 0, { name: 'Meja 1', capacity: 4, active: false }), (e: any) => JSON.parse(e.detail).reason === 'table_busy_deactivate')
    await resource('menu', menuId, 0, { ...menu, price: '17000', available: false })
    await as(a)
    const changed = await save(id, 0, { ...order, stage: 'preparing' })
    assert.equal(changed.subtotal, 30000)
    await assert.rejects(save(id, 0), /changed/)
    await assert.rejects(save(id, 1), /stage/)
    await assert.rejects(save(id, 1, { ...order, stage: 'preparing', lines: [{ id: menuId, quantity: 3 }] }), (e: any) => JSON.parse(e.detail).reason === 'menu_out' && JSON.parse(e.detail).name === 'Kopi Susu')
    await assert.rejects(pay(id, 1, { ...payDetails, confirmed: false }), /Invalid payment/)
    await assert.rejects(pay(id, 1, { ...payDetails, received: '100' }), (e: any) => JSON.parse(e.detail).reason === 'payment_short' && JSON.parse(e.detail).total === 30000)
    await assert.rejects(pay(id, 1, { ...payDetails, discountKind: 'amount', discountValue: '1000' }), /Discount access/)
    const paymentRequest = randomUUID(), paid = await pay(id, 1, payDetails, paymentRequest)
    assert.equal(paid.sale.total, 30000); assert.equal(paid.sale.change, 20000); assert.equal(paid.order.status, 'paid')
    assert.equal((await pay(id, 1, payDetails, paymentRequest)).sale.id, paid.sale.id)
    await assert.rejects(pay(id, 1), (e: any) => JSON.parse(e.detail).reason === 'order_paid')
    assert.equal((await db.query<any>('select * from public.restaurant_table_usage($1)', [restaurant])).rows[0].occupied, false)
    await assert.rejects(db.query("select public.read_sales_report($1,date_trunc('day',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta',(date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '1 day') at time zone 'Asia/Jakarta')", [restaurant]), /access denied/)
    await as(b); assert.equal((await db.query('select id from public.pos_transactions')).rows.length, 0)
    await as(owner); await resource('menu', menuId, 1, { ...menu, price: '17000' })
    await as(b)
    const takeaway = { ...order, kind: 'takeaway', tableId: null } as typeof order
    const secondId = randomUUID(), second = await save(secondId, null, takeaway)
    assert.equal(second.subtotal, 34000)
    await db.query('select public.cancel_restaurant_order($1,$2,$3,$4)', [restaurant, secondId, 0, 'Pelanggan membatalkan'])
    await assert.rejects(pay(secondId, 1), /changed/)
    const thirdId = randomUUID(); await save(thirdId, null, takeaway)
    await as(admin)
    const thirdPaid = await pay(thirdId, 0, { payment: 'qris', received: '33000', discountKind: 'amount', discountValue: '1000', confirmed: true })
    assert.equal(thirdPaid.sale.total, 33000)
    await as(b); assert.equal((await db.query('select id from public.restaurant_orders where id=$1', [thirdId])).rows.length, 0)
    await as(a)
    await assert.rejects(db.query('select public.cancel_restaurant_sale($1,$2,$3,true,true)', [restaurant, paid.sale.id, 'Pembatalan penuh']), /access denied/)
    await as(owner)
    await assert.rejects(db.query('select public.cancel_restaurant_sale($1,$2,$3,true,false)', [restaurant, paid.sale.id, 'Pembatalan penuh']), /Confirm/)
    const cancelled = (await db.query<{ value: any }>('select public.cancel_restaurant_sale($1,$2,$3,true,true) value', [restaurant, paid.sale.id, 'Pembatalan penuh'])).rows[0].value
    assert.equal(cancelled.refund_amount, 30000)
    assert.equal((await db.query<any>('select status from public.restaurant_orders where id=$1', [id])).rows[0].status, 'cancelled')
    const report = (await db.query<{ value: any }>("select public.read_sales_report($1,date_trunc('day',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta',(date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '1 day') at time zone 'Asia/Jakarta') value", [restaurant])).rows[0].value
    assert.equal(report.sales.length, 2); assert.equal(report.refunds.length, 1)
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from public.catalog_products order by id')).rows, stockBefore)
    assert.deepEqual((await db.query('select * from public.stock_movements order by id')).rows, ledgerBefore)
    await db.query('update public.business_members set active=false where user_id=$1', [a]); await as(a)
    await assert.rejects(pay(id, 1, payDetails, paymentRequest), /access denied/)
  } finally { await db.close() }
})
