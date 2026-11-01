import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('loyalty points settings, accrual on checkout, ledger history and cancellation reversal', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated; grant all on storage.objects,storage.buckets to service_role;
    `)

    const files = (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()
    for (const f of files) {
      const sql = await readFile('supabase/migrations/' + f, 'utf8')
      await db.exec(sql)
    }

    // Setup Owner and Business
    const ownerId = randomUUID()
    await db.query('insert into auth.users(id) values($1)', [ownerId])

    const asUser = async (id: string) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
      await db.exec('set role authenticated')
    }

    await asUser(ownerId)

    const createRes = await db.query<{ id: string }>(
      "select public.create_business_profile('Toko Poin Uji', 'Pemilik', '081234567890', 'Jl Uji No 1', 'Bandung', 'Jawa Barat', '') as id"
    )
    const businessId = createRes.rows[0].id
    await db.query('select public.complete_business_onboarding($1)', [businessId])

    // Verify default loyalty points config
    const bizRow = (await db.query<any>('select * from public.businesses where id = $1', [businessId])).rows[0]
    assert.equal(bizRow.loyalty_active, false)
    assert.equal(Number(bizRow.loyalty_point_nominal), 50000)

    // Update settings via save_business_loyalty_settings RPC
    const saved = (
      await db.query<any>(
        'select * from public.save_business_loyalty_settings($1, $2, $3)',
        [businessId, true, 50000]
      )
    ).rows[0]
    assert.equal(saved.loyalty_active, true)
    assert.equal(Number(saved.loyalty_point_nominal), 50000)

    // Validation: rejecting nominal <= 0
    await assert.rejects(
      db.query('select public.save_business_loyalty_settings($1, $2, $3)', [businessId, true, 0]),
      /Invalid loyalty configuration/
    )

    // Add a customer
    const customerId = randomUUID()
    await db.query(
      'select public.save_customer($1, $2, null, $3, $4)',
      [businessId, customerId, randomUUID(), { name: 'Budi Member', phone: '08123456789', notes: 'Catatan', active: true }]
    )

    // Check customer initial points
    const initCust = (await db.query<any>('select points from public.customers where id = $1', [customerId])).rows[0]
    assert.equal(initCust.points, 0)

    // Create a product in catalog
    const prodRes = await db.query<any>(
      "select public.save_catalog_product($1, $2, null, $3, $4) as prod",
      [
        businessId,
        randomUUID(),
        randomUUID(),
        {
          name: 'Produk A',
          category: 'Kebutuhan pokok',
          unit: 'pcs',
          sku: '',
          barcode: '',
          price: '25000',
          minimum: '0',
          initialStock: '100',
          active: true
        }
      ]
    )
    const prod = prodRes.rows[0].prod

    // Perform POS Checkout: 5 units of Produk A = Rp125.000
    // With nominal Rp50.000 per point, points = floor(125000 / 50000) = 2 points
    const opId1 = randomUUID()
    const checkoutPayload1 = {
      lines: [{ id: prod.id, price: String(prod.price), quantity: '5', revision: prod.revision }],
      payment: 'cash',
      received: '125000',
      discountKind: 'none',
      discountValue: '0',
      confirmed: true,
      customerId: customerId,
      taxRate: '0',
      taxRevision: 0,
      paymentRevision: 0
    }

    const saleRes1 = await db.query<any>(
      'select public.checkout_pos($1, $2, $3) as sale',
      [businessId, opId1, checkoutPayload1]
    )
    const sale1 = saleRes1.rows[0].sale

    assert.equal(sale1.status, 'completed')
    assert.equal(Number(sale1.total), 125000)
    assert.equal(sale1.points_earned, 2)

    // Verify customer's updated points balance = 2
    const updatedCust = (await db.query<any>('select points from public.customers where id = $1', [customerId])).rows[0]
    assert.equal(updatedCust.points, 2)

    // Verify ledger history recorded
    const history1 = (
      await db.query<any>(
        'select * from public.customer_point_history where customer_id = $1 and sale_id = $2',
        [customerId, sale1.id]
      )
    ).rows
    assert.equal(history1.length, 1)
    assert.equal(history1[0].kind, 'earn')
    assert.equal(history1[0].points, 2)
    assert.equal(history1[0].before_points, 0)
    assert.equal(history1[0].after_points, 2)

    // Non-member checkout: customerId null -> 0 points
    const opId2 = randomUUID()
    const checkoutPayload2 = {
      lines: [{ id: prod.id, price: String(prod.price), quantity: '2', revision: prod.revision }],
      payment: 'cash',
      received: '50000',
      discountKind: 'none',
      discountValue: '0',
      confirmed: true,
      taxRate: '0',
      taxRevision: 0,
      paymentRevision: 0
    }
    const saleRes2 = await db.query<any>(
      'select public.checkout_pos($1, $2, $3) as sale',
      [businessId, opId2, checkoutPayload2]
    )
    const sale2 = saleRes2.rows[0].sale
    assert.equal(sale2.points_earned, 0)

    // Test transaction cancellation: cancelling sale1 should reverse points
    const cancelRes = await db.query<any>(
      'select public.cancel_pos($1, $2, $3, true, true) as sale',
      [businessId, sale1.id, 'Pembatalan barang retur']
    )
    assert.equal(cancelRes.rows[0].sale.status, 'cancelled')

    // Verify customer points balance reversed from 2 back to 0
    const custAfterCancel = (await db.query<any>('select points from public.customers where id = $1', [customerId])).rows[0]
    assert.equal(custAfterCancel.points, 0)

    // Verify refund history recorded in ledger
    const refundHistory = (
      await db.query<any>(
        "select * from public.customer_point_history where customer_id = $1 and kind = 'refund'",
        [customerId]
      )
    ).rows
    assert.equal(refundHistory.length, 1)
    assert.equal(refundHistory[0].points, -2)
    assert.equal(refundHistory[0].before_points, 2)
    assert.equal(refundHistory[0].after_points, 0)

    // Test inactive program: turning toggle off gives 0 points
    await db.query('select public.save_business_loyalty_settings($1, $2, $3)', [businessId, false, 50000])
    const opId3 = randomUUID()
    const checkoutPayload3 = {
      lines: [{ id: prod.id, price: String(prod.price), quantity: '2', revision: prod.revision }],
      payment: 'cash',
      received: '50000',
      discountKind: 'none',
      discountValue: '0',
      confirmed: true,
      customerId: customerId,
      taxRate: '0',
      taxRevision: 0,
      paymentRevision: 0
    }
    const saleRes3 = await db.query<any>(
      'select public.checkout_pos($1, $2, $3) as sale',
      [businessId, opId3, checkoutPayload3]
    )
    assert.equal(saleRes3.rows[0].sale.points_earned, 0)
    const custAfterInactive = (await db.query<any>('select points from public.customers where id = $1', [customerId])).rows[0]
    assert.equal(custAfterInactive.points, 0)
  } finally {
    await db.close()
  }
})
