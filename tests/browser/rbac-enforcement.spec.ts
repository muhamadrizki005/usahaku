import { test, expect, type Browser, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

async function fixture(browser: Browser, baseURL?: string, requireMigration = true) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('RBAC fixture: ' + (r.error.code || r.error.status)); return r.data }
  if (requireMigration) ok(await admin.from('business_roles').select('role_key').limit(1))
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  async function snapshot() {
    const tables: Record<string, any[]> = {}
    for (const table of ['businesses','business_members','business_roles','catalog_products','stock_movements','pos_transactions','customers','business_payments']) {
      const rows: any[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order(table === 'business_payments' ? 'business_id' : 'id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      tables[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(tables)).digest('hex')
  }
  const before = await snapshot(), users: string[] = [], bids: string[] = [], contexts: BrowserContext[] = [], errors: string[] = []
  async function account(role?: string, bid?: string) {
    const username = 'audit' + randomBytes(4).toString('hex'), password = randomBytes(24).toString('base64url')
    const code = bid ? ok(await admin.from('businesses').select('code').eq('id', bid).single()).code : ''
    const email = bid ? `${code.toLowerCase()}.${username}@staff.usahaku.invalid` : `usahaku-rbac-${randomUUID()}@example.com`
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role ? 'staff' : 'owner' } })).user.id
    users.push(uid)
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    ok(await client.auth.signInWithPassword({ email, password }))
    if (bid) ok(await admin.from('business_members').insert({ business_id: bid, user_id: uid, username, name: 'Staf Audit ' + username, role, must_change_password: false }))
    else { bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji RBAC', owner_name: 'Owner Uji RBAC', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' })); bids.push(bid!); ok(await client.rpc('complete_business_onboarding', { target_id: bid })) }
    return { client, bid: bid!, uid, email, password, username, code, role }
  }
  async function login(actor: Awaited<ReturnType<typeof account>>) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }); contexts.push(context)
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
    await page.goto(actor.role ? '/login?mode=staff' : '/login')
    if (actor.role) { await page.getByLabel('Kode toko', { exact: true }).fill(actor.code); await page.getByLabel('Username', { exact: true }).fill(actor.username) }
    else await page.getByLabel('Email', { exact: true }).fill(actor.email)
    await page.getByLabel('Kata sandi', { exact: true }).fill(actor.password); await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(page).toHaveURL(/\/(dashboard|account)/)
    return page
  }
  async function product(actor: Awaited<ReturnType<typeof account>>, name = 'Produk RBAC UI') {
    const id = randomUUID(), result = await actor.client.rpc('save_catalog_product', { target_id: actor.bid, item_id: id, expected_version: null, operation_id: randomUUID(), details: { name, category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '10', active: true } })
    return { id, result }
  }
  async function cleanup(name: string, passed: boolean) {
    for (const context of contexts) await context.close()
    for (const bid of bids) { const members = ok(await admin.from('business_members').select('user_id').eq('business_id', bid)); for (const member of members) if (!users.includes(member.user_id)) users.push(member.user_id); ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    for (const uid of users) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true); expect(errors).toEqual([])
    await mkdir('.cache/rbac-fixes/results', { recursive: true }); await writeFile(`.cache/rbac-fixes/results/${name}.json`, JSON.stringify({ passed, cleanup: true, legacyUnchanged: unchanged, pageErrors: errors }, null, 2))
  }
  return { admin, ok, account, login, product, cleanup }
}

