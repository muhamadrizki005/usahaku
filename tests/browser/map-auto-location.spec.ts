import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('opening map locates automatically and handles denied, timeout and stale device responses', async ({ browser, baseURL }) => {
  test.setTimeout(120000)
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `usahaku-autolocate-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (created.error) throw Error('Fixture failed: ' + created.error.code)
  const uid = created.data.user.id, context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, geolocation: { latitude: -7.329249, longitude: 108.203538 }, permissions: ['geolocation'] }), p = await context.newPage()
  const errors: string[] = []; p.on('pageerror', error => errors.push(error.message))
  let passed = false
  try {
    await p.route('**/api/location', route => {
      const input = route.request().postDataJSON(), tasik = input.mode === 'reverse' && input.latitude === -7.329249
      return route.fulfill({ json: { results: [{ latitude: tasik ? -7.329249 : -6.8945, longitude: tasik ? 108.203538 : 107.613, address: 'Jalan Uji', province: 'Jawa Barat', city: tasik ? 'Kota Tasikmalaya' : 'Kota Bandung', district: tasik ? 'Cihideung' : 'Coblong', village: tasik ? 'Cilembang' : 'Cipaganti', incomplete: false, display: tasik ? 'Lokasi GPS uji Tasikmalaya' : 'Lokasi manual uji Bandung' }] } })
    })
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(/\/onboarding$/); await p.goto('/onboarding/identity')
    const open = p.getByRole('button', { name: 'Pilih titik di peta', exact: true }), dialog = p.getByRole('dialog', { name: 'Pilih lokasi usaha', exact: true })
    await open.click(); await expect(dialog.getByText('Cilembang', { exact: true })).toBeVisible(); await expect(dialog.getByText(/Koordinat:/)).toContainText('-7.329249'); await expect(dialog.locator('.leaflet-marker-icon')).toBeVisible()
    await dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true }).click(); await expect(p.getByLabel('Kelurahan/Desa', { exact: true })).toHaveValue('Cilembang')
    for (const [code, text] of [[1, 'Izin lokasi ditolak'], [3, 'batas waktu']] as const) {
      await p.evaluate(code => { navigator.geolocation.getCurrentPosition = (_success, failure) => failure?.({ code } as GeolocationPositionError) }, code)
      await p.getByRole('button', { name: 'Ubah titik di peta', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText(text)
      await dialog.getByLabel('Cari lokasi atau alamat', { exact: true }).fill('Bandung'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await dialog.locator('li button').first().click(); await expect(dialog.getByRole('button', { name: 'Gunakan lokasi ini', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: 'Batal', exact: true }).click()
    }
    await p.evaluate(() => { navigator.geolocation.getCurrentPosition = success => { (window as any).resolvePendingLocation = () => success({ coords: { latitude: -7.329249, longitude: 108.203538 } } as GeolocationPosition) } })
    await p.getByRole('button', { name: 'Ubah titik di peta', exact: true }).click(); await expect(dialog.getByRole('status').filter({ hasText: 'Mendeteksi lokasi' })).toBeVisible()
    await dialog.getByLabel('Cari lokasi atau alamat', { exact: true }).fill('Bandung'); await dialog.getByRole('button', { name: 'Cari', exact: true }).click(); await dialog.locator('li button').first().click(); await expect(dialog.getByText('Cipaganti', { exact: true })).toBeVisible()
    await p.evaluate(() => (window as any).resolvePendingLocation()); await expect(dialog.getByText('Cipaganti', { exact: true })).toBeVisible(); await expect(dialog.getByText('Cilembang', { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click(); await p.getByRole('button', { name: 'Ubah titik di peta', exact: true }).click(); await p.keyboard.press('Escape'); await p.evaluate(() => (window as any).resolvePendingLocation()); await expect(dialog).toHaveCount(0)
    expect(errors).toEqual([]); passed = true
  } finally {
    await context.close(); const deleted = await admin.auth.admin.deleteUser(uid); if (deleted.error) throw Error('Cleanup failed: ' + deleted.error.code)
    await mkdir('.cache/map-auto-location', { recursive: true }); await writeFile('.cache/map-auto-location/results.json', JSON.stringify({ passed, errors, cleanup: true, cases: ['automatic permitted browser GPS (simulated coordinates)', 'denied fallback search', 'timeout fallback search', 'late GPS cannot replace manual selection', 'closed dialog ignores GPS'] }, null, 2))
  }
})
