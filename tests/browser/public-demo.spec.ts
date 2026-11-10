import { test, expect } from '@playwright/test'

test('public landing demo: three categories, charts, cart-only POS and signup gates without business API requests', async ({ page, context }) => {
  async function navigate(name: string) {
    const top = page.getByRole('navigation', { name: 'Navigasi utama dashboard', exact: true }).getByRole('button', { name, exact: true })
    if (await top.isVisible()) await top.click()
    else {
      await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
      await page.getByRole('navigation', { name: 'Navigasi dashboard mobile', exact: true }).getByRole('button', { name, exact: true }).click()
    }
  }
  const operationalRequests: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dashboard') || url.hostname.endsWith('.supabase.co') || request.headers()['next-action']) operationalRequests.push(request.method() + ' ' + url.pathname)
  })
  await context.addCookies([{ name: 'demo-test-existing-cookie', value: 'preserved', domain: 'localhost', path: '/' }])
  await page.goto('/')
  await page.getByRole('button', { name: 'Coba demo', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Pilih alur kerja usaha Anda.' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('link', { name: 'Lihat demo toko' })).toHaveAttribute('href', '/demo/toko')
  await expect(picker.getByRole('link', { name: 'Lihat demo restoran' })).toHaveAttribute('href', '/demo/restoran')
  await expect(picker.getByRole('link', { name: 'Lihat demo salon' })).toHaveAttribute('href', '/demo/salon')
  await picker.getByRole('link', { name: 'Lihat demo toko' }).click()
  for (const [category, cashier, item] of [
    ['toko', 'Kasir (POS)', 'Susu UHT 1 liter'], ['restoran', 'Pesanan & kasir', 'Kopi susu gula aren'], ['salon', 'Janji temu & kasir', 'Potong rambut'],
  ]) {
    await page.goto('/demo/' + category)
    await expect(page.getByRole('region', { name: 'Informasi demo' })).toContainText('Semua data adalah contoh')
    await expect(page.locator('[data-demo-chart] .apexcharts-bar-area').first()).toBeVisible()
    await navigate(cashier)
    await expect(page).toHaveURL(new RegExp('/demo/' + category + '\\?view=kasir'))
    await expect(page.getByRole('button', { name: 'Bayar', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Tambahkan ' + item, exact: true }).click()
    await page.getByRole('button', { name: 'Tambah jumlah ' + item, exact: true }).click()
    await expect(page.getByLabel('Jumlah ' + item, { exact: true })).toHaveText('2')
    await page.getByRole('button', { name: 'Kurangi ' + item, exact: true }).click()
    await expect(page.getByLabel('Jumlah ' + item, { exact: true })).toHaveText('1')
    await navigate('Ringkasan')
    await navigate(cashier)
    await expect(page.getByLabel('Jumlah ' + item, { exact: true })).toHaveText('1')
    const before = await page.locator('[data-demo-total]').textContent()
    await page.getByRole('button', { name: 'Bayar', exact: true }).click()
    const gate = page.getByRole('dialog', { name: 'Daftar untuk melanjutkan' })
    await expect(gate).toBeVisible()
    await expect(gate.getByRole('link', { name: 'Daftar sekarang' })).toHaveAttribute('href', '/signup')
    await gate.getByRole('button', { name: 'Lanjutkan demo' }).click()
    await expect(page.locator('[data-demo-total]')).toHaveText(before!)
    await page.getByRole('button', { name: 'Hapus ' + item, exact: true }).click()
    await expect(page.getByText('Belum ada produk atau layanan', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
    await page.getByRole('navigation', { name: 'Navigasi dashboard mobile' }).getByRole('button', { name: 'Asisten Bisnis AI', exact: true }).click()
    await expect(gate).toBeVisible()
    await expect(page.getByRole('button', { name: 'Buka Asisten AI', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(gate).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Belum ada produk atau layanan', { exact: true })).toBeVisible()
  }
  await page.goto('/demo/salon?view=pengaturan')
  await expect(page.getByRole('dialog', { name: 'Daftar untuk melanjutkan' })).toBeVisible()
  expect((await context.cookies()).some(c => c.name === 'demo-test-existing-cookie' && c.value === 'preserved')).toBe(true)
  expect(operationalRequests).toEqual([])
})
