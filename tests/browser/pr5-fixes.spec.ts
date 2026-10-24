import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

test('completed onboarding keeps independent owner settings and staff access with durable scoped writes', async ({ browser, baseURL }) => {
  test.setTimeout(300000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const make = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const ok = (result: any) => { if (result.error) throw Error('Fixture/backend request failed: ' + result.error.code); return result.data }
  const users: string[] = [], bids: string[] = [], contexts: BrowserContext[] = [], results: string[] = []
  const dir = 'artifacts/pr5-fixes'
  const legacy = ok(await admin.from('businesses').select('*').order('id'))
  const pass = (s: string) => { results.push(s); console.log('PASS: ' + s) }
  let passed = false
  const longName = 'Pemilik Dengan Nama Sangat Panjang Untuk Memeriksa Header Layar Kecil'
  async function account(label: string, role?: string, business?: any) {
    const email = role ? `${business.code.toLowerCase()}.${label}@staff.usahaku.invalid` : `usahaku-pr5-fix-${randomUUID()}@example.com`
    const password = randomBytes(24).toString('base64url')
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role ? 'staff' : 'owner' }, user_metadata: { full_name: longName } })).user
    users.push(user.id)
    const client = make()
    ok(await client.auth.signInWithPassword({ email, password }))
    if (role) ok(await admin.from('business_members').insert({ business_id: business.id, user_id: user.id, name: label, username: label, role, must_change_password: false }))
    else {
      const id = ok(await client.rpc('create_business_profile', { store_name: 'Uji PR5 ' + label, owner_name: longName, store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
      bids.push(id)
      business = ok(await admin.from('businesses').select('*').eq('id', id).single())
    }
    return { email, password, client, business }
  }
  async function newPage() {
    const c = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
    contexts.push(c)
    return c.newPage()
  }
  async function login(p: Page, a: any, staff = false) {
    await p.goto(staff ? '/login?mode=staff' : '/login')
    if (staff) {
      await p.getByLabel('Kode toko', { exact: true }).fill(a.business.code)
      await p.getByLabel('Username', { exact: true }).fill(a.email.split('.')[1].split('@')[0])
    } else await p.getByLabel('Email', { exact: true }).fill(a.email)
    await p.getByLabel('Kata sandi', { exact: true }).fill(a.password)
    await p.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(p).toHaveURL(/\/(dashboard(?:\/pos)?|onboarding\/summary)$/)
  }
  const row = (id: string) => admin.from('businesses').select('*').eq('id', id).single().then(ok)
  try {
    await mkdir(dir, { recursive: true })
    const owner = await account('owner'), other = await account('other'), p = await newPage()
    await login(p, owner)
    for (const width of [320, 390, 768, 1440]) {
      await p.setViewportSize({ width, height: 900 })
      for (const path of ['/onboarding', '/onboarding/identity', '/onboarding/setup']) {
        await p.goto(path)
        const header = p.locator('header').first()
        const boxes = await header.locator('a, span').evaluateAll(elements => elements.filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent, left: r.left, right: r.right, width: r.width } }))
        expect(boxes.every(b => b.left >= 0 && b.right <= width)).toBe(true)
        const title = boxes.find(b => b.text === 'Pengaturan usaha'), name = boxes.find(b => b.text === longName)
        if (title && name) expect(title.right).toBeLessThan(name.left)
        expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (width === 320) await header.screenshot({ path: `${dir}/header-${path.split('/').pop()}-320.png` })
      }
    }
    pass('Header kategori, identitas, dan setup dengan nama panjang tidak bertumpuk pada 320/390/768/1440 px')
    ok(await owner.client.rpc('complete_business_onboarding', { target_id: owner.business.id }))
    ok(await other.client.rpc('complete_business_onboarding', { target_id: other.business.id }))
    await p.setViewportSize({ width: 1440, height: 1000 })
    for (const path of ['/onboarding', '/onboarding/identity', '/onboarding/setup', '/onboarding/summary']) {
      await p.goto(path)
      await expect(p).toHaveURL(/\/dashboard$/)
    }
    await p.getByRole('navigation', { name: 'Navigasi dashboard' }).getByRole('button', { name: 'Pengaturan', exact: true }).click()
    await expect(p).toHaveURL(/\/dashboard\/settings/)
    await expect(p.getByRole('heading', { name: 'Pengaturan toko', exact: true })).toBeVisible()
    await expect(p.getByRole('link', { name: 'Ubah kategori', exact: true })).toHaveCount(0)
    await p.getByLabel('Nama usaha *', { exact: true }).fill('Profil Owner Setelah Onboarding')
    await p.getByLabel('Alamat usaha *', { exact: true }).fill('Alamat Permanen 22')
    const image = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#1835d9' } }).webp().toBuffer()
    await p.locator('input[type=file]').setInputFiles({ name: 'logo.webp', mimeType: 'image/webp', buffer: image })
    await p.getByRole('button', { name: 'Simpan perubahan', exact: true }).click()
    await expect(p.getByRole('status').filter({ hasText: 'Profil usaha tersimpan.' })).toBeVisible()
    await expect.poll(async () => (await row(owner.business.id)).name).toBe('Profil Owner Setelah Onboarding')
    expect((await row(owner.business.id)).logo_path).toBeTruthy()
    const hours = p.getByRole('region', { name: 'Jam operasional', exact: true })
    await hours.getByRole('button', { name: 'Minggu dibuka', exact: true }).click()
    await hours.locator('input[type=time]').nth(12).fill('22:00')
    await hours.locator('input[type=time]').nth(13).fill('02:00')
    await hours.getByRole('button', { name: 'Simpan jam operasional', exact: true }).click()
    await expect(hours.getByRole('status')).toContainText('Jam operasional tersimpan.')
    await p.reload()
    await expect(p.getByLabel('Nama usaha *', { exact: true })).toHaveValue('Profil Owner Setelah Onboarding')
    await expect.poll(() => p.getByAltText('Preview logo usaha').evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(64)
    await expect(hours.locator('input[type=time]').nth(12)).toHaveValue('22:00')
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.screenshot({ path: `${dir}/settings-persisted.png`, fullPage: true })
    await p.goto('/dashboard')
    await p.getByRole('button', { name: 'Menu akun', exact: true }).click()
    await p.getByRole('button', { name: 'Staf & akses', exact: true }).click()
    await expect(p).toHaveURL(/\/dashboard\/settings\/staff$/)
    await expect(p.getByRole('heading', { name: 'Staf & akses', exact: true })).toBeVisible()
    await expect(p.getByText(owner.business.code, { exact: true })).toBeVisible()
    await p.getByRole('button', { name: 'Tambah staf', exact: true }).click()
    await p.getByLabel('Nama staf', { exact: true }).fill('Staf Baru PR5')
    await p.getByLabel('Username', { exact: true }).fill('new_pr5')
    await p.getByRole('button', { name: 'Buat akses staf', exact: true }).click()
    await expect(p.getByTestId('staff-new_pr5')).toBeVisible()
    await p.goto('/dashboard')
    await p.getByRole('button', { name: 'Menu akun', exact: true }).click()
    await p.getByRole('button', { name: 'Akun saya', exact: true }).click()
    await expect(p).toHaveURL(/\/account$/)
    await p.getByRole('button', { name: 'Keluar akun', exact: true }).click()
    await login(p, owner)
    await p.goto('/dashboard/settings')
    await expect(p.getByLabel('Nama usaha *', { exact: true })).toHaveValue('Profil Owner Setelah Onboarding')
    await expect(p.getByRole('region', { name: 'Jam operasional' }).locator('input[type=time]').nth(13)).toHaveValue('02:00')
    const second = await newPage()
    await login(second, owner)
    await second.goto('/dashboard/settings')
    await expect(second.getByLabel('Alamat usaha *', { exact: true })).toHaveValue('Alamat Permanen 22')
    await expect.poll(() => second.getByAltText('Preview logo usaha').evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(64)
    await expect(second.getByRole('region', { name: 'Jam operasional' }).locator('input[type=time]').nth(12)).toHaveValue('22:00')
    pass('Guard empat route onboarding tetap berlaku; Pengaturan, Staf & akses, dan Akun saya terpisah; profil/WebP/jam lintas malam persisten setelah reload, logout-login, serta sesi browser baru; staf dapat dibuat')
    const saved = await row(owner.business.id)
    for (const role of ['admin', 'cashier', 'other-owner']) {
      const a = role === 'other-owner' ? other : await account('pr5_' + role, role, owner.business)
      const restricted = await newPage()
      await login(restricted, a, role !== 'other-owner')
      for (const path of ['/dashboard/settings', '/dashboard/settings/staff']) {
        await restricted.goto(path)
        if (role === 'other-owner') {
          await expect(restricted).toHaveURL(new RegExp(path + '$'))
          await expect(restricted.getByText('Profil Owner Setelah Onboarding', { exact: true })).toHaveCount(0)
        } else await expect(restricted).toHaveURL(role === 'cashier' ? /\/dashboard\/pos$/ : /\/dashboard$/)
      }
      expect((await a.client.rpc('save_business_profile', { target_id: saved.id, expected_revision: saved.profile_revision, new_name: 'Forbidden', new_phone: saved.phone, new_street: saved.street_address, new_city: saved.city, new_province: saved.province, new_description: '' })).error).toBeTruthy()
      expect((await a.client.rpc('save_business_hours', { target_id: saved.id, expected_revision: saved.hours_revision, schedule: saved.operating_hours })).error).toBeTruthy()
      expect((await a.client.rpc('reserve_business_logo', { target_id: saved.id, asset_id: randomUUID() })).error).toBeTruthy()
      if (role === 'other-owner') {
        expect(ok(await a.client.from('businesses').select('id').eq('id', saved.id))).toEqual([])
        expect((await restricted.context().request.get(`/api/business/${saved.id}/logo`)).status()).toBe(403)
      }
    }
    expect(await row(owner.business.id)).toEqual(saved)
    pass('Admin/kasir ditolak route owner dan RPC profil/jam/logo; owner lain tidak membaca/mengubah profil maupun gambar usaha pertama')
    passed = true
  } finally {
    for (const c of contexts) await c.close()
    if (bids.length) {
      const staff = ok(await admin.from('business_members').select('user_id').in('business_id', bids))
      for (const m of staff) if (!users.includes(m.user_id)) users.push(m.user_id)
      const assets = ok(await admin.from('business_logo_assets').select('path').in('business_id', bids))
      if (assets.length) ok(await admin.storage.from('business-logos').remove(assets.map((a: any) => a.path)))
      ok(await admin.from('businesses').update({ logo_path: null }).in('id', bids))
      for (const table of ['business_logo_assets', 'staff_audit_logs', 'business_members']) ok(await admin.from(table).delete().in('business_id', bids))
      ok(await admin.from('businesses').delete().in('id', bids))
    }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    expect(ok(await admin.from('businesses').select('*').in('id', legacy.map((b: any) => b.id)).order('id'))).toEqual(legacy)
    await writeFile(`${dir}/settings-results.json`, JSON.stringify({ passed, results, cleanup: true, legacyBusinessesUnchanged: true }, null, 2))
  }
})

