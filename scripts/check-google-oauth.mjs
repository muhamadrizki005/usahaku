// Checks OAuth initiation only. Never enters credentials or creates a Google/Supabase account.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const settingsResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000) })
const settings = await settingsResponse.json()
const result = { providerEnabled: settings.external?.google === true, ownerButton: false, signupButton: false, staffButtonAbsent: false, pkceVerifierSet: false, reachedGoogle: false, googleConfigurationError: false, completedGoogleLogin: false }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  if (!result.providerEnabled) throw new Error('Google provider is not enabled.')
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  for (const [route, key] of [['/login', 'ownerButton'], ['/signup', 'signupButton']]) {
    await page.goto(route)
    result[key] = await page.getByRole('button', { name: /^(Lanjutkan|Masuk|Daftar) dengan Google$/ }).count() === 1
    if (!result[key]) throw new Error(`Google button missing on ${route}`)
  }
  await page.goto('/login?mode=staff')
  result.staffButtonAbsent = await page.getByRole('button', { name: /^(Lanjutkan|Masuk|Daftar) dengan Google$/ }).count() === 0
  await page.goto('/login')
  await page.getByRole('button', { name: /^(Lanjutkan|Masuk|Daftar) dengan Google$/ }).click()
  try {
    await page.waitForURL(url => url.hostname === 'accounts.google.com', { timeout: 20000, waitUntil: 'domcontentloaded' })
  } catch {
    // Do not print OAuth state, code challenge, full provider URLs, or cookie values.
    throw new Error('OAuth did not reach the Google sign-in page. Check provider and callback configuration.')
  }
  result.reachedGoogle = true
  result.pkceVerifierSet = (await context.cookies(baseURL)).some(cookie => cookie.name.includes('code-verifier'))
  const text = await page.locator('body').innerText()
  result.googleConfigurationError = /redirect_uri_mismatch|invalid_client|deleted_client|Error 400/i.test(text) || new URL(page.url()).pathname.includes('/oauth/error')
  if (result.googleConfigurationError) throw new Error('Google reported an OAuth client/redirect configuration error.')
  if (!result.pkceVerifierSet) throw new Error('PKCE verifier cookie was not set.')
} finally {
  await browser.close()
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/google-oauth-check.json', JSON.stringify(result, null, 2) + '\n')
  console.log('GOOGLE_OAUTH_INITIATION: ' + JSON.stringify(result))
}
