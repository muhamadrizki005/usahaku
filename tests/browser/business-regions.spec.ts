import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('CSV locations: dependent dropdowns, legacy records, saved settings and new owner onboarding', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const users: string[] = [], businesses: string[] = [], contexts: BrowserContext[] = [], errors: string[] = [], results: string[] = [], dir = '.cache/business-regions'
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  const snapshot = async () => {
    const rows: unknown[] = []
    for (let start = 0; ; start += 500) { const batch = ok(await admin.from('businesses').select('*').in('id', legacy).order('id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  const before = await snapshot()
  let passed = false
  async function page() {
    const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }); contexts.push(context)
    const p = await context.newPage(); p.on('pageerror', error => errors.push(error.message)); return p
  }
  async function login(p: Page, email: string, password: string) {
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(p).toHaveURL(url => ['/dashboard', '/onboarding'].includes(url.pathname))
  }
  async function province(p: Page, name: string) { await p.getByLabel('Provinsi *', { exact: true }).fill(name.toLowerCase()); await p.getByRole('option', { name, exact: true }).click() }
  async function city(p: Page, name: string) { await p.getByLabel('Kota/Kabupaten *', { exact: true }).fill(name.toLowerCase()); await p.getByRole('option', { name, exact: true }).click() }
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-regions-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id; users.push(uid)
    const p = await page(); await login(p, email, password)
    await p.getByRole('button', { name: /^Toko \/ Minimarket \/ Kios/ }).click(); await p.getByRole('button', { name: 'Lanjutkan', exact: true }).click()
    await expect(p).toHaveURL(/\/onboarding\/identity/)
    const cityField = p.getByLabel('Kota/Kabupaten *', { exact: true })
    const districtField = p.getByLabel('Kecamatan', { exact: true }), villageField = p.getByLabel('Kelurahan/Desa', { exact: true })
    await expect(districtField).toBeDisabled(); await expect(villageField).toBeDisabled()
    await p.getByLabel('Provinsi *', { exact: true }).fill('wilayah-tidak-ada'); await expect(p.getByRole('status').filter({ hasText: 'Tidak ada wilayah' })).toBeVisible(); await p.keyboard.press('Escape')
    await expect(cityField).toBeDisabled(); await expect(cityField).toHaveAttribute('placeholder', 'Pilih provinsi terlebih dahulu')
    await province(p, 'Jawa Barat'); await expect(cityField).toBeEnabled(); await cityField.click()
    await expect(p.getByRole('option', { name: 'Kab. Bandung', exact: true })).toBeVisible(); await expect(p.getByRole('option', { name: 'Kota Bandung', exact: true })).toBeVisible(); await expect(p.getByRole('option', { name: 'Kota Surabaya', exact: true })).toHaveCount(0)
    await p.getByRole('option', { name: 'Kota Bandung', exact: true }).click(); await province(p, 'Jawa Timur'); await expect(cityField).toHaveValue('')
    await cityField.click(); await expect(p.getByRole('option', { name: 'Kota Bandung', exact: true })).toHaveCount(0); await p.getByRole('option', { name: 'Kota Surabaya', exact: true }).click()
    await expect(districtField).toBeEnabled(); await districtField.fill('karang pi'); await expect(p.getByRole('option', { name: 'Coblong', exact: true })).toHaveCount(0); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await expect(districtField).toHaveValue('Karang Pilang')
    await expect(villageField).toBeEnabled(); await villageField.fill('kebra'); await p.getByRole('option', { name: 'Kebraon', exact: true }).click()
    await p.getByLabel('Nama usaha *', { exact: true }).fill('Toko Uji Wilayah'); await p.getByPlaceholder('Nama jalan, nomor, dan detail alamat', { exact: true }).fill('Jalan Uji Wilayah'); await p.getByLabel('Nomor kontak usaha *', { exact: true }).fill('081234567890')
    for (const width of [320, 390, 768, 1366]) {
      await p.setViewportSize({ width, height: 900 }); await cityField.click()
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const bounds = (await p.getByRole('listbox').boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      await p.screenshot({ path: `${dir}/identity-${width}.png`, fullPage: true, animations: 'disabled' }); await p.keyboard.press('Escape'); await expect(p.getByRole('listbox')).toHaveCount(0)
      await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${dir}/fields-${width}.png`, fullPage: true, animations: 'disabled' })
    }
    await p.getByRole('button', { name: 'Simpan & lanjutkan', exact: true }).click(); await expect(p).toHaveURL(/\/onboarding\/setup/)
    const bid = ok(await admin.from('businesses').select('id,city,province,district,village').eq('owner_id', uid).single()); businesses.push(bid.id)
    expect(bid.city).toBe('Kota Surabaya'); expect(bid.province).toBe('Jawa Timur')
    expect(bid.district).toBe('Karang Pilang'); expect(bid.village).toBe('Kebraon')
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    ok(await client.auth.signInWithPassword({ email, password })); ok(await client.rpc('complete_business_onboarding', { target_id: bid.id }))
    await p.goto('/dashboard/settings'); await expect(cityField).toHaveValue('Kota Surabaya')
    await expect(districtField).toHaveValue('Karang Pilang'); await expect(villageField).toHaveValue('Kebraon')
    await province(p, 'Jawa Barat'); await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('alert').filter({ hasText: 'Lengkapi' })).toBeVisible()
    await expect(districtField).toHaveValue(''); await expect(villageField).toHaveValue(''); await expect(districtField).toBeDisabled(); await expect(villageField).toBeDisabled()
    expect(ok(await admin.from('businesses').select('province').eq('id', bid.id).single()).province).toBe('Jawa Timur')
    let failedLoad = false
    await p.route('**/api/regions?level=district&parent=3273', async route => {
      if (!failedLoad) { failedLoad = true; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) } else await route.continue()
    })
    await city(p, 'Kota Bandung'); await expect(p.getByRole('alert').filter({ hasText: 'Daftar wilayah' })).toBeVisible(); await p.getByRole('button', { name: 'Coba lagi', exact: true }).click(); expect(failedLoad).toBe(true)
    await expect(districtField).toBeEnabled(); await districtField.fill('coblong'); await p.getByRole('option', { name: 'Coblong', exact: true }).click(); await expect(villageField).toBeEnabled(); await villageField.fill('cipaganti'); await p.getByRole('option', { name: 'Cipaganti', exact: true }).click()
    await p.unroute('**/api/regions?level=district&parent=3273')
    await districtField.fill('sukasari'); await p.getByRole('option', { name: 'Sukasari', exact: true }).click(); await expect(villageField).toHaveValue(''); await expect(villageField).toBeEnabled(); await villageField.click(); await expect(p.getByRole('option', { name: 'Cipaganti', exact: true })).toHaveCount(0); await p.keyboard.press('Escape')
    await districtField.fill('coblong'); await p.getByRole('option', { name: 'Coblong', exact: true }).click(); await expect(villageField).toBeEnabled(); await villageField.fill('cipaganti'); await p.getByRole('option', { name: 'Cipaganti', exact: true }).click()
    let forged = false
    await p.route('**/dashboard/settings', async route => {
      const request = route.request(), body = request.postData()
      if (request.method() === 'POST' && request.headers()['next-action'] && body?.includes('Kota Bandung')) {
        forged = true; await route.continue({ postData: body.replaceAll('Kota Bandung', 'Kota Surabaya') })
      } else await route.continue()
    })
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('alert').filter({ hasText: 'sesuai dengan provinsi' })).toBeVisible(); expect(forged).toBe(true)
    expect(ok(await admin.from('businesses').select('province').eq('id', bid.id).single()).province).toBe('Jawa Timur')
    await p.unroute('**/dashboard/settings')
    await p.route('**/dashboard/settings', async route => {
      const request = route.request(), body = request.postData()
      if (request.method() === 'POST' && request.headers()['next-action'] && body?.includes('Cipaganti')) await route.continue({ postData: body.replaceAll('Cipaganti', 'Desa tidak sesuai') })
      else await route.continue()
    })
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('alert').filter({ hasText: 'sesuai dengan kecamatan' })).toBeVisible()
    expect(ok(await admin.from('businesses').select('village').eq('id', bid.id).single()).village).toBe('Kebraon')
    await p.unroute('**/dashboard/settings')
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('status').filter({ hasText: 'Profil usaha tersimpan' })).toBeVisible()
    await expect.poll(async () => ok(await admin.from('businesses').select('city').eq('id', bid.id).single()).city).toBe('Kota Bandung')
    await p.reload(); await expect(cityField).toHaveValue('Kota Bandung'); await expect(p.getByLabel('Provinsi *', { exact: true })).toHaveValue('Jawa Barat')
    await expect(districtField).toHaveValue('Coblong'); await expect(villageField).toHaveValue('Cipaganti')
    const fresh = await page(); await login(fresh, email, password); await fresh.goto('/dashboard/settings'); await expect(fresh.getByLabel('Kota/Kabupaten *', { exact: true })).toHaveValue('Kota Bandung')
    results.push('Four searchable fields, disabled child controls, scoped options, descendant reset, empty search, failed-load retry, keyboard navigation, server rejects forged cross-province pair, all four persisted after reload and fresh browser login')
    await expect(fresh.getByLabel('Kecamatan', { exact: true })).toHaveValue('Coblong'); await expect(fresh.getByLabel('Kelurahan/Desa', { exact: true })).toHaveValue('Cipaganti')
    ok(await admin.from('businesses').update({ city: 'Bandung', district: '', village: '' }).eq('id', bid.id)); await p.reload(); await expect(cityField).toHaveValue('Bandung (tersimpan)')
    await p.getByLabel('Nama usaha *', { exact: true }).fill('Toko Uji Wilayah Revisi'); await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(p.getByRole('status').filter({ hasText: 'Profil usaha tersimpan' })).toBeVisible()
    await expect.poll(async () => ok(await admin.from('businesses').select('name').eq('id', bid.id).single()).name).toBe('Toko Uji Wilayah Revisi')
    expect(ok(await admin.from('businesses').select('city').eq('id', bid.id).single()).city).toBe('Bandung')
    await province(p, 'Jawa Timur'); await expect(cityField).toHaveValue(''); await cityField.focus(); await p.keyboard.press('ArrowDown'); await expect(p.getByRole('listbox')).toBeVisible(); await p.getByRole('option', { name: 'Kota Surabaya', exact: true }).focus(); await p.keyboard.press('Enter'); await expect(cityField).toHaveValue('Kota Surabaya')
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect.poll(async () => ok(await admin.from('businesses').select('city').eq('id', bid.id).single()).city).toBe('Kota Surabaya'); await p.reload(); await expect(cityField).toHaveValue('Kota Surabaya')
    expect(errors).toEqual([]); results.push('Unchanged ambiguous legacy location retained; explicit reselection replaces it; keyboard Enter/Escape and dropdown bounds at 320/390/768/1366 passed'); passed = true
  } finally {
    for (const context of contexts) await context.close()
    if (users.length) for (const row of ok(await admin.from('businesses').select('id').in('owner_id', users))) if (!businesses.includes(row.id)) businesses.push(row.id)
    for (const id of businesses) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', id)); ok(await admin.from('business_members').delete().eq('business_id', id)); ok(await admin.from('businesses').delete().eq('id', id)) }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
