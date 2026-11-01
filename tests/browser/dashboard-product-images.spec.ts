import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

test('best sellers use product IDs for private photos, with missing and failed image fallbacks', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (result: any) => { if (result.error) throw Error('Image fixture failed: ' + result.error.code); return result.data }
  const context = await browser.newContext({ baseURL })
  const anonymous = await browser.newContext({ baseURL })
  const page = await context.newPage(), errors: string[] = [], paths: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let uid = '', bid = ''
  try {
    const email = `usahaku-photo-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
    ok(await client.auth.signInWithPassword({ email, password }))
    bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Foto', owner_name: 'Owner Uji', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    const products: { id: string; name: string; revision: number }[] = []
    for (let i = 0; i < 3; i++) {
      const id = randomUUID(), name = i < 2 ? 'Produk bernama sama' : 'Produk tanpa foto'
      ok(await client.rpc('save_catalog_product', { target_id: bid, item_id: id, expected_version: null, operation_id: randomUUID(), details: { name, category: 'Minuman', unit: 'pcs', sku: `IMG-${i}`, barcode: '', price: '1000', minimum: '0', initialStock: '10', active: true } }))
      if (i < 2) {
        const asset = randomUUID()
        const path = ok(await client.rpc('reserve_product_image', { target_id: bid, item_id: id, asset_id: asset }))
        paths.push(path)
        const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: i ? '#1835d9' : '#24cbc5' } }).png().toBuffer()
        ok(await admin.storage.from('product-images').upload(path, png, { contentType: 'image/png' }))
        ok(await client.rpc('set_product_image', { target_id: bid, item_id: id, expected_version: 0, asset_id: asset }))
      }
      products.push({ id, name, revision: i < 2 ? 1 : 0 })
    }
    ok(await client.rpc('checkout_pos', { target_id: bid, operation_id: randomUUID(), details: { lines: products.map((product, i) => ({ id: product.id, quantity: String(3 - i), price: '1000', revision: product.revision })), payment: 'cash', received: '6000', discountKind: 'none', discountValue: '0', confirmed: true } }))
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Kata sandi', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Produk paling laris', exact: true }) })
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.reload()
      const images = card.getByRole('img')
      await expect(images).toHaveCount(2)
      for (let i = 0; i < 2; i++) {
        await expect(images.nth(i)).toHaveAttribute('src', `/api/products/${products[i].id}/image?v=1`)
        await expect.poll(() => images.nth(i).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(40)
        const box = await images.nth(i).boundingBox()
        expect(box!.width).toBeLessThanOrEqual(40)
      }
      await expect(card.getByText('Produk tanpa foto', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await mkdir('.cache/dashboard-product-images', { recursive: true })
      await card.screenshot({ path: `.cache/dashboard-product-images/${width}.png` })
    }
    expect((await anonymous.request.get(`/api/products/${products[0].id}/image`)).status()).toBe(401)
    await page.route(`**/api/products/${products[0].id}/image*`, route => route.fulfill({ status: 404, body: '' }))
    await page.reload()
    await expect(card.getByRole('img')).toHaveCount(1)
    await expect(card.getByText('Produk bernama sama', { exact: true })).toHaveCount(2)
    await page.unrouteAll()
    await page.reload()
    await expect(card.getByRole('img')).toHaveCount(2)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    await anonymous.close()
    if (bid) {
      if (paths.length) ok(await admin.storage.from('product-images').remove(paths))
      ok(await admin.from('catalog_products').update({ image_path: null }).eq('business_id', bid))
      ok(await admin.from('product_image_assets').delete().eq('business_id', bid))
      ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid))
      ok(await admin.from('business_members').delete().eq('business_id', bid))
      ok(await admin.from('businesses').delete().eq('id', bid))
    }
    if (uid) ok(await admin.auth.admin.deleteUser(uid))
  }
})
