import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { defaultReportFilter, reportQuery } from '../../lib/reports'

async function fixture(browser: Browser, baseURL: string | undefined) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (result: any) => { if (result.error) throw Error('Store reconciliation fixture: ' + result.error.code); return result.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((row: any) => row.id)
  const tables: Record<string, string> = { businesses: 'id,name,code,phone,address,profile_revision,operating_hours,hours_revision,onboarding_completed_at,tax_rate,tax_revision,loyalty_active,loyalty_point_nominal', business_members: '*', catalog_products: '*', stock_movements: '*', pos_transactions: 'id,business_id,actor_id,actor_name,customer,customer_id,lines,subtotal,discount_kind,discount_value,discount,total,payment,received,change,status,created_at,cancelled_at,cancelled_by_name,cancellation_reason,refund_amount,tax_rate,tax_amount,product_discount,order_discount,receipt_number', customers: 'id,business_id,name,phone,notes,active,revision,created_at,updated_at', business_payments: '*' }
  async function snapshot() {
    const out: Record<string, unknown[]> = {}
    for (const [table, columns] of Object.entries(tables)) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select(columns).in(table === 'businesses' ? 'id' : 'business_id', legacy).order(table === 'business_payments' ? 'business_id' : 'id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      out[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(out)).digest('hex')
  }
  const before = await snapshot(), users: string[] = [], businesses: string[] = [], contexts: BrowserContext[] = [], errors: string[] = []
  async function login(email: string, password: string) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }); contexts.push(context)
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Kata sandi', { exact: true }).fill(password); await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(page).toHaveURL(/\/(dashboard|onboarding)/)
    return page
  }
  async function account(role?: 'admin' | 'cashier', bid?: string, draft = false) {
    const email = `usahaku-store-fix-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url'), uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role ? 'staff' : 'owner' } })).user.id
    users.push(uid)
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options); ok(await client.auth.signInWithPassword({ email, password }))
    if (bid) ok(await admin.from('business_members').insert({ business_id: bid, user_id: uid, name: 'Petugas Uji', username: role + randomBytes(3).toString('hex'), role, must_change_password: false }))
    else if (!draft) { bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Perbaikan', owner_name: 'Owner Uji', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' })); businesses.push(bid!); ok(await client.rpc('complete_business_onboarding', { target_id: bid })) }
    return { client, bid: bid!, uid, email, password, page: await login(email, password) }
  }
  async function product(actor: Awaited<ReturnType<typeof account>>, price = '10000', name = 'Produk Uji', stock = '10') {
    const id = randomUUID(); ok(await actor.client.rpc('save_catalog_product', { target_id: actor.bid, item_id: id, expected_version: null, operation_id: randomUUID(), details: { name, category: 'Audit', unit: 'kg', sku: '', barcode: '', price, minimum: '0', initialStock: stock, active: true, discountKind: price === '10000' ? 'percent' : 'none', discountValue: price === '10000' ? 10 : 0 } })); return id
  }
  async function cleanup(name: string, passed: boolean) {
    for (const context of contexts) await context.close()
    if (users.length) for (const row of ok(await admin.from('businesses').select('id').in('owner_id', users))) if (!businesses.includes(row.id)) businesses.push(row.id)
    for (const bid of businesses) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    for (const uid of users) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir('.cache/store-fixes', { recursive: true }); await writeFile(`.cache/store-fixes/${name}.json`, JSON.stringify({ passed, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
  return { admin, ok, account, product, login, errors, cleanup }
}

test('quantity draft, stock clamp and checkout stay synchronized on desktop and phones', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const f = await fixture(browser, baseURL); let passed = false
  try {
    const owner = await f.account(); await f.product(owner); const page = owner.page
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('/dashboard/pos'); await expect(page.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Tambah Produk Uji', exact: true }).click()
      const field = page.getByLabel('Jumlah Produk Uji', { exact: true }), cart = page.locator('aside').filter({ hasText: 'Keranjang aktif' }), submit = page.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true })
      for (const raw of ['1/0', '', 'abc', '0']) { await field.fill(raw); await field.press('Tab'); await expect(field).toHaveAttribute('aria-invalid', 'true'); await page.getByLabel('Nominal tunai diterima', { exact: true }).fill('100000'); await cart.getByRole('checkbox').check(); await expect(submit).toBeDisabled() }
      await field.fill('1/2'); await field.press('Tab'); await expect(field).toHaveValue('0.5'); await expect(field).toHaveAttribute('aria-invalid', 'false'); await expect(cart).toContainText('Rp4.500')
      await field.fill('999'); await expect(submit).toBeDisabled(); await field.press('Tab'); await expect(field).toHaveValue('10'); await expect(cart).toContainText('Rp90.000'); await expect(field).toHaveAttribute('aria-invalid', 'false')
      await page.getByRole('button', { name: 'Kurangi jumlah', exact: true }).click(); await expect(field).toHaveValue('9'); await page.getByRole('button', { name: 'Tambah jumlah', exact: true }).click(); await expect(field).toHaveValue('10')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await mkdir('.cache/store-fixes', { recursive: true }); await cart.screenshot({ path: `.cache/store-fixes/quantity-${width}.png` })
      await page.getByRole('button', { name: 'Hapus Produk Uji', exact: true }).click(); await expect(submit).toHaveCount(0)
    }
    expect(f.errors).toEqual([]); passed = true
  } finally { await f.cleanup('quantity-browser', passed) }
})

test('real e-wallet, stacked discounts, loyalty retry/reversal, access and report exports work together', async ({ browser, baseURL }) => {
  test.setTimeout(300000)
  const f = await fixture(browser, baseURL); let passed = false
  try {
    f.ok(await f.admin.from('customers').select('points').limit(1)); f.ok(await f.admin.from('customer_point_history').select('id').limit(1))
    const owner = await f.account(), staff = await f.account('admin', owner.bid), cashier = await f.account('cashier', owner.bid), cashierB = await f.account('cashier', owner.bid), other = await f.account()
    const pid = await f.product(owner), customer = randomUUID()
    f.ok(await owner.client.rpc('save_customer', { target_id: owner.bid, item_id: customer, expected_version: null, operation_id: randomUUID(), details: { name: 'Pelanggan Uji', phone: '081234567891', notes: '', active: true } }))
    const page = owner.page
    await page.goto('/dashboard/settings'); await page.getByRole('switch', { name: 'Aktifkan program poin member', exact: true }).click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Program Poin Member', exact: true }) })
    await section.locator('input').fill('5000'); await section.getByRole('button', { name: 'Simpan pengaturan poin', exact: true }).click()
    await expect.poll(async () => Number(f.ok(await f.admin.from('businesses').select('loyalty_point_nominal').eq('id', owner.bid).single()).loyalty_point_nominal)).toBe(5000)
    await section.locator('input').fill('1000000001'); await section.getByRole('button', { name: 'Simpan pengaturan poin', exact: true }).click(); await expect(page.getByText('Isi nominal rupiah bulat antara Rp1 dan Rp1.000.000.000.', { exact: true })).toBeVisible()
    expect(Number(f.ok(await f.admin.from('businesses').select('loyalty_point_nominal').eq('id', owner.bid).single()).loyalty_point_nominal)).toBe(5000)
    f.ok(await owner.client.rpc('save_store_tax', { target_id: owner.bid, expected_version: 0, rate: 11 }))
    f.ok(await owner.client.rpc('save_business_payments', { target_id: owner.bid, expected_revision: 0, details: { cash: true, qris: false, transfer: false, banks: [], ewallet: true, ewallets: [{ ewallet: 'DANA', holder: 'Owner Uji', number: '081234567890' }] }, asset_id: null }))
    await page.goto('/dashboard/pos'); await page.getByRole('button', { name: 'Tambah Produk Uji', exact: true }).click(); await page.getByLabel('Jumlah Produk Uji', { exact: true }).fill('2'); await page.getByLabel('Jumlah Produk Uji', { exact: true }).press('Tab')
    await page.getByLabel('Pilih kategori pelanggan POS', { exact: true }).click(); await page.getByRole('option', { name: 'Pelanggan', exact: true }).click(); await page.getByLabel('Cari pelanggan POS', { exact: true }).fill('Pelanggan Uji'); await page.getByRole('button', { name: /Pelanggan Uji.*Pilih/ }).click()
    await page.getByLabel('Jenis diskon keseluruhan', { exact: true }).click(); await page.getByRole('option', { name: 'Persen (%)', exact: true }).click(); await page.getByLabel('Nilai diskon keseluruhan', { exact: true }).fill('10')
    await page.getByRole('button', { name: 'E-wallet', exact: true }).click(); const cart = page.locator('aside').filter({ hasText: 'Keranjang aktif' }); await expect(cart).toContainText('Rp17.982'); await cart.getByRole('checkbox').check()
    let dropped = false
    await page.route('**/dashboard/pos', async route => { if (!dropped && route.request().method() === 'POST' && route.request().headers()['next-action']) { dropped = true; await route.fetch(); await route.abort('connectionreset') } else await route.continue() })
    await page.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true }).click(); await expect(page.getByRole('button', { name: 'Coba ulang permintaan yang sama', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Coba ulang permintaan yang sama', exact: true }).click(); await expect(page.getByRole('status')).toContainText('berhasil dicatat'); await page.unrouteAll()
    const sale = f.ok(await f.admin.from('pos_transactions').select('*').eq('business_id', owner.bid).single()); expect(Number(sale.total)).toBe(17982); expect(sale.payment).toBe('ewallet'); expect(Number(sale.points_earned)).toBe(3)
    expect(Number(f.ok(await f.admin.from('customers').select('points').eq('id', customer).single()).points)).toBe(3)
    expect(f.ok(await f.admin.from('customer_point_history').select('id').eq('business_id', owner.bid))).toHaveLength(1)
    const fresh = await f.login(owner.email, owner.password); await fresh.goto('/dashboard/transactions/' + sale.id); await expect(fresh.locator('#pos-receipt')).toContainText('E-WALLET'); await expect(fresh.locator('#pos-receipt')).toContainText('Rp17.982')
    await fresh.emulateMedia({ media: 'print' }); await expect(fresh.locator('#pos-print-root')).toContainText(sale.receipt_number); await fresh.pdf({ path: '.cache/store-fixes/ewallet-receipt.pdf', width: '80mm', height: '280mm', printBackground: true }); await fresh.emulateMedia({ media: 'screen' })
    const filters = { ...defaultReportFilter(), payment: 'ewallet' as const }, query = reportQuery(filters)
    await fresh.goto('/dashboard/reports?' + query); await expect(fresh.getByLabel('Metode pembayaran laporan', { exact: true })).toContainText('E-wallet')
    await expect(fresh.getByRole('row', { name: /^E-wallet 1 / })).toContainText('Rp16.200')
    const csv = await fresh.request.get('/api/reports/sales?' + query); expect(csv.status()).toBe(200); expect(await csv.text()).toContain('E-wallet'); expect(await csv.text()).toContain(sale.receipt_number)
    await fresh.emulateMedia({ media: 'print' }); await expect(fresh.locator('#report-print-root')).toContainText('E-wallet'); await fresh.pdf({ path: '.cache/store-fixes/ewallet-report.pdf', format: 'A4', landscape: true, printBackground: true }); await fresh.emulateMedia({ media: 'screen' })
    for (const actor of [staff, cashier, cashierB, other]) expect((await actor.client.rpc('save_business_loyalty_settings', { target_id: owner.bid, new_active: false, new_nominal: 1 })).error?.code).toBe('42501')
    for (const actor of [cashier, cashierB, other]) expect(f.ok(await actor.client.from('customer_point_history').select('id').eq('business_id', owner.bid))).toEqual([])
    const details = { lines: [{ id: pid, quantity: '1', price: '10000', revision: 0 }], payment: 'ewallet', received: '9990', discountKind: 'none', discountValue: '0', customerId: customer, taxRate: '11', taxRevision: 1, paymentRevision: 1, confirmed: true }
    const own = f.ok(await cashier.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details })); expect(Number(own.points_earned)).toBe(1)
    await cashier.page.goto('/dashboard/transactions/' + own.id); await expect(cashier.page.locator('#pos-receipt')).toContainText(own.receipt_number); await cashierB.page.goto('/dashboard/transactions/' + own.id); await expect(cashierB.page.getByRole('heading', { name: /404/ })).toBeVisible()
    f.ok(await owner.client.rpc('cancel_pos', { target_id: owner.bid, sale_id: sale.id, explanation: 'Pembatalan uji perbaikan', goods_returned: true, refund_confirmed: true })); f.ok(await owner.client.rpc('cancel_pos', { target_id: owner.bid, sale_id: sale.id, explanation: 'Pembatalan uji perbaikan', goods_returned: true, refund_confirmed: true }))
    expect(Number(f.ok(await f.admin.from('customers').select('points').eq('id', customer).single()).points)).toBe(1)
    const report = f.ok(await owner.client.rpc('read_sales_report', { target_id: owner.bid, from_ts: new Date(filters.from + 'T00:00:00+07:00').toISOString(), to_ts: new Date(Date.parse(filters.to + 'T00:00:00+07:00') + 86400000).toISOString(), payment_method: 'ewallet' })); expect(report.refunds).toHaveLength(1)
    f.ok(await owner.client.rpc('save_business_loyalty_settings', { target_id: owner.bid, new_active: true, new_nominal: 1 })); const huge = await f.product(owner, '2147483648', 'Batas Poin', '1')
    const high = f.ok(await owner.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details: { ...details, lines: [{ id: huge, quantity: '1', price: '2147483648', revision: 0 }], taxRate: '11', received: '2383706849' } })); expect(Number(high.points_earned)).toBeGreaterThan(2147483647)
    f.ok(await owner.client.rpc('cancel_pos', { target_id: owner.bid, sale_id: high.id, explanation: 'Pembatalan batas poin uji', goods_returned: true, refund_confirmed: true })); expect(Number(f.ok(await f.admin.from('customers').select('points').eq('id', customer).single()).points)).toBe(1)
    expect(f.errors).toEqual([]); passed = true
  } finally { await f.cleanup('integration-browser', passed) }
})

test('onboarding stores loyalty choices and owner profile updates keep the saved configuration', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const f = await fixture(browser, baseURL); let passed = false
  try {
    const owner = await f.account(undefined, undefined, true), page = owner.page
    await page.goto('/onboarding/identity')
    await page.getByLabel('Nama usaha *', { exact: true }).fill('Toko Onboarding Poin')
    await page.getByPlaceholder('Nama jalan, nomor, dan detail alamat', { exact: true }).fill('Jalan Uji No 1')
    await page.getByLabel('Provinsi *', { exact: true }).click(); await page.getByRole('option', { name: 'Jawa Barat', exact: true }).click()
    await page.getByLabel('Kota/Kabupaten *', { exact: true }).click(); await page.getByRole('option', { name: 'Kota Bandung', exact: true }).click()
    await page.getByLabel('Nomor kontak usaha *', { exact: true }).fill('081234567890')
    await page.getByRole('switch', { name: 'Aktifkan program poin member', exact: true }).click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Program Poin Member', exact: true }) })
    await section.locator('input').fill('5000')
    await page.getByRole('button', { name: 'Simpan & lanjutkan', exact: true }).click(); await expect(page).toHaveURL(/\/onboarding\/setup/)
    const business = f.ok(await f.admin.from('businesses').select('*').eq('owner_id', owner.uid).single())
    expect(business.loyalty_active).toBe(true); expect(Number(business.loyalty_point_nominal)).toBe(5000); expect(business.onboarding_completed_at).toBeNull()
    await page.goto('/dashboard'); await expect(page).toHaveURL(/\/onboarding/)
    await page.goto('/onboarding/summary'); await page.getByRole('button', { name: 'Buka dashboard', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/dashboard/settings'); await page.getByLabel('Nama usaha *', { exact: true }).fill('Toko Profil Poin Tersimpan'); await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click()
    await expect.poll(async () => f.ok(await f.admin.from('businesses').select('name').eq('id', business.id).single()).name).toBe('Toko Profil Poin Tersimpan')
    await page.reload(); await expect(page.getByRole('switch', { name: 'Aktifkan program poin member', exact: true })).toHaveAttribute('aria-checked', 'true')
    expect(Number(f.ok(await f.admin.from('businesses').select('loyalty_point_nominal').eq('id', business.id).single()).loyalty_point_nominal)).toBe(5000)
    expect(f.errors).toEqual([]); passed = true
  } finally { await f.cleanup('onboarding-browser', passed) }
})
