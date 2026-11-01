import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('map location: live provider/tiles, draft confirmation, autofill, failure recovery, saved coordinates and access', async ({ browser, baseURL }) => {
  test.setTimeout(300000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }, url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options), users: string[] = [], businesses: string[] = [], contexts: BrowserContext[] = [], errors: string[] = [], checks: string[] = [], dir = '.cache/business-location-map'
  const ok = (result: any) => { if (result.error) throw Error('Fixture failed: ' + result.error.code); return result.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((row: any) => row.id)
  async function snapshot() {
    const rows: unknown[] = []
    for (let start = 0; ; start += 500) { const batch = ok(await admin.from('businesses').select('*').in('id', legacy).order('id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  const before = await snapshot()
  let passed = false, leakedKey = false
  async function page() {
    const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }); contexts.push(context)
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text().replaceAll(process.env.GEOAPIFY_API_KEY || 'unused-secret', '[redacted]')) }); p.on('request', request => { if (process.env.GEOAPIFY_API_KEY && request.url().includes(process.env.GEOAPIFY_API_KEY)) leakedKey = true }); return p
  }
  async function login(p: Page, email: string, password: string) {
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(path => ['/dashboard', '/onboarding'].includes(path.pathname))
  }
  const point = { latitude: -6.8945, longitude: 107.613 }
  const fixture = { ...point, address: 'Jalan Uji Peta 10', province: 'Jawa Barat', city: 'Kota Bandung', district: 'Coblong', village: 'Cipaganti', display: 'Jalan Uji Peta 10, Cipaganti (fixture uji)', incomplete: false }
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-map-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url'), uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id; users.push(uid)
    const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options); ok(await client.auth.signInWithPassword({ email, password }))
    const bid = ok(await client.rpc('create_business_profile_with_location', { business_category: 'store', store_name: 'Toko Uji Peta', owner_name: 'Owner Uji Peta', store_phone: '081234567890', store_street: 'Jalan Lama', store_city: 'Kota Bandung', store_province: 'Jawa Barat', store_description: '', store_district: '', store_village: '' })); businesses.push(bid); ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    const stored = async () => ok(await admin.from('businesses').select('latitude,longitude,street_address,city,district,village').eq('id', bid).single())
    const p = await page(); await login(p, email, password); await p.goto('/dashboard/settings')
    const reverse = await p.request.post('/api/location', { data: { mode: 'reverse', ...point } }); expect(reverse.status()).toBe(200); expect((await reverse.json()).results[0].city).toBe('Kota Bandung')
    const anonymous = await browser.newContext({ baseURL }); contexts.push(anonymous)
    expect((await anonymous.request.post('/api/location', { data: { mode: 'reverse', ...point } })).status()).toBe(403)
    expect((await anonymous.request.get('/api/map-tiles/4/13/8')).status()).toBe(403)
    await p.getByRole('button', { name: 'Pilih titik di peta', exact: true }).click()
    const dialog = p.getByRole('dialog', { name: 'Pilih lokasi usaha', exact: true }), search = dialog.getByLabel('Cari lokasi atau alamat', { exact: true })
    await expect(dialog.locator('.leaflet-container')).toBeVisible()
    await expect.poll(async () => p.locator('.leaflet-tile-loaded').count(), { timeout: 30000 }).toBeGreaterThan(0)
    await search.fill('Jalan Ir. H. Djuanda, Kota Bandung'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await expect(dialog.locator('li button').first()).toBeVisible(); await dialog.locator('li button').first().click()
    await p.screenshot({ path: `${dir}/after-live-search.png`, animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(p.getByPlaceholder('Nama jalan, nomor, dan detail alamat', { exact: true })).toHaveValue('Jalan Lama'); expect((await stored()).latitude).toBeNull()
    checks.push('Live Geoapify reverse, address search and raster tiles passed; API key absent from browser URLs; cancel preserves original form and DB')
    await p.context().grantPermissions(['geolocation']); await p.context().setGeolocation({ latitude: -7.329249, longitude: 108.203538 })
    await p.getByRole('button', { name: 'Pilih titik di peta', exact: true }).click(); await dialog.getByRole('button', { name: 'Gunakan lokasi perangkat', exact: true }).click()
    await expect(dialog.getByText('Cilembang', { exact: true })).toBeVisible(); await expect(dialog.getByText('Kota Tasikmalaya', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true }).click()
    await expect(p.getByLabel('Provinsi *', { exact: true })).toHaveValue('Jawa Barat'); await expect(p.getByLabel('Kota/Kabupaten *', { exact: true })).toHaveValue('Kota Tasikmalaya'); await expect(p.getByLabel('Kecamatan', { exact: true })).toHaveValue('Cihideung'); await expect(p.getByLabel('Kelurahan/Desa', { exact: true })).toHaveValue('Cilembang'); expect((await stored()).latitude).toBeNull()
    await p.screenshot({ path: `${dir}/reported-point-autofill.png`, fullPage: true, animations: 'disabled' }); await p.reload()
    checks.push('Reported point -7.329249/108.203538: live reverse + containing boundaries autofill Jawa Barat / Kota Tasikmalaya / Cihideung / Cilembang in the real form; geolocation test uses browser-simulated GPS, not a real device fix')
    await p.getByRole('button', { name: 'Pilih titik di peta', exact: true }).click(); await p.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(p.getByRole('button', { name: 'Pilih titik di peta', exact: true })).toBeFocused()
    let fail = false, partial = false, delay = false, reverseCount = 0
    await p.route('**/api/location', async route => {
      const body = route.request().postDataJSON()
      if (fail) { await route.fulfill({ status: 502, json: { error: 'Layanan peta belum tersedia. Coba lagi atau isi alamat manual.' } }); return }
      if (body.mode === 'reverse') reverseCount++
      if (delay) await new Promise(resolve => setTimeout(resolve, 500))
      const selected = body.mode === 'reverse' ? { ...fixture, latitude: body.latitude, longitude: body.longitude } : fixture
      await route.fulfill({ json: { results: [{ ...selected, ...(partial ? { district: '', village: '', incomplete: true } : {}) }] } })
    })
    await p.getByRole('button', { name: 'Pilih titik di peta', exact: true }).click(); await search.fill('Lokasi uji'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await dialog.locator('li button').first().click()
    await expect(dialog.locator('.leaflet-marker-icon')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeEnabled()
    const canvas = dialog.locator('.leaflet-container'), marker = dialog.locator('.leaflet-marker-icon')
    const tileZooms = () => canvas.locator('img.leaflet-tile').evaluateAll(nodes => [...new Set(nodes.map(node => new URL((node as HTMLImageElement).src).pathname.split('/')[3]))].sort())
    await canvas.getByRole('button', { name: 'Zoom out', exact: true }).click(); await expect.poll(tileZooms).toEqual(['15'])
    await canvas.click({ position: { x: 70, y: 70 } }); await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeEnabled(); await expect.poll(tileZooms).toEqual(['15'])
    await search.fill('Lokasi uji'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await dialog.locator('li button').first().click(); await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeEnabled()
    const countBefore = reverseCount, markerBox = (await marker.boundingBox())!
    await p.mouse.move(markerBox.x + 12, markerBox.y + 15); await p.mouse.down(); await p.mouse.move(markerBox.x + 40, markerBox.y + 30, { steps: 8 }); await p.mouse.up()
    await expect.poll(() => reverseCount).toBe(countBefore + 1); await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeEnabled()
    fail = true; await canvas.click({ position: { x: 70, y: 70 } }); await expect(dialog.getByRole('alert').filter({ hasText: 'Layanan peta' })).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeDisabled()
    fail = false; delay = true; const box = (await canvas.boundingBox())!
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } }); await canvas.click({ position: { x: box.width / 2 + 20, y: box.height / 2 + 15 } }); await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeEnabled(); delay = false
    await search.fill('Lokasi uji'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await dialog.locator('li button').first().click()
    for (const width of [320, 390, 768, 1366]) {
      await p.setViewportSize({ width, height: 900 }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const bounds = (await dialog.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      await expect.poll(async () => canvas.locator('img.leaflet-tile:not(.leaflet-tile-loaded)').count(), { timeout: 30000 }).toBe(0)
      await p.screenshot({ path: `${dir}/modal-${width}.png`, animations: 'disabled' })
    }
    expect((await stored()).latitude).toBeNull()
    await dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true }).click(); await expect(dialog).toHaveCount(0)
    await expect(p.getByLabel('Provinsi *', { exact: true })).toHaveValue('Jawa Barat'); await expect(p.getByLabel('Kota/Kabupaten *', { exact: true })).toHaveValue('Kota Bandung'); await expect(p.getByLabel('Kecamatan', { exact: true })).toHaveValue('Coblong'); await expect(p.getByLabel('Kelurahan/Desa', { exact: true })).toHaveValue('Cipaganti')
    expect((await stored()).latitude).toBeNull()
    await p.route('**/dashboard/settings', async route => {
      const body = route.request().postData()
      if (route.request().method() === 'POST' && route.request().headers()['next-action'] && body?.includes('107.613')) await route.continue({ postData: body.replaceAll('107.613', '') })
      else await route.continue()
    })
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('alert').filter({ hasText: 'Latitude dan longitude' })).toBeVisible(); expect((await stored()).latitude).toBeNull(); await p.unroute('**/dashboard/settings')
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect.poll(async () => (await stored()).latitude).toBe(point.latitude)
    await p.reload(); await expect(p.getByText(/Titik dipilih:/)).toContainText('-6.894500'); await expect(p.getByLabel('Kelurahan/Desa', { exact: true })).toHaveValue('Cipaganti')
    const fresh = await page(); await login(fresh, email, password); await fresh.goto('/dashboard/settings'); await expect(fresh.getByText(/Titik dipilih:/)).toContainText('107.613000')
    checks.push('Fixture browser tests: draggable pin makes one reverse request, stale/failure states cannot apply, autofill four CSV fields, four viewport bounds, draft until Save, persistent coordinates/address across reload and fresh login')
    await p.getByRole('button', { name: 'Hapus titik', exact: true }).click(); expect((await stored()).latitude).toBe(point.latitude); await p.reload(); await expect(p.getByRole('button', { name: 'Ubah titik di peta', exact: true })).toBeVisible()
    await p.getByRole('button', { name: 'Hapus titik', exact: true }).click(); await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect.poll(async () => (await stored()).latitude).toBeNull(); await p.reload(); await expect(p.getByRole('button', { name: 'Pilih titik di peta', exact: true })).toBeVisible()
    partial = true; await p.getByRole('button', { name: 'Pilih titik di peta', exact: true }).click(); await search.fill('Lokasi tidak lengkap'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await dialog.locator('li button').first().click(); await expect(dialog.getByText(/Sebagian wilayah belum cocok/)).toBeVisible(); await dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true }).click(); await expect(p.getByLabel('Kecamatan', { exact: true })).toHaveValue(''); await expect(p.getByLabel('Kelurahan/Desa', { exact: true })).toHaveValue('')
    await p.getByLabel('Provinsi *', { exact: true }).fill('jawa timur'); await p.getByRole('option', { name: 'Jawa Timur', exact: true }).click(); await expect(p.getByText(/Titik dipilih:/)).toHaveCount(0)
    const businessCode = ok(await admin.from('businesses').select('code').eq('id', bid).single()).code
    for (const role of ['admin', 'cashier']) {
      const name = 'petugas' + randomBytes(3).toString('hex'), email = `${businessCode.toLowerCase()}.${name}@staff.usahaku.invalid`, password = randomBytes(24).toString('base64url')
      const id = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: 'staff' } })).user.id; users.push(id)
      ok(await admin.from('business_members').insert({ business_id: bid, user_id: id, name, username: name, role, must_change_password: false }))
      const staffClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options); ok(await staffClient.auth.signInWithPassword({ email, password }))
      const denied = await staffClient.rpc('save_business_profile_with_map', { target_id: bid, expected_revision: 0, new_name: 'Forbidden', new_phone: '', new_street: 'Jalan', new_city: 'Kota Bandung', new_province: 'Jawa Barat', new_description: '', new_district: '', new_village: '', new_latitude: point.latitude, new_longitude: point.longitude }); expect(denied.error?.code).toBe('42501')
      const staffPage = await page(); await staffPage.goto('/login?mode=staff'); await staffPage.getByLabel('Kode toko', { exact: true }).fill(businessCode); await staffPage.getByLabel('Username', { exact: true }).fill(name); await staffPage.getByLabel('Kata sandi', { exact: true }).fill(password); await staffPage.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(staffPage).toHaveURL(path => ['/dashboard', '/dashboard/pos'].includes(path.pathname))
      expect((await staffPage.request.post('/api/location', { data: { mode: 'reverse', ...point } })).status()).toBe(403); expect((await staffPage.request.get('/api/map-tiles/4/13/8')).status()).toBe(403)
    }
    const otherEmail = `usahaku-map-new-${randomUUID()}@example.com`, otherPassword = randomBytes(24).toString('base64url'), otherId = ok(await admin.auth.admin.createUser({ email: otherEmail, password: otherPassword, email_confirm: true })).user.id; users.push(otherId)
    const otherClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options); ok(await otherClient.auth.signInWithPassword({ email: otherEmail, password: otherPassword }))
    expect((await otherClient.rpc('save_business_profile_with_map', { target_id: bid, expected_revision: 0, new_name: 'Forbidden', new_phone: '', new_street: 'Jalan', new_city: 'Kota Bandung', new_province: 'Jawa Barat', new_description: '', new_district: '', new_village: '', new_latitude: point.latitude, new_longitude: point.longitude })).error?.code).toBe('42501')
    const onboarding = await page(); await login(onboarding, otherEmail, otherPassword); await onboarding.goto('/onboarding/identity')
    await onboarding.route('**/api/location', route => route.fulfill({ json: { results: [fixture] } }))
    await onboarding.getByLabel('Nama usaha *', { exact: true }).fill('Toko Baru Peta'); await onboarding.getByLabel('Nomor kontak usaha *', { exact: true }).fill('081234567890'); await onboarding.getByRole('button', { name: 'Pilih titik di peta', exact: true }).click()
    const newDialog = onboarding.getByRole('dialog', { name: 'Pilih lokasi usaha', exact: true }); await newDialog.getByLabel('Cari lokasi atau alamat', { exact: true }).fill('Lokasi uji'); await newDialog.getByRole('button', { name: 'Cari', exact: true }).click(); await newDialog.locator('li button').first().click(); await newDialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true }).click()
    await onboarding.getByRole('button', { name: 'Simpan & lanjutkan', exact: true }).click(); await expect(onboarding).toHaveURL(/\/onboarding\/setup/)
    const created = ok(await admin.from('businesses').select('id,latitude,longitude,onboarding_completed_at').eq('owner_id', otherId).single()); businesses.push(created.id); expect(created.latitude).toBe(point.latitude); expect(created.longitude).toBe(point.longitude); expect(created.onboarding_completed_at).toBeNull()
    await p.unroute('**/api/location'); expect(leakedKey).toBe(false); expect(errors).toEqual([])
    checks.push('Remove is draft until Save, removal persists, incomplete regions cleared for manual selection, manual region change clears pin, admin/cashier API and RPC denied, other owner cannot mutate this business; new onboarding saves coordinates as draft; pre-existing businesses unchanged'); passed = true
  } finally {
    for (const context of contexts) await context.close()
    if (users.length) for (const row of ok(await admin.from('businesses').select('id').in('owner_id', users))) if (!businesses.includes(row.id)) businesses.push(row.id)
    for (const id of businesses) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', id)); ok(await admin.from('business_members').delete().eq('business_id', id)); ok(await admin.from('businesses').delete().eq('id', id)) }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, checks, pageErrors: errors, leakedKey, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
