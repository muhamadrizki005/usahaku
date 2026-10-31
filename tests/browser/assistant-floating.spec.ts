import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('floating assistant toggles without navigation, retains chat across pages and resets visibility on reload', async ({ browser, baseURL }) => {
  test.skip(process.env.USAHAKU_GEMINI_STUB !== '1', 'Requires the isolated Gemini stub server.')
  test.setTimeout(180000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
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
  const before = await snapshot(), contexts: BrowserContext[] = [], users: string[] = [], errors: string[] = [], results: string[] = [], dir = '.cache/assistant-floating'
  let bid = '', passed = false
  try {
    await mkdir(dir, { recursive: true })
    const email = `usahaku-floating-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
    const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id; users.push(uid)
    ok(await owner.auth.signInWithPassword({ email, password }))
    bid = ok(await owner.rpc('create_business_profile', { store_name: 'Toko Uji Floating', owner_name: 'Owner Floating', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    ok(await owner.rpc('complete_business_onboarding', { target_id: bid }))
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } }); contexts.push(context)
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message))
    await p.goto('/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Kata sandi', { exact: true }).fill(password); await p.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard')
    let requests = 0
    p.on('request', request => { if (new URL(request.url()).pathname === '/api/assistant') requests++ })
    const toggle = p.getByRole('complementary', { name: 'Sidebar navigasi sekunder' }).getByRole('button', { name: 'Asisten Bisnis AI', exact: true })
    const launcher = p.locator('#dashboard-floating-assistant-launcher'), chat = p.getByRole('dialog', { name: 'Asisten Bisnis AI', exact: true })
    await expect(launcher).toHaveCount(0); await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click(); await expect(launcher).toBeVisible(); await expect(toggle).toHaveAttribute('aria-pressed', 'true'); await expect(chat).toBeHidden(); await expect(p).toHaveURL(url => url.pathname === '/dashboard'); expect(requests).toBe(0)
    const moveLauncher = async (x: number, y: number) => {
      const box = (await launcher.boundingBox())!
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(x + 28, y + 28, { steps: 8 }); await p.mouse.up()
    }
    await moveLauncher(1000, 180); await expect(chat).toBeHidden(); expect((await launcher.boundingBox())!.y).toBeCloseTo(180, 0)
    await launcher.click(); await expect(chat).toBeVisible(); await expect(chat.getByRole('button', { name: 'Tutup panel Asisten AI' })).toBeFocused()
    await chat.getByLabel('Pertanyaan', { exact: true }).fill('Buat caption promosi toko')
    await chat.getByRole('button', { name: 'Kirim pesan', exact: true }).click(); await expect(chat.getByRole('article')).toContainText('Belanja kebutuhan harian')
    await chat.getByLabel('Pertanyaan', { exact: true }).fill('Draft lanjutan saya')
    await p.getByRole('navigation', { name: 'Navigasi utama dashboard', exact: true }).getByRole('button', { name: 'Produk', exact: true }).click(); await expect(p).toHaveURL(url => url.pathname === '/dashboard/products')
    await expect(chat).toBeVisible(); await expect(chat.getByRole('article')).toHaveCount(1); await expect(chat.getByLabel('Pertanyaan', { exact: true })).toHaveValue('Draft lanjutan saya')
    await chat.getByRole('button', { name: 'Tutup panel Asisten AI', exact: true }).click(); await expect(chat).toBeHidden(); await expect(launcher).toBeVisible(); await expect(launcher).toBeFocused()
    await launcher.click(); await expect(chat.getByRole('article')).toHaveCount(1); await p.keyboard.press('Escape'); await expect(chat).toBeHidden(); await expect(launcher).toBeFocused()
    await toggle.click(); await expect(launcher).toHaveCount(0); await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click(); await launcher.click(); await expect(chat.getByLabel('Pertanyaan', { exact: true })).toHaveValue('Draft lanjutan saya')
    await p.screenshot({ path: `${dir}/desktop.png`, fullPage: true })
    for (const point of [{ x: -50, y: -50 }, { x: 1400, y: -50 }, { x: -50, y: 880 }, { x: 1400, y: 880 }, { x: 700, y: 400 }]) {
      await moveLauncher(point.x, point.y); await expect(chat).toBeVisible()
      for (const locator of [launcher, chat]) { const box = (await locator.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(16); expect(box.y).toBeGreaterThanOrEqual(16); expect(box.x + box.width).toBeLessThanOrEqual(1424); expect(box.y + box.height).toBeLessThanOrEqual(884) }
    }
    await launcher.focus(); const beforeArrow = (await launcher.boundingBox())!.x; await launcher.press('ArrowLeft'); expect((await launcher.boundingBox())!.x).toBeCloseTo(beforeArrow - 16, 0)
    await moveLauncher(1368, 828)
    await p.emulateMedia({ media: 'print' }); await expect(chat).toBeHidden(); await expect(launcher).toBeHidden(); await p.emulateMedia({ media: 'screen' }); await expect(chat).toBeVisible()
    results.push('Hidden by default; sidebar toggle keeps URL; reply/draft survive navigation, closing and hiding; Escape restores launcher focus; no provider call on toggle')
    for (const width of [320, 390, 768, 1440]) {
      await p.setViewportSize({ width, height: 844 }); const box = (await chat.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(844)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(chat.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeVisible()
      await p.screenshot({ path: `${dir}/viewport-${width}.png`, fullPage: true })
    }
    await p.setViewportSize({ width: 390, height: 844 }); await p.reload(); await expect(launcher).toHaveCount(0); await expect(chat).toBeHidden()
    await p.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
    let mobileToggle = p.getByRole('navigation', { name: 'Navigasi dashboard mobile' }).getByRole('button', { name: 'Asisten Bisnis AI', exact: true })
    await mobileToggle.click(); await expect(p.getByRole('dialog', { name: 'Menu dashboard', exact: true })).toHaveCount(0); await expect(launcher).toBeVisible(); await expect(p).toHaveURL(url => url.pathname === '/dashboard/products')
    await launcher.click(); await expect(chat.getByRole('article')).toHaveCount(0); await expect(chat.getByLabel('Pertanyaan', { exact: true })).toHaveValue('')
    const touch = (await launcher.boundingBox())!
    const touchSession = await context.newCDPSession(p)
    await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.x + 28, y: touch.y + 28 }] })
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 44, y: 44 }] })
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touchSession.detach()
    await expect(chat).toBeVisible(); for (const locator of [launcher, chat]) { const box = (await locator.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(16); expect(box.y).toBeGreaterThanOrEqual(16); expect(box.x + box.width).toBeLessThanOrEqual(374); expect(box.y + box.height).toBeLessThanOrEqual(828) }
    await p.getByRole('button', { name: 'Buka navigasi', exact: true }).click(); await mobileToggle.click(); await expect(launcher).toHaveCount(0); await expect(chat).toBeHidden()
    await p.reload(); await expect(launcher).toHaveCount(0)
    for (const role of ['admin', 'cashier']) {
      const staffEmail = `usahaku-floating-${role}-${randomUUID()}@example.com`, staffPassword = randomBytes(24).toString('base64url')
      const staffId = ok(await admin.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true, app_metadata: { account_type: 'staff' } })).user.id; users.push(staffId)
      ok(await admin.from('business_members').insert({ business_id: bid, user_id: staffId, name: 'Petugas Floating', username: role + 'uji', role, must_change_password: false }))
      const c = await browser.newContext({ baseURL }); contexts.push(c); const page = await c.newPage()
      await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(staffEmail); await page.getByLabel('Kata sandi', { exact: true }).fill(staffPassword); await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(page).toHaveURL(url => url.pathname.startsWith('/dashboard'))
      const staffToggle = page.getByRole('button', { name: 'Asisten Bisnis AI', exact: true })
      if (role === 'cashier') { await expect(staffToggle).toHaveCount(0); expect((await c.request.post('/api/assistant', { headers: { Origin: baseURL! }, data: { question: 'Buat caption', period: '7d' } })).status()).toBe(403) }
      else { await staffToggle.click(); await expect(page.getByRole('button', { name: 'Buka Asisten AI', exact: true })).toBeVisible() }
    }
    expect(errors).toEqual([]); results.push('Four widths, reload resets, mobile menu toggles, admin access and cashier API denial passed'); passed = true
  } finally {
    for (const c of contexts) await c.close()
    if (users.length && !bid) bid = ok(await admin.from('businesses').select('id').eq('owner_id', users[0]).maybeSingle())?.id || ''
    if (bid) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid)); ok(await admin.from('business_members').delete().eq('business_id', bid)); ok(await admin.from('businesses').delete().eq('id', bid)) }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    const unchanged = before === await snapshot(); expect(unchanged).toBe(true)
    await mkdir(dir, { recursive: true }); await writeFile(`${dir}/results.json`, JSON.stringify({ passed, results, pageErrors: errors, cleanup: true, legacyUnchanged: unchanged }, null, 2))
  }
})
