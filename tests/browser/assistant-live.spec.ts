import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('live Gemini interprets actual scoped store evidence through the website', async ({ browser, baseURL }) => {
  test.skip(process.env.USAHAKU_GEMINI_LIVE !== '1', 'Explicit opt-in required: calls Google Gemini with the isolated server key.')
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const legacyIds = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  const snapshot = async () => {
    const data: Record<string, unknown> = {}
    for (const table of ['businesses', 'business_members', 'catalog_products', 'stock_movements', 'pos_transactions']) data[table] = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacyIds).order('id'))
    return JSON.stringify(data)
  }
  const before = await snapshot(), dir = '.cache/assistant-live'
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } })
  const page = await context.newPage(), errors: string[] = [], results: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  let uid = '', bid = '', passed = false
  async function ask(question: string) {
    await page.getByLabel('Pertanyaan', { exact: true }).fill(question)
    const pending = page.waitForResponse(r => r.url().endsWith('/api/assistant') && r.request().method() === 'POST', { timeout: 80000 })
    await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click()
    const response = await pending, data = await response.json()
    if (!response.ok()) throw Error(`Assistant HTTP ${response.status()}: ${data.error}`)
    await expect(page.getByRole('article').last()).toContainText(data.answer.message.split('\n')[0].replace(/\*\*/g, '').replace(/^(?:#+|[-*])\s*/, ''))
    return data.answer
  }
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-gemini-live-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
    ok(await client.auth.signInWithPassword({ email, password }))
    bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Gemini Nyata', owner_name: 'Pemilik Uji Gemini', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    const productId = randomUUID()
    ok(await client.rpc('save_catalog_product', { target_id: bid, item_id: productId, expected_version: null, operation_id: randomUUID(), details: { name: 'Produk Uji Gemini', category: 'Minuman', unit: 'kg', sku: 'LIVE-TEST', barcode: '', price: '20000', minimum: '1', initialStock: '0.75', active: true } }))
    ok(await client.rpc('checkout_pos', { target_id: bid, operation_id: randomUUID(), details: { lines: [{ id: productId, quantity: '0.25', price: '20000', revision: 0 }], payment: 'cash', received: '5000', discountKind: 'amount', discountValue: '500', customer: 'Pelanggan umum', confirmed: true } }))
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Kata sandi', { exact: true }).fill(password); await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByRole('navigation', { name: 'Navigasi dashboard', exact: true }).getByRole('button', { name: 'Asisten Bisnis AI', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeEnabled()
    const first = await ask('Saran barang yang perlu dijual beserta harga dan stoknya. Jika perlu, tanyakan dulu barang baru atau yang ada dan anggaran saya.')
    expect(['answer', 'clarification']).toContain(first.mode)
    const planned = await ask('barang baru, anggarannya 1 juta, iya bantu aku')
    expect(planned.mode).toBe('answer'); expect(planned.message).not.toContain('?')
    expect(planned.estimate).not.toBeNull(); expect(planned.estimate.items.length).toBeGreaterThan(0)
    expect(planned.estimate.budget).toBe('1000000'); expect(BigInt(planned.estimate.total)).toBeLessThanOrEqual(BigInt(1000000))
    await expect(page.getByRole('article').last()).toContainText('Perkiraan rencana belanja')
    results.push('Actual Gemini directly prepares a labelled estimated purchase plan after user replies new goods and one-million budget; at most one clarification round')
    await page.screenshot({ path: `${dir}/general-desktop.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect.poll(() => page.getByRole('log', { name: 'Percakapan Asisten', exact: true }).evaluate(el => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight))).toBeLessThanOrEqual(2)
    await page.screenshot({ path: `${dir}/general-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1366, height: 900 })
    const stock = await ask('Stok apa yang perlu saya periksa?')
    expect(stock.mode).toBe('answer'); expect(stock.basis).toBe('store_data')
    expect(stock.message + ' ' + stock.facts.join(' ')).toContain('stok 0,5 kg, minimum 1 kg')
    results.push('Actual Gemini uses verified fractional stock evidence without asking another question')
    const caption = await ask('Buatkan caption promosi yang ramah untuk toko kebutuhan harian, tanpa menyebut diskon atau stok yang belum pasti.')
    expect(caption.mode).toBe('answer'); expect(caption.basis).toBe('general'); expect(caption.message.length).toBeGreaterThan(40)
    expect(caption.message).not.toContain('?')
    results.push('Actual Gemini writes useful general marketing copy instead of returning unsupported')
    await page.evaluate(() => document.fonts.ready)
    expect(errors).toEqual([])
    passed = true
  } finally {
    await context.close()
    if (uid && !bid) { const b = ok(await admin.from('businesses').select('id').eq('owner_id', uid).maybeSingle()); if (b) bid = b.id }
    if (bid) { for (const table of ['staff_audit_logs', 'business_members']) ok(await admin.from(table).delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    if (uid) ok(await admin.auth.admin.deleteUser(uid))
    expect(await snapshot()).toBe(before)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, provider: 'Google Gemini actual, no HTTP stub', results, cleanup: true, legacyUnchanged: true, pageErrors: errors }, null, 2))
  }
})
