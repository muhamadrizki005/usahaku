import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('prepaid salon visits retain manual service progression, atomic checkout and tenant/role restrictions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated; grant all on storage.objects,storage.buckets to service_role;`)
    const migration = '202611100005_salon_prepaid_service_status.sql'
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && f < migration).sort()) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    }
    const owner = randomUUID(), cashier = randomUUID(), admin = randomUUID(), other = randomUUID()
    for (const id of [owner, cashier, admin, other]) await db.query('insert into auth.users(id) values($1)', [id])
    const as = async (id: string) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec('set role authenticated')
    }
    const rpc = async (name: string, args: unknown[]) => (await db.query<any>(
      'select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') value', args)).rows[0].value
    await as(owner)
    const bid = await rpc('create_business_profile_for_category', ['barbershop', 'Salon Uji', 'Owner', '081234567890', 'Jalan', 'Bandung', 'Jawa Barat', ''])
    await rpc('complete_business_onboarding', [bid])
    const hours = Object.fromEntries(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map(d => [d, { open: '00:00', close: '23:59', closed: false }]))
    await rpc('save_business_hours', [bid, 0, hours])
    const sid = randomUUID(), pid = randomUUID()
    await rpc('save_salon_resource', [bid, 'service', sid, null, randomUUID(), { name: 'Potong', price: '50000', duration: '30', active: true }])
    await rpc('save_salon_resource', [bid, 'practitioner', pid, null, randomUUID(), { name: 'Rina', active: true, serviceIds: [sid], schedule: hours }])
    await db.exec('reset role')
    for (const [id, role] of [[cashier, 'cashier'], [admin, 'admin']]) await db.query(
      "insert into public.business_members(business_id,user_id,name,username,role,must_change_password) values($1,$2,'Staf',$3,$4,false)", [bid, id, id.slice(0, 8), role])
    // Keep a paid, finished visit from the previous schema to verify migration preservation.
    const now = Date.parse((await db.query<any>('select now() t')).rows[0].t)
    const start = new Date(now - 60000).toISOString(), end = new Date(now + 29 * 60000).toISOString()
    const lines = [{ id: sid, name: 'Potong', sku: '', unit: 'layanan', price: 50000, quantity: 1, total: 50000, duration: 30, revision: 1 }]
    const saleId = randomUUID(), visitId = randomUUID()
    const sale = { id: saleId, business_id: bid, actor_id: cashier, actor_name: 'Staf', customer_id: null, customer: 'Umum', lines,
      subtotal: 50000, discount_kind: 'none', discount_value: 0, discount: 0, total: 50000, payment: 'cash', received: 50000, change: 0,
      status: 'completed', tax_rate: 0, tax_amount: 0, service_rate: 0, service_amount: 0, tax_base: 'net', receipt_number: 'SLN-TEST',
      points_earned: 0, deposit_amount: 0, deposit_payment: null, balance_received: 50000, product_discount: 0, order_discount: 0 }
    const visit = { id: visitId, business_id: bid, actor_id: cashier, actor_name: 'Staf', practitioner_id: pid, practitioner_name: 'Rina',
      customer_id: null, customer: 'Umum', phone: '', notes: '', kind: 'walk_in', starts_at: start, ends_at: end,
      buffer_minutes: 0, busy_until: end, lines, subtotal: 50000, status: 'waiting', arrived_at: start, started_at: null, finished_at: null,
      sale_id: saleId, deposit_amount: 0, deposit_payment: null, deposit_refunded: 0, revision: 1 }
    await as(owner)
    const legacyId = randomUUID()
    const legacyOp = (revision: number | null, action: string, details: unknown = {}) => rpc('salon_visit_operation', [bid, legacyId, revision, randomUUID(), action, details])
    await legacyOp(null, 'save', { practitionerId: pid, customerId: null, customer: 'Riwayat lama', phone: '', notes: '', kind: 'walk_in', startsAt: start, serviceIds: [sid], deposit: null })
    await legacyOp(1, 'start')
    await legacyOp(2, 'finish')
    const legacy = await legacyOp(3, 'pay', { payment: 'cash', received: '50000', discountKind: 'none', discountValue: '0', confirmed: true, paymentRevision: 0, settingsRevision: 0 })
    await db.exec('reset role')
    const oldVisit = (await db.query('select * from public.salon_visits where id=$1', [legacyId])).rows
    const oldSale = (await db.query('select * from public.pos_transactions where id=$1', [legacy.sale_id])).rows
    await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'))
    assert.deepEqual((await db.query('select * from public.salon_visits where id=$1', [legacyId])).rows, oldVisit)
    assert.deepEqual((await db.query('select * from public.pos_transactions where id=$1', [legacy.sale_id])).rows, oldSale)
    await as(cashier)
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, cashier, sale, visit]), /permission denied/)
    await db.exec('reset role; set role service_role')
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, other, sale, visit]), /denied/)
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, cashier, sale, { ...visit, status: 'finished' }]), /state/)
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, cashier, sale, { ...visit, subtotal: -1 }]), /constraint/)
    assert.equal((await db.query('select id from public.pos_transactions where id=$1', [saleId])).rows.length, 0)
    const result = await rpc('commit_salon_cart_checkout', [bid, cashier, sale, visit])
    assert.equal(result.sale.status, 'completed')
    assert.equal(result.visit.status, 'waiting')
    assert.equal(result.visit.started_at, null)
    assert.equal(result.visit.finished_at, null)
    const financialSnapshot = (await db.query('select * from public.pos_transactions where id=$1', [saleId])).rows
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, cashier, { ...sale, id: randomUUID() }, { ...visit, id: randomUUID() }]), /state/)
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, cashier, { ...sale, id: randomUUID() }, { ...visit, id: randomUUID(), sale_id: null }]), /state/)
    const nextSale = randomUUID()
    await assert.rejects(rpc('commit_salon_cart_checkout', [bid, cashier, { ...sale, id: nextSale }, { ...visit, id: randomUUID(), sale_id: nextSale }]), /Slot/)
    await assert.rejects(db.query("update public.salon_visits set status='cancelled',cancellation_reason='Batal' where id=$1", [visitId]), /refund/)
    const operation = (revision: number, action: string, details: unknown = {}, request = randomUUID()) => rpc('salon_visit_operation', [bid, visitId, revision, request, action, details])
    await as(owner)
    await assert.rejects(operation(1, 'finish'), /Mulai pelayanan/)
    await as(other)
    await assert.rejects(operation(1, 'start'), /denied/)
    await as(cashier)
    await assert.rejects(operation(1, 'pay', { payment: 'cash', received: '50000', discountKind: 'none', discountValue: '0', confirmed: true, paymentRevision: 0, settingsRevision: 0 }), /[Ss]elesai|dibayar/)
    await assert.rejects(operation(1, 'deposit', { amount: '1000', payment: 'cash', confirmed: true, paymentRevision: 0 }), /DP/)
    const req = randomUUID()
    assert.equal((await operation(1, 'start', {}, req)).status, 'in_service')
    assert.equal((await operation(1, 'start', {}, req)).revision, 2)
    await assert.rejects(operation(1, 'finish'), /changed|reload|berubah/)
    assert.equal((await operation(2, 'finish')).status, 'finished')
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from public.pos_transactions where id=$1', [saleId])).rows, financialSnapshot)
    const historicalVisit = (await db.query('select * from public.salon_visits where id=$1', [visitId])).rows
    // A second paid visit remains active until an owner/admin confirms a full manual refund.
    const sale2 = randomUUID(), visit2 = randomUUID(), future = new Date(now + 86400000).toISOString(), futureEnd = new Date(now + 86400000 + 1800000).toISOString()
    await db.exec('set role service_role')
    const futureResult = await rpc('commit_salon_cart_checkout', [bid, owner, { ...sale, id: sale2, actor_id: owner, receipt_number: 'SLN-TEST2' },
      { ...visit, id: visit2, actor_id: owner, sale_id: sale2, kind: 'appointment', status: 'scheduled', starts_at: future, ends_at: futureEnd, busy_until: futureEnd }])
    assert.equal(futureResult.visit.status, 'scheduled')
    assert.equal(futureResult.visit.arrived_at, null)
    await as(cashier)
    await assert.rejects(rpc('salon_visit_operation', [bid, visit2, 1, randomUUID(), 'arrive', {}]), /denied/)
    await assert.rejects(rpc('cancel_salon_sale', [bid, sale2, 'Batal uji', true, true]), /denied/)
    await as(admin)
    await assert.rejects(rpc('cancel_salon_sale', [bid, sale2, 'Batal uji', true, false]), /Confirm/)
    await rpc('cancel_salon_sale', [bid, sale2, 'Refund penuh uji', true, true])
    await db.exec('reset role')
    assert.equal((await db.query<any>('select status from public.salon_visits where id=$1', [visit2])).rows[0].status, 'cancelled')
    assert.deepEqual((await db.query('select * from public.salon_visits where id=$1', [visitId])).rows, historicalVisit)
    assert.deepEqual((await db.query('select * from public.pos_transactions where id=$1', [saleId])).rows, financialSnapshot)
  } finally { await db.close() }
})
