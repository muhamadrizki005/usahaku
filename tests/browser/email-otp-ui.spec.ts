import { test, expect } from '@playwright/test'

// Fault injection verifies UI recovery only. No SMTP delivery or hosted expiry claim.
test('OTP without a signup context explains how to recover', async ({ page }) => {
  await page.goto('/signup/verify')
  await expect(page.locator('main [role="alert"]')).toContainText('Email pendaftaran tidak ditemukan')
  await expect(page.getByRole('button', { name: 'Verifikasi Email', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Kirim ulang kode', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Kembali ke pendaftaran' })).toHaveAttribute('href', '/signup')
})

test('OTP editing, expiry response, resend cooldown and network recovery', async ({ page, context }) => {
  let resendMode: 'ok' | 'rate' | 'network' = 'ok'
  let verifyMode: 'expired' | 'network' | 'no-session' = 'expired'
  let resendRequests = 0
  await page.clock.install()
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('usahaku_signup_email')) sessionStorage.setItem('usahaku_signup_email', 'ui-otp@example.invalid')
  })
  await context.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const body = route.request().postDataJSON()
    if (path.endsWith('/resend')) {
      resendRequests++
      expect(body.type).toBe('signup')
      expect(body.email).toBe('ui-otp@example.invalid')
      if (resendMode === 'network') return route.abort('failed')
      return route.fulfill({ status: resendMode === 'rate' ? 429 : 200, contentType: 'application/json', body: JSON.stringify(resendMode === 'rate' ? { code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' } : {}) })
    }
    if (path.endsWith('/verify')) {
      expect(body.type).toBe('email')
      expect(body.email).toBe('ui-otp@example.invalid')
      if (verifyMode === 'network') return route.abort('failed')
      return route.fulfill({ status: verifyMode === 'expired' ? 403 : 200, contentType: 'application/json', body: JSON.stringify(verifyMode === 'expired' ? { code: 'otp_expired', msg: 'Token has expired or is invalid' } : { user: null, session: null }) })
    }
    // Never let these synthetic OTP/email fixtures reach the live provider.
    return route.abort('blockedbyclient')
  })
  await page.goto('/signup/verify')
  const digits = page.locator('input[inputmode="numeric"]')
  const length = await digits.count()
  await digits.first().fill('1'.repeat(length))
  await expect(page.getByRole('button', { name: 'Verifikasi Email', exact: true })).toBeEnabled()
  await digits.nth(2).fill('')
  await expect(digits.nth(2)).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Verifikasi Email', exact: true })).toBeDisabled()
  await digits.nth(2).fill('2')
  await page.getByRole('button', { name: 'Verifikasi Email', exact: true }).click()
  await expect(page.locator('main [role="alert"]')).toContainText('kedaluwarsa')
  await expect(page).toHaveURL(/\/signup\/verify$/)

  await page.getByRole('button', { name: 'Kirim ulang kode', exact: true }).click()
  await expect(page.locator('main [role="status"]')).toContainText('kode baru')
  await expect(digits.first()).toHaveValue('')
  await expect(page.getByRole('button', { name: /Kirim ulang kode/ })).toBeDisabled()
  expect(resendRequests).toBe(1)
  await page.reload()
  await expect(page.getByRole('button', { name: /Kirim ulang kode/ })).toBeDisabled()
  await page.clock.fastForward(61000)
  await expect(page.getByRole('button', { name: 'Kirim ulang kode', exact: true })).toBeEnabled()

  resendMode = 'rate'
  await page.getByRole('button', { name: 'Kirim ulang kode', exact: true }).click()
  await expect(page.locator('main [role="alert"]')).toContainText('Batas pengiriman')
  await page.reload()
  await expect(page.getByRole('button', { name: /Kirim ulang kode/ })).toBeDisabled()
  await page.clock.fastForward(61000)
  resendMode = 'network'
  await page.getByRole('button', { name: 'Kirim ulang kode', exact: true }).click()
  await expect(page.locator('main [role="alert"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kirim ulang kode', exact: true })).toBeEnabled()

  verifyMode = 'network'
  await digits.first().fill('1'.repeat(length))
  await page.getByRole('button', { name: 'Verifikasi Email', exact: true }).click()
  await expect(page.locator('main [role="alert"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verifikasi Email', exact: true })).toBeEnabled()
  verifyMode = 'no-session'
  await page.getByRole('button', { name: 'Verifikasi Email', exact: true }).click()
  await expect(page.locator('main [role="alert"]')).toContainText('Sesi belum berhasil dibuat')
  await expect(page).toHaveURL(/\/signup\/verify$/)
})
