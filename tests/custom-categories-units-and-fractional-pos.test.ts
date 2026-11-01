import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { parseQuantityInput, quantity, defaultProductUnits } from '../lib/catalog'
import { lineAmount, quote, type Sale } from '../lib/pos'
import { discountedPrice, productQuote, checkoutQuote } from '../lib/product-pricing'

test('parseQuantityInput and quantity support fractions, mixed fractions, decimals and commas with exact validation', () => {
  // Simple fractions
  const half = parseQuantityInput('1/2')
  assert.equal(half.valid, true)
  assert.equal(half.value, 0.5)
  assert.equal(half.formatted, '0.5')

  const quarter = parseQuantityInput('1/4')
  assert.equal(quarter.valid, true)
  assert.equal(quarter.value, 0.25)
  assert.equal(quarter.formatted, '0.25')

  const threeQuarters = parseQuantityInput('3/4')
  assert.equal(threeQuarters.valid, true)
  assert.equal(threeQuarters.value, 0.75)
  assert.equal(threeQuarters.formatted, '0.75')

  // Mixed fractions
  const mixedOneAndHalf = parseQuantityInput('1 1/2')
  assert.equal(mixedOneAndHalf.valid, true)
  assert.equal(mixedOneAndHalf.value, 1.5)
  assert.equal(mixedOneAndHalf.formatted, '1.5')

  const mixedTwoAndQuarter = parseQuantityInput('2 1/4')
  assert.equal(mixedTwoAndQuarter.valid, true)
  assert.equal(mixedTwoAndQuarter.value, 2.25)
  assert.equal(mixedTwoAndQuarter.formatted, '2.25')

  // Decimals with comma and dot
  const decimalComma = parseQuantityInput('0,5')
  assert.equal(decimalComma.valid, true)
  assert.equal(decimalComma.value, 0.5)

  const decimalQuarterComma = parseQuantityInput('0,25')
  assert.equal(decimalQuarterComma.valid, true)
  assert.equal(decimalQuarterComma.value, 0.25)

  const decimalOneAndHalfComma = parseQuantityInput('1,5')
  assert.equal(decimalOneAndHalfComma.valid, true)
  assert.equal(decimalOneAndHalfComma.value, 1.5)

  const decimalDot = parseQuantityInput('0.5')
  assert.equal(decimalDot.valid, true)
  assert.equal(decimalDot.value, 0.5)

  // Integers
  const integerVal = parseQuantityInput('10')
  assert.equal(integerVal.valid, true)
  assert.equal(integerVal.value, 10)

  // Rejections
  assert.equal(parseQuantityInput('0').valid, false)
  assert.equal(parseQuantityInput('0.0').valid, false)
  assert.equal(parseQuantityInput('0/2').valid, false)
  assert.equal(parseQuantityInput('-0.5').valid, false)
  assert.equal(parseQuantityInput('-1/2').valid, false)
  assert.equal(parseQuantityInput('1/0').valid, false)
  assert.equal(parseQuantityInput('abc').valid, false)
  assert.equal(parseQuantityInput('').valid, false)

  // quantity() helper conversions
  assert.equal(quantity('1/2'), '0.5')
  assert.equal(quantity('1/4'), '0.25')
  assert.equal(quantity('3/4'), '0.75')
  assert.equal(quantity('1 1/2'), '1.5')
  assert.equal(quantity('0,5'), '0.5')
  assert.equal(quantity('0.25'), '0.25')
  assert.throws(() => quantity('-1/2'), /tidak boleh bernilai negatif/)
  assert.throws(() => quantity('1/0'), /Pembagian dengan nol/)
})

