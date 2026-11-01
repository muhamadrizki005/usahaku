import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { defaultReportFilter, reportBounds } from '../../lib/reports'

test('empty carts hide checkout controls and owner/admin stack discounts while cashier and other tenants stay restricted', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (result: any) => { if (result.error) throw Error('Order discount fixture failed: ' + result.error.code); return result.data }
  ok(await admin.from('pos_transactions').select('product_discount,order_discount').limit(1))
  const legacy = ok(await admin.from('businesses').select('id')).map((row: any) => row.id)
  async function snapshot() {
    const tables: Record<string, unknown[]> = {}
    for (const table of ['businesses', 'catalog_products', 'pos_transactions', 'stock_movements']) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) {
        const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499))
        rows.push(...batch); if (batch.length < 500) break
      }
      tables[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(tables)).digest('hex')
  }
  const before = await snapshot(), contexts: BrowserContext[] = [], users: string[] = [], businesses: string[] = [], errors: string[] = []
  const dir = '.cache/order-discounts'
  let passed = false
  async function login(email: string, password: string) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }); contexts.push(context)
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Kata sandi', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard/)
    return page
  }
  async function account(role?: 'admin' | 'cashier', businessId?: string) {
    const email = `usahaku-order-discount-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role ? 'staff' : 'owner' } })).user.id; users.push(uid)
    if (businessId) ok(await admin.from('business_members').insert({ business_id: businessId, user_id: uid, name: 'Petugas Uji', username: role, role, must_change_password: false }))
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    ok(await client.auth.signInWithPassword({ email, password }))
    if (!businessId) {
      businessId = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Diskon', owner_name: 'Owner Uji', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
      businesses.push(businessId!); ok(await client.rpc('complete_business_onboarding', { target_id: businessId }))
    }
    return { client, bid: businessId!, email, password, page: await login(email, password) }
  }
  const cart = (page: Page) => page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Keranjang aktif', exact: true }) })
  async function empty(page: Page) {
    const aside = cart(page)
    await expect(aside.getByText('Belum ada produk', { exact: true })).toBeVisible()
    await expect(aside.getByText('Subtotal', { exact: true })).toHaveCount(0)
    await expect(aside.getByText('Metode pembayaran', { exact: true })).toHaveCount(0)
    await expect(aside.getByLabel('Nominal tunai diterima', { exact: true })).toHaveCount(0)
    await expect(aside.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true })).toHaveCount(0)
    await expect(aside.getByRole('button', { name: /Tambah pelanggan/ })).toHaveCount(0)
  }
  try {
    await mkdir(dir, { recursive: true })
    const owner = await account(), cashier = await account('cashier', owner.bid), staff = await account('admin', owner.bid), other = await account()
    const product = randomUUID()
    ok(await owner.client.rpc('save_catalog_product', { target_id: owner.bid, item_id: product, expected_version: null, operation_id: randomUUID(), details: { name: 'Susu UHT Uji', category: 'Minuman', unit: 'kotak', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '100', active: true, discountKind: 'percent', discountValue: 10 } }))
    ok(await owner.client.rpc('save_store_tax', { target_id: owner.bid, expected_version: 0, rate: 11 }))
    const page = owner.page
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('/dashboard/pos'); await empty(page)
      await cart(page).screenshot({ path: `${dir}/empty-${width}.png` })
      await page.getByRole('button', { name: 'Tambah Susu UHT Uji', exact: true }).click()
      await page.getByLabel('Jumlah Susu UHT Uji', { exact: true }).fill('2'); await page.getByLabel('Jumlah Susu UHT Uji', { exact: true }).press('Tab')
      await page.getByLabel('Jenis diskon keseluruhan', { exact: true }).click(); await page.getByRole('option', { name: 'Persen (%)', exact: true }).click()
      await page.getByLabel('Nilai diskon keseluruhan', { exact: true }).fill('10')
      for (const value of ['Rp20.000', '−Rp2.000', '−Rp1.800', 'Rp16.200', 'Rp1.782', 'Rp17.982']) await expect(cart(page)).toContainText(value)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await cart(page).screenshot({ path: `${dir}/filled-${width}.png` })
      await page.getByLabel('Nominal tunai diterima', { exact: true }).fill('20000'); await cart(page).getByRole('checkbox').check()
      await page.getByLabel('Nilai diskon keseluruhan', { exact: true }).fill('20'); await expect(cart(page).getByRole('checkbox')).not.toBeChecked()
      await page.getByLabel('Jenis diskon keseluruhan', { exact: true }).click(); await page.getByRole('option', { name: 'Rupiah (Rp)', exact: true }).click()
      await page.getByLabel('Nilai diskon keseluruhan', { exact: true }).fill('18001'); await expect(cart(page).getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Hapus Susu UHT Uji', exact: true }).click(); await empty(page)
      await page.getByRole('button', { name: 'Tambah Susu UHT Uji', exact: true }).click(); await expect(page.getByLabel('Jenis diskon keseluruhan', { exact: true })).toContainText('Tanpa diskon'); await expect(page.getByLabel('Nominal tunai diterima', { exact: true })).toHaveValue('')
    }
    await page.getByLabel('Jumlah Susu UHT Uji', { exact: true }).fill('2'); await page.getByLabel('Jumlah Susu UHT Uji', { exact: true }).press('Tab')
    await page.getByLabel('Jenis diskon keseluruhan', { exact: true }).click(); await page.getByRole('option', { name: 'Persen (%)', exact: true }).click(); await page.getByLabel('Nilai diskon keseluruhan', { exact: true }).fill('10')
    await page.getByLabel('Nominal tunai diterima', { exact: true }).fill('20000'); await cart(page).getByRole('checkbox').check()
    let dropped = false
    await page.route('**/dashboard/pos', async route => { if (!dropped && route.request().method() === 'POST' && route.request().headers()['next-action']) { dropped = true; await route.fetch(); await route.abort('connectionreset') } else await route.continue() })
    await page.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true }).click(); await expect(page.getByRole('button', { name: 'Coba ulang permintaan yang sama', exact: true })).toBeVisible()
    await expect(page.getByLabel('Jenis diskon keseluruhan', { exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Coba ulang permintaan yang sama', exact: true }).click(); await expect(page.getByRole('status')).toContainText('berhasil dicatat'); await empty(page); await page.unrouteAll()
    const sale = ok(await admin.from('pos_transactions').select('*').eq('business_id', owner.bid).single())
    expect(Number(sale.product_discount)).toBe(2000); expect(Number(sale.order_discount)).toBe(1800); expect(Number(sale.discount)).toBe(3800); expect(Number(sale.total)).toBe(17982); expect(Number(sale.change)).toBe(2018)
    const fresh = await login(owner.email, owner.password)
    await fresh.goto('/dashboard/transactions/' + sale.id)
    const receipt = fresh.locator('#pos-receipt'); await expect(receipt).toContainText('Diskon produk'); await expect(receipt).toContainText('Diskon keseluruhan'); await expect(receipt).toContainText('Rp17.982')
    await receipt.screenshot({ path: `${dir}/receipt.png` })
    const details = { lines: [{ id: product, quantity: '1', price: '10000', revision: 0 }], payment: 'cash', received: '10000', discountKind: 'amount', discountValue: '1000', taxRate: '11', taxRevision: 1, confirmed: true }
    expect((await cashier.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details })).error?.code).toBe('42501')
    expect((await other.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details })).error?.code).toBe('42501')
    for (const actor of [cashier, staff]) {
      await actor.page.goto('/dashboard/pos'); await empty(actor.page); await actor.page.getByRole('button', { name: 'Tambah Susu UHT Uji', exact: true }).click()
      if (actor === cashier) { await expect(actor.page.getByLabel('Jenis diskon keseluruhan', { exact: true })).toHaveCount(0); await actor.page.getByLabel('Nominal tunai diterima', { exact: true }).fill('10000') }
      else { await actor.page.getByLabel('Jenis diskon keseluruhan', { exact: true }).click(); await actor.page.getByRole('option', { name: 'Rupiah (Rp)', exact: true }).click(); await actor.page.getByLabel('Nilai diskon keseluruhan', { exact: true }).fill('1000'); await actor.page.getByLabel('Nominal tunai diterima', { exact: true }).fill('10000') }
      await cart(actor.page).getByRole('checkbox').check(); await actor.page.getByRole('button', { name: 'Konfirmasi & catat transaksi', exact: true }).click(); await expect(actor.page.getByRole('status')).toContainText('berhasil dicatat'); await empty(actor.page)
    }
    await cashier.page.goto('/dashboard/transactions/' + sale.id); await expect(cashier.page.getByRole('heading', { name: /404/ })).toBeVisible()
    const bounds = reportBounds(defaultReportFilter())
    const summary = ok(await owner.client.rpc('read_sales_report', { target_id: owner.bid, from_ts: bounds.start, to_ts: bounds.end, payment_method: 'all' }))
    expect(summary.sales.find((row: any) => row.id === sale.id).discount).toBe(3800)
    ok(await owner.client.rpc('cancel_pos', { target_id: owner.bid, sale_id: sale.id, explanation: 'Uji pembatalan diskon bertingkat', goods_returned: true, refund_confirmed: true }))
    await fresh.reload(); await expect(receipt).toContainText('TRANSAKSI DIBATALKAN'); await expect(receipt).toContainText('Rp17.982'); expect(errors).toEqual([]); passed = true
  } finally {
    for (const context of contexts) await context.close()
    for (const bid of businesses) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    for (const uid of users) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(dir + '/results.json', JSON.stringify({ passed, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
