import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('restaurant validation explains exact server failures and never reports failed writes as successful', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options), client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  async function snapshot() { const rows: Record<string, unknown> = {}; for (const table of ['businesses', 'business_members', 'catalog_products', 'stock_movements', 'pos_transactions', 'restaurant_menu', 'restaurant_tables', 'restaurant_orders']) { const values: unknown[] = []; for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499)); values.push(...batch); if (batch.length < 500) break } rows[table] = values } return createHash('sha256').update(JSON.stringify(rows)).digest('hex') }
  const before = await snapshot(), context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }), p = await context.newPage(), errors: string[] = [], results: string[] = [], dir = '.cache/restaurant-errors'
  context.on('page', page => page.on('pageerror', e => errors.push(e.message))); p.on('pageerror', e => errors.push(e.message))
  let uid = '', bid = '', passed = false
  async function prepare(page: Page, tableId?: string, guests = 2) {
    await page.goto('/dashboard/pos'); await page.getByRole('button', { name: 'Buat pesanan', exact: true }).click()
    const d = page.getByRole('dialog', { name: 'Buat pesanan', exact: true })
    if (tableId) { await d.getByLabel('Jenis pesanan', { exact: true }).selectOption('dine_in'); await d.getByLabel('Meja', { exact: true }).selectOption(tableId); await d.getByLabel('Jumlah tamu', { exact: true }).fill(String(guests)) }
    await d.getByLabel('Pilih menu', { exact: true }).selectOption({ label: 'Kopi Error Uji / Rp15.000' }); await d.getByRole('button', { name: 'Tambahkan menu', exact: true }).click(); return d
  }
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-errors-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id; ok(await client.auth.signInWithPassword({ email, password }))
    bid = ok(await client.rpc('create_business_profile_for_category', { business_category: 'restaurant', store_name: 'Restoran Uji Pesan Spesifik', owner_name: 'Pemilik Uji', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' })); ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    const menuId = randomUUID(), tableId = randomUUID(), secondTableId = randomUUID(), menu = { name: 'Kopi Error Uji', category: 'Minuman', price: '15000', active: true, available: true }
    const resource = (type: string, id: string, revision: number | null, details: unknown) => client.rpc('save_restaurant_resource', { target_id: bid, resource: type, item_id: id, expected_revision: revision, operation_id: randomUUID(), details })
    ok(await resource('menu', menuId, null, menu)); ok(await resource('table', tableId, null, { name: 'Meja 1', capacity: 4, active: true })); ok(await resource('table', secondTableId, null, { name: 'Meja 2', capacity: 6, active: true }))
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    const capacity = await prepare(p, tableId, 6); await capacity.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(capacity.getByRole('alert')).toContainText('Meja ini hanya muat 4 orang, sedangkan jumlah tamu 6 orang.'); expect(ok(await admin.from('restaurant_orders').select('id').eq('business_id', bid))).toHaveLength(0)
    await p.setViewportSize({ width: 390, height: 844 }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await p.screenshot({ path: `${dir}/capacity-mobile.png`, fullPage: true }); await p.setViewportSize({ width: 1366, height: 900 })
    const stale = await context.newPage(), occupied = await prepare(stale, tableId)
    await capacity.getByLabel('Jumlah tamu', { exact: true }).fill('2'); await capacity.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(capacity).toHaveCount(0)
    await occupied.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(occupied.getByRole('alert')).toContainText('Meja ini sedang terpakai'); expect(ok(await admin.from('restaurant_orders').select('id').eq('business_id', bid))).toHaveLength(1); await occupied.getByRole('button', { name: 'Batal', exact: true }).click()
    const soldOut = await prepare(stale)
    ok(await resource('menu', menuId, 0, { ...menu, available: false }))
    await soldOut.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(soldOut.getByRole('alert')).toContainText('Menu "Kopi Error Uji" sedang habis.'); await stale.screenshot({ path: `${dir}/menu-out.png`, fullPage: true })
    ok(await resource('menu', menuId, 1, { ...menu, active: false }))
    await soldOut.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(soldOut.getByRole('alert')).toContainText('Menu yang dipilih sudah dinonaktifkan'); await soldOut.getByRole('button', { name: 'Batal', exact: true }).click(); ok(await resource('menu', menuId, 2, menu))
    const inactive = await prepare(stale, secondTableId)
    ok(await resource('table', secondTableId, 0, { name: 'Meja 2', capacity: 6, active: false }))
    await inactive.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(inactive.getByRole('alert')).toContainText('Meja yang dipilih sedang nonaktif'); await inactive.getByRole('button', { name: 'Batal', exact: true }).click()
    results.push('Capacity with actual guest counts, occupied table and inactive/sold-out menu are distinct server errors; failed saves create no extra orders')
    const order = ok(await admin.from('restaurant_orders').select('*').eq('business_id', bid).single()), code = 'PSN-' + order.id.slice(0, 8).toUpperCase()
    await p.getByRole('button', { name: `Ubah ${code}`, exact: true }).click(); const revision = p.getByRole('dialog', { name: 'Ubah pesanan', exact: true })
    ok(await client.rpc('save_restaurant_order', { target_id: bid, item_id: order.id, expected_revision: 0, operation_id: randomUUID(), details: { kind: 'dine_in', tableId, guests: 2, customer: 'Pelanggan umum', notes: 'Diubah dari tab lain', stage: 'preparing', lines: [{ id: menuId, quantity: 1 }] } }))
    await revision.getByRole('button', { name: 'Simpan pesanan', exact: true }).click(); await expect(revision.getByRole('alert')).toContainText('Pesanan telah diperbarui oleh petugas atau tab lain'); await revision.getByRole('button', { name: 'Batal', exact: true }).click(); await p.reload()
    await p.getByRole('button', { name: `Bayar ${code}`, exact: true }).click(); const payment = p.getByRole('dialog', { name: `Bayar ${code}`, exact: true }); await payment.getByLabel('Uang diterima', { exact: true }).fill('10000'); await payment.getByLabel('Pembayaran sebesar total sudah diterima dan diperiksa.', { exact: true }).check(); await payment.getByRole('button', { name: 'Catat pembayaran', exact: true }).click(); await expect(payment.getByRole('alert')).toContainText('Pembayaran masih kurang Rp5.000'); expect(ok(await admin.from('pos_transactions').select('id').eq('business_id', bid))).toHaveLength(0)
    await stale.goto('/dashboard/pos'); await stale.getByRole('button', { name: `Bayar ${code}`, exact: true }).click(); const alreadyPaid = stale.getByRole('dialog', { name: `Bayar ${code}`, exact: true }); await alreadyPaid.getByLabel('Uang diterima', { exact: true }).fill('15000'); await alreadyPaid.getByLabel('Pembayaran sebesar total sudah diterima dan diperiksa.', { exact: true }).check()
    await payment.getByLabel('Uang diterima', { exact: true }).fill('15000'); await payment.getByRole('button', { name: 'Catat pembayaran', exact: true }).click(); await expect(p).toHaveURL(/\/dashboard\/transactions\/[0-9a-f-]+$/)
    await alreadyPaid.getByRole('button', { name: 'Catat pembayaran', exact: true }).click(); await expect(alreadyPaid.getByRole('alert')).toContainText('Pesanan ini sudah dibayar'); expect(ok(await admin.from('pos_transactions').select('id').eq('business_id', bid))).toHaveLength(1)
    await p.goto('/dashboard/restaurant/tables'); await p.getByRole('button', { name: 'Tambah meja', exact: true }).click(); const duplicate = p.getByRole('dialog', { name: 'Tambah meja', exact: true }); await duplicate.getByLabel('Nama', { exact: true }).fill('Meja 1'); await duplicate.getByRole('button', { name: 'Simpan', exact: true }).click(); await expect(duplicate.getByRole('alert')).toHaveText('Nama/nomor meja sudah dipakai. Gunakan nama/nomor meja lain.'); expect(ok(await admin.from('restaurant_tables').select('id').eq('business_id', bid))).toHaveLength(2)
    expect(errors).toEqual([]); results.push('Revision conflict, insufficient cash with exact shortage, already-paid order and duplicate table name are specific; failed payments do not create sales'); passed = true
  } finally {
    await context.close()
    if (uid && !bid) bid = ok(await admin.from('businesses').select('id').eq('owner_id', uid).maybeSingle())?.id || ''
    if (bid) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    if (uid) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
