import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
const ok = response => { if (response.error) throw Error(response.error.code + ': ' + response.error.message); return response.data }
const users = [], businesses = []
const legacy = ok(await admin.from('businesses').select('id')).map(b => b.id)
async function snapshot() {
  const result = {}
  for (const [table, order] of [['businesses', 'id'], ['salon_visits', 'id'], ['pos_transactions', 'id'], ['salon_audit', 'id'], ['customer_point_history', 'id']]) {
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
  const email = `usahaku-prepaid-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
  const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user
  users.push(user.id)
  const client = createClient(url, key, options)
  ok(await client.auth.signInWithPassword({ email, password }))
  return { id: user.id, client }
}
let passed = false
try {
  const owner = await account(), cashier = await account(), other = await account()
  const bid = ok(await owner.client.rpc('create_business_profile_for_category', {
    business_category: 'barbershop', store_name: 'Salon Prepaid QA', owner_name: 'Owner QA', store_phone: '081234567890',
    store_street: 'Alamat QA', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '',
  }))
  businesses.push(bid)
  ok(await owner.client.rpc('complete_business_onboarding', { target_id: bid }))
  ok(await admin.from('business_members').insert({ business_id: bid, user_id: cashier.id, name: 'Kasir QA', username: 'qa' + randomBytes(4).toString('hex'), role: 'cashier', must_change_password: false }))
  const hours = Object.fromEntries(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map(d => [d, { open: '00:00', close: '23:59', closed: false }]))
  ok(await owner.client.rpc('save_business_hours', { target_id: bid, expected_revision: 0, schedule: hours }))
  const sid = randomUUID(), pid = randomUUID()
  for (const [resource, id, details] of [
    ['service', sid, { name: 'Potong QA', price: '50000', duration: '30', active: true }],
    ['practitioner', pid, { name: 'Penata QA', active: true, serviceIds: [sid], schedule: hours }],
  ]) ok(await owner.client.rpc('save_salon_resource', { target_id: bid, resource, item_id: id, expected_revision: null, operation_id: randomUUID(), details }))
  const id = randomUUID(), vid = randomUUID(), start = new Date(Date.now() - 30000).toISOString(), end = new Date(Date.now() + 1770000).toISOString()
  const lines = [{ id: sid, name: 'Potong QA', sku: '', unit: 'layanan', price: 50000, quantity: 1, total: 50000, duration: 30, revision: 1 }]
  const sale = { id, business_id: bid, actor_id: cashier.id, actor_name: 'Kasir QA', customer_id: null, customer: 'Pelanggan QA', lines,
    subtotal: 50000, discount_kind: 'none', discount_value: 0, discount: 0, total: 50000, payment: 'cash', received: 50000, change: 0,
    status: 'completed', tax_rate: 0, tax_amount: 0, service_rate: 0, service_amount: 0, tax_base: 'net', receipt_number: 'SLN-QA-' + id,
    points_earned: 0, deposit_amount: 0, deposit_payment: null, balance_received: 50000, product_discount: 0, order_discount: 0 }
  const visit = { id: vid, business_id: bid, actor_id: cashier.id, actor_name: 'Kasir QA', practitioner_id: pid, practitioner_name: 'Penata QA',
    customer_id: null, customer: 'Pelanggan QA', phone: '', notes: '', kind: 'walk_in', starts_at: start, ends_at: end, buffer_minutes: 0,
    busy_until: end, lines, subtotal: 50000, status: 'waiting', started_at: null, finished_at: null, sale_id: id, deposit_amount: 0,
    deposit_payment: null, deposit_refunded: 0, revision: 1 }
  const commit = data => admin.rpc('commit_salon_cart_checkout', { target_id: bid, checkout_actor: cashier.id, sale_details: sale, visit_details: data })
  assert.ok((await commit({ ...visit, subtotal: -1 })).error)
  assert.equal(ok(await admin.from('pos_transactions').select('id').eq('id', id)).length, 0)
  assert.ok((await cashier.client.rpc('commit_salon_cart_checkout', { target_id: bid, checkout_actor: cashier.id, sale_details: sale, visit_details: visit })).error)
  const paid = ok(await commit(visit))
  assert.equal(paid.visit.status, 'waiting')
  assert.equal(paid.sale.status, 'completed')
  assert.equal(paid.visit.started_at, null)
  assert.equal(paid.visit.finished_at, null)
  const operation = (client, revision, action, request = randomUUID()) => client.rpc('salon_visit_operation', { target_id: bid, item_id: vid, expected_revision: revision, operation_id: request, action, details: {} })
  assert.ok((await operation(other.client, 1, 'start')).error)
  assert.ok((await operation(cashier.client, 1, 'finish')).error)
  const request = randomUUID()
  assert.equal(ok(await operation(cashier.client, 1, 'start', request)).status, 'in_service')
  assert.equal(ok(await operation(cashier.client, 1, 'start', request)).revision, 2)
  assert.equal(ok(await operation(cashier.client, 2, 'finish')).status, 'finished')
  assert.equal(Number(ok(await admin.from('pos_transactions').select('total').eq('id', id).single()).total), 50000)
  assert.equal(ok(await admin.from('pos_transactions').select('id').eq('business_id', bid)).length, 1)
  passed = true
} finally {
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
