import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options)
const users = [], businesses = [], results = []
const ok = response => { if (response.error) throw Error('Fixture/RPC failed: ' + response.error.code); return response.data }
const denied = (response, code) => { assert.ok(response.error, 'Forbidden operation unexpectedly succeeded'); if (code) assert.equal(response.error.code, code) }
const legacyIds = ok(await admin.from('businesses').select('id')).map(b => b.id)
async function snapshot() {
  const data = {}
  for (const [table, order] of [['businesses', 'id'], ['business_members', 'id'], ['staff_audit_logs', 'id'], ['catalog_products', 'id'], ['stock_movements', 'id'], ['pos_transactions', 'id'], ['customers', 'id'], ['restaurant_menu', 'id'], ['restaurant_tables', 'id'], ['restaurant_orders', 'id'], ['restaurant_audit', 'id'], ['restaurant_requests', 'request_id']]) {
    const rows = []
    for (let start = 0; ; start += 500) {
      const batch = ok(await admin.from(table).select('*').in(table === 'businesses' ? 'id' : 'business_id', legacyIds).order(order).range(start, start + 499))
      rows.push(...batch); if (batch.length < 500) break
    }
    data[table] = rows
  }
  return createHash('sha256').update(JSON.stringify(data)).digest('hex')
}
async function account(role = 'owner', businessId) {
  const email = `usahaku-restaurant-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url')
  const uid = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: role === 'owner' ? 'owner' : 'staff' } })).user.id
  users.push(uid)
  const supabase = client(); ok(await supabase.auth.signInWithPassword({ email, password }))
  if (businessId) ok(await admin.from('business_members').insert({ business_id: businessId, user_id: uid, name: 'Petugas Uji', username: uid.replaceAll('-', '').slice(0, 10), role, must_change_password: false }))
  return { uid, supabase }
}
async function business(owner, category = 'restaurant', complete = true) {
  const id = ok(await owner.supabase.rpc('create_business_profile_for_category', { business_category: category, store_name: 'Restoran Uji Backend', owner_name: 'Pemilik Uji', store_phone: '081234567890', store_street: 'Jalan Uji', store_city: 'Bandung', store_province: 'Jawa Barat', store_description: '' }))
  businesses.push(id)
  if (complete) ok(await owner.supabase.rpc('complete_business_onboarding', { target_id: id }))
  return id
}
let passed = false, cleanup = false, legacyUnchanged = false, before
try {
  before = await snapshot()
  const owner = await account(), other = await account(), storeOwner = await account()
  const id = await business(owner), foreign = await business(other), store = await business(storeOwner, 'store')
  const a = await account('cashier', id), b = await account('cashier', id), manager = await account('admin', id)
  const menuId = randomUUID(), tableId = randomUUID(), menu = { name: 'Kopi Susu Uji', category: 'Minuman', price: '15000', available: true, active: true }
  const resource = (who, resource, item_id, expected_revision, details, operation_id = randomUUID()) => who.supabase.rpc('save_restaurant_resource', { target_id: id, resource, item_id, expected_revision, operation_id, details })
  ok(await resource(owner, 'menu', menuId, null, menu)); ok(await resource(manager, 'table', tableId, null, { name: 'Meja 1', capacity: 4, active: true }))
  denied(await resource(a, 'menu', menuId, 0, menu), '42501')
  denied(await other.supabase.rpc('save_restaurant_resource', { target_id: foreign, resource: 'menu', item_id: menuId, expected_revision: null, operation_id: randomUUID(), details: menu }), '42501')
  assert.equal(ok(await other.supabase.from('restaurant_menu').select('id').eq('business_id', id)).length, 0)
  const details = { kind: 'dine_in', tableId, guests: 2, customer: 'Pelanggan umum', notes: 'Tanpa gula', stage: 'new', lines: [{ id: menuId, quantity: 2 }] }
  const save = (who, item_id, expected_revision, data = details, operation_id = randomUUID()) => who.supabase.rpc('save_restaurant_order', { target_id: id, item_id, expected_revision, operation_id, details: data })
  const orderId = randomUUID(), request = randomUUID()
  const first = ok(await save(a, orderId, null, details, request)); assert.equal(first.subtotal, 30000)
  assert.deepEqual(ok(await save(a, orderId, null, details, request)), first)
  denied(await save(b, orderId, 0), '42501')
  denied(await save(b, randomUUID(), null), 'PT409')
  assert.equal(ok(await b.supabase.from('restaurant_orders').select('*')).length, 0)
  assert.equal(ok(await b.supabase.rpc('restaurant_table_usage', { target_id: id }))[0].occupied, true)
  denied(await resource(owner, 'table', tableId, 0, { name: 'Meja 1', capacity: 1, active: true }), 'PT409')
  const revisions = await Promise.all([save(a, orderId, 0, { ...details, stage: 'preparing' }), save(a, orderId, 0, { ...details, stage: 'ready' })])
  assert.equal(revisions.filter(r => !r.error).length, 1); assert.equal(revisions.filter(r => r.error?.code === 'PT409').length, 1)
  ok(await resource(owner, 'menu', menuId, 0, { ...menu, available: false, price: '17000' }))
  const edited = ok(await save(a, orderId, 1, { ...details, stage: 'served' })); assert.equal(edited.subtotal, 30000)
  const payment = { payment: 'cash', received: '50000', discountKind: 'none', discountValue: '0', confirmed: true }
  const pay = (who, item_id, expected_revision, data = payment, operation_id = randomUUID()) => who.supabase.rpc('pay_restaurant_order', { target_id: id, item_id, expected_revision, operation_id, details: data })
  denied(await pay(b, orderId, 2), '42501')
  denied(await pay(a, orderId, 2, { ...payment, discountKind: 'amount', discountValue: '1000' }), '42501')
  denied(await pay(a, orderId, 2, { ...payment, confirmed: false }), '22023')
  const paymentId = randomUUID(), paidTwice = await Promise.all([pay(a, orderId, 2, payment, paymentId), pay(a, orderId, 2, payment, paymentId)])
  const paid = ok(paidTwice[0]); assert.equal(ok(paidTwice[1]).sale.id, paid.sale.id)
  assert.equal(paid.sale.total, 30000); assert.equal(paid.sale.change, 20000)
  assert.equal(ok(await a.supabase.from('pos_transactions').select('id')).length, 1)
  assert.equal(ok(await b.supabase.from('pos_transactions').select('id')).length, 0)
  assert.equal(ok(await a.supabase.rpc('restaurant_table_usage', { target_id: id }))[0].occupied, false)
  denied(await pay(a, orderId, 2), 'PT409')
  results.push('Actual hosted menu/table role isolation, occupied-table metadata, concurrent revisions and exactly-once payment passed')
  ok(await resource(owner, 'menu', menuId, 1, menu))
  const ids = [randomUUID(), randomUUID()]
  const contention = await Promise.all(ids.map((oid, index) => save(index ? b : a, oid, null)))
  assert.equal(contention.filter(r => !r.error).length, 1); assert.equal(contention.filter(r => r.error?.code === 'PT409').length, 1)
  const winner = contention.findIndex(r => !r.error), waiter = winner ? b : a
  ok(await waiter.supabase.rpc('cancel_restaurant_order', { target_id: id, item_id: ids[winner], expected_revision: 0, explanation: 'Pelanggan membatalkan' }))
  const takeawayId = randomUUID(); ok(await save(b, takeawayId, null, { ...details, kind: 'takeaway', tableId: null }))
  const qris = ok(await pay(manager, takeawayId, 0, { payment: 'qris', received: '29000', discountKind: 'amount', discountValue: '1000', confirmed: true }))
  assert.equal(qris.sale.total, 29000)
  assert.equal(ok(await b.supabase.from('restaurant_orders').select('id').eq('id', takeawayId)).length, 0)
  const transferId = randomUUID(); ok(await save(a, transferId, null, { ...details, kind: 'takeaway', tableId: null, lines: [{ id: menuId, quantity: 1 }] }))
  const transfer = ok(await pay(a, transferId, 0, { payment: 'transfer', received: '15000', discountKind: 'none', discountValue: '0', confirmed: true })); assert.equal(transfer.sale.total, 15000)
  denied(await a.supabase.rpc('cancel_restaurant_sale', { target_id: id, sale_id: paid.sale.id, explanation: 'Pembatalan penuh', goods_returned: true, refund_confirmed: true }), '42501')
  const cancel = () => owner.supabase.rpc('cancel_restaurant_sale', { target_id: id, sale_id: paid.sale.id, explanation: 'Pembatalan penuh', goods_returned: true, refund_confirmed: true })
  const cancelled = ok(await cancel()); assert.equal(cancelled.refund_amount, 30000); assert.deepEqual(ok(await cancel()), cancelled)
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), next = new Date(new Date(day + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
  const filter = { target_id: id, from_ts: day + 'T00:00:00+07:00', to_ts: next + 'T00:00:00+07:00', payment_method: 'all' }
  const report = ok(await owner.supabase.rpc('read_sales_report', filter)); assert.equal(report.sales.length, 3); assert.equal(report.refunds.length, 1)
  assert.equal(report.sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + Number(s.total), 0), 44000)
  denied(await a.supabase.rpc('read_sales_report', filter), '42501')
  denied(await other.supabase.rpc('read_sales_report', filter), '42501')
  assert.equal(ok(await admin.from('stock_movements').select('id').eq('business_id', id)).length, 0)
  denied(await storeOwner.supabase.rpc('save_restaurant_order', { target_id: store, item_id: randomUUID(), expected_revision: null, operation_id: randomUUID(), details }), '42501')
  ok(await admin.from('business_members').update({ active: false }).eq('user_id', a.uid))
  denied(await pay(a, orderId, 2, payment, paymentId), '42501')
  results.push('Actual table contention, takeaway, cash/QRIS/transfer, owner/admin discounts, cashier own-history, manual refunds, reports and deactivation passed; restaurant inventory untouched')
  passed = true
} finally {
  if (users.length) for (const row of ok(await admin.from('businesses').select('id').in('owner_id', users))) if (!businesses.includes(row.id)) businesses.push(row.id)
  for (const id of businesses) { ok(await admin.from('staff_audit_logs').delete().eq('business_id', id)); ok(await admin.from('business_members').delete().eq('business_id', id)); ok(await admin.from('businesses').delete().eq('id', id)) }
  for (const id of users) ok(await admin.auth.admin.deleteUser(id))
  cleanup = true; if (before) { legacyUnchanged = await snapshot() === before; assert.ok(legacyUnchanged) }
  await mkdir('.cache/restaurant', { recursive: true }); await writeFile('.cache/restaurant/backend-results.json', JSON.stringify({ passed, cleanup, legacyUnchanged, results }, null, 2))
}
console.log(JSON.stringify({ passed, cleanup, legacyUnchanged, results }, null, 2))
