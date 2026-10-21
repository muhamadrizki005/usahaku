import { expect, type Browser, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Optional audit against a separately served ZIP. Only empty forms/test fixtures are captured.
export async function compareZipView(browser: Browser, current: Page, name: string, route: string, businessName = '[TEST UI] Warung A') {
  if (!process.env.UI_REFERENCE_URL) return
  const context = await browser.newContext({ baseURL: process.env.UI_REFERENCE_URL, viewport: current.viewportSize()! })
  try {
    await context.addInitScript(({ businessName }) => {
      localStorage.setItem('usahaku_business_name', businessName)
      localStorage.setItem('usahaku_identity', JSON.stringify({ form: { name: businessName, address: 'Jalan Uji 1, Bandung, Jawa Barat', phone: '081234567890' } }))
      localStorage.setItem('usahaku_category', 'toko')
    }, { businessName })
    const reference = await context.newPage()
    await reference.goto(route, { timeout: 90000 })
    if (name === 'dashboard') await expect(reference.getByRole('heading', { name: /Selamat/ })).toBeVisible()
    if (name === 'staff') await reference.getByRole('button', { name: 'Kelola staf', exact: true }).click()
    const selectors = name === 'staff' ? ['div.fixed > div', 'div.fixed h2', 'button[aria-label="Tambah staf"]'] : ['main', 'header', 'h1', 'h2', 'input[type="email"]', 'input[type="password"]']
    const properties = ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'borderRadius', 'borderTopColor', 'paddingTop', 'paddingLeft'] as const
    const samples = []
    for (const selector of selectors) {
      if (!await reference.locator(selector).count()) continue
      const sample = async (page: Page) => page.locator(selector).first().evaluate((element, properties) => {
        const style = getComputedStyle(element)
        return Object.fromEntries(properties.map(key => [key, style[key as keyof CSSStyleDeclaration]]))
      }, properties)
      const expected = await sample(reference)
      const actual = await sample(current)
      expect(actual, name + ': ' + selector).toEqual(expected)
      samples.push({ selector, expected, actual })
    }
    await mkdir('artifacts/ui-reference', { recursive: true })
    await reference.screenshot({ path: 'artifacts/ui-reference/' + name + '-zip.png', fullPage: true })
    await current.screenshot({ path: 'artifacts/ui-reference/' + name + '-current.png', fullPage: true })
    await writeFile('artifacts/ui-reference/' + name + '.json', JSON.stringify({ viewport: current.viewportSize(), samples }, null, 2))
  } finally { await context.close() }
}