test('real-time subtotal and total calculations with fractional quantities match user examples exactly', () => {
  // Contoh 1: Harga Rp20.000/kg x 0,5 kg = Rp10.000
  assert.equal(lineAmount(20000, 0.5), 10000)

  // Contoh 2: Harga Rp20.000/kg x 0,25 kg = Rp5.000
  assert.equal(lineAmount(20000, 0.25), 5000)

  // Contoh 3: Harga Rp10.000/liter x 1,5 liter = Rp15.000
  assert.equal(lineAmount(10000, 1.5), 15000)

  // Contoh 4: Harga Rp8.000/porsi x 1,5 porsi = Rp12.000
  assert.equal(lineAmount(8000, 1.5), 12000)

  // Real-time cart calculations changing quantity multiple times
  const beras = { id: 'p1', price: 20000 }
  const minyak = { id: 'p2', price: 10000 }

  // Initial cart: 1 kg beras + 1 liter minyak
  let quoteRes = checkoutQuote([
    { product: beras, quantity: 1 },
    { product: minyak, quantity: 1 },
  ])
  assert.equal(quoteRes.subtotal, 30000)
  assert.equal(quoteRes.total, 30000)

  // Kasir mengetik 0,5 kg beras -> langsung update real-time
  quoteRes = checkoutQuote([
    { product: beras, quantity: 0.5 },
    { product: minyak, quantity: 1 },
  ])
  assert.equal(quoteRes.subtotal, 20000) // 10000 + 10000
  assert.equal(quoteRes.total, 20000)

  // Kasir mengetik 0,25 kg beras
  quoteRes = checkoutQuote([
    { product: beras, quantity: 0.25 },
    { product: minyak, quantity: 1 },
  ])
  assert.equal(quoteRes.subtotal, 15000) // 5000 + 10000
  assert.equal(quoteRes.total, 15000)

  // Kasir mengetik 1/2 liter minyak (0.5 liter)
  const parsedFraction = parseQuantityInput('1/2').value
  assert.equal(parsedFraction, 0.5)
  quoteRes = checkoutQuote([
    { product: beras, quantity: 0.25 },
    { product: minyak, quantity: parsedFraction },
  ])
  assert.equal(quoteRes.subtotal, 10000) // 5000 + 5000
  assert.equal(quoteRes.total, 10000)
})

