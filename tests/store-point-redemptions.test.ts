import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

for (const newlines of ['LF', 'CRLF']) test(`store rewards are atomic, refundable and isolated with migration newlines ${newlines}`, async () => {
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
    const migration = '202611100006_store_point_redemptions.sql'
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && f < migration).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    const owner = randomUUID(), admin = randomUUID(), cashier = randomUUID(), other = randomUUID()
    for (const id of [owner, admin, cashier, other]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    const rpc = async (name: string, args: unknown[]) => (await db.query<any>('select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') value', args)).rows[0].value
    const create = () => rpc('create_business_profile', ['Toko QA', 'Owner', '081234567890', 'Jalan', 'Bandung', 'Jawa Barat', ''])
    await as(owner); const bid = await create(); await rpc('complete_business_onboarding', [bid])
    await as(other); const foreign = await create(); await rpc('complete_business_onboarding', [foreign])
    await db.exec('reset role')
    for (const [id, role] of [[admin, 'admin'], [cashier, 'cashier']]) await db.query("insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Staf',$3,$4,false)", [bid, id, id.slice(0, 8), role])
    await as(owner)
    const product = randomUUID(), rice = randomUUID(), customer = randomUUID()
    for (const [id, price, discountKind, discountValue] of [[product, '100000', 'none', 0], [rice, '16000', 'percent', 10]]) {
      await rpc('save_catalog_product', [bid, id, null, randomUUID(), { name: 'Produk ' + id, category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price, minimum: '0', initialStock: '20', active: true, discountKind, discountValue }])
    }
    await rpc('save_customer', [bid, customer, null, randomUUID(), { name: 'Member QA', phone: '', notes: '', active: true }])
    await db.exec('reset role')
    await db.query('update public.businesses set tax_rate=11 where id=$1', [bid])
    await db.query('update public.customers set points=100 where id=$1', [customer])
    await as(owner)
    const details = { lines: [{ id: product, price: '100000', quantity: '1', revision: 0 }], payment: 'qris', received: '111000', discountKind: 'none', discountValue: '0', taxRate: '11', taxRevision: 0, paymentRevision: 0, confirmed: true, customerId: customer }
    const checkout = (input: unknown, request = randomUUID()) => rpc('checkout_pos', [bid, request, input])
    const oldSale = await checkout(details)
    await db.exec('reset role')
    const legacy = (await db.query('select * from public.pos_transactions where id=$1', [oldSale.id])).rows
    const migrationSql = await readFile('supabase/migrations/' + migration, 'utf8')
    if (newlines === 'CRLF') {
      const previous = migrationSql
        .replace(" needle:=replace(needle,E'\\r\\n',E'\\n');\n", '')
        .replace(" replacement:=replace(replacement,E'\\r\\n',E'\\n');\n", '')
      await assert.rejects(db.exec(previous.replace(/\r?\n/g, '\r\n')), /Unexpected function body/)
      await db.exec('rollback')
    }
    await db.exec(newlines === 'CRLF' ? migrationSql.replace(/\r?\n/g, '\r\n') : migrationSql.replace(/\r\n/g, '\n'))
    assert.deepEqual((await db.query('select * from public.pos_transactions where id=$1', [oldSale.id])).rows, legacy)
    const rules = [
      { id: 'voucher', points_required: 10, reward_type: 'voucher', voucher_amount: 10000 },
      { id: 'rice', points_required: 5, reward_type: 'product', product_id: rice },
    ]
    await as(owner); await rpc('save_business_loyalty_settings', [bid, true, 10000, rules])
    await as(admin); await assert.rejects(rpc('save_business_loyalty_settings', [bid, true, 10000, rules]), /denied/)
    await as(cashier); await assert.rejects(rpc('save_business_loyalty_settings', [bid, true, 10000, rules]), /denied/)
    const redeemed = { ...details, received: '99900', redemptionId: 'voucher', pointsRedeemed: 10 }
    await assert.rejects(checkout({ ...redeemed, pointsRedeemed: 9 }), /Jumlah poin/)
    await assert.rejects(checkout({ ...redeemed, redemptionId: 'invented' }), /Hadiah belum tersimpan/)
    await assert.rejects(checkout({ ...redeemed, pointDiscount: 99999 }), /Invalid checkout/)
    await assert.rejects(checkout({ ...redeemed, received: '101000' }), /received/)
    const request = randomUUID(), sale = await checkout(redeemed, request)
    assert.equal(sale.total, 99900); assert.equal(sale.tax_amount, 9900); assert.equal(sale.point_discount, 10000)
    assert.equal(sale.points_earned, 9); assert.equal(sale.points_redeemed, 10)
    assert.equal((await checkout(redeemed, request)).id, sale.id)
    await assert.rejects(checkout({ ...redeemed, received: '0' }, request), /Request ID/)
    await db.exec('reset role')
    assert.equal(Number((await db.query<any>('select points from public.customers where id=$1', [customer])).rows[0].points), 99)
    const ledger = (await db.query<any>('select kind,points,before_points,after_points from public.customer_point_history where sale_id=$1 order by kind', [sale.id])).rows
    assert.deepEqual(ledger.map(r => [r.kind, Number(r.points), Number(r.before_points), Number(r.after_points)]), [['earn', 9, 90, 99], ['redeem', -10, 100, 90]])
    assert.equal(Number((await db.query<any>('select stock from public.catalog_products where id=$1', [product])).rows[0].stock), 18)
    await as(cashier); await assert.rejects(rpc('cancel_pos', [bid, sale.id, 'Refund QA', true, true]), /denied/)
    await as(admin); await rpc('cancel_pos', [bid, sale.id, 'Refund QA', true, true]); await rpc('cancel_pos', [bid, sale.id, 'Refund QA', true, true])
    await db.exec('reset role')
    assert.equal(Number((await db.query<any>('select points from public.customers where id=$1', [customer])).rows[0].points), 100)
    assert.equal((await db.query('select id from public.customer_point_history where sale_id=$1 and kind=\'refund\'', [sale.id])).rows.length, 1)
    const stockBefore = (await db.query<any>('select stock from public.catalog_products where id=$1', [rice])).rows[0].stock
    await as(owner)
    const riceSale = await checkout({ ...redeemed, lines: [{ id: rice, price: '16000', quantity: '0.25', revision: 0 }], redemptionId: 'rice', pointsRedeemed: 5, received: '0' })
    assert.equal(riceSale.point_discount, 3600); assert.equal(riceSale.tax_amount, 0); assert.equal(riceSale.total, 0)
    await assert.rejects(checkout({ ...redeemed, redemptionId: 'rice', pointsRedeemed: 5 }), /Tambahkan produk hadiah/)
    await db.exec('reset role')
    assert.equal(Number((await db.query<any>('select stock from public.catalog_products where id=$1', [rice])).rows[0].stock), Number(stockBefore) - 0.25)
    await as(owner)
    const stacked = await checkout({...redeemed,discountKind:'percent',discountValue:'10',received:'88800'})
    assert.equal(stacked.order_discount,10000);assert.equal(stacked.point_discount,10000);assert.equal(stacked.tax_amount,8800);assert.equal(stacked.total,88800)
    await rpc('save_business_loyalty_settings',[bid,false,10000,rules])
    await assert.rejects(checkout(redeemed),/aktifkan program poin/)
    await rpc('save_business_loyalty_settings',[bid,true,10000,rules])
    await db.exec('reset role');await db.query('update public.customers set active=false where id=$1',[customer]);await as(owner)
    await assert.rejects(checkout(redeemed),/Customer unavailable/)
    await db.exec('reset role');await db.query('update public.customers set active=true where id=$1',[customer])
    await as(other); await assert.rejects(checkout(redeemed), /denied/)
    await assert.rejects(rpc('save_business_loyalty_settings', [foreign, true, 10000, rules]), /unavailable/)
    await as(owner)
    await rpc('save_business_loyalty_settings', [bid, true, 1000000, rules])
    await db.exec('reset role'); await db.query('update public.customers set points=10 where id=$1', [customer]); await as(cashier)
    const simultaneous = await Promise.allSettled([checkout(redeemed), checkout(redeemed)])
    assert.equal(simultaneous.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(simultaneous.filter(r => r.status === 'rejected').length, 1)
    await db.exec('reset role')
    assert.equal(Number((await db.query<any>('select points from public.customers where id=$1', [customer])).rows[0].points), 0)
    assert.deepEqual((await db.query('select * from public.pos_transactions where id=$1', [oldSale.id])).rows, legacy)
  } finally { await db.close() }
})
