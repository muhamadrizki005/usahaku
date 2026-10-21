import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

test('signup OTP rejects wrong/reused codes and creates a server-recognized session', async ({ browser, baseURL }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `usahaku-otp-${randomUUID()}@example.com`
  const password = randomBytes(18).toString('base64url')
  const context = await browser.newContext({ baseURL })
  let userId: string | undefined
  const result = { wrongCodeRejected: false, unconfirmedPasswordLoginRejected: false, otpConfirmed: false, serverSession: false, reusedCodeRejected: false, passwordLoginAfterConfirmation: false, cleanup: false, inboxDeliveryTested: false }
  try {
    const generated = await admin.auth.admin.generateLink({ type: 'signup', email, password })
    if (generated.error) throw new Error('Unable to create isolated OTP fixture: ' + generated.error.code)
    userId = generated.data.user.id
    const token = generated.data.properties.email_otp
    // Never include token values in assertion failure output.
    expect(/^\d{6}$|^\d{8}$/.test(token)).toBe(true)
    const beforeLogin = await client.auth.signInWithPassword({ email, password })
    expect(Boolean(beforeLogin.error)).toBe(true)
    result.unconfirmedPasswordLoginRejected = true

    // Only the email/cooldown is browser state. Activation always uses Supabase verification.
    await context.addInitScript(({ email }) => {
      if (sessionStorage.getItem('usahaku_otp_test_initialized')) return
      sessionStorage.setItem('usahaku_otp_test_initialized', '1')
      sessionStorage.setItem('usahaku_signup_email', email)
      sessionStorage.setItem('usahaku_signup_sent_at', String(Date.now()))
    }, { email })
    const page = await context.newPage()
    await page.goto('/signup/verify')
    await expect(page.getByRole('button', { name: /Kirim ulang kode/ })).toBeDisabled()
    const wrong = token.slice(0, -1) + ((Number(token[token.length - 1]) + 1) % 10)
    await page.getByLabel(`Digit 1 dari ${token.length}`, { exact: true }).fill(wrong)
    await page.getByRole('button', { name: 'Verifikasi Email', exact: true }).click()
    await expect(page.locator('main [role="alert"]')).toContainText('tidak valid')
    result.wrongCodeRejected = true
    await page.getByLabel(`Digit 1 dari ${token.length}`, { exact: true }).fill(token)
    await page.getByRole('button', { name: 'Verifikasi Email', exact: true }).click()
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByRole('heading', { name: 'Usaha apa yang Anda jalankan?' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Usaha apa yang Anda jalankan?' })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('usahaku_signup_email'))).toBeNull()
    result.serverSession = true
    const confirmed = await admin.auth.admin.getUserById(userId)
    expect(Boolean(confirmed.data.user?.email_confirmed_at)).toBe(true)
    result.otpConfirmed = true
    const reused = await client.auth.verifyOtp({ email, token, type: 'email' })
    expect(Boolean(reused.error)).toBe(true)
    result.reusedCodeRejected = true
    const replayContext = await browser.newContext({ baseURL })
    try {
      await replayContext.addInitScript(({ email }) => sessionStorage.setItem('usahaku_signup_email', email), { email })
      const replayPage = await replayContext.newPage()
      await replayPage.goto('/signup/verify')
      await replayPage.getByLabel(`Digit 1 dari ${token.length}`, { exact: true }).fill(token)
      await replayPage.getByRole('button', { name: 'Verifikasi Email', exact: true }).click()
      await expect(replayPage.locator('main [role="alert"]')).toContainText('tidak valid atau sudah kedaluwarsa')
      await replayPage.goto('/onboarding')
      await expect(replayPage).toHaveURL(/\/login(?:\?|$)/)
    } finally { await replayContext.close() }
    const afterLogin = await client.auth.signInWithPassword({ email, password })
    expect(afterLogin.error).toBeNull()
    result.passwordLoginAfterConfirmation = true
    await client.auth.signOut()
  } finally {
    await context.close()
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId)
      if (deleted.error) throw new Error('Isolated OTP fixture cleanup failed: ' + userId)
    }
    result.cleanup = true
    await mkdir('artifacts', { recursive: true })
    await writeFile('artifacts/email-otp-result.json', JSON.stringify(result, null, 2) + '\n')
    console.log('OTP verification checks: ' + JSON.stringify(result))
  }
})