test('owner staff dialogs support labels, focus, Escape and keyboard dropdowns without changing saved roles', async ({ browser, baseURL }) => {
  const f = await fixture(browser, baseURL, false); let passed = false
  try {
    const owner = await f.account(), cashier = await f.account('cashier', owner.bid), manager = await f.account('admin', owner.bid)
    const page = await f.login(owner); await page.goto('/dashboard/settings/staff')
    const defaults = f.ok(await owner.client.from('business_roles').select('*').eq('business_id', owner.bid))
    for (const name of ['Admin Toko', 'Petugas Kasir']) await expect(page.getByTestId('role-card-' + defaults.find((r: any) => r.name === name).id)).toContainText('1 staf')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      const trigger = page.getByRole('button', { name: 'Tambah role', exact: true }); await trigger.click()
      const dialog = page.getByRole('dialog'); await expect(dialog.getByLabel('Nama Role', { exact: false })).toBeFocused()
      await dialog.getByLabel('Deskripsi', { exact: false }).fill('Draf tidak disimpan')
      await dialog.getByRole('button', { name: 'Simpan Role Baru', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(dialog.getByLabel('Tutup formulir role')).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
    }
    const change = page.getByTestId('staff-' + cashier.username).getByRole('button', { name: 'Ubah role', exact: true }); await change.click()
    const dialog = page.getByRole('dialog'), select = dialog.getByLabel('Pilih role baru', { exact: true })
    await select.focus(); await page.keyboard.press('ArrowDown'); await expect(page.getByRole('option', { name: 'Petugas Kasir', exact: true })).toBeFocused()
    await page.keyboard.press('Home'); await expect(page.getByRole('option', { name: 'Admin Toko', exact: true })).toBeFocused()
    await page.keyboard.press('End'); await expect(page.getByRole('option', { name: 'Petugas Kasir', exact: true })).toBeFocused()
    await page.keyboard.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0); await expect(dialog).toBeVisible(); await expect(select).toBeFocused()
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(change).toBeFocused()
    const members = f.ok(await owner.client.from('business_members').select('user_id,role').in('user_id', [cashier.uid, manager.uid]))
    expect(members.find((m: any) => m.user_id === cashier.uid).role).toBe('cashier'); expect(members.find((m: any) => m.user_id === manager.uid).role).toBe('admin')
    passed = true
  } finally { await f.cleanup('keyboard-and-counts', passed) }
})

