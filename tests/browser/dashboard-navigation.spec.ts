import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const dir = '.cache/urbanist-dashboard-results'
const menuLabels = ['Ringkasan', 'Produk', 'Inventori', 'Kasir (POS)', 'Transaksi', 'Pelanggan', 'Laporan', 'Asisten Bisnis AI', 'Pengaturan']

async function checkFont(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.locator('h1').first().evaluate(el => getComputedStyle(el).fontFamily)).toContain('Urbanist')
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    await page.locator('h1').first().evaluate(el => {
      const textElement = [el, ...Array.from(el.querySelectorAll('*'))].find(node => Array.from(node.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
      textElement?.setAttribute('data-rendered-font-probe', '')
    })
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-rendered-font-probe]' })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    expect(fonts.some(font => font.familyName === 'Urbanist' && font.isCustomFont && font.glyphCount > 0)).toBe(true)
  } finally { await cdp.detach(); await page.locator('[data-rendered-font-probe]').evaluateAll(elements => elements.forEach(el => el.removeAttribute('data-rendered-font-probe'))) }
}

test('Urbanist actually renders globally and dashboard chrome aligns on desktop, tablet and phone', async ({ page }) => {
  test.setTimeout(120000)
  const results: object[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mkdir(dir, { recursive: true })
  for (const path of ['/', '/login', '/signup', '/forgot-password', '/signup/verify']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    await checkFont(page)
    results.push({ path, renderedFont: 'Urbanist' })
  }
  await page.evaluate(async () => { await document.fonts.load('italic 400 16px Urbanist') })
  expect(await page.evaluate(() => Array.from(document.fonts).some(face => face.family === 'Urbanist' && face.style === 'italic' && face.status === 'loaded'))).toBe(true)
  for (const width of [320, 390, 768, 1024, 1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/preview/dashboard-palette')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Selamat')
    await checkFont(page)
    const header = page.locator('header').first()
    expect(await header.evaluate(el => getComputedStyle(el).borderBottomWidth)).toBe('0px')
    await expect(header.getByRole('navigation')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const brand = page.getByRole('button', { name: 'Usahaku beranda dashboard', exact: true })
    if (width >= 1024) {
      const nav = page.getByRole('navigation', { name: 'Navigasi dashboard', exact: true })
      await expect(nav.getByRole('button')).toHaveText(menuLabels)
      await expect(nav.locator('.lucide-search, .lucide-plus, .lucide-moon')).toHaveCount(0)
      const borderRadius = await nav.locator('..').evaluate(el => Number.parseFloat(getComputedStyle(el).borderRadius))
      expect(borderRadius).toBe(20)
      const brandBox = (await brand.boundingBox())!, titleBox = (await page.getByRole('heading', { level: 1 }).boundingBox())!
      expect(Math.abs(brandBox.x - titleBox.x)).toBeLessThan(1)
      const sidebarBox = (await nav.locator('..').boundingBox())!
      expect(titleBox.x - (sidebarBox.x + sidebarBox.width)).toBeCloseTo(24, 0)
      for (const button of await nav.getByRole('button').all()) {
        const label = button.locator('span'), box = (await button.boundingBox())!, labelBox = (await label.boundingBox())!
        expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(box.x + box.width)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      results.push({ width, alignmentDifference: brandBox.x - titleBox.x, menuCount: 9, borderRadius, sidebarGap: titleBox.x - (sidebarBox.x + sidebarBox.width) })
    } else {
      await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
      const nav = page.getByRole('navigation', { name: 'Navigasi dashboard mobile', exact: true })
      await expect(nav.getByRole('button')).toHaveText(menuLabels)
      await page.getByRole('button', { name: 'Tutup menu', exact: true }).click()
      await expect(nav).toHaveCount(0)
      results.push({ width, mobileMenuCount: 9 })
    }
    if ([390, 1366, 1920].includes(width)) await page.screenshot({ path: `${dir}/dashboard-${width}.png` })
  }
  await page.setViewportSize({ width: 1024, height: 480 })
  await page.goto('/preview/dashboard-palette')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Selamat')
  const settingsButton = page.getByRole('navigation', { name: 'Navigasi dashboard', exact: true }).getByRole('button', { name: 'Pengaturan', exact: true })
  await settingsButton.scrollIntoViewIfNeeded()
  const settingsBox = (await settingsButton.boundingBox())!
  expect(settingsBox.y + settingsBox.height).toBeLessThanOrEqual(480)
  results.push({ shortViewport: '1024x480', lastMenuItemAccessible: true, italicFontLoaded: true })
  expect(errors).toEqual([])
  await writeFile(`${dir}/public-results.json`, JSON.stringify({ passed: true, results, errors }, null, 2))
})

test('owner and admin navigation stays scoped across dashboard modules with the local font', async ({ browser, baseURL }) => {
  test.setTimeout(240000)
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
  const make = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)
  const ok = (r: any) => { if (r.error) throw Error('Test fixture/backend failed: ' + r.error.code); return r.data }
  const users: string[] = [], contexts = [], results: string[] = []
  let businessId = '', passed = false
  const legacy = ok(await admin.from('businesses').select('*').order('id'))
  const password = randomBytes(24).toString('base64url'), email = `usahaku-urbanist-${randomUUID()}@example.com`
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } })
  contexts.push(context)
  const page = await context.newPage()
  const login = async (p: Page, address: string) => {
    await p.goto('/login')
    await p.getByLabel('Email', { exact: true }).fill(address)
    await p.getByLabel('Kata sandi', { exact: true }).fill(password)
    await p.getByRole('button', { name: 'Masuk', exact: true }).click()
    await expect(p).toHaveURL(/\/(dashboard|onboarding\/summary)$/)
  }
  try {
    await mkdir(dir, { recursive: true })
    users.push(ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id)
    const client = make()
    ok(await client.auth.signInWithPassword({ email, password }))
    businessId = ok(await client.rpc('create_business_profile', { store_name: 'Toko Uji Urbanist', owner_name: 'Alif Uji Urbanist', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
    await login(page, email)
    for (const path of ['/onboarding', '/onboarding/identity', '/onboarding/setup', '/onboarding/summary']) {
      await page.goto(path)
      await checkFont(page)
    }
    results.push('Urbanist renders in all four onboarding pages')
    ok(await client.rpc('complete_business_onboarding', { target_id: businessId }))
    await page.goto('/dashboard')
    for (const [label, path] of [['Produk', '/dashboard/products'], ['Inventori', '/dashboard/inventory'], ['Pelanggan', '/dashboard/customers'], ['Transaksi', '/dashboard/transactions'], ['Laporan', '/dashboard/reports'], ['Asisten Bisnis AI', '/dashboard/assistant']]) {
      const nav = page.getByRole('navigation', { name: 'Navigasi dashboard', exact: true })
      await nav.getByRole('button', { name: label, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(path + '(\\?|$)'))
      await checkFont(page)
      await expect(page.locator('header').getByRole('navigation')).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Navigasi dashboard', exact: true }).getByRole('button')).toHaveText(menuLabels)
      results.push(label + ': sidebar route, labels and Urbanist verified')
    }
    for (const path of ['/dashboard/products', '/dashboard/inventory', '/dashboard/customers']) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
      const nav = page.getByRole('navigation', { name: 'Navigasi dashboard mobile', exact: true })
      await expect(nav.getByRole('button')).toHaveText(menuLabels)
      if (path !== '/dashboard/customers') {
        await page.keyboard.press('Escape')
        await expect(nav).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Buka navigasi', exact: true })).toBeFocused()
        await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
      }
      const box = (await nav.boundingBox())!
      expect(box.height).toBeGreaterThan(300)
      await nav.getByRole('button', { name: 'Ringkasan', exact: true }).click()
      await expect(page).toHaveURL(/\/dashboard\?category=toko$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      results.push(path + ': phone menu can navigate back to dashboard')
    }
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.goto('/dashboard/settings')
    await checkFont(page)
    await page.goto('/dashboard/settings/staff')
    await checkFont(page)
    await page.goto('/account')
    await checkFont(page)
    const business = ok(await admin.from('businesses').select('code').eq('id', businessId).single())
    const staffEmail = `${business.code.toLowerCase()}.urbanist_admin@staff.usahaku.invalid`
    users.push(ok(await admin.auth.admin.createUser({ email: staffEmail, password, email_confirm: true, app_metadata: { account_type: 'staff' } })).user.id)
    ok(await admin.from('business_members').insert({ business_id: businessId, user_id: users[1], name: 'Admin Uji', username: 'urbanist_admin', role: 'admin', must_change_password: false }))
    const staffContext = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } })
    contexts.push(staffContext)
    const staffPage = await staffContext.newPage()
    await login(staffPage, staffEmail)
    for (const path of ['/dashboard', '/dashboard/products', '/dashboard/inventory', '/dashboard/customers']) {
      await staffPage.goto(path)
      const nav = staffPage.getByRole('navigation', { name: 'Navigasi dashboard', exact: true })
      await expect(nav.getByRole('button')).toHaveText(menuLabels.filter(label => label !== 'Pengaturan'))
    }
    await staffPage.goto('/dashboard/settings')
    await expect(staffPage).toHaveURL(/\/dashboard$/)
    results.push('Admin keeps eight allowed menu items and server still denies owner settings')
    passed = true
  } finally {
    for (const c of contexts) await c.close()
    if (businessId) {
      for (const table of ['staff_audit_logs', 'business_members']) ok(await admin.from(table).delete().eq('business_id', businessId))
      ok(await admin.from('businesses').delete().eq('id', businessId))
    }
    for (const id of users) ok(await admin.auth.admin.deleteUser(id))
    expect(ok(await admin.from('businesses').select('*').in('id', legacy.map((b: any) => b.id)).order('id'))).toEqual(legacy)
    await writeFile(`${dir}/account-results.json`, JSON.stringify({ passed, results, cleanup: true, legacyUnchanged: true }, null, 2))
  }
})
