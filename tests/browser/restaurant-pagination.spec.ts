import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('restaurant paged history survives 5000+ orders, releases last pages, validates cash and isolates cashier reads', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  const snapshot = async () => {
    const data: Record<string, unknown> = {}
    for (const table of ['businesses', 'business_members', 'catalog_products', 'stock_movements', 'restaurant_menu', 'restaurant_tables', 'restaurant_orders', 'pos_transactions']) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      data[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }
  const before = await snapshot(), context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }), p = await context.newPage()
  const users: string[] = [], observations: string[] = [], errors: string[] = [], dir = '.cache/restaurant-read-fixes'
  p.on('pageerror', e => errors.push(e.message))
  let bid = '', passed = false
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-paged-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id; users.push(uid)
    ok(await owner.auth.signInWithPassword({ email, password }))
    bid = ok(await owner.rpc('create_business_profile_for_category', { business_category: 'restaurant', store_name: 'Restoran Uji Pagination', owner_name: 'Owner Pagination', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    ok(await owner.rpc('complete_business_onboarding', { target_id: bid }))
    const menuId = randomUUID()
    ok(await owner.rpc('save_restaurant_resource', { target_id: bid, resource: 'menu', item_id: menuId, expected_revision: null, operation_id: randomUUID(), details: { name: 'Kopi Pagination', category: 'Minuman', price: '15000', available: true, active: true } }))
    const createOrder = async (customer: string) => ok(await owner.rpc('save_restaurant_order', { target_id: bid, item_id: randomUUID(), expected_revision: null, operation_id: randomUUID(), details: { kind: 'takeaway', tableId: null, guests: 1, customer, notes: '', stage: 'new', lines: [{ id: menuId, quantity: 1 }] } }))
    for (let i = 1; i <= 26; i++) await createOrder(i === 26 ? 'Cari literal %,()_' : `Pesanan audit ${String(i).padStart(2, '0')}`)
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    await p.goto('/dashboard/pos'); await expect(p.locator('tbody tr')).toHaveCount(25)
    await p.getByRole('button', { name: 'Berikutnya', exact: true }).click(); await expect(p.locator('tbody tr')).toHaveCount(1)
    await p.getByRole('button', { name: /^Batalkan PSN-/ }).click()
    const cancel = p.getByRole('dialog'); await cancel.getByLabel('Alasan pembatalan', { exact: true }).fill('Uji pembatalan halaman terakhir')
    await cancel.getByRole('button', { name: 'Batalkan pesanan', exact: true }).click(); await expect(cancel).toHaveCount(0)
    await expect(p.locator('tbody tr')).toHaveCount(25); await expect(p.getByText('25 pesanan', { exact: true })).toBeVisible(); await expect(p.getByRole('button', { name: 'Sebelumnya', exact: true })).toBeDisabled()
    await p.screenshot({ path: `${dir}/pagination-cancel-fixed.png`, fullPage: true })
    await createOrder('Tambahan uji pembayaran'); await p.reload(); await p.getByRole('button', { name: 'Berikutnya', exact: true }).click(); await expect(p.locator('tbody tr')).toHaveCount(1)
    await p.getByRole('button', { name: /^Bayar PSN-/ }).click(); const pay = p.getByRole('dialog')
    await pay.getByLabel('Pembayaran sebesar total sudah diterima dan diperiksa.', { exact: true }).check()
    for (const invalid of ['abc', '15.000', '-1', '1e4', '1000000000000']) {
      await pay.getByLabel('Uang diterima', { exact: true }).fill(invalid)
      await expect(pay.getByRole('alert')).toContainText('Masukkan nominal rupiah yang valid')
      await expect(pay.getByRole('button', { name: 'Catat pembayaran', exact: true })).toBeDisabled()
      await expect(pay).not.toContainText('NaN'); await expect(pay).not.toContainText('Infinity')
    }
    await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: `${dir}/cash-validation-mobile.png`, fullPage: true }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await pay.getByLabel('Uang diterima', { exact: true }).fill('20000'); await expect(pay.getByRole('alert')).toHaveCount(0); await expect(pay).toContainText('Kembalian pratinjau: Rp5.000')
    await pay.getByRole('button', { name: 'Catat pembayaran', exact: true }).click(); await expect(p).toHaveURL(/\/dashboard\/transactions\/[0-9a-f-]+$/); await expect(p.locator('#pos-receipt')).toContainText('Rp5.000')
    await p.goto('/dashboard/pos'); await expect(p.locator('tbody tr')).toHaveCount(25)
    observations.push('Last-page cancellation returns to 25 rows; invalid cash is blocked and corrected cash pays one sale with correct change')
    const template = ok(await admin.from('restaurant_orders').select('*').eq('business_id', bid).eq('status', 'open').limit(1).single())
    const history = Array.from({ length: 5001 }, (_, i) => ({ ...template, id: randomUUID(), customer: `Riwayat uji ${i}`, status: 'cancelled', cancellation_reason: 'Riwayat uji pagination', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', revision: 0 }))
    for (let start = 0; start < history.length; start += 500) ok(await admin.from('restaurant_orders').insert(history.slice(start, start + 500)))
    await p.setViewportSize({ width: 1366, height: 900 })
    const response = await p.goto('/dashboard'); expect(response?.status()).toBe(200); await expect(p.getByRole('heading', { name: 'Ringkasan restoran', exact: true })).toBeVisible()
    await expect(p.locator('dl > div').filter({ has: p.locator('dt', { hasText: /^Pesanan terbuka$/ }) }).locator('dd')).toHaveText('25')
    await p.screenshot({ path: `${dir}/dashboard-5000-history.png`, fullPage: true })
    await p.goto('/dashboard/pos'); await expect(p.locator('tbody tr')).toHaveCount(25)
    await p.getByLabel('Status pesanan', { exact: true }).selectOption('all'); await expect(p.getByText('5028 pesanan', { exact: true })).toBeVisible()
    await p.getByLabel('Cari pesanan', { exact: true }).fill('%,()_'); await expect(p.getByText('1 pesanan', { exact: true })).toBeVisible(); await expect(p.locator('tbody tr')).toHaveCount(1)
    await p.getByLabel('Cari pesanan', { exact: true }).fill('hasil tidak ada'); await expect(p.getByText('Belum ada pesanan yang sesuai.', { exact: true })).toBeVisible()
    let blocked = false
    await p.route('**/dashboard/pos**', async route => { if (!blocked && route.request().method() === 'POST' && route.request().headers()['next-action']) { blocked = true; await route.abort('failed') } else await route.continue() })
    await p.getByLabel('Cari pesanan', { exact: true }).fill('Riwayat uji 4999'); await expect(p.locator('section[aria-busy]').getByRole('alert')).toContainText('Daftar pesanan belum dapat dimuat')
    await p.unroute('**/dashboard/pos**'); await p.getByRole('button', { name: 'Coba muat lagi', exact: true }).click(); await expect(p.getByText('1 pesanan', { exact: true })).toBeVisible(); await expect(p.locator('tbody tr')).toContainText('Riwayat uji 4999')
    const clientPage = ok(await owner.rpc('read_restaurant_orders_page', { target_id: bid, order_status: 'all', search_text: '', requested_page: 1000000 })); expect(clientPage.orders).toHaveLength(3); expect(clientPage.total).toBe(5028)
    observations.push('5028 rows remain readable; dashboard totals, database filtering/literal search, empty state, failed-read retry and final history page passed')
    const cashierEmail = `usahaku-paged-cashier-${randomUUID()}@example.com`, cashierPassword = randomBytes(24).toString('base64url'), cashier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    const cashierId = ok(await admin.auth.admin.createUser({ email: cashierEmail, password: cashierPassword, email_confirm: true, app_metadata: { account_type: 'staff' } })).user.id; users.push(cashierId)
    ok(await admin.from('business_members').insert({ business_id: bid, user_id: cashierId, name: 'Kasir Pagination', username: 'kasirpag', role: 'cashier', must_change_password: false }))
    ok(await cashier.auth.signInWithPassword({ email: cashierEmail, password: cashierPassword }))
    expect(ok(await cashier.rpc('read_restaurant_orders_page', { target_id: bid, order_status: 'all' })).total).toBe(0)
    expect((await cashier.rpc('read_restaurant_overview', { target_id: bid })).error?.code).toBe('42501')
    expect(errors).toEqual([]); passed = true
  } finally {
    await context.close()
    if (users.length && !bid) bid = ok(await admin.from('businesses').select('id').eq('owner_id', users[0]).maybeSingle())?.id || ''
    if (bid) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, observations, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
