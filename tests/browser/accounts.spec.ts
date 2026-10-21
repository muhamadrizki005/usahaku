import { compareZipView } from './ui-reference'
import { test, expect, type Page, type BrowserContext, type Request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

// Real hosted Auth + real website. No Auth/DB stubs and no existing demo credentials.
// Credentials and Auth links remain in memory; automatic traces/screenshots are disabled.
test('foundation accounts through browser, server actions, and hosted RLS', async ({ browser, baseURL }) => {
  if (process.env.UI_REFERENCE_URL) test.setTimeout(420000)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const newClient = () => createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const users = new Set<string>()
  const businessIds = new Set<string>()
  const contexts: BrowserContext[] = []
  const results: Record<string, boolean | string> = {}
  const password = () => randomBytes(18).toString('base64url')
  const runId = randomUUID()
  const signupEmail = `usahaku-public-${runId}@example.com`
  let signupAttempted = false
  let stage = 'initial snapshot'
  let finished = false
  let demoBefore = ''

  function checked<T extends { data: unknown; error: unknown }>({ data, error }: T): NonNullable<T['data']> {
    const problem = error as { code?: string; status?: number } | null
    if (problem) throw new Error(`Supabase test operation failed at ${stage}; code=${problem.code || problem.status || 'unknown'}`)
    return data as NonNullable<T['data']>
  }
  async function snapshot() {
    const businesses = checked(await admin.from('businesses').select('*').in('code', ['F531258D', 'E792CF0F']).order('id'))!
    const ids = businesses.map(row => row.id)
    const members = checked(await admin.from('business_members').select('*').in('business_id', ids).order('id'))
    const audit = checked(await admin.from('staff_audit_logs').select('*').in('business_id', ids).order('id'))
    return JSON.stringify({ businesses, members, audit })
  }
  async function page() {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
    contexts.push(context)
    return context.newPage()
  }
  async function callback(target: Page, tokenHash: string, type: 'signup' | 'recovery') {
    // Never log the generated URL/token or provider response.
    await target.goto(`/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${type === 'recovery' ? '/account/reset-password' : '/onboarding'}`)
  }
  async function owner(label: string) {
    const email = `usahaku-ui-${label}-${runId}@example.com`
    const secret = password()
    const data = checked(await admin.auth.admin.generateLink({ type: 'signup', email, password: secret, options: { redirectTo: `${baseURL}/auth/callback?next=/onboarding` } }))
    users.add(data.user!.id)
    return { email, secret, userId: data.user!.id, hash: data.properties!.hashed_token }
  }
  async function loginOwner(target: Page, email: string, secret: string) {
    await target.goto('/login')
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Kata sandi', { exact: true }).fill(secret)
    await target.getByRole('button', { name: 'Masuk', exact: true }).click()
  }
  async function loginStaff(target: Page, code: string, username: string, secret: string) {
    await target.goto('/login?mode=staff')
    await target.getByLabel('Kode toko', { exact: true }).fill(code)
    await target.getByLabel('Username', { exact: true }).fill(username)
    await target.getByLabel('Kata sandi / sementara', { exact: true }).fill(secret)
    await target.getByRole('button', { name: 'Masuk', exact: true }).click()
  }
  async function changePassword(target: Page, current: string, next: string) {
    await target.getByLabel('Kata sandi saat ini / sementara', { exact: true }).fill(current)
    await target.getByLabel('Kata sandi baru', { exact: true }).fill(next)
    await target.getByLabel('Konfirmasi kata sandi baru', { exact: true }).fill(next)
    await target.getByRole('button', { name: 'Simpan kata sandi', exact: true }).click()
  }
  async function createBusiness(target: Page, name: string, userId: string) {
    await target.goto('/onboarding/identity')
    await target.getByRole('textbox', { name: /^Nama usaha/ }).fill(name)
    await target.getByRole('textbox', { name: /^Alamat usaha/ }).fill('Jalan Uji 1')
    await target.getByRole('textbox', { name: /^Kota\/Kabupaten/ }).fill('Bandung')
    await target.getByRole('textbox', { name: /^Provinsi/ }).fill('Jawa Barat')
    await target.getByRole('textbox', { name: /^Nomor kontak usaha/ }).fill('081234567890')
    await target.getByRole('button', { name: 'Simpan & lanjutkan', exact: true }).click()
    await expect(target).toHaveURL(/\/onboarding\/setup\?category=toko$/)
    await target.screenshot({ path: 'artifacts/qa-onboarding-setup.png', fullPage: true })
    await compareZipView(browser, target, 'setup', '/onboarding/setup?category=toko', name)
    await target.getByRole('button', { name: 'Masuk ke ringkasan' }).click()
    await expect(target).toHaveURL(/\/onboarding\/summary\?category=toko$/)
    await target.screenshot({ path: 'artifacts/qa-onboarding-summary.png', fullPage: true })
    await compareZipView(browser, target, 'summary', '/onboarding/summary?category=toko', name)
    await target.getByRole('button', { name: 'Buka dashboard' }).click()
    await expect(target).toHaveURL(/\/dashboard(?:\?category=toko)?$/)
    const business = checked(await admin.from('businesses').select('*').eq('owner_id', userId).single())!
    expect(business.address).toBe('Jalan Uji 1, Bandung, Jawa Barat')
    businessIds.add(business.id)
    return business
  }
  async function createStaff(target: Page, username: string, role: 'cashier' | 'admin') {
    await target.goto('/dashboard/settings/staff')
    await target.getByRole('button', { name: 'Tambah staf', exact: true }).click()
    await target.getByLabel('Nama staf', { exact: true }).fill(`UI ${role}`)
    await target.getByLabel('Username', { exact: true }).fill(username)
    await target.getByLabel('Peran', { exact: true }).selectOption(role)
    await target.getByRole('button', { name: 'Buat akses staf', exact: true }).click()
    const field = target.getByTestId('temporary-password')
    await expect(field).toHaveCount(1)
    const secret = (await field.textContent())!
    const member = checked(await admin.from('business_members').select('*').eq('business_id', [...businessIds][0]).eq('username', username).single())!
    users.add(member.user_id)
    return { secret, member }
  }
  async function captureAction(target: Page, action: () => Promise<unknown>) {
    const request = target.waitForRequest(r => r.method() === 'POST' && Boolean(r.headers()['next-action']))
    await action()
    return request
  }
  async function replay(context: BrowserContext, request: Request) {
    const sourceHeaders = request.headers()
    return context.request.post('/dashboard/settings/staff', { data: request.postDataBuffer()!, headers: { 'content-type': sourceHeaders['content-type'], 'next-action': sourceHeaders['next-action'], origin: baseURL!, accept: 'text/x-component' }, maxRedirects: 0 })
  }

  try {
    demoBefore = await snapshot()
    console.log('E2E stage: anonymous route protection')
    stage = 'anonymous route protection'
    const anonymous = await page()
    for (const route of ['/dashboard', '/dashboard/settings/staff', '/onboarding/identity', '/account']) {
      await anonymous.goto(route)
      await expect(anonymous).toHaveURL(/\/login(?:\?|$)/)
    }
    results.anonymousProtection = true
    await anonymous.goto('/login')
    await mkdir('artifacts', { recursive: true })
    await anonymous.screenshot({ path: 'artifacts/qa-login.png', fullPage: true })
    await compareZipView(browser, anonymous, 'login', '/login')

    console.log('E2E stage: public registration form')
    stage = 'public registration form'
    await anonymous.goto('/signup')
    await compareZipView(browser, anonymous, 'signup', '/signup')
    await anonymous.getByLabel('Nama pemilik', { exact: true }).fill('Public UI Test')
    await anonymous.getByLabel('Email', { exact: true }).fill(signupEmail)
    const signupPassword = password()
    await anonymous.getByLabel('Kata sandi', { exact: true }).fill(signupPassword)
    await anonymous.getByLabel('Konfirmasi kata sandi', { exact: true }).fill(signupPassword)
    signupAttempted = true
    await anonymous.getByRole('button', { name: /^Buat akun pemilik$/i }).click()
    await expect.poll(async () => new URL(anonymous.url()).pathname === '/signup/verify' || await anonymous.locator('form [role="alert"]').count() === 1).toBe(true)
    results.publicRegistrationAccepted = new URL(anonymous.url()).pathname === '/signup/verify'
    const allUsers = checked(await admin.auth.admin.listUsers({ perPage: 1000 }))
    const publicUser = allUsers.users.find(user => user.email === signupEmail)
    if (publicUser) users.add(publicUser.id)
    results.publicRegistrationCreatedAuthUser = Boolean(publicUser)
    results.realInboxDelivery = 'not tested in this suite; see the optional real-email test result'
    results.confirmationLinks = 'tested with Admin API generated tokens; not proof of email delivery'

    console.log('E2E stage: owner confirmation callback and cookie session')
    stage = 'owner confirmation callback and cookie session'
    const a = await owner('a')
    const b = await owner('b')
    const pageA = await page()
    const pageB = await page()
    await callback(pageA, a.hash, 'signup')
    await expect(pageA).toHaveURL(/\/onboarding$/)
    await pageA.reload()
    await expect(pageA.getByRole('heading', { name: 'Usaha apa yang Anda jalankan?' })).toBeVisible()
    await pageA.screenshot({ path: 'artifacts/qa-onboarding.png', fullPage: true })
    await compareZipView(browser, pageA, 'onboarding', '/onboarding')
    await expect(pageA.getByRole('button', { name: /Restoran \/ Cafe/ })).toBeDisabled()
    await pageA.getByRole('button', { name: 'Lanjutkan', exact: true }).click()
    await expect(pageA).toHaveURL(/\/onboarding\/identity\?category=toko$/)
    await pageA.screenshot({ path: 'artifacts/qa-onboarding-identity.png', fullPage: true })
    await compareZipView(browser, pageA, 'onboarding-identity', '/onboarding/identity?category=toko')
    const businessA = await createBusiness(pageA, '[TEST UI] Warung A', a.userId)
    await callback(pageB, b.hash, 'signup')
    await expect(pageB).toHaveURL(/\/onboarding$/)
    const businessB = await createBusiness(pageB, '[TEST UI] Warung B', b.userId)
    await expect(pageB.locator('main')).toContainText('[TEST UI] Warung B')
    await pageB.screenshot({ path: 'artifacts/qa-dashboard.png', fullPage: true })
    await compareZipView(browser, pageB, 'dashboard', '/dashboard', '[TEST UI] Warung B')
    await expect(pageB.locator('main')).not.toContainText('[TEST UI] Warung A')
    await pageA.goto('/onboarding/identity')
    await expect(pageA).toHaveURL(/\/dashboard$/)
    const countA = checked(await admin.from('businesses').select('id').eq('owner_id', a.userId))!
    expect(countA.length).toBe(1)
    results.ownerConfirmationCookieBusiness = true
    results.oneBusinessPerOwner = true

    console.log('E2E stage: owner logout and password login')
    stage = 'owner logout and password login'
    await pageA.getByRole('button', { name: 'Menu akun', exact: true }).click()
    await pageA.getByRole('button', { name: 'Keluar akun', exact: true }).click()
    await expect(pageA).toHaveURL(/\/login$/)
    await pageA.goto('/dashboard')
    await expect(pageA).toHaveURL(/\/login$/)
    await loginOwner(pageA, a.email, a.secret)
    await expect(pageA).toHaveURL(/\/dashboard$/)
    results.ownerLoginLogout = true

    console.log('E2E stage: owner creates cashier/admin')
    stage = 'owner creates cashier/admin'
    const cashier = await createStaff(pageA, 'cashier_ui', 'cashier')
    const adminStaff = await createStaff(pageA, 'admin_ui', 'admin')
    await pageA.goto('/dashboard/settings/staff')
    await expect(pageA.getByTestId('staff-cashier_ui')).toBeVisible()
    await expect(pageA.getByTestId('staff-admin_ui')).toBeVisible()
    await pageA.screenshot({ path: 'artifacts/qa-staff.png', fullPage: true })
    await compareZipView(browser, pageA, 'staff', '/onboarding/setup?category=toko')
    // Client-side options are not a security boundary: submit an injected owner role.
    await pageA.getByRole('button', { name: 'Tambah staf', exact: true }).click()
    await pageA.getByLabel('Nama staf', { exact: true }).fill('Forbidden Owner')
    await pageA.getByLabel('Username', { exact: true }).fill('forbidden_owner')
    await pageA.getByLabel('Peran', { exact: true }).evaluate((select: HTMLSelectElement) => {
      select.add(new Option('Owner', 'owner'))
      select.value = 'owner'
    })
    await pageA.getByRole('button', { name: 'Buat akses staf' }).click()
    await expect(pageA.locator('main [role="alert"]')).toBeVisible()
    const illicitMember = checked(await admin.from('business_members').select('id').eq('business_id', businessA.id).eq('username', 'forbidden_owner'))!
    expect(illicitMember.length).toBe(0)
    await pageA.goto('/dashboard/settings/staff')
    await pageA.getByRole('button', { name: 'Tambah staf', exact: true }).click()
    await pageA.getByLabel('Nama staf', { exact: true }).fill('Duplicate User')
    await pageA.getByLabel('Username', { exact: true }).fill('cashier_ui')
    await pageA.getByRole('button', { name: 'Buat akses staf' }).click()
    await expect(pageA.locator('main [role="alert"]')).toBeVisible()
    expect(checked(await admin.from('business_members').select('id').eq('business_id', businessA.id).eq('username', 'cashier_ui'))!.length).toBe(1)
    results.roleInjectionAndDuplicateUsernameRejected = true
    await pageB.goto('/dashboard/settings/staff')
    await expect(pageB.getByTestId('staff-cashier_ui')).toHaveCount(0)
    results.staffCreationAndWebsiteIsolation = true

    console.log('E2E stage: cashier forced password change')
    stage = 'cashier forced password change'
    const pageCashier = await page()
    await loginStaff(pageCashier, businessA.code, 'cashier_ui', cashier.secret)
    await expect(pageCashier).toHaveURL(/\/account\/password$/)
    await pageCashier.goto('/dashboard/settings/staff')
    await expect(pageCashier).toHaveURL(/\/account\/password$/)
    let cashierPassword = password()
    await changePassword(pageCashier, cashier.secret, cashierPassword)
    await expect(pageCashier).toHaveURL(/\/dashboard\/pos$/)
    await pageCashier.goto('/dashboard/settings/staff')
    await expect(pageCashier).toHaveURL(/\/dashboard\/pos$/)
    await pageCashier.goto('/dashboard/reports')
    await expect(pageCashier).toHaveURL(/\/dashboard\/pos$/)
    await pageCashier.goto('/dashboard/transactions')
    await expect(pageCashier).toHaveURL(/\/dashboard\/transactions$/)
    results.cashierForcedChangeAndRoleRestrictions = true
    results.cashierOwnTransactionsRouteRetained = true

    console.log('E2E stage: admin forced password change and role restriction')
    stage = 'admin forced password change and role restriction'
    const pageAdmin = await page()
    await loginStaff(pageAdmin, businessA.code, 'admin_ui', adminStaff.secret)
    await expect(pageAdmin).toHaveURL(/\/account\/password$/)
    await changePassword(pageAdmin, adminStaff.secret, password())
    await expect(pageAdmin).toHaveURL(/\/dashboard$/)
    await pageAdmin.goto('/dashboard/settings/staff')
    await expect(pageAdmin).toHaveURL(/\/dashboard$/)
    results.adminRestrictions = true

    console.log('E2E stage: staff reset while old session is open')
    stage = 'staff reset while old session is open'
    await pageA.goto('/dashboard/settings/staff')
    const resetRequest = await captureAction(pageA, () => pageA.getByTestId('staff-cashier_ui').getByRole('button', { name: 'Reset kata sandi' }).click())
    const resetField = pageA.getByTestId('staff-cashier_ui').getByTestId('temporary-password')
    await expect(resetField).toHaveCount(1)
    const resetPassword = (await resetField.textContent())!
    await pageCashier.goto('/dashboard/pos')
    // Hosted Auth can revoke the session outright on admin password reset.
    await expect(pageCashier).toHaveURL(/\/(?:login|account\/password)$/)
    if (new URL(pageCashier.url()).pathname === '/login') {
      await loginStaff(pageCashier, businessA.code, 'cashier_ui', cashierPassword)
      await expect(pageCashier.locator('main [role="alert"]')).toBeVisible()
      await loginStaff(pageCashier, businessA.code, 'cashier_ui', resetPassword)
      await expect(pageCashier).toHaveURL(/\/account\/password$/)
    } else {
      await changePassword(pageCashier, cashierPassword, password())
      await expect(pageCashier.locator('main [role="alert"]')).toContainText('tidak sesuai')
    }
    const blocked = checked(await admin.from('business_members').select('must_change_password').eq('id', cashier.member.id).single())!
    expect(blocked.must_change_password).toBe(true)
    cashierPassword = password()
    await changePassword(pageCashier, resetPassword, cashierPassword)
    await expect(pageCashier).toHaveURL(/\/dashboard\/pos$/)
    results.staffResetBlocksStaleSession = true

    console.log('E2E stage: direct action role/tenant tampering')
    stage = 'direct action role/tenant tampering'
    await replay(pageAdmin.context(), resetRequest)
    await replay(pageB.context(), resetRequest)
    const unchanged = checked(await admin.from('business_members').select('must_change_password').eq('id', cashier.member.id).single())!
    expect(unchanged.must_change_password).toBe(false)
    results.directActionRoleAndTenantProtection = true

    console.log('E2E stage: deactivation and reactivation with live session')
    stage = 'deactivation and reactivation with live session'
    await pageA.getByTestId('staff-cashier_ui').getByRole('button', { name: 'Nonaktifkan', exact: true }).click()
    await expect(pageA.getByTestId('staff-cashier_ui').getByText('Nonaktif', { exact: true })).toBeVisible()
    await pageCashier.goto('/dashboard/pos')
    await expect(pageCashier).toHaveURL(/\/account$/)
    await expect(pageCashier.getByRole('heading', { name: 'Akses dinonaktifkan' })).toBeVisible()
    const cashierSdk = newClient()
    checked(await cashierSdk.auth.signInWithPassword({ email: `${businessA.code.toLowerCase()}.cashier_ui@staff.usahaku.invalid`, password: cashierPassword }))
    expect(checked(await cashierSdk.from('businesses').select('id'))!.length).toBe(0)
    await pageA.getByTestId('staff-cashier_ui').getByRole('button', { name: 'Aktifkan', exact: true }).click()
    await expect(pageA.getByTestId('staff-cashier_ui').getByText('Aktif', { exact: true })).toBeVisible()
    await pageCashier.goto('/dashboard/pos')
    await expect(pageCashier).toHaveURL(/\/dashboard\/pos$/)
    results.deactivationAndReactivation = true

    console.log('E2E stage: hosted tenant isolation and escalation rejection')
    stage = 'hosted tenant isolation and escalation rejection'
    const ownerSdk = newClient()
    checked(await ownerSdk.auth.signInWithPassword({ email: a.email, password: a.secret }))
    for (const table of ['businesses', 'business_members', 'staff_audit_logs']) {
      const column = table === 'businesses' ? 'id' : 'business_id'
      expect(checked(await ownerSdk.from(table).select('id').eq(column, businessB.id))!.length).toBe(0)
    }
    expect((await cashierSdk.from('business_members').update({ role: 'owner' }).eq('id', cashier.member.id)).error).toBeTruthy()
    expect((await cashierSdk.rpc('create_business', { business_name: 'Forbidden', owner_name: 'Forbidden' })).error).toBeTruthy()
    results.hostedTenantIsolation = true

    console.log('E2E stage: owner recovery form and signed callback')
    stage = 'owner recovery form and signed callback'
    await pageA.goto('/forgot-password')
    await pageA.getByLabel('Email pemilik', { exact: true }).fill(a.email)
    await pageA.getByRole('button', { name: 'Kirim tautan pemulihan' }).click()
    await expect(pageA.locator('form [role="status"], form [role="alert"]')).toHaveCount(1)
    results.recoveryEmailRequestAccepted = await pageA.locator('form [role="status"]').count() === 1
    const recovery = checked(await admin.auth.admin.generateLink({ type: 'recovery', email: a.email, options: { redirectTo: `${baseURL}/auth/callback?next=/account/reset-password` } }))
    await callback(pageA, recovery.properties!.hashed_token, 'recovery')
    await expect(pageA).toHaveURL(/\/account\/reset-password$/)
    const ownerNewPassword = password()
    await pageA.getByLabel('Kata sandi baru', { exact: true }).fill(ownerNewPassword)
    await pageA.getByLabel('Konfirmasi kata sandi baru', { exact: true }).fill(ownerNewPassword)
    await pageA.getByRole('button', { name: 'Simpan kata sandi' }).click()
    await expect(pageA).toHaveURL(/\/login\?notice=password-updated$/)
    await loginOwner(pageA, a.email, a.secret)
    await expect(pageA.locator('main [role="alert"]')).toBeVisible()
    await loginOwner(pageA, a.email, ownerNewPassword)
    await expect(pageA).toHaveURL(/\/dashboard$/)
    await pageA.goto('/account/reset-password')
    await expect(pageA.locator('main [role="alert"]')).toContainText('kedaluwarsa')
    await callback(pageA, recovery.properties!.hashed_token, 'recovery')
    await expect(pageA).toHaveURL(/\/auth\/error$/)
    results.ownerRecoveryAndUsedLinkRejection = true

    console.log('E2E stage: tablet form layout')
    stage = 'tablet form layout'
    await anonymous.setViewportSize({ width: 768, height: 1024 })
    await anonymous.goto('/login?mode=staff')
    expect(await anonymous.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    results.tabletLayout = true
    finished = true
  } finally {
    if (!finished) results.failedStage = stage
    console.log('E2E stage: cleanup')
    stage = 'cleanup'
    // A signup may have created an unconfirmed user before the UI response was interrupted.
    if (signupAttempted) {
      const list = checked(await admin.auth.admin.listUsers({ perPage: 1000 }))
      const user = list.users.find(item => item.email === signupEmail)
      if (user) users.add(user.id)
    }
    for (const id of users) {
      const membership = checked(await admin.from('business_members').select('business_id,role').eq('user_id', id).maybeSingle())
      if (membership?.role === 'owner') businessIds.add(membership.business_id)
    }
    for (const id of businessIds) {
      const memberships = checked(await admin.from('business_members').select('user_id').eq('business_id', id))!
      memberships.forEach(member => users.add(member.user_id))
      checked(await admin.from('staff_audit_logs').delete().eq('business_id', id))
      checked(await admin.from('business_members').delete().eq('business_id', id))
      checked(await admin.from('businesses').delete().eq('id', id))
    }
    for (const id of users) checked(await admin.auth.admin.deleteUser(id))
    if (demoBefore) expect(await snapshot() === demoBefore).toBe(true)
    results.demoUnchangedAndTemporaryDataCleaned = true
    results.completed = finished
    await mkdir('artifacts', { recursive: true })
    await writeFile('artifacts/accounts-e2e-result.json', JSON.stringify(results, null, 2) + '\n')
    for (const context of contexts) await context.close()
    console.log('Account E2E checks: ' + JSON.stringify(results))
  }
})
