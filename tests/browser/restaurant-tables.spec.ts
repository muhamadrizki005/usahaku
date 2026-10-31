import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('restaurant table boxes show only names and open accessible persistent details', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  async function snapshot() {
    const data: Record<string, unknown> = {}
    for (const table of ['businesses', 'business_members', 'catalog_products', 'stock_movements', 'pos_transactions', 'restaurant_menu', 'restaurant_tables', 'restaurant_orders']) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      data[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }
  const before = await snapshot(), context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }), p = await context.newPage()
  const errors: string[] = [], results: string[] = [], dir = '.cache/restaurant-tables'
  p.on('pageerror', e => errors.push(e.message))
  let uid = '', bid = '', passed = false
  try {
    const email = `usahaku-table-grid-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
    ok(await client.auth.signInWithPassword({ email, password }))
    bid = ok(await client.rpc('create_business_profile_for_category', { business_category: 'restaurant', store_name: 'Restoran Uji Grid Meja', owner_name: 'Pemilik Uji Grid', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    const menuId = randomUUID(), ids = Array.from({ length: 12 }, () => randomUUID()), longName = 'Meja ' + 'W'.repeat(55)
    ok(await client.rpc('save_restaurant_resource', { target_id: bid, resource: 'menu', item_id: menuId, expected_revision: null, operation_id: randomUUID(), details: { name: 'Kopi Uji Grid', category: 'Minuman', price: '15000', available: true, active: true } }))
    for (let i = 0; i < ids.length; i++) ok(await client.rpc('save_restaurant_resource', { target_id: bid, resource: 'table', item_id: ids[i], expected_revision: null, operation_id: randomUUID(), details: { name: i === 3 ? longName : `Meja ${i + 1}`, capacity: i === 1 ? 2 : i === 2 ? 6 : 4, active: i !== 2 } }))
    ok(await client.rpc('save_restaurant_order', { target_id: bid, item_id: randomUUID(), expected_revision: null, operation_id: randomUUID(), details: { kind: 'dine_in', tableId: ids[1], guests: 2, customer: 'Nama privat pesanan uji', notes: '', stage: 'new', lines: [{ id: menuId, quantity: 1 }] } }))
    await mkdir(dir, { recursive: true })
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    await p.getByRole('navigation', { name: 'Navigasi utama dashboard', exact: true }).getByRole('button', { name: 'Meja', exact: true }).click()
    const grid = p.getByRole('group', { name: 'Pilihan meja', exact: true })
    await expect(grid.getByRole('button')).toHaveCount(12)
    expect((await grid.getByRole('button').allTextContents()).slice(0, 3)).toEqual(['Meja 1', 'Meja 2', 'Meja 3'])
    await expect(grid.getByRole('button', { name: 'Meja 1', exact: true })).toHaveText('Meja 1')
    await expect(grid).not.toContainText(/orang|Tersedia|Terpakai|Nonaktif|Ubah/)
    await p.screenshot({ path: `${dir}/desktop.png`, fullPage: true })
    const occupied = grid.getByRole('button', { name: 'Meja 2', exact: true })
    await expect(occupied).toHaveCSS('opacity', '0.6')
    await expect(occupied).toHaveAccessibleDescription(/sedang terpakai/)
    await expect(grid.getByRole('button', { name: 'Meja 1', exact: true })).toHaveCSS('opacity', '1')
    await occupied.click(); let details = p.getByRole('dialog', { name: 'Detail Meja 2', exact: true })
    await expect(details.getByText('Terpakai', { exact: true })).toBeVisible(); await expect(details.getByText('2 orang', { exact: true })).toBeVisible(); await expect(details).not.toContainText('Nama privat pesanan uji')
    await details.getByRole('button', { name: 'Tutup dialog', exact: true }).focus(); await p.keyboard.press('Shift+Tab'); await expect(details.getByRole('button', { name: 'Ubah meja', exact: true })).toBeFocused(); await p.keyboard.press('Tab'); await expect(details.getByRole('button', { name: 'Tutup dialog', exact: true })).toBeFocused()
    await p.keyboard.press('Escape'); await expect(details).toHaveCount(0); await expect(occupied).toBeFocused(); await occupied.press('Enter'); await expect(details).toBeVisible()
    await details.getByRole('button', { name: 'Ubah meja', exact: true }).click(); const editOccupied = p.getByRole('dialog', { name: 'Ubah meja', exact: true }); await editOccupied.getByLabel('Kapasitas orang', { exact: true }).fill('1'); await editOccupied.getByRole('button', { name: 'Simpan', exact: true }).click(); await expect(editOccupied.getByRole('alert')).toContainText('Meja sedang dipakai oleh 2 tamu. Kapasitas tidak bisa diubah menjadi 1 orang'); expect(ok(await admin.from('restaurant_tables').select('capacity').eq('id', ids[1]).single()).capacity).toBe(2); await editOccupied.getByRole('button', { name: 'Batal', exact: true }).click()
    results.push('Names-only squares, occupied detail, keyboard Enter/Escape/Tab loop, focus restoration and occupied-capacity server rejection passed')
    await grid.getByRole('button', { name: 'Meja 3', exact: true }).click(); details = p.getByRole('dialog', { name: 'Detail Meja 3', exact: true }); await expect(details.getByText('Nonaktif', { exact: true })).toBeVisible(); await expect(details.getByText('6 orang', { exact: true })).toBeVisible()
    await details.getByRole('button', { name: 'Ubah meja', exact: true }).click(); const edit = p.getByRole('dialog', { name: 'Ubah meja', exact: true }); await edit.getByLabel('Aktif', { exact: true }).check(); await edit.getByLabel('Kapasitas orang', { exact: true }).fill('5'); await edit.getByRole('button', { name: 'Simpan', exact: true }).click(); await expect(edit).toHaveCount(0)
    await p.reload(); await grid.getByRole('button', { name: 'Meja 3', exact: true }).click(); details = p.getByRole('dialog', { name: 'Detail Meja 3', exact: true }); await expect(details.getByText('Tersedia', { exact: true })).toBeVisible(); await expect(details.getByText('5 orang', { exact: true })).toBeVisible(); await p.keyboard.press('Escape')
    await p.getByLabel('Cari meja', { exact: true }).fill('Meja 3'); await expect(grid.getByRole('button')).toHaveCount(1); await p.getByLabel('Cari meja', { exact: true }).fill('Tidak ada meja ini'); await expect(grid.getByRole('button')).toHaveCount(0); await expect(p.getByText('Belum ada meja yang sesuai.', { exact: true })).toBeVisible(); await p.getByLabel('Cari meja', { exact: true }).fill('')
    for (const width of [320, 390, 768, 1366]) {
      await p.setViewportSize({ width, height: 900 }); await p.locator('#dashboard-content').evaluate(el => { el.scrollTop = 0 }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const box = (await grid.getByRole('button', { name: 'Meja 1', exact: true }).boundingBox())!; expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1)
      await p.screenshot({ path: `${dir}/grid-${width}.png`, fullPage: true }); await grid.getByRole('button', { name: longName, exact: true }).click()
      const long = p.getByRole('dialog', { name: `Detail ${longName}`, exact: true }); await expect(long.getByText(longName, { exact: true })).toBeVisible(); expect(await long.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      if (width === 390) await p.screenshot({ path: `${dir}/details-mobile.png`, fullPage: true })
      await p.keyboard.press('Escape'); await expect(long).toHaveCount(0)
    }
    await grid.getByRole('button', { name: 'Meja 3', exact: true }).click(); await p.screenshot({ path: `${dir}/details-desktop.png`, fullPage: true }); await p.keyboard.press('Escape')
    await p.goto('/dashboard/pos'); await p.getByRole('button', { name: 'Buat pesanan', exact: true }).click()
    let orderDialog = p.getByRole('dialog', { name: 'Buat pesanan', exact: true })
    await orderDialog.getByLabel('Jenis pesanan', { exact: true }).selectOption('dine_in')
    await expect(orderDialog.getByLabel('Meja', { exact: true }).locator(`option[value="${ids[1]}"]`)).toBeDisabled()
    await orderDialog.getByRole('button', { name: 'Batal', exact: true }).click()
    const activeOrder = ok(await admin.from('restaurant_orders').select('*').eq('business_id', bid).single()), code = 'PSN-' + activeOrder.id.slice(0, 8).toUpperCase()
    await p.getByRole('button', { name: `Ubah ${code}`, exact: true }).click()
    const existing = p.getByRole('dialog', { name: 'Ubah pesanan', exact: true })
    await expect(existing.getByLabel('Meja', { exact: true })).toHaveValue(ids[1])
    await expect(existing.getByLabel('Meja', { exact: true }).locator(`option[value="${ids[1]}"]`)).toBeEnabled()
    await existing.getByLabel('Catatan pesanan', { exact: true }).fill('Pesanan lama tetap dapat dilanjutkan')
    await existing.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(existing).toHaveCount(0)
    await p.getByRole('button', { name: `Batalkan ${code}`, exact: true }).click()
    const cancel = p.getByRole('dialog', { name: `Batalkan ${code}`, exact: true })
    await cancel.getByLabel('Alasan pembatalan', { exact: true }).fill('Selesai pengujian meja terpakai')
    await cancel.getByRole('button', { name: 'Batalkan pesanan', exact: true }).click()
    await expect.poll(async () => await cancel.count() ? await cancel.getByRole('alert').allTextContents() : ['closed']).toEqual(['closed'])
    await p.goto('/dashboard/restaurant/tables'); await expect(occupied).toHaveCSS('opacity', '1')
    await p.goto('/dashboard/pos'); await p.getByRole('button', { name: 'Buat pesanan', exact: true }).click()
    orderDialog = p.getByRole('dialog', { name: 'Buat pesanan', exact: true })
    await orderDialog.getByLabel('Jenis pesanan', { exact: true }).selectOption('dine_in')
    await expect(orderDialog.getByLabel('Meja', { exact: true }).locator(`option[value="${ids[1]}"]`)).toBeEnabled()
    await orderDialog.getByLabel('Meja', { exact: true }).selectOption(ids[1])
    await orderDialog.getByLabel('Pilih menu', { exact: true }).selectOption(menuId)
    await orderDialog.getByRole('button', { name: 'Tambahkan menu', exact: true }).click()
    await orderDialog.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(orderDialog).toHaveCount(0)
    await p.goto('/dashboard/restaurant/tables'); await expect(occupied).toHaveCSS('opacity', '0.6')
    await p.reload(); await expect(occupied).toHaveCSS('opacity', '0.6')
    await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: `${dir}/occupied-mobile.png`, fullPage: true })
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await p.goto('/dashboard/pos')
    const payable = ok(await admin.from('restaurant_orders').select('id').eq('business_id', bid).eq('status', 'open').single()), paymentCode = 'PSN-' + payable.id.slice(0, 8).toUpperCase()
    await p.getByRole('button', { name: `Bayar ${paymentCode}`, exact: true }).click()
    const pay = p.getByRole('dialog', { name: `Bayar ${paymentCode}`, exact: true })
    await pay.getByLabel('Uang diterima', { exact: true }).fill('15000')
    await pay.getByLabel('Pembayaran sebesar total sudah diterima dan diperiksa.', { exact: true }).check()
    await pay.getByRole('button', { name: 'Catat pembayaran', exact: true }).click(); await expect(p).toHaveURL(/\/dashboard\/transactions\/[0-9a-f-]+$/)
    await p.goto('/dashboard/restaurant/tables'); await expect(occupied).toHaveCSS('opacity', '1')
    results.push('Occupied boxes fade after save/reload, new orders cannot select them, existing orders remain editable, cancellation and payment release the table')
    await p.goto('/dashboard/products'); await expect(p.getByRole('heading', { level: 1 })).toHaveText('Menu'); await expect(p.getByRole('row').filter({ hasText: 'Kopi Uji Grid' })).toContainText('Rp15.000'); await expect(p.getByRole('group', { name: 'Pilihan meja' })).toHaveCount(0)
    expect(errors).toEqual([]); results.push('Inactive/available details, edit persistence, search/empty state, long names at four widths and unchanged menu list passed'); passed = true
  } finally {
    await context.close()
    if (uid && !bid) bid = ok(await admin.from('businesses').select('id').eq('owner_id', uid).maybeSingle())?.id || ''
    if (bid) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    if (uid) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
