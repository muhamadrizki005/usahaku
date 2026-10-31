import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

test('assistant: scoped database evidence, private provider contract, errors, roles and responsive UI', async ({ browser, baseURL }) => {
  test.skip(process.env.USAHAKU_GEMINI_STUB !== '1' && process.env.USAHAKU_ASSISTANT_MISSING_KEY !== '1', 'Requires an explicitly configured isolated test server.')
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Fixture failed: ' + r.error.code); return r.data }
  const users: string[] = [], businesses: string[] = [], contexts: BrowserContext[] = [], results: string[] = []
  const dir = '.cache/assistant-results'
  let passed = false
  const legacy = ok(await admin.from('businesses').select('id')).map((b: any) => b.id)
  const snapshot = async () => {
    const out: Record<string, unknown> = {}
    for (const table of ['businesses', 'business_members', 'catalog_products', 'pos_transactions', 'stock_movements']) out[table] = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order('id'))
    return JSON.stringify(out)
  }
  const before = await snapshot()
  async function account(role = 'owner', bid?: string, complete = true) {
    const email = `usahaku-assistant-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role === 'owner' ? 'owner' : 'staff' } })).user.id
    users.push(uid)
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
    ok(await client.auth.signInWithPassword({ email, password }))
    if (bid) ok(await admin.from('business_members').insert({ business_id: bid, user_id: uid, name: 'Private Staff Fixture', username: uid.replaceAll('-', '').slice(0, 10), role, must_change_password: false }))
    else {
      bid = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Asisten', owner_name: 'Pemilik Uji Asisten', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
      businesses.push(bid!)
      if (complete) ok(await client.rpc('complete_business_onboarding', { target_id: bid }))
    }
    const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }); contexts.push(context)
    const page = await context.newPage()
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Kata sandi', { exact: true }).fill(password); await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(page).toHaveURL(/\/(dashboard(?:\/pos)?|onboarding\/summary)$/)
    return { client, page, context, uid, bid: bid! }
  }
  const post = (page: Page, body: unknown, origin?: string) => page.context().request.post('/api/assistant', { headers: { Origin: origin || baseURL!, 'Content-Type': 'application/json' }, data: body })
  try {
    await mkdir(dir, { recursive: true })
    const owner = await account(), p = owner.page
    await p.getByRole('complementary', { name: 'Sidebar navigasi sekunder', exact: true }).getByRole('button', { name: 'Asisten Bisnis AI', exact: true }).click()
    await expect(p).toHaveURL(url => url.pathname === '/dashboard/assistant')
    await p.setViewportSize({ width: 390, height: 844 })
    await p.goto('/dashboard')
    await p.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
    await p.getByRole('navigation', { name: 'Navigasi dashboard mobile', exact: true }).getByRole('button', { name: 'Asisten Bisnis AI', exact: true }).click()
    await expect(p).toHaveURL(url => url.pathname === '/dashboard/assistant')
    await expect(p.getByRole('dialog', { name: 'Menu dashboard', exact: true })).toHaveCount(0)
    await p.setViewportSize({ width: 1366, height: 900 })
    results.push('Post-merge desktop secondary sidebar and mobile menu both navigate to the assistant')
    if (process.env.USAHAKU_ASSISTANT_MISSING_KEY === '1') {
      await expect(p.getByRole('status')).toContainText('Gemini belum dikonfigurasi')
      await expect(p.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeDisabled()
      expect((await post(p, { question: 'Ringkas', period: '7d' })).status()).toBe(503)
      results.push('Missing key: explicit status, disabled submit and safe 503'); passed = true; return
    }
    const other = await account(), manager = await account('admin', owner.bid), cashier = await account('cashier', owner.bid), draft = await account('owner', undefined, false)
    const productId = randomUUID()
    ok(await owner.client.rpc('save_catalog_product', { target_id: owner.bid, item_id: productId, expected_version: null, operation_id: randomUUID(), details: { name: 'Private Product Fixture', category: 'Minuman', unit: 'kg', sku: 'TEST-ASSIST', barcode: '', price: '20000', minimum: '1', initialStock: '0.75', active: true } }))
    ok(await owner.client.rpc('checkout_pos', { target_id: owner.bid, operation_id: randomUUID(), details: { lines: [{ id: productId, quantity: '0.25', price: '20000', revision: 0 }], payment: 'cash', received: '5000', discountKind: 'amount', discountValue: '500', customer: 'Private Customer Fixture', confirmed: true } }))
    const anon = await browser.newContext({ baseURL }); contexts.push(anon)
    expect((await anon.request.post('/api/assistant', { headers: { Origin: baseURL! }, data: { question: 'Ringkas', period: '7d' } })).status()).toBe(401)
    for (const denied of [cashier, draft]) expect((await post(denied.page, { question: 'Ringkas', period: '7d' })).status()).toBe(403)
    expect((await post(p, { question: 'Ringkas', period: '7d', businessId: other.bid })).status()).toBe(400)
    expect((await post(p, { question: 'a'.repeat(601), period: '7d' })).status()).toBe(400)
    expect((await post(p, { question: 'Ringkas', period: '7d', previousQuestions: ['stok?', 'stok?', 'stok?', 'stok?'] })).status()).toBe(400)
    expect((await post(p, { question: 'a'.repeat(70000), period: '7d' })).status()).toBe(413)
    expect((await post(p, { question: 'Ringkas', period: '7d' }, 'https://untrusted.invalid')).status()).toBe(403)
    await cashier.page.goto('/dashboard/assistant'); await expect(cashier.page).toHaveURL(/\/dashboard\/pos$/)
    results.push('Anonymous/cashier/draft denied; tenant override, oversized question and foreign origin rejected')
    const errors: string[] = []; p.on('pageerror', e => errors.push(e.message))
    for (const prompt of ['Bantu susun ide barang baru dan rencana belanja.', 'Buatkan caption promosi toko.', 'Stok apa yang perlu saya periksa?']) { await p.getByRole('button', { name: prompt, exact: true }).click(); await expect(p.getByLabel('Pertanyaan', { exact: true })).toHaveValue(prompt) }
    await p.getByRole('button', { name: 'Ringkas penjualan pada periode ini.', exact: true }).click(); await expect(p.getByLabel('Pertanyaan', { exact: true })).toBeFocused()
    await p.getByLabel('Pertanyaan', { exact: true }).press('Shift+Enter')
    await expect(p.getByRole('article')).toHaveCount(0)
    await p.getByLabel('Pertanyaan', { exact: true }).press('Enter')
    await expect(p.getByRole('article')).toContainText('Rp4.500'); await expect(p.getByRole('article')).toContainText('Transaksi selesai: 1.')
    await p.getByRole('article').last().getByText('Sumber dan waktu data', { exact: true }).click()
    await expect(p.getByRole('link', { name: 'Laporan penjualan periode pilihan', exact: true })).toHaveAttribute('href', /from=.*&to=.*&payment=all/)
    for (const width of [320, 390, 768, 1366, 1920]) {
      await p.setViewportSize({ width, height: 900 }); expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect.poll(() => p.getByRole('log', { name: 'Percakapan Asisten', exact: true }).evaluate(el => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight))).toBeLessThanOrEqual(2)
      const sendY = (await p.getByRole('button', { name: 'Kirim pesan', exact: true }).boundingBox())!.y
      const log = p.getByRole('log', { name: 'Percakapan Asisten', exact: true })
      await log.evaluate(el => { el.scrollTop = 0 })
      expect((await p.getByRole('button', { name: 'Kirim pesan', exact: true }).boundingBox())!.y).toBe(sendY)
      const jump = p.getByRole('button', { name: 'Ke pesan terbaru', exact: true })
      if (await jump.isVisible()) { await jump.click(); await expect(jump).toBeHidden() }
      await p.evaluate(() => document.fonts.ready); await expect(p.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeVisible(); await p.screenshot({ path: `${dir}/assistant-${width}.png`, fullPage: true })
    }
    await p.getByRole('button', { name: 'Bersihkan percakapan', exact: true }).click(); await expect(p.getByRole('article')).toHaveCount(0)
    await p.getByRole('log', { name: 'Percakapan Asisten', exact: true }).evaluate(el => { el.scrollTop = 0 })
    const jump = p.getByRole('button', { name: 'Ke pesan terbaru', exact: true })
    if (await jump.isVisible()) { await jump.click(); await expect(jump).toBeHidden() }
    await p.getByLabel('Periode penjualan (WIB)', { exact: true }).selectOption('today'); await p.getByLabel('Pertanyaan', { exact: true }).fill('Stok apa yang perlu diperiksa?')
    await p.getByRole('button', { name: 'Kirim pesan', exact: true }).click(); await expect(p.getByRole('article')).toContainText('stok 0,5 kg, minimum 1 kg')
    await p.getByRole('article').last().getByText('Sumber dan waktu data', { exact: true }).click()
    await p.getByRole('link', { name: 'Inventori saat ini', exact: true }).click(); await expect(p).toHaveURL(/\/dashboard\/inventory$/)
    await p.goto('/dashboard/assistant'); await expect(p.getByRole('article')).toHaveCount(0)
    results.push('Actual checkout totals and fractional stock correct; periods/prompts/clear/source link/session reset and five viewports work')
    const otherResponse = await post(other.page, { question: 'Ringkas', period: '7d' }); expect(otherResponse.status()).toBe(200)
    const otherData = (await otherResponse.json()).answer; const otherAnswer = otherData.message + ' ' + otherData.facts.join(' '); expect(otherAnswer).toContain('Rp0'); expect(otherAnswer).not.toContain('Rp4.500')
    const managerResponse = await post(manager.page, { question: 'Ringkas', period: '30d' }); expect(managerResponse.status()).toBe(200); const managerData = (await managerResponse.json()).answer; expect(managerData.message + ' ' + managerData.facts.join(' ')).toContain('Rp4.500')
    await manager.page.goto('/dashboard/assistant'); await expect(manager.page.getByRole('heading', { level: 1 })).toHaveText('Asisten Bisnis AI')
    const invalid = await post(p, { question: 'uji format', period: '7d' }); expect(invalid.status()).toBe(502); expect(await invalid.text()).not.toContain('nonexistent')
    await p.getByLabel('Pertanyaan', { exact: true }).fill('uji lama')
    const captureLength = (await readFile(process.env.USAHAKU_GEMINI_CAPTURE!, 'utf8')).length
    const slow = p.waitForResponse(r => r.url().endsWith('/api/assistant') && r.request().method() === 'POST')
    await p.getByRole('button', { name: 'Kirim pesan', exact: true }).click(); await expect(p.getByRole('button', { name: 'Mengirim pesan' })).toBeDisabled()
    await expect.poll(async () => (await readFile(process.env.USAHAKU_GEMINI_CAPTURE!, 'utf8')).length).toBeGreaterThan(captureLength)
    expect((await post(p, { question: 'Ringkas', period: '7d' })).status()).toBe(429)
    await p.getByLabel('Pertanyaan', { exact: true }).fill('Draf pesan berikutnya')
    expect((await slow).status()).toBe(200); await expect(p.getByLabel('Pertanyaan', { exact: true })).toHaveValue('Draf pesan berikutnya'); await expect(p.getByRole('article')).toHaveCount(1)
    await p.getByLabel('Pertanyaan', { exact: true }).fill('uji kuota'); await p.getByRole('button', { name: 'Kirim pesan', exact: true }).click()
    await expect(p.locator('form').getByRole('alert')).toContainText('Kuota Gemini'); await expect(p.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeDisabled(); await expect(p.getByText(/Tunggu \d+ detik sebelum mengirim lagi/)).toBeVisible(); await expect(p.getByLabel('Pertanyaan', { exact: true })).toHaveValue('uji kuota')
    expect((await post(manager.page, { question: 'uji jaringan', period: '7d' })).status()).toBe(504)
    const unsupported = await post(manager.page, { question: 'Berapa laba?', period: '7d' }); expect(unsupported.status()).toBe(200); expect((await unsupported.json()).answer.message).toContain('HPP')
    await manager.page.route('**/api/assistant', route => route.abort('connectionreset'))
    await manager.page.getByLabel('Pertanyaan', { exact: true }).fill('Pertanyaan saat koneksi gagal')
    await manager.page.getByRole('button', { name: 'Kirim pesan', exact: true }).click()
    await expect(manager.page.locator('form').getByRole('alert')).toContainText('Koneksi terputus')
    await expect(manager.page.getByLabel('Pertanyaan', { exact: true })).toHaveValue('Pertanyaan saat koneksi gagal')
    await manager.page.unroute('**/api/assistant')
    await expect(manager.page.locator('[data-chat-message=user]')).toHaveCount(1)
    await manager.page.getByRole('button', { name: 'Kirim pesan', exact: true }).click()
    await expect(manager.page.getByRole('article')).toHaveCount(1)
    await expect(manager.page.locator('[data-chat-message=user]')).toHaveCount(1)
    const second = other.page
    await second.goto('/dashboard/assistant')
    const ask = async (question: string) => {
      await second.getByLabel('Pertanyaan', { exact: true }).fill(question)
      const done = second.waitForResponse(r => r.url().endsWith('/api/assistant') && r.request().method() === 'POST')
      await second.getByRole('button', { name: 'Kirim pesan', exact: true }).click()
      const response = await done; expect(response.status()).toBe(200)
      const body = await response.json(); await expect(second.getByRole('article').last()).toContainText(body.answer.message.split('\n')[0]); return body
    }
    const clarification = await ask('Saran barang baru beserta harga dan stoknya')
    expect(clarification.answer.mode).toBe('clarification')
    expect((await post(p, { question: 'iya bantu', period: '7d', conversationToken: clarification.conversationToken })).status()).toBe(409)
    const plan = await ask('barang baru, anggarannya 1 juta, iya bantu aku')
    expect(plan.answer.mode).toBe('answer'); expect(plan.answer.message).not.toContain('?')
    expect(plan.answer.estimate.budget).toBe('1000000'); expect(BigInt(plan.answer.estimate.total)).toBeLessThanOrEqual(BigInt(1000000))
    await expect(second.getByRole('article').last()).toContainText('Total estimasi')
    await expect(second.getByRole('article').last()).toContainText('Rp1.000.000')
    expect((await post(second, { question: 'uji tanya lagi', period: '7d', conversationToken: plan.conversationToken })).status()).toBe(502)
    const caption = await post(second, { question: 'Buat caption promosi', period: '7d', conversationToken: plan.conversationToken })
    expect(caption.status()).toBe(200); expect((await caption.json()).answer.basis).toBe('general')
    for (const width of [390, 1366]) { await second.setViewportSize({ width, height: 900 }); expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await second.screenshot({ path: `${dir}/general-plan-${width}.png`, fullPage: true }) }
    await ask('uji xss')
    await expect(second.locator('img[src="x"]')).toHaveCount(0)
    expect(await second.evaluate(() => (window as any).__assistantXss)).toBeUndefined()
    results.push('General UMKM dialogue: one clarification, user budget reply immediately produces an exact labelled plan; forged/cross-account receipts and repeated questions rejected')
    ok(await admin.from('business_members').update({ active: false }).eq('user_id', manager.uid)); expect((await post(manager.page, { question: 'Ringkas', period: '7d' })).status()).toBe(403)
    ok(await admin.from('business_members').update({ must_change_password: true }).eq('user_id', other.uid)); expect((await post(other.page, { question: 'Ringkas', period: '7d' })).status()).toBe(403)
    const capture = await readFile(process.env.USAHAKU_GEMINI_CAPTURE!, 'utf8')
    for (const secret of ['Private Staff Fixture', 'Private Customer Fixture', 'Private Product Fixture', owner.bid, other.bid, productId, 'TEST-ASSIST']) expect(capture).not.toContain(secret)
    expect(capture).toContain('Rp4.500'); expect(errors).toEqual([])
    results.push('Second tenant isolated; admin allowed; malformed/slow/quota/network/unsupported handled; inactive/forced-password denied; provider excludes private names and tenant IDs')
    passed = true
  } finally {
    for (const c of contexts) await c.close()
    if (users.length) for (const b of ok(await admin.from('businesses').select('id').in('owner_id', users))) if (!businesses.includes(b.id)) businesses.push(b.id)
    for (const bid of businesses) { for (const table of ['staff_audit_logs', 'business_members']) ok(await admin.from(table).delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    for (const uid of users) ok(await admin.auth.admin.deleteUser(uid))
    expect(await snapshot()).toBe(before)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/${process.env.USAHAKU_ASSISTANT_MISSING_KEY === '1' ? 'missing-key' : 'browser'}-results.json`, JSON.stringify({ passed, provider: process.env.USAHAKU_ASSISTANT_MISSING_KEY === '1' ? 'No key: Gemini not called; application and Supabase actual' : 'HTTP stub; application and Supabase actual', results, cleanup: true, legacyUnchanged: true }, null, 2))
  }
})
