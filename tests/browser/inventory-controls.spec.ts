import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('inventory direction controls preview signed corrections and preserve audited decimal stock', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options), client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  const snapshot = async () => {
    const data: Record<string, unknown> = {}
    for (const table of ['businesses', 'business_members', 'catalog_products', 'stock_movements', 'pos_transactions']) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      data[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }
  const before = await snapshot(), context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }), p = await context.newPage(), errors: string[] = [], results: string[] = [], dir = '.cache/inventory-controls'
  p.on('pageerror', e => errors.push(e.message))
  let uid = '', bid = '', passed = false
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-stock-controls-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url'), productId = randomUUID()
    uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id; ok(await client.auth.signInWithPassword({ email, password }))
    bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Arah Stok', owner_name: 'Owner Uji Stok', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' })); ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    ok(await client.rpc('save_catalog_product', { target_id: bid, item_id: productId, expected_version: null, operation_id: randomUUID(), details: { name: 'Beras Uji Arah', category: 'Bahan Pokok', unit: 'kg', sku: '', barcode: '', price: '15000', minimum: '1', initialStock: '10.5', active: true } }))
    const stock = async () => Number(ok(await admin.from('catalog_products').select('stock').eq('id', productId).single()).stock)
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    await p.goto('/dashboard/inventory'); await expect(p.getByRole('button', { name: 'Catat stok keluar', exact: true })).toHaveCount(0)
    await p.getByRole('button', { name: 'Sesuaikan stok fisik', exact: true }).click()
    const form = p.locator('#adjustment'), amount = form.getByLabel('Koreksi jumlah (selisih) *', { exact: true }), incoming = form.getByRole('button', { name: 'Masuk barang', exact: true }), outgoing = form.getByRole('button', { name: 'Keluar barang', exact: true }), save = form.getByRole('button', { name: 'Simpan penyesuaian', exact: true })
    await expect(amount).toHaveValue(''); await amount.fill('2,25'); await expect(form.getByText('12,75 kg', { exact: true })).toBeVisible(); await expect(save).toBeDisabled()
    await outgoing.click(); await expect(outgoing).toHaveAttribute('aria-pressed', 'true'); await expect(form.getByText('8,25 kg', { exact: true })).toBeVisible(); expect(await stock()).toBe(10.5)
    await incoming.click(); await form.getByLabel('Alasan koreksi *', { exact: true }).fill('Selisih hitung fisik masuk uji'); await save.click(); await expect(amount).toHaveValue(''); await expect.poll(stock).toBe(12.75)
    await amount.fill('1.25'); await outgoing.click(); await expect(form.getByText('11,5 kg', { exact: true })).toBeVisible(); await form.getByLabel('Alasan koreksi *', { exact: true }).fill('Selisih hitung fisik keluar uji'); await save.click(); await expect.poll(stock).toBe(11.5); await expect(amount).toHaveValue('')
    const movements = ok(await admin.from('stock_movements').select('*').eq('product_id', productId).eq('kind', 'adjustment'))
    expect(movements.map((m: any) => Number(m.quantity)).sort((a: number, b: number) => a - b)).toEqual([-1.25, 2.25])
    await p.reload(); await expect(form.getByText('11,5 kg', { exact: true }).first()).toBeVisible()
    await amount.fill('99'); await outgoing.click(); await form.getByLabel('Alasan koreksi *', { exact: true }).fill('Uji validasi pengurangan'); await expect(save).toBeDisabled(); await expect(form.getByText(/Hasil stok tidak boleh di bawah 0/)).toBeVisible()
    for (const invalid of ['-1', '1.2345', 'abc']) { await amount.fill(invalid); await expect(form.getByRole('alert')).toContainText('Masukkan jumlah positif'); await expect(save).toBeDisabled(); await expect(form).not.toContainText('NaN') }
    await amount.fill('0'); await expect(save).toBeDisabled(); expect(await stock()).toBe(11.5)
    await amount.fill('1'); await incoming.click()
    for (const width of [320, 390, 768, 1366]) {
      await p.setViewportSize({ width, height: 900 }); await form.scrollIntoViewIfNeeded(); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const a = (await amount.boundingBox())!, b = (await incoming.boundingBox())!, c = (await outgoing.boundingBox())!; expect(b.x).toBeGreaterThanOrEqual(a.x + a.width); expect(a.width).toBeGreaterThan(40); expect(c.x + c.width).toBeLessThanOrEqual(width - 16); expect((await form.boundingBox())!.width).toBeLessThanOrEqual(width - 32)
      await p.screenshot({ path: `${dir}/width-${width}.png`, fullPage: true })
    }
    await form.getByRole('button', { name: 'Batal', exact: true }).click(); await expect(amount).toHaveValue(''); expect(await stock()).toBe(11.5)
    await p.getByRole('button', { name: /Catat stok masuk/ }).click(); await expect(incoming).toHaveAttribute('aria-pressed', 'true'); await amount.fill('0.5'); await form.getByLabel('Alasan koreksi *', { exact: true }).fill('Stok masuk uji pintasan'); await save.click(); await expect.poll(stock).toBe(12)
    expect(ok(await admin.from('stock_movements').select('id').eq('product_id', productId).eq('kind', 'in'))).toHaveLength(1)
    expect(errors).toEqual([]); results.push('Removed stock-out shortcut, positive/negative previews, comma/decimal corrections, required reason, audited +/- values, reload, overdraw/invalid/zero guard, cancel, four widths and stock-in shortcut passed'); passed = true
  } finally {
    await context.close()
    if (uid && !bid) bid = ok(await admin.from('businesses').select('id').eq('owner_id', uid).maybeSingle())?.id || ''
    if (bid) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    if (uid) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
