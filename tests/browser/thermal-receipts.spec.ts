import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('thermal receipts persist daily numbers through concurrent checkout, retries, print, roles and cancellation', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (result: any) => { if (result.error) throw Error('Receipt fixture failed: ' + result.error.code); return result.data }
  ok(await admin.from('pos_transactions').select('receipt_number').limit(1))
  const legacy = ok(await admin.from('businesses').select('id')).map((row: any) => row.id)
  async function snapshot() {
    const tables: Record<string, unknown[]> = {}
    for (const table of ['businesses', 'catalog_products', 'pos_transactions']) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) {
        const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499))
        rows.push(...batch)
        if (batch.length < 500) break
      }
      tables[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(tables)).digest('hex')
  }
  const before = await snapshot(), users: string[] = [], businesses: string[] = [], contexts: BrowserContext[] = [], errors: string[] = []
  let passed = false
  async function account(role?: 'cashier', bid?: string) {
    const email = `usahaku-receipt-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role ? 'staff' : 'owner' } })).user.id
    users.push(uid)
    if (bid) ok(await admin.from('business_members').insert({ business_id: bid, user_id: uid, name: 'Kasir Uji', username: 'kasir', role, must_change_password: false }))
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    ok(await client.auth.signInWithPassword({ email, password }))
    if (!bid) {
      bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Struk', owner_name: 'Owner Uji', store_phone: '081234567890', store_street: 'Jl. Uji No. 1', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
      businesses.push(bid!)
      ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    }
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
    contexts.push(context)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Kata sandi', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    return { client, page, bid: bid! }
  }
  try {
    const owner = await account(), other = await account(), cashier = await account('cashier', owner.bid)
    const product = randomUUID(), fractional = randomUUID(), longName = 'Susu UHT Cokelat Kemasan Kotak Besar untuk Persediaan Kebutuhan Harian'
    for (const [id, name, discount] of [[product, longName, 10], [fractional, 'Beras Putih', 0]] as const) {
      ok(await owner.client.rpc('save_catalog_product', { target_id: owner.bid, item_id: id, expected_version: null, operation_id: randomUUID(), details: { name, category: 'Makanan', unit: id === product ? 'kotak' : 'kg', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '100', active: true, discountKind: discount ? 'percent' : 'none', discountValue: discount } }))
    }
    ok(await owner.client.rpc('save_store_tax', { target_id: owner.bid, expected_version: 0, rate: 11 }))
    const payload = { lines: [{ id: product, quantity: '1', price: '10000', revision: 0 }], payment: 'cash', received: '10000', discountKind: 'none', discountValue: '0', taxRate: '11', taxRevision: 1, confirmed: true }
    const first = ok(await owner.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details: { ...payload, lines: [...payload.lines, { id: fractional, quantity: '0.25', price: '10000', revision: 0 }], received: '20000' } }))
    const code = ok(await admin.from('businesses').select('code').eq('id', owner.bid).single()).code
    expect(first.receipt_number).toMatch(new RegExp(`^TRX-${code}-[0-9]{8}-0001$`))
    const simultaneous = await Promise.all(Array.from({ length: 6 }, () => cashier.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details: payload })))
    const sales = simultaneous.map(result => ok(result))
    expect(new Set(sales.map(sale => sale.receipt_number)).size).toBe(6)
    expect(sales.map(sale => Number(sale.receipt_number.split('-').at(-1))).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7])
    const retryId = randomUUID()
    const retries = await Promise.all(Array.from({ length: 3 }, () => cashier.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: retryId, details: payload })))
    expect(new Set(retries.map(result => ok(result).id)).size).toBe(1)
    expect(ok(retries[0]).receipt_number).toMatch(/-0008$/)
    expect((await cashier.client.from('receipt_counters').select('*')).error?.code).toBe('42501')
    expect(ok(await cashier.client.from('pos_transactions').select('id').eq('id', first.id))).toEqual([])
    expect(ok(await other.client.from('pos_transactions').select('id').eq('id', first.id))).toEqual([])
    for (const actor of [cashier, other]) {
      const response = await actor.page.goto('/dashboard/transactions/' + first.id)
      expect(response?.status()).toBe(404)
    }
    const page = owner.page
    await page.goto('/dashboard/transactions/' + first.id)
    const receipt = page.locator('#pos-receipt')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 })
      await page.reload()
      await expect(receipt).toContainText(first.receipt_number)
      await expect(receipt).toContainText('Bandung')
      await expect(receipt).toContainText('Telp: 081234567890')
      const items = receipt.getByRole('table', { name: 'Rincian barang' })
      await expect(items.getByRole('columnheader')).toHaveText(['Nama Barang', 'Qty', 'Harga/U', 'Total'])
      const rice = items.getByRole('row').filter({ hasText: 'Beras Putih' })
      await expect(rice.getByRole('cell')).toHaveText(['Beras Putih', '0,25 kg', '10.000', '2.500'])
      await expect(receipt.locator('.receipt-totals .receipt-row').filter({ has: page.getByText('Total Item', { exact: true }) }).locator('dd')).toHaveText('2')
      await expect(receipt).toContainText('TOTAL BAYAR')
      await expect(receipt.locator('del')).toHaveText('Rp10.000')
      await expect(receipt).toContainText('Pajak (11%)')
      for (const amount of ['Rp12.500', 'Rp1.000', 'Rp1.265', 'Rp12.765', 'Rp20.000', 'Rp7.235']) await expect(receipt).toContainText(amount)
      const box = await receipt.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(await receipt.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await mkdir('.cache/thermal-receipts', { recursive: true })
      await receipt.screenshot({ path: `.cache/thermal-receipts/screen-${width}.png` })
    }
    await page.setViewportSize({ width: 800, height: 1200 })
    await page.emulateMedia({ media: 'print' })
    const print = page.locator('#pos-print-root')
    await expect(print).toBeVisible()
    await expect(receipt).not.toBeVisible()
    await expect(print).toContainText(first.receipt_number)
    await expect(print.getByText(longName, { exact: true })).toBeVisible()
    expect(await print.locator('.sale-receipt').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
    expect(await print.locator('.receipt-payment').evaluate(element => getComputedStyle(element).borderBottomColor)).toBe('rgb(17, 17, 17)')
    await print.screenshot({ path: '.cache/thermal-receipts/print.png' })
    await page.pdf({ path: '.cache/thermal-receipts/receipt.pdf', width: '80mm', height: '280mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    await page.emulateMedia({ media: 'screen' })
    await cashier.page.goto('/dashboard/transactions/' + sales[0].id)
    await expect(cashier.page.locator('#pos-receipt')).toContainText(sales[0].receipt_number)
    await expect(cashier.page.getByRole('button', { name: 'Batalkan transaksi', exact: true })).toHaveCount(0)
    ok(await owner.client.rpc('cancel_pos', { target_id: owner.bid, sale_id: first.id, explanation: 'Uji pembatalan struk', goods_returned: true, refund_confirmed: true }))
    await page.reload()
    await expect(receipt).toContainText(first.receipt_number)
    await expect(receipt).toContainText('TRANSAKSI DIBATALKAN')
    await expect(receipt).toContainText('Uji pembatalan struk')
    expect(errors).toEqual([])
    passed = true
  } finally {
    for (const context of contexts) await context.close()
    for (const bid of businesses) {
      ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid))
      ok(await admin.from('business_members').delete().eq('business_id', bid))
      ok(await admin.from('businesses').delete().eq('id', bid))
    }
    for (const uid of users) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot()
    expect(unchanged).toBe(true)
    await mkdir('.cache/thermal-receipts', { recursive: true })
    await writeFile('.cache/thermal-receipts/results.json', JSON.stringify({ passed, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
