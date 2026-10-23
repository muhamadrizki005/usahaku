import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('automatic/custom SKU in catalog/setup, concurrent saves and business isolation', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Backend request failed: ' + r.error.code); return r.data }
  const users: string[] = [], businesses: string[] = [], results: string[] = []
  const legacy = ok(await admin.from('businesses').select('*').order('id'))
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }), page = await context.newPage()
  const dir = 'artifacts/product-sku'
  let passed = false
  const pass = (message: string) => { results.push(message); console.log('PASS: ' + message) }
  async function account(label: string) {
    const email = `usahaku-sku-${label}-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const id = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
    users.push(id)
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    ok(await c.auth.signInWithPassword({ email, password }))
    return { email, password, id, c }
  }
  try {
    await mkdir(dir, { recursive: true })
    const owner = await account('owner')
    const bid = ok(await owner.c.rpc('create_business_profile', { store_name: 'Toko Uji SKU', owner_name: 'Uji SKU', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    businesses.push(bid)
    ok(await owner.c.rpc('complete_business_onboarding', { target_id: bid }))
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(owner.email)
    await page.getByLabel('Kata sandi', { exact: true }).fill(owner.password)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/dashboard/products')
    await page.getByRole('button', { name: 'Tambah produk', exact: true }).click()
    await page.getByLabel('Nama produk *', { exact: true }).fill('Kopi Susu')
    await page.getByLabel('Kategori *', { exact: true }).selectOption('Minuman')
    await expect(page.getByLabel('SKU', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('SKU', { exact: true })).toHaveAttribute('placeholder', 'MIN-KS-001')
    await page.getByLabel('Harga jual *', { exact: true }).fill('15000')
    await page.getByLabel('Stok fisik', { exact: true }).fill('2.500')
    await page.getByRole('button', { name: 'Simpan produk', exact: true }).click()
    await expect(page.getByText('Produk berhasil disimpan.', { exact: true })).toBeVisible()
    const product = ok(await admin.from('catalog_products').select('*').eq('business_id', bid).eq('name', 'Kopi Susu').single())
    expect(product.sku).toBe('MIN-KS-001')
    expect(product.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number(product.stock)).toBe(2.5)
    await expect(page.getByRole('row').filter({ has: page.getByText('Kopi Susu', { exact: true }) })).toContainText('MIN-KS-001')
    await page.screenshot({ path: dir + '/catalog.png', fullPage: true })

    await page.goto('/onboarding/setup')
    await page.getByRole('button', { name: 'Kelola produk', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Kelola produk', exact: true })
    await dialog.getByLabel('Nama produk *', { exact: true }).fill('Kopi Segar')
    await dialog.getByLabel('Kategori *', { exact: true }).selectOption('Minuman')
    await expect(dialog.getByLabel('SKU', { exact: true })).toHaveAttribute('placeholder', 'MIN-KS-001')
    await dialog.getByLabel('Harga jual *', { exact: true }).fill('10000')
    await dialog.getByLabel('Stok *', { exact: true }).fill('1')
    await dialog.getByRole('button', { name: 'Simpan produk', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(ok(await admin.from('catalog_products').select('sku').eq('business_id', bid).eq('name', 'Kopi Segar').single()).sku).toBe('MIN-KS-002')
    pass('Katalog menghasilkan MIN-KS-001, setup menghasilkan MIN-KS-002; UUID dan stok pecahan tetap benar')

    const details = { name: 'Kopi Susu', category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '1', active: true }
    const operations = Array.from({ length: 8 }, () => ({ id: randomUUID(), request: randomUUID() }))
    const save = (operation: typeof operations[number]) => owner.c.rpc('save_catalog_product', { target_id: bid, item_id: operation.id, expected_version: null, operation_id: operation.request, details })
    const saved = (await Promise.all(operations.map(save))).map(ok)
    expect(saved.map(p => p.sku).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `MIN-KS-${String(i + 3).padStart(3, '0')}`))
    expect(ok(await save(operations[0]))).toEqual(saved[0])
    expect(ok(await admin.from('stock_movements').select('id').eq('product_id', operations[0].id))).toHaveLength(1)
    pass('Delapan penyimpanan bersamaan mendapat nomor 003–010 unik; retry operasi sama tidak membuat produk/stok ganda')

    await page.goto('/dashboard/products')
    const row = page.getByRole('row').filter({ has: page.getByText('MIN-KS-001', { exact: false }) }).filter({ has: page.getByText('Kopi Susu', { exact: true }) })
    await row.getByRole('button', { name: 'Ubah', exact: true }).click()
    await expect(page.getByLabel('SKU', { exact: true })).toHaveValue('MIN-KS-001')
    await page.getByLabel('Nama produk *', { exact: true }).fill('Kopi Nama Baru')
    await page.getByLabel('Kategori *', { exact: true }).selectOption('Makanan')
    await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Ubah produk', exact: true })).toHaveCount(0)
    expect(ok(await admin.from('catalog_products').select('sku').eq('id', product.id).single()).sku).toBe('MIN-KS-001')
    await page.getByRole('row').filter({ has: page.getByText('Kopi Nama Baru', { exact: true }) }).getByRole('button', { name: 'Ubah', exact: true }).click()
    await page.getByLabel('SKU', { exact: true }).fill('KOPI-CUSTOM')
    await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Ubah produk', exact: true })).toHaveCount(0)
    const edited = ok(await admin.from('catalog_products').select('*').eq('id', product.id).single())
    expect(edited.sku).toBe('KOPI-CUSTOM')
    expect(edited.id).toBe(product.id)
    expect(Number(edited.stock)).toBe(2.5)
    expect((await owner.c.rpc('save_catalog_product', { target_id: bid, item_id: randomUUID(), expected_version: null, operation_id: randomUUID(), details: { ...details, sku: 'kopi-custom' } })).error?.code).toBe('23505')
    pass('Ubah nama/kategori mempertahankan SKU; kode custom tersimpan tanpa mengganti UUID/stok; duplikasi beda kapital ditolak')

    const other = await account('other')
    const otherBid = ok(await other.c.rpc('create_business_profile', { store_name: 'Toko SKU B', owner_name: 'Owner B', store_phone: '081234567891', store_street: 'Jalan B', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    businesses.push(otherBid)
    const params = { target_id: otherBid, item_id: randomUUID(), expected_version: null, operation_id: randomUUID(), details }
    expect(ok(await other.c.rpc('save_catalog_product', params)).sku).toBe('MIN-KS-001')
    expect((await owner.c.rpc('save_catalog_product', { ...params, item_id: randomUUID(), operation_id: randomUUID() })).error?.code).toBe('42501')
    const staff = await account('cashier')
    ok(await admin.from('business_members').insert({ business_id: bid, user_id: staff.id, name: 'Kasir Uji SKU', username: 'sku_cashier', role: 'cashier', must_change_password: false }))
    expect((await staff.c.rpc('save_catalog_product', { ...params, target_id: bid, item_id: randomUUID(), operation_id: randomUUID() })).error?.code).toBe('42501')
    pass('Penomoran terpisah per usaha; akses lintas usaha dan mutasi kasir tetap ditolak')
    passed = true
  } finally {
    await context.close()
    for (const bid of businesses) {
      for (const table of ['staff_audit_logs', 'business_members']) ok(await admin.from(table).delete().eq('business_id', bid))
      ok(await admin.from('businesses').delete().eq('id', bid))
    }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    expect(ok(await admin.from('businesses').select('*').in('id', legacy.map((business: any) => business.id)).order('id'))).toEqual(legacy)
    await writeFile(dir + '/results.json', JSON.stringify({ passed, results, cleanup: true, legacyBusinessesUnchanged: true }, null, 2))
  }
})