test('landing keeps normal motion and switches to static interactions for live reduced-motion preference', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 }, reducedMotion: 'no-preference' })
  const page = await context.newPage(), errors: string[] = [], results: string[] = []
  const dir = 'artifacts/pr5-fixes'
  let passed = false
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /hydrat|did not match|server rendered/i.test(m.text())) errors.push(m.text()) })
  await context.addInitScript(() => {
    ;(window as any).canvasDraws = 0
    ;(window as any).cls = 0
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { (window as any).canvasDraws++; return clear.apply(this, args) }
    new PerformanceObserver(list => { for (const e of list.getEntries() as any) if (!e.hadRecentInput) (window as any).cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  })
  try {
    await mkdir(dir, { recursive: true })
    await page.goto('/')
    const card = page.locator('figure.tilted-card').first(), body = card.locator(':scope > div').nth(1)
    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
    await card.hover({ position: { x: 20, y: 20 } })
    await expect.poll(() => body.evaluate(e => getComputedStyle(e).transform)).not.toBe('none')
    const count = await page.evaluate(() => (window as any).canvasDraws)
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => (window as any).canvasDraws)).toBeGreaterThan(count)
    results.push('Normal tilt and animated canvas remain active')
    const before = await card.boundingBox()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(() => body.evaluate(e => getComputedStyle(e).transform)).toBe('none')
    await page.waitForTimeout(250)
    const stopped = await page.evaluate(() => (window as any).canvasDraws)
    await card.hover({ position: { x: 40, y: 40 } })
    await card.click()
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByText('Contoh kasir aktif (ilustrasi)', { exact: true })).toBeVisible()
    expect(await body.evaluate(e => getComputedStyle(e).transform)).toBe('none')
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => (window as any).canvasDraws)).toBe(stopped)
    const after = await card.boundingBox()
    expect(after!.width).toBeCloseTo(before!.width, 0)
    expect(after!.height).toBeCloseTo(before!.height, 0)
    await card.press('Enter')
    await expect(card).toHaveAttribute('aria-pressed', 'false')
    await page.screenshot({ path: `${dir}/landing-reduced.png`, fullPage: true })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await card.hover()
    await expect.poll(() => body.evaluate(e => getComputedStyle(e).transform)).not.toBe('none')
    await expect.poll(() => page.evaluate(() => (window as any).canvasDraws)).toBeGreaterThan(stopped)
    results.push('Live preference stops hover scaling, tilt, 3D rotation, canvas/cascade; pointer/keyboard switch static faces; normal motion resumes')
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await expect.poll(() => body.evaluate(e => getComputedStyle(e).transform)).toBe('none')
      await page.getByRole('button', { name: 'Buka navigasi', exact: true }).first().click()
      await expect(page.getByRole('link', { name: 'Fitur', exact: true }).last()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${dir}/landing-menu-${width}.png` })
      await page.getByRole('link', { name: 'Fitur', exact: true }).last().click()
      await expect(page).toHaveURL(/#fitur$/)
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200)
      for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += 650) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(50) }
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: `${dir}/landing-scrolled-${width}.png`, fullPage: true })
      expect(await page.evaluate(() => (window as any).cls)).toBeLessThan(0.01)
    }
    expect(errors).toEqual([])
    results.push('Fresh reduced-motion render, mobile menu/scroll and no horizontal overflow at 320/390 px; no hydration/page errors or initial layout shift')
    passed = true
  } finally {
    await context.close()
    await writeFile(`${dir}/motion-results.json`, JSON.stringify({ passed, results, errors }, null, 2))
  }
})