test('end-to-end database integration: custom categories, custom units, fractional POS, stock deduction & consistency', async () => {
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

    const migrationFiles = [
      '202610200001_foundation.sql',
      '202610210001_profile_setup.sql',
      '202610220001_catalog_inventory.sql',
      '202610220002_bulk_catalog.sql',
      '202610220003_product_image_policy.sql',
      '202610220004_pos_transactions.sql',
      '202610220005_customers.sql',
      '202610230001_sales_reports.sql',
      '202610230002_onboarding_completion.sql',
      '202610230003_auto_product_sku.sql',
      '202611010001_product_discounts_tax.sql',
      '202611010002_business_payments.sql',
      '202611010003_optional_payment_methods.sql',
      '202611010004_receipt_numbers.sql',
      '202611010005_pos_order_discounts.sql',
      '202611010006_loyalty_points.sql',
      '202611010007_business_payments_ewallet.sql',
      '202611010008_custom_categories_and_units.sql',
    ]

    for (const file of migrationFiles) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    }

    const owner = randomUUID()
    const cashier = randomUUID()
    for (const id of [owner, cashier]) {
      await db.query('insert into auth.users(id) values($1)', [id])
    }

    const as = async (id: string) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec('set role authenticated')
    }

    // 1. Create business and member
    await as(owner)
    const bid = (await db.query<any>("select public.create_business('Toko Sembako Maju','Owner') id")).rows[0].id
    await db.exec('reset role')
    await db.query("insert into public.business_members(business_id,user_id,name,username,role) values($1,$2,'Kasir Sembako','kasir1','cashier')", [bid, cashier])

    // Scenario 1: Membuat kategori custom dan menggunakannya pada produk lain
    await as(owner)
    const pBeras = randomUUID()
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [
      bid,
      pBeras,
      randomUUID(),
      {
        name: 'Beras Rojolele',
        category: 'Sembako Premium', // Custom category
        unit: 'kg',
        sku: 'BRS-01',
        barcode: '123456789',
        price: '20000',
        initialStock: '10',
        minimum: '2',
        active: true,
      },
    ])

    // Check that 'Sembako Premium' was automatically saved in product_categories
    const catCheck = await db.query<any>('select * from public.product_categories where business_id=$1', [bid])
    assert.equal(catCheck.rows.length, 1)
    assert.equal(catCheck.rows[0].name, 'Sembako Premium')

    // Reuse category on another product (with different casing: 'sembako premium')
    const pGula = randomUUID()
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [
      bid,
      pGula,
      randomUUID(),
      {
        name: 'Gula Pasir',
        category: 'Sembako Premium',
        unit: 'kg',
        sku: 'GLA-01',
        barcode: '987654321',
        price: '20000',
        initialStock: '5',
        minimum: '1',
        active: true,
      },
    ])
    // Deduplication check: should NOT create a duplicate in product_categories
    const catCheck2 = await db.query<any>('select * from public.product_categories where business_id=$1', [bid])
    assert.equal(catCheck2.rows.length, 1)

    // Scenario 2: Membuat unit custom dan menggunakannya pada produk lain
    const pTali = randomUUID()
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [
      bid,
      pTali,
      randomUUID(),
      {
        name: 'Tali Rafia',
        category: 'Perlengkapan',
        unit: 'meter', // Custom unit
        sku: 'RAF-01',
        barcode: '111222333',
        price: '1000',
        initialStock: '100',
        minimum: '10',
        active: true,
      },
    ])

    const unitCheck = await db.query<any>('select * from public.product_units where business_id=$1', [bid])
    assert.ok(unitCheck.rows.some((r: any) => r.name === 'meter'))

    // Scenario 3: Mengedit produk yang menggunakan kategori dan unit custom
    // Edit pTali price & category, preserving unit 'meter'
    await db.query('select public.save_catalog_product($1,$2,0,$3,$4)', [
      bid,
      pTali,
      randomUUID(),
      {
        name: 'Tali Rafia Merah',
        category: 'Perlengkapan Toko',
        unit: 'meter',
        sku: 'RAF-01',
        barcode: '111222333',
        price: '1500',
        initialStock: '0',
        minimum: '10',
        active: true,
      },
    ])
    const pTaliAfter = (await db.query<any>('select * from public.catalog_products where id=$1', [pTali])).rows[0]
    assert.equal(pTaliAfter.name, 'Tali Rafia Merah')
    assert.equal(pTaliAfter.unit, 'meter')
    assert.equal(Number(pTaliAfter.price), 1500)

    // Add Minyak Goreng with unit 'liter'
    const pMinyak = randomUUID()
    await db.query('select public.save_catalog_product($1,$2,null,$3,$4)', [
      bid,
      pMinyak,
      randomUUID(),
      {
        name: 'Minyak Goreng',
        category: 'Sembako Premium',
        unit: 'liter',
        sku: 'MYK-01',
        barcode: '444555666',
        price: '10000',
        initialStock: '2',
        minimum: '0.5',
        active: true,
      },
    ])

    // Scenario 4 & 5: Membeli produk 0,5 kg, 0,25 kg, dan 1/2 liter (0.5 liter)
    // 0.5 kg Beras (20000 x 0.5 = 10000)
    // 0.25 kg Gula (20000 x 0.25 = 5000)
    // 1/2 liter Minyak (10000 x 0.5 = 5000)
    // Total = 10000 + 5000 + 5000 = 20000
    await as(cashier)
    const cartLines = [
      { id: pBeras, quantity: '0.5', price: '20000', revision: 0 },
      { id: pGula, quantity: '0.25', price: '20000', revision: 0 },
      { id: pMinyak, quantity: parseQuantityInput('1/2').formatted, price: '10000', revision: 0 },
    ]
    const checkoutKey = randomUUID()
    const salePayload = {
      lines: cartLines,
      payment: 'cash',
      received: '25000',
      discountKind: 'none',
      discountValue: '0',
      customer: 'Ibu Rahma',
      confirmed: true,
    }

    const saleResult = (await db.query<any>('select public.checkout_pos($1,$2,$3) sale', [bid, checkoutKey, salePayload])).rows[0].sale

    // Subtotal and Total verification
    assert.equal(Number(saleResult.subtotal), 20000)
    assert.equal(Number(saleResult.total), 20000)
    assert.equal(Number(saleResult.received), 25000)
    assert.equal(Number(saleResult.change), 5000)

    // Check lines inside sale snapshot
    const lines = saleResult.lines
    assert.equal(lines.length, 3)
    const lineBeras = lines.find((l: any) => l.id === pBeras)
    assert.equal(Number(lineBeras.quantity), 0.5)
    assert.equal(Number(lineBeras.total), 10000)
    assert.equal(lineBeras.unit, 'kg')

    const lineGula = lines.find((l: any) => l.id === pGula)
    assert.equal(Number(lineGula.quantity), 0.25)
    assert.equal(Number(lineGula.total), 5000)
    assert.equal(lineGula.unit, 'kg')

    const lineMinyak = lines.find((l: any) => l.id === pMinyak)
    assert.equal(Number(lineMinyak.quantity), 0.5)
    assert.equal(Number(lineMinyak.total), 5000)
    assert.equal(lineMinyak.unit, 'liter')

    // Scenario 6: Memastikan stok berkurang sesuai kuantitas pecahan
    // Beras: 10 kg - 0.5 kg = 9.5 kg
    const berasStock = (await db.query<any>('select stock from public.catalog_products where id=$1', [pBeras])).rows[0].stock
    assert.equal(Number(berasStock), 9.5)

    // Gula: 5 kg - 0.25 kg = 4.75 kg
    const gulaStock = (await db.query<any>('select stock from public.catalog_products where id=$1', [pGula])).rows[0].stock
    assert.equal(Number(gulaStock), 4.75)

    // Minyak: 2 liter - 0.5 liter = 1.5 liter
    const minyakStock = (await db.query<any>('select stock from public.catalog_products where id=$1', [pMinyak])).rows[0].stock
    assert.equal(Number(minyakStock), 1.5)

    // Stock movement logs verification (as owner who has SELECT permission on stock_movements)
    await as(owner)
    const movements = (await db.query<any>('select * from public.stock_movements where sale_id=$1', [saleResult.id])).rows
    assert.equal(movements.length, 3)
    const movBeras = movements.find((m: any) => m.product_id === pBeras)
    assert.equal(Number(movBeras.quantity), -0.5)
    assert.equal(Number(movBeras.before_stock), 10)
    assert.equal(Number(movBeras.after_stock), 9.5)

    // Scenario 7: Memastikan data tetap benar setelah transaksi disimpan dan halaman dimuat ulang
    // Query sale record directly
    const reloadedSale = (await db.query<any>('select * from public.pos_transactions where id=$1', [saleResult.id])).rows[0]
    assert.equal(reloadedSale.status, 'completed')
    assert.equal(Number(reloadedSale.total), 20000)
    assert.equal(reloadedSale.customer, 'Pelanggan umum')

    // Test cancellation consistency with fractional stock
    const cancelRes = (await db.query<any>('select public.cancel_pos($1,$2,$3,$4,$5) sale', [
      bid,
      saleResult.id,
      'Pelanggan salah pesan takaran',
      true,
      true,
    ])).rows[0].sale
    assert.equal(cancelRes.status, 'cancelled')

    // Verify stock is restored by exact fractional amount: 9.5 + 0.5 = 10 kg
    const berasRestored = (await db.query<any>('select stock from public.catalog_products where id=$1', [pBeras])).rows[0].stock
    assert.equal(Number(berasRestored), 10)

    const gulaRestored = (await db.query<any>('select stock from public.catalog_products where id=$1', [pGula])).rows[0].stock
    assert.equal(Number(gulaRestored), 5)

    const minyakRestored = (await db.query<any>('select stock from public.catalog_products where id=$1', [pMinyak])).rows[0].stock
    assert.equal(Number(minyakRestored), 2)
  } finally {
    await db.close()
  }
})
