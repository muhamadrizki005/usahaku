import { test } from 'node:test'
import assert from 'node:assert/strict'
import { restaurantFailure } from '../lib/restaurant-errors'
import { restaurantTableSchema, restaurantOrderSchema } from '../lib/restaurant'

const failure = (reason: Record<string, unknown>, code = 'PT409') => restaurantFailure({ code, details: JSON.stringify(reason) })
test('restaurant errors explain exact capacity, availability and payment causes without exposing raw errors', () => {
  assert.match(failure({ reason: 'table_capacity', capacity: 4, guests: 6 }).error!, /hanya muat 4 orang.*jumlah tamu 6 orang/)
  assert.match(failure({ reason: 'table_busy_capacity', capacity: 1, guests: 2 }).error!, /dipakai oleh 2 tamu.*menjadi 1 orang/)
  assert.match(failure({ reason: 'table_busy_deactivate' }).error!, /belum bisa dinonaktifkan/)
  assert.match(failure({ reason: 'table_occupied' }).error!, /sedang terpakai/)
  assert.match(failure({ reason: 'table_inactive' }).error!, /sedang nonaktif/)
  assert.match(failure({ reason: 'menu_out', name: 'Kopi Susu' }).error!, /Menu "Kopi Susu" sedang habis/)
  assert.match(failure({ reason: 'menu_inactive' }).error!, /dinonaktifkan/)
  assert.match(failure({ reason: 'menu_missing' }).error!, /sudah tidak tersedia/)
  assert.match(failure({ reason: 'order_paid' }).error!, /sudah dibayar/)
  assert.match(failure({ reason: 'order_cancelled' }).error!, /sudah dibatalkan/)
  assert.match(failure({ reason: 'order_revision' }).error!, /petugas atau tab lain/)
  assert.match(failure({ reason: 'payment_short', received: 10000, total: 30000 }, '22023').error!, /kurang Rp20.000/)
  assert.match(failure({ reason: 'payment_exact', total: 30000 }, '22023').error!, /sesuai total Rp30.000/)
  assert.match(restaurantFailure({ code: '23505', message: 'duplicate key value violates unique constraint "restaurant_table_name"', details: 'secret database row' }, 'table').error!, /Nama\/nomor meja sudah dipakai/)
  assert.match(restaurantFailure({ code: 'PT409', message: 'Menu changed; reload' }, 'menu').error!, /Menu telah diperbarui/)
  assert.match(restaurantFailure({ code: 'PT409', message: 'Table changed; reload' }, 'table').error!, /Data meja telah diperbarui/)
})

test('only whitelisted rollback errors are definite; unknown/service errors stay uncertain and private', () => {
  for (const details of ['not json', '[]', 'null', '{"reason":"__proto__"}', JSON.stringify({ reason: 'menu_out', name: 'x'.repeat(101) }), JSON.stringify({ reason: 'table_capacity', capacity: 'secret', guests: 6 }), JSON.stringify({ reason: 'payment_short', received: -1, total: 30000 }), 'x'.repeat(3000)]) {
    const result = restaurantFailure({ code: 'PT409', message: 'secret backend SQL', details })
    assert.equal(result.uncertain, false); assert.equal(result.error!.includes('secret'), false)
  }
  for (const code of [undefined, 'XX000', 'PGRST000']) { const result = restaurantFailure({ code, message: 'secret DB text', details: '{"reason":"order_paid"}' }); assert.equal(result.uncertain, true); assert.equal(result.error!.includes('sudah dibayar'), false); assert.equal(result.error!.includes('secret'), false) }
  assert.equal(restaurantFailure({ code: '42501', details: '{"reason":"menu_out","name":"Hidden name"}' }).error!.includes('Hidden'), false)
  assert.equal(restaurantFailure({ code: 'PGRST202' }).uncertain, false)
  assert.match(restaurantFailure({ code: '42501', message: 'Discount access denied' }).error!, /owner atau admin/)
})

test('restaurant form validation identifies the field in Indonesian', () => {
  const capacity = restaurantTableSchema.safeParse({ name: 'Meja 1', capacity: 0, active: true })
  assert.equal(capacity.success, false); if (!capacity.success) assert.equal(capacity.error.issues[0].message, 'Kapasitas meja minimal 1 orang.')
  const empty = restaurantOrderSchema.safeParse({ kind: 'takeaway', tableId: null, guests: 1, customer: 'Pelanggan umum', notes: '', stage: 'new', lines: [] })
  assert.equal(empty.success, false); if (!empty.success) assert.equal(empty.error.issues[0].message, 'Tambahkan minimal satu menu ke pesanan.')
})
