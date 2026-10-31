import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('product numeric inputs start blank, allow deletion, validate and persist exact fractional stock', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options), client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  const snapshot = async () => {
    const data: Record<string, unknown> = {}
    for (const table of ['businesses', 'business_members', 'catalog_products', 'stock_movements', 'pos_transactions']) {
      const rows: unknown[] = []
      for (let start = 0; ; start += 500) { const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id').range(start, start + 499)); rows.push(...batch); if (batch.length < 500) break }
      data[table] = rows
    }
    return createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }
  const before = await snapshot(), context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }), p = await context.newPage(), errors: string[] = [], results: string[] = [], dir = '.cache/product-numeric-input'
  p.on('pageerror', e => errors.push(e.message))
  let uid = '', bid = '', passed = false
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-input-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
    ok(await client.auth.signInWithPassword({ email, password }))
    bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Input Angka', owner_name: 'Owner Uji', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    await p.goto('/dashboard/products'); await p.getByRole('button', { name: 'Tambah produk', exact: true }).click()
    let dialog = p.getByRole('dialog', { name: 'Tambah produk', exact: true })
    for (const label of ['Harga jual *', 'Stok fisik', 'Minimum stok *']) {
      const field = dialog.getByLabel(label, { exact: true }); await expect(field).toHaveValue('')
      await field.fill('0'); await field.press('Backspace'); await expect(field).toHaveValue('')
      await field.pressSequentially('10'); await expect(field).toHaveValue('10'); await field.fill('')
    }
    await p.screenshot({ path: `${dir}/blank-desktop.png`, fullPage: true })
    await dialog.getByLabel('Nama produk *', { exact: true }).fill('Beras Uji Input'); await dialog.getByLabel('Kategori *', { exact: true }).click(); await dialog.getByRole('option', { name: 'Lainnya', exact: true }).click(); await dialog.getByLabel('Kategori lainnya *', { exact: true }).fill('Bahan Pokok Uji'); await dialog.getByLabel('Unit stok *', { exact: true }).fill('kg')
    await dialog.getByRole('button', { name: 'Simpan produk', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Harga jual wajib diisi')
    await dialog.getByLabel('Harga jual *', { exact: true }).fill('15000'); await dialog.getByRole('button', { name: 'Simpan produk', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Minimum stok wajib diisi')
    await dialog.getByLabel('Minimum stok *', { exact: true }).fill('0.500'); await dialog.getByLabel('Stok fisik', { exact: true }).fill('1.2345'); await dialog.getByRole('button', { name: 'Simpan produk', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('maksimal 3 desimal')
    expect(ok(await admin.from('catalog_products').select('id').eq('business_id', bid))).toHaveLength(0)
    await dialog.getByLabel('Stok fisik', { exact: true }).fill('0.250'); await dialog.getByRole('button', { name: 'Simpan produk', exact: true }).click(); await expect(dialog).toHaveCount(0)
    let product = ok(await admin.from('catalog_products').select('*').eq('business_id', bid).eq('name', 'Beras Uji Input').single()); expect(Number(product.price)).toBe(15000); expect(Number(product.stock)).toBe(0.25); expect(Number(product.minimum_stock)).toBe(0.5)
    await p.reload(); await p.getByRole('row').filter({ hasText: 'Beras Uji Input' }).getByRole('button', { name: 'Ubah', exact: true }).click(); dialog = p.getByRole('dialog', { name: 'Ubah produk', exact: true })
    await expect(dialog.getByLabel('Harga jual *', { exact: true })).toHaveValue('15000'); await expect(dialog.getByLabel('Stok fisik', { exact: true })).toBeDisabled()
    await dialog.getByLabel('Harga jual *', { exact: true }).fill(''); await expect(dialog.getByLabel('Harga jual *', { exact: true })).toHaveValue(''); await dialog.getByLabel('Harga jual *', { exact: true }).pressSequentially('10')
    await dialog.getByLabel('Minimum stok *', { exact: true }).fill(''); await dialog.getByLabel('Minimum stok *', { exact: true }).pressSequentially('0')
    await dialog.getByRole('button', { name: 'Simpan perubahan', exact: true }).click(); await expect(dialog).toHaveCount(0)
    product = ok(await admin.from('catalog_products').select('*').eq('id', product.id).single()); expect(Number(product.price)).toBe(10); expect(Number(product.minimum_stock)).toBe(0); expect(Number(product.stock)).toBe(0.25)
    await p.getByRole('button', { name: 'Tambah produk', exact: true }).click(); dialog = p.getByRole('dialog', { name: 'Tambah produk', exact: true })
    await dialog.getByLabel('Nama produk *', { exact: true }).fill('Produk Nol Uji'); await dialog.getByLabel('Kategori *', { exact: true }).click(); await dialog.getByRole('option', { name: 'Makanan', exact: true }).click(); await dialog.getByLabel('Unit stok *', { exact: true }).fill('pcs'); await dialog.getByLabel('Harga jual *', { exact: true }).fill('0'); await dialog.getByLabel('Minimum stok *', { exact: true }).fill('0')
    await p.setViewportSize({ width: 390, height: 844 }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await p.screenshot({ path: `${dir}/mobile.png`, fullPage: true })
    await dialog.getByRole('button', { name: 'Simpan produk', exact: true }).click(); await expect(dialog).toHaveCount(0)
    const zero = ok(await admin.from('catalog_products').select('*').eq('business_id', bid).eq('name', 'Produk Nol Uji').single()); expect(Number(zero.price)).toBe(0); expect(Number(zero.stock)).toBe(0)
    results.push('All three fields begin blank and accept Backspace then 10; required blanks and four-decimal quantity rejected without a write; fractional values persist; edit preserves physical stock; explicit zero and optional blank stock save correctly')
    expect(errors).toEqual([]); passed = true
  } finally {
    await context.close()
    if (uid && !bid) bid = ok(await admin.from('businesses').select('id').eq('owner_id', uid).maybeSingle())?.id || ''
    if (bid) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    if (uid) ok(await admin.auth.admin.deleteUser(uid))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