test('owner creates stable custom roles; role changes, member counts and keyboard dialogs remain usable on desktop and mobile', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const f = await fixture(browser, baseURL); let passed = false
  try {
    const owner = await f.account(), cashier = await f.account('cashier', owner.bid), item = await f.product(owner); f.ok(item.result)
    const page = await f.login(owner); await page.goto('/dashboard/settings/staff')
    const defaults = f.ok(await f.admin.from('business_roles').select('*').eq('business_id', owner.bid)), cashierRole = defaults.find((role: any) => role.role_key === 'cashier')
    await expect(page.getByTestId('role-card-' + cashierRole.id)).toContainText('1 staf')
    const trigger = page.getByRole('button', { name: 'Tambah role', exact: true }); await trigger.click()
    let dialog = page.getByRole('dialog'); await expect(dialog.getByLabel('Nama Role', { exact: false })).toBeFocused()
    await dialog.getByLabel('Nama Role', { exact: false }).fill('Pengamat UI')
    await dialog.getByRole('checkbox', { name: /^Lihat produk/ }).check(); await expect(dialog.getByRole('checkbox', { name: /^Ubah pengaturan/ })).toBeDisabled()
    const first = dialog.getByLabel('Nama Role', { exact: false }), last = dialog.getByRole('button', { name: 'Simpan Role Baru', exact: true })
    await last.focus(); await page.keyboard.press('Tab'); await expect(dialog.getByLabel('Tutup formulir role')).toBeFocused()
    await first.focus(); await dialog.getByRole('button', { name: 'Simpan Role Baru', exact: true }).click(); await expect(dialog).toHaveCount(0)
    const role = f.ok(await owner.client.from('business_roles').select('*').eq('business_id', owner.bid).eq('name', 'Pengamat UI').single()); expect(role.role_key).toBe(role.id)
    const staffRow = page.getByTestId('staff-' + cashier.username), change = staffRow.getByRole('button', { name: 'Ubah role', exact: true })
    await change.click(); dialog = page.getByRole('dialog'); const select = dialog.getByLabel('Pilih role baru', { exact: true })
    await select.press('ArrowDown'); await expect(page.getByRole('listbox')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0); await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(change).toBeFocused()
    await change.click(); await page.getByLabel('Pilih role baru').click(); await page.getByRole('option', { name: 'Petugas Kasir', exact: true }).click(); await page.getByRole('button', { name: 'Simpan Role', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(f.ok(await f.admin.from('business_members').select('role').eq('user_id', cashier.uid).single()).role).toBe('cashier')
    const p = await f.login(cashier); await expect(p).toHaveURL(/\/dashboard\/pos$/)
    await change.click(); await page.getByLabel('Pilih role baru').click(); await page.getByRole('option', { name: 'Pengamat UI', exact: true }).click(); await page.getByRole('button', { name: 'Simpan Role', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(f.ok(await f.admin.from('business_members').select('role').eq('user_id', cashier.uid).single()).role).toBe(role.id)
    await p.reload(); await expect(p).toHaveURL(/\/dashboard\/products$/); await expect(p.getByRole('heading', { name: 'Manajemen produk', exact: true })).toBeVisible(); await expect(p.getByRole('button', { name: 'Tambah produk', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('role-card-' + role.id)).toContainText('1 staf')
    await p.goto('/dashboard/settings'); await expect(p).toHaveURL(/\/dashboard\/products$/)
    for (const width of [390, 320]) { await p.setViewportSize({ width, height: 900 }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
    await page.getByTestId('role-card-' + role.id).getByRole('button', { name: 'Kelola hak akses', exact: true }).click(); await page.getByLabel('Nama Role', { exact: false }).fill('Pengamat Berganti Nama'); await page.getByRole('button', { name: 'Perbarui Hak Akses', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await p.reload(); await expect(p.getByRole('heading', { name: 'Manajemen produk', exact: true })).toBeVisible()
    passed = true
  } finally { await f.cleanup('stable-role-and-keyboard', passed) }
})

test('revoked admin permissions block live-session writes, bulk actions and exports while keeping tenant and cashier scopes', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const f = await fixture(browser, baseURL); let passed = false
  try {
    const owner = await f.account(), manager = await f.account('admin', owner.bid), cashier = await f.account('cashier', owner.bid), other = await f.account()
    const item = await f.product(owner); f.ok(item.result)
    const p = await f.login(manager); await p.goto('/dashboard/products'); await expect(p.getByRole('button', { name: 'Tambah produk', exact: true })).toBeVisible()
    const page = await f.login(owner); await page.goto('/dashboard/settings/staff')
    const role = f.ok(await owner.client.from('business_roles').select('*').eq('business_id', owner.bid).eq('role_key', 'admin').single())
    await page.getByTestId('role-card-' + role.id).getByRole('button', { name: 'Kelola hak akses', exact: true }).click()
    const dialog = page.getByRole('dialog'); const checked = dialog.locator('input[type=checkbox]:checked')
    while (await checked.count()) await checked.first().uncheck()
    await dialog.getByRole('checkbox', { name: /^Lihat produk/ }).check(); await dialog.getByRole('button', { name: 'Perbarui Hak Akses', exact: true }).click(); await expect(dialog).toHaveCount(0)
    expect(f.ok(await owner.client.from('business_roles').select('permissions').eq('id', role.id).single()).permissions).toEqual(['products:view'])
    expect((await f.product(manager, 'Tidak boleh tersimpan')).result.error?.code).toBe('42501')
    const bulk = await manager.client.rpc('bulk_catalog_products', { target_id: owner.bid, operation_id: randomUUID(), items: [{ id: item.id, revision: 0 }], new_category: null, new_active: false }); expect(bulk.error?.code).toBe('42501')
    await p.reload(); await expect(p.getByRole('button', { name: 'Tambah produk', exact: true })).toHaveCount(0); await expect(p.getByRole('button', { name: 'Ubah', exact: true })).toHaveCount(0)
    expect((await p.context().request.get('/api/reports/sales')).status()).toBe(403)
    expect((await other.client.from('catalog_products').select('id').eq('business_id', owner.bid)).data).toEqual([])
    expect((await other.client.rpc('save_business_loyalty_settings', { target_id: owner.bid, new_active: true, new_nominal: 1 })).error?.code).toBe('42501')
    expect((await cashier.client.rpc('save_store_tax', { target_id: owner.bid, expected_version: 0, rate: 10 })).error?.code).toBe('42501')
    expect((await cashier.client.from('customer_point_history').select('id').eq('business_id', owner.bid)).data).toEqual([])
    f.ok(await owner.client.from('business_roles').update({ permissions: [] }).eq('id', role.id))
    await p.goto('/dashboard/products'); await expect(p).toHaveURL(/\/account\?notice=permissions$/)
    passed = true
  } finally { await f.cleanup('live-revocation', passed) }
})
