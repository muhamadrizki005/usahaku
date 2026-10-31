import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('restaurant website: onboarding, menu, tables, orders, exactly-once payment, receipts, reports and roles', async ({ browser, baseURL }) => {
  test.setTimeout(300000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const users: string[] = [], businesses: string[] = [], contexts: BrowserContext[] = [], errors: string[] = [], results: string[] = []
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  async function snapshot() {
    const data: Record<string, unknown> = {}
    for (const [table, key] of [['businesses', 'id'], ['business_members', 'id'], ['catalog_products', 'id'], ['stock_movements', 'id'], ['pos_transactions', 'id'], ['restaurant_menu', 'id'], ['restaurant_tables', 'id'], ['restaurant_orders', 'id'], ['restaurant_audit', 'id'], ['restaurant_requests', 'request_id']]) {
      const rows: any[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order(key).range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      data[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }
  const before = await snapshot(), dir = '.cache/restaurant'
  let passed = false, stage = 'owner onboarding'
  async function page() { const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }); contexts.push(context); const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message)); return p }
  async function account(role = 'owner', bid?: string, code?: string) {
    const username = 'uji' + randomBytes(4).toString('hex'), email = role === 'owner' ? `usahaku-rest-ui-${randomUUID()}@example.com` : `${code!.toLowerCase()}.${username}@staff.usahaku.invalid`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role === 'owner' ? 'owner' : 'staff' } })).user.id
    users.push(uid)
    if (bid) ok(await admin.from('business_members').insert({ business_id: bid, user_id: uid, name: 'Petugas Restoran Uji', username, role, must_change_password: false }))
    const p = await page(); await p.goto(role === 'owner' ? '/login' : '/login?mode=staff')
    if (role === 'owner') { await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password) }
    else { await p.getByLabel('Kode toko', { exact: true }).fill(code!); await p.getByLabel('Username', { exact: true }).fill(username); await p.getByLabel('Kata sandi', { exact: true }).fill(password) }
    await p.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(p).toHaveURL(url => ['/dashboard', '/dashboard/pos', '/onboarding'].includes(url.pathname))
    return { p, uid, email, password }
  }
  async function addMenu(p: Page) {
    await p.getByRole('button', { name: 'Tambah menu', exact: true }).click()
    const dialog = p.getByRole('dialog', { name: 'Tambah menu', exact: true })
    await dialog.getByLabel('Nama', { exact: true }).fill('Kopi Susu Uji'); await dialog.getByLabel('Kategori menu', { exact: true }).selectOption('Minuman'); await dialog.getByLabel('Harga menu', { exact: true }).fill('15000'); await dialog.getByRole('button', { name: 'Simpan', exact: true }).click(); await expect(dialog).toHaveCount(0)
    await expect(p.getByRole('row').filter({ hasText: 'Kopi Susu Uji' })).toContainText('Rp15.000')
  }
  async function createOrder(p: Page, dineIn: boolean, quantity = 2) {
    await p.getByRole('button', { name: 'Buat pesanan', exact: true }).click()
    const dialog = p.getByRole('dialog', { name: 'Buat pesanan', exact: true })
    if (dineIn) { await dialog.getByLabel('Jenis pesanan', { exact: true }).selectOption('dine_in'); await dialog.getByLabel('Meja', { exact: true }).selectOption({ label: 'Meja 1 / 4 orang' }); await dialog.getByLabel('Jumlah tamu', { exact: true }).fill('2') }
    await dialog.getByLabel('Pilih menu', { exact: true }).selectOption({ label: 'Kopi Susu Uji / Rp15.000' }); await dialog.getByRole('button', { name: 'Tambahkan menu', exact: true }).click(); await dialog.getByLabel('Jumlah Kopi Susu Uji', { exact: true }).fill(String(quantity)); await dialog.getByLabel('Catatan pesanan', { exact: true }).fill('Tanpa gula'); await dialog.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(dialog).toHaveCount(0)
  }
  try {
    await mkdir(dir, { recursive: true })
    const owner = await account(), p = owner.p
    await p.getByRole('button', { name: /^Restoran \/ Cafe/ }).click(); await p.getByRole('button', { name: 'Lanjutkan', exact: true }).click()
    await expect(p).toHaveURL(/\/onboarding\/identity\?category=restoran/)
    await expect(p.getByText('Restoran / Cafe', { exact: true })).toBeVisible()
    for (const [label, value] of [['Nama usaha *', 'Restoran Uji Website'], ['Detail Alamat *', 'Jalan Uji'], ['Nomor kontak usaha *', '081234567890']]) await p.getByLabel(label, { exact: true }).fill(value)
    await p.getByLabel('Provinsi *', { exact: true }).click(); await p.getByRole('option', { name: 'Jawa Barat', exact: true }).click(); await p.getByLabel('Kota/Kabupaten *', { exact: true }).click(); await p.getByRole('option', { name: 'Kota Bandung', exact: true }).click()
    await p.getByRole('button', { name: 'Simpan & lanjutkan', exact: true }).click(); await expect(p).toHaveURL(/\/onboarding\/setup\?category=restoran/)
    const business = ok(await admin.from('businesses').select('*').eq('owner_id', owner.uid).single()); businesses.push(business.id)
    expect(business.category).toBe('restaurant'); expect(business.onboarding_completed_at).toBeNull()
    await p.goto('/dashboard'); await expect(p).toHaveURL(url => url.pathname === '/onboarding/summary')
    await p.getByRole('link', { name: 'Kembali ke pengaturan', exact: true }).click()
    await p.getByRole('link', { name: 'Kembali', exact: true }).click(); await expect(p).toHaveURL(/\/onboarding\/identity/)
    await p.getByRole('button', { name: 'Kembali', exact: true }).click(); await expect(p).toHaveURL(/\/onboarding$/)
    await expect(p.getByRole('button', { name: /^Restoran \/ Cafe/ })).toHaveAttribute('aria-pressed', 'true')
    await p.getByRole('button', { name: 'Lanjutkan', exact: true }).click(); await p.getByRole('button', { name: 'Simpan & lanjutkan', exact: true }).click()
    await expect(p).toHaveURL(/\/onboarding\/setup/)
    await addMenu(p)
    await p.getByRole('button', { name: 'Tambah meja', exact: true }).click(); const tableDialog = p.getByRole('dialog', { name: 'Tambah meja', exact: true }); await tableDialog.getByLabel('Nama', { exact: true }).fill('Meja 1'); await tableDialog.getByLabel('Kapasitas orang', { exact: true }).fill('4'); await tableDialog.getByRole('button', { name: 'Simpan', exact: true }).click(); await expect(tableDialog).toHaveCount(0)
    await p.getByRole('button', { name: 'Aktifkan semua hari', exact: true }).click(); await p.getByRole('button', { name: 'Simpan jam operasional', exact: true }).click(); await expect(p.getByRole('status').filter({ hasText: 'Jam operasional tersimpan' })).toBeVisible()
    await p.getByRole('link', { name: 'Masuk ke ringkasan', exact: true }).click(); await expect(p.getByText('Restoran / Cafe', { exact: true })).toBeVisible(); await p.getByRole('button', { name: 'Buka dashboard', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    await expect(p.getByRole('heading', { level: 1 })).toHaveText('Ringkasan restoran'); await p.goto('/onboarding/setup?category=toko'); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    expect(ok(await admin.from('businesses').select('onboarding_completed_at').eq('id', business.id).single()).onboarding_completed_at).toBeTruthy()
    results.push('Restaurant onboarding creates one canonical restaurant, preserves Back flow, persists menu/table/hours, guards drafts and only unlocks dashboard on Summary')
    stage = 'roles and orders'
    const a = await account('cashier', business.id, business.code), b = await account('cashier', business.id, business.code), manager = await account('admin', business.id, business.code)
    await expect(a.p.getByRole('heading', { level: 1 })).toHaveText('Pesanan & kasir')
    await createOrder(a.p, true)
    let order = ok(await admin.from('restaurant_orders').select('*').eq('business_id', business.id).eq('actor_id', a.uid).single())
    const code = 'PSN-' + order.id.slice(0, 8).toUpperCase()
    await a.p.reload(); await expect(a.p.getByRole('row').filter({ hasText: code })).toContainText('Rp30.000')
    await a.p.screenshot({ path: `${dir}/orders-desktop.png`, fullPage: true })
    await a.p.setViewportSize({ width: 390, height: 844 }); expect(await a.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await a.p.screenshot({ path: `${dir}/orders-mobile.png`, fullPage: true }); await a.p.setViewportSize({ width: 1366, height: 900 })
    await a.p.getByRole('button', { name: `Ubah ${code}`, exact: true }).click(); const edit = a.p.getByRole('dialog', { name: 'Ubah pesanan', exact: true }); await edit.getByLabel('Proses pesanan', { exact: true }).selectOption('preparing'); await edit.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(edit).toHaveCount(0)
    await b.p.reload(); await expect(b.p.getByRole('row').filter({ hasText: code })).toHaveCount(0); await b.p.getByRole('button', { name: 'Buat pesanan', exact: true }).click(); const blocked = b.p.getByRole('dialog', { name: 'Buat pesanan', exact: true }); await blocked.getByLabel('Jenis pesanan', { exact: true }).selectOption('dine_in'); await expect(blocked.getByRole('option', { name: 'Meja 1 / 4 orang / Terpakai', exact: true })).toBeDisabled(); await blocked.getByRole('button', { name: 'Batal', exact: true }).click()
    await a.p.goto('/dashboard/products'); await expect(a.p).toHaveURL(url => url.pathname === '/dashboard/pos')
    await manager.p.goto('/dashboard/products'); await expect(manager.p.getByRole('heading', { level: 1 })).toHaveText('Menu'); await manager.p.getByRole('button', { name: 'Ubah Kopi Susu Uji', exact: true }).click(); const menuEdit = manager.p.getByRole('dialog', { name: 'Ubah menu', exact: true }); await menuEdit.getByLabel('Menu tersedia', { exact: true }).uncheck(); await menuEdit.getByRole('button', { name: 'Simpan', exact: true }).click(); await expect(menuEdit).toHaveCount(0); await expect(manager.p.getByRole('row').filter({ hasText: 'Kopi Susu Uji' })).toContainText('Habis')
    await b.p.reload(); await b.p.getByRole('button', { name: 'Buat pesanan', exact: true }).click(); await expect(b.p.getByRole('dialog').getByLabel('Pilih menu', { exact: true }).locator('option')).toHaveCount(1); await b.p.getByRole('dialog').getByRole('button', { name: 'Batal', exact: true }).click()
    stage = 'payment retry and receipt'
    await a.p.getByRole('button', { name: `Bayar ${code}`, exact: true }).click(); const payment = a.p.getByRole('dialog', { name: `Bayar ${code}`, exact: true }); await payment.getByLabel('Uang diterima', { exact: true }).fill('50000'); await payment.getByLabel('Pembayaran sebesar total sudah diterima dan diperiksa.', { exact: true }).check()
    let intercepted = false
    await a.p.route('**/dashboard/pos**', async route => { if (!intercepted && route.request().method() === 'POST' && route.request().headers()['next-action']) { intercepted = true; await route.fetch(); await route.abort('failed') } else await route.continue() })
    await payment.getByRole('button', { name: 'Catat pembayaran', exact: true }).click(); await expect(payment.getByRole('alert')).toContainText('belum pasti'); await a.p.unroute('**/dashboard/pos**'); await payment.getByRole('button', { name: 'Ulangi permintaan yang sama', exact: true }).click()
    await expect(a.p).toHaveURL(/\/dashboard\/transactions\/[0-9a-f-]+$/); expect(intercepted).toBe(true)
    const receipt = a.p.locator('#pos-receipt'); await expect(receipt).toContainText('Kopi Susu Uji'); await expect(receipt).toContainText('Rp30.000'); await expect(receipt).toContainText('Rp20.000')
    const sales = ok(await admin.from('pos_transactions').select('*').eq('business_id', business.id)); expect(sales).toHaveLength(1)
    await a.p.emulateMedia({ media: 'print' }); await expect(a.p.locator('#pos-print-root')).toBeVisible(); await expect(a.p.locator('#pos-print-root')).toContainText('Kopi Susu Uji'); await a.p.pdf({ path: `${dir}/receipt.pdf`, format: 'A4', printBackground: true }); await a.p.emulateMedia({ media: 'screen' })
    await b.p.goto(`/dashboard/transactions/${sales[0].id}`); await expect(b.p.getByRole('heading', { name: /404/ })).toBeVisible(); await b.p.goto('/dashboard/transactions'); await expect(b.p.getByRole('link', { name: 'Detail & struk', exact: true })).toHaveCount(0)
    await a.p.goto('/dashboard/reports'); await expect(a.p).toHaveURL(url => url.pathname === '/dashboard/pos'); expect((await a.p.context().request.get('/api/reports/sales')).status()).toBe(403)
    results.push('Actual staff login, menu availability, cashier own-orders/history, occupied table isolation, process updates, lost payment response/retry, one sale and printed receipt passed')
    stage = 'admin, refund, reports and responsive'
    await manager.p.goto('/dashboard/settings'); await expect(manager.p).toHaveURL(url => url.pathname === '/dashboard')
    await p.goto(`/dashboard/transactions/${sales[0].id}`); await p.getByRole('button', { name: 'Batalkan transaksi', exact: true }).click(); const cancellation = p.getByRole('dialog', { name: 'Pembatalan penuh restoran', exact: true }); await cancellation.getByLabel('Alasan pembatalan', { exact: true }).fill('Pembatalan uji lengkap'); await cancellation.getByLabel('Pembatalan seluruh pesanan telah dikonfirmasi.', { exact: true }).check(); await cancellation.getByLabel(/Dana Rp30.000 sudah dikembalikan manual/).check(); await cancellation.getByRole('button', { name: 'Konfirmasi pembatalan penuh', exact: true }).click(); await expect(cancellation).toHaveCount(0); await expect(p.locator('#pos-receipt')).toContainText('Pembatalan pesanan dicatat.'); await expect(p.locator('#pos-receipt')).not.toContainText('Stok dikembalikan')
    await p.goto('/dashboard/reports'); await expect(p.getByRole('heading', { level: 1 })).toHaveText('Laporan'); const csv = p.getByRole('link', { name: 'Ekspor CSV', exact: true }); const href = await csv.getAttribute('href'); expect(href).toBeTruthy(); const exported = await p.context().request.get(href!); expect(exported.status()).toBe(200); expect(await exported.text()).toContain('Pembatalan uji lengkap')
    for (const width of [320, 390, 768, 1366]) { await p.setViewportSize({ width, height: 900 }); await p.goto('/dashboard/products'); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await p.getByRole('button', { name: 'Tambah menu', exact: true }).click(); const dialog = p.getByRole('dialog', { name: 'Tambah menu', exact: true }); const box = (await dialog.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); await p.screenshot({ path: `${dir}/menu-${width}.png`, fullPage: true }); await p.keyboard.press('Escape'); await expect(dialog).toHaveCount(0) }
    await p.setViewportSize({ width: 390, height: 844 }); await p.getByRole('button', { name: 'Buka navigasi', exact: true }).click(); await p.getByRole('navigation', { name: 'Navigasi dashboard mobile', exact: true }).getByRole('button', { name: 'Meja', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard/restaurant/tables'); await expect(p.getByRole('heading', { level: 1 })).toHaveText('Meja & kapasitas'); await p.screenshot({ path: `${dir}/tables-mobile.png`, fullPage: true })
    await p.evaluate(() => document.fonts.ready); const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily); expect(font.toLowerCase()).toContain('poppins')
    await p.goto('/dashboard/settings'); await p.getByLabel('Provinsi *', { exact: true }).click(); await p.getByRole('option', { name: 'Jawa Timur', exact: true }).click(); await p.getByLabel('Kota/Kabupaten *', { exact: true }).click(); await p.getByRole('option', { name: 'Kota Surabaya', exact: true }).click(); await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('status').filter({ hasText: 'Profil usaha tersimpan' })).toBeVisible(); await p.reload(); await expect(p.getByLabel('Kota/Kabupaten *', { exact: true })).toHaveValue('Kota Surabaya')
    const fresh = await page(); await fresh.goto('/login'); await fresh.getByLabel('Email', { exact: true }).fill(owner.email); await fresh.getByLabel('Kata sandi', { exact: true }).fill(owner.password); await fresh.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(fresh).toHaveURL(url => url.pathname === '/dashboard'); await fresh.goto('/dashboard/settings'); await expect(fresh.getByLabel('Kota/Kabupaten *', { exact: true })).toHaveValue('Kota Surabaya'); await fresh.goto('/dashboard/settings/staff'); await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Staf & akses')
    ok(await admin.from('business_members').update({ active: false }).eq('user_id', a.uid)); await a.p.reload(); await expect(a.p).toHaveURL(url => url.pathname === '/account')
    expect(errors).toEqual([])
    results.push('Owner/admin settings restriction, profile persistence in fresh browser login, staff access after onboarding, manual restaurant refund without stock claims, real report/CSV, menu dialog at four widths, mobile navigation, Escape/focus and Poppins passed')
    passed = true
  } finally {
    for (const context of contexts) await context.close()
    if (users.length) for (const row of ok(await admin.from('businesses').select('id').in('owner_id', users))) if (!businesses.includes(row.id)) businesses.push(row.id)
    for (const id of businesses) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', id)); ok(await admin.from('business_members').delete().eq('business_id', id)); ok(await admin.from('businesses').delete().eq('id', id)) }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    const unchanged = await snapshot() === before; expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/browser-results.json`, JSON.stringify({ passed, stage, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
