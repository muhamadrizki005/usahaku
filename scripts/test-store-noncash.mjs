import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import sharp from 'sharp'

const base = process.env.TEST_BASE_URL || 'http://localhost:3234'
const manifestPath = process.env.TEST_ACTION_MANIFEST || '.cache/store-noncash-qa/.next/dev/server/server-reference-manifest.json'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
const ok = response => { if (response.error) throw Error(response.error.code + ': ' + response.error.message); return response.data }
const users = [], businesses = [], uploads = []
const legacy = ok(await admin.from('businesses').select('id')).map(b => b.id)
async function snapshot() {
  const result = {}
  for (const [table, order] of [['businesses', 'id'], ['pos_transactions', 'id'], ['stock_movements', 'id'], ['customers', 'id'], ['customer_point_history', 'id'], ['business_payments', 'business_id']]) {
    const rows = []
    if (legacy.length) for (let offset = 0; ; offset += 500) {
      const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacy).order(order).range(offset, offset + 499))
      rows.push(...batch)
      if (batch.length < 500) break
    }
    result[table] = rows
  }
  return createHash('sha256').update(JSON.stringify(result)).digest('hex')
}
const before = await snapshot()
async function account() {
  const email = `usahaku-noncash-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
  const id = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
  users.push(id)
  const cookies = new Map()
  const client = createServerClient(url, key, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: batch => { for (const cookie of batch) cookies.set(cookie.name, cookie.value) },
  } })
  ok(await client.auth.signInWithPassword({ email, password }))
  return { id, client, cookie: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
}
let passed = false
try {
  const owner = await account(), cashier = await account(), other = await account()
  const bid = ok(await owner.client.rpc('create_business_profile', { store_name: 'Noncash QA', owner_name: 'Owner QA', store_phone: '081234567890', store_street: 'Alamat QA', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
  businesses.push(bid)
  ok(await owner.client.rpc('complete_business_onboarding', { target_id: bid }))
  ok(await admin.from('business_members').insert({ business_id: bid, user_id: cashier.id, name: 'Kasir QA', username: 'qa' + randomBytes(4).toString('hex'), role: 'cashier', must_change_password: false }))
  const product = randomUUID(), asset = randomUUID()
  ok(await owner.client.rpc('save_catalog_product', { target_id: bid, item_id: product, expected_version: null, operation_id: randomUUID(), details: {
    name: 'Produk QA', category: 'Minuman', unit: 'pcs', sku: '', barcode: '', price: '10000', minimum: '0', initialStock: '20', active: true, discountKind: 'none', discountValue: 0,
  } }))
  const path = ok(await owner.client.rpc('reserve_payment_qr', { target_id: bid, asset_id: asset }))
  const image = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#ffffff' } }).png().toBuffer()
  ok(await admin.storage.from('business-payment-qr').upload(path, image, { contentType: 'image/png' }))
  uploads.push(path)
  const payments = ok(await owner.client.rpc('save_business_payments', { target_id: bid, expected_revision: 0, asset_id: asset, details: {
    cash: true, qris: true, transfer: true, banks: [{ bank: 'Bank QA', holder: 'Owner QA', account: '12345678' }],
    ewallet: true, ewallets: [{ ewallet: 'GoPay', holder: 'Owner QA', number: '081234567890' }],
  } }))
  const page = await fetch(base + '/dashboard/pos', { headers: { Cookie: cashier.cookie() } })
  assert.equal(page.status, 200)
  await page.text()
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const actionId = Object.entries(manifest.node).find(([, value]) => value.exportedName === 'checkoutPos')?.[0]
  assert.ok(actionId, 'checkoutPos server action not found in QA manifest')
  async function checkout(account, request, details) {
    const response = await fetch(base + '/dashboard/pos', { method: 'POST', headers: {
      Cookie: account.cookie(), Origin: base, 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8',
    }, body: JSON.stringify([request, details]) })
    const text = await response.text()
    const result = text.split('\n').filter(line => line.startsWith('1:{')).at(-1)
    if (!result) throw Error('Unexpected server action response: HTTP ' + response.status)
    return JSON.parse(result.slice(2))
  }
  const qrResponse = await fetch(base + `/api/business/${bid}/payment-qr`, { headers: { Cookie: cashier.cookie() } })
  assert.equal(qrResponse.status, 200)
  assert.ok((await qrResponse.arrayBuffer()).byteLength > 0)
  assert.equal((await fetch(base + `/api/business/${bid}/payment-qr`, { headers: { Cookie: other.cookie() } })).status, 404)
  let revision = 0
  for (const payment of ['qris', 'ewallet', 'cash', 'transfer']) {
    const details = { lines: [{ id: product, quantity: '1', price: '10000', revision }], payment, received: '10000', discountKind: 'none', discountValue: '0', taxRate: '0', taxRevision: 0, paymentRevision: payments.revision, confirmed: true, customer: 'Pelanggan umum', pointsRedeemed: 0 }
    const request = randomUUID(), result = await checkout(cashier, request, details)
    assert.ok(result.sale, result.error)
    assert.equal(result.sale.payment, payment)
    assert.equal(Number(result.sale.total), 10000)
    assert.equal(result.sale.actor_id, cashier.id)
    assert.equal((await checkout(cashier, request, details)).sale.id, result.sale.id)
    revision = Number(ok(await admin.from('catalog_products').select('revision').eq('id', product).single()).revision)
    console.log('PASS: ' + payment + ' via authenticated server action and idempotent retry')
  }
  const blocked = await checkout(cashier, randomUUID(), { pointsRedeemed: 100 })
  assert.match(blocked.error, /Pilihan penukaran poin tidak valid/)
  assert.equal(ok(await admin.from('pos_transactions').select('id').eq('business_id', bid)).length, 4)
  assert.equal(Number(ok(await admin.from('catalog_products').select('stock').eq('id', product).single()).stock), 16)
  if (process.env.TEST_STORE_REDEMPTIONS === '1') {
    const customer = randomUUID(), reward = {id: 'voucher-qa', points_required: 10, reward_type: 'voucher', voucher_amount: 1000}
    ok(await owner.client.rpc('save_customer', {target_id: bid, item_id: customer, expected_version: null, operation_id: randomUUID(), details: {name: 'Member QA', phone: '', notes: '', active: true}}))
    ok(await admin.from('customers').update({points: 100}).eq('business_id', bid).eq('id', customer))
    ok(await owner.client.rpc('save_business_loyalty_settings', {target_id: bid, new_active: true, new_nominal: 1000, new_redemptions: [reward]}))
    assert.ok((await cashier.client.rpc('save_business_loyalty_settings', {target_id: bid, new_active: true, new_nominal: 1000, new_redemptions: [reward]})).error)
    const tax = ok(await owner.client.rpc('save_store_tax', {target_id: bid, expected_version: 0, rate: 11}))
    const rewardSales = []
    for (const payment of ['qris', 'ewallet']) {
      const details = {lines: [{id: product, quantity: '1', price: '10000', revision}], payment, received: '9990', discountKind: 'none', discountValue: '0', taxRate: '11', taxRevision: tax.revision, paymentRevision: payments.revision, confirmed: true, customerId: customer, redemptionId: reward.id, pointsRedeemed: 10}
      const request = randomUUID(), result = await checkout(cashier, request, details)
      assert.ok(result.sale, result.error)
      assert.equal(Number(result.sale.total), 9990); assert.equal(Number(result.sale.tax_amount), 990)
      assert.equal(Number(result.sale.point_discount), 1000); assert.equal(Number(result.sale.points_redeemed), 10)
      assert.equal(Number(result.sale.points_earned), 9)
      assert.equal((await checkout(cashier, request, details)).sale.id, result.sale.id)
      rewardSales.push(result.sale.id)
      console.log('PASS: ' + payment + ' with verified reward, correct tax and idempotent retry')
      revision = Number(ok(await admin.from('catalog_products').select('revision').eq('id', product).single()).revision)
    }
    assert.equal(Number(ok(await admin.from('customers').select('points').eq('id', customer).single()).points), 98)
    assert.equal(ok(await admin.from('customer_point_history').select('id').eq('customer_id', customer)).length, 4)
    const forged = await checkout(cashier, randomUUID(), {lines: [{id: product, quantity: '1', price: '10000', revision}], payment: 'qris', received: '9990', discountKind: 'none', discountValue: '0', taxRate: '11', taxRevision: tax.revision, paymentRevision: payments.revision, confirmed: true, customerId: customer, redemptionId: 'invented', pointsRedeemed: 10})
    assert.match(forged.error, /Hadiah belum tersimpan/)
    assert.equal(ok(await admin.from('pos_transactions').select('id').eq('business_id', bid)).length, 6)
    const refund = {target_id: bid, sale_id: rewardSales[0], explanation: 'Refund penuh QA', goods_returned: true, refund_confirmed: true}
    assert.ok((await cashier.client.rpc('cancel_pos', refund)).error)
    assert.equal(ok(await owner.client.rpc('cancel_pos', refund)).status, 'cancelled')
    assert.equal(ok(await owner.client.rpc('cancel_pos', refund)).status, 'cancelled')
    assert.equal(Number(ok(await admin.from('customers').select('points').eq('id', customer).single()).points), 99)
    assert.equal(ok(await admin.from('customer_point_history').select('id').eq('sale_id', rewardSales[0]).eq('kind', 'refund')).length, 1)
    console.log('PASS: owner refund restores redeemed points once; cashier refund denied')
  }
  passed = true
} finally {
  if (uploads.length) ok(await admin.storage.from('business-payment-qr').remove(uploads))
  for (const bid of businesses) {
    ok(await admin.from('staff_audit_logs').delete().eq('business_id', bid))
    ok(await admin.from('business_members').delete().eq('business_id', bid))
    ok(await admin.from('businesses').delete().eq('id', bid))
  }
  for (const id of users) ok(await admin.auth.admin.deleteUser(id))
  const legacyUnchanged = before === await snapshot()
  assert.ok(legacyUnchanged, 'Existing business data changed during QA')
  console.log(JSON.stringify({ passed, cleanup: true, legacyUnchanged }))
}
