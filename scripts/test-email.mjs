// Optional real-mail test. Set USAHAKU_TEST_EMAIL to a mailbox you own.
// Only a new Gmail plus-address is used; no existing account is reset or modified.
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const email = process.env.USAHAKU_TEST_EMAIL
if (!email || !/^[^+@]+@gmail\.com$/i.test(email)) throw new Error('Set USAHAKU_TEST_EMAIL to your own Gmail address, without an existing plus-tag.')
const alias = email.replace('@', `+usahaku-test-${randomUUID().slice(0, 8)}@`)
const secret = randomBytes(18).toString('base64url')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3100'
let userId
// The user enters the OTP in this visible test window; secrets never go through chat.
const browser = await chromium.launch({ channel: 'msedge', headless: false })
const context = await browser.newContext({ baseURL })
const page = await context.newPage()
const result = { registrationAccepted: false, authUserCreated: false, confirmationConsumed: false, passwordLoginAfterEmailConfirmation: false, recoveryEmailAccepted: false, cleanup: false }
try {
  page.setDefaultTimeout(15000)
  await page.goto('/signup')
  await page.getByLabel('Nama pemilik', { exact: true }).fill('Email Test Sementara')
  await page.getByLabel('Email', { exact: true }).fill(alias)
  await page.getByLabel('Kata sandi', { exact: true }).fill(secret)
  await page.getByLabel('Konfirmasi kata sandi', { exact: true }).fill(secret)
  await page.getByRole('button', { name: /^Buat akun pemilik$/i }).click()
  await Promise.race([
    page.waitForURL('**/signup/verify'),
    page.locator('form [role="alert"]').waitFor(),
  ])
  result.registrationAccepted = new URL(page.url()).pathname === '/signup/verify'
  const list = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (list.error) throw new Error('Cannot inspect temporary signup result.')
  userId = list.data.users.find(user => user.email === alias)?.id
  result.authUserCreated = Boolean(userId)
  if (!result.registrationAccepted) {
    console.log('REAL_EMAIL_REGISTRATION_REJECTED: ' + await page.locator('form [role="alert"]').textContent())
  } else if (userId) {
    console.log('REAL_EMAIL_SENT_TO: ' + alias)
    console.log('WAITING_FOR_CONFIRMATION: read the email OTP and enter it in the visible test browser. Do not share the code in chat.')
    // Keep credentials only in memory. Poll for at most four minutes while the user checks mail.
    for (let attempt = 0; attempt < 48; attempt++) {
      const response = await admin.auth.admin.getUserById(userId)
      if (response.error) throw new Error('Cannot inspect temporary user confirmation.')
      if (response.data.user.email_confirmed_at) { result.confirmationConsumed = true; break }
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    if (result.confirmationConsumed) {
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(alias)
      await page.getByLabel('Kata sandi', { exact: true }).fill(secret)
      await page.getByRole('button', { name: 'Masuk', exact: true }).click()
      await page.waitForURL('**/onboarding')
      result.passwordLoginAfterEmailConfirmation = true
      await page.goto('/forgot-password')
      await page.getByLabel('Email pemilik', { exact: true }).fill(alias)
      await page.getByRole('button', { name: 'Kirim tautan pemulihan' }).click()
      await page.locator('form [role="status"], form [role="alert"]').waitFor()
      result.recoveryEmailAccepted = await page.locator('form [role="status"]').count() === 1
      console.log('REAL_RECOVERY_EMAIL_REQUEST_ACCEPTED: ' + result.recoveryEmailAccepted)
    }
  }
} finally {
  if (!userId) {
    const list = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (!list.error) userId = list.data.users.find(user => user.email === alias)?.id
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw new Error('Temporary email user cleanup failed; user ID: ' + userId)
  }
  result.cleanup = true
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/email-e2e-result.json', JSON.stringify(result, null, 2) + '\n')
  await browser.close()
  console.log('REAL_EMAIL_TEST_RESULT: ' + JSON.stringify(result))
}
