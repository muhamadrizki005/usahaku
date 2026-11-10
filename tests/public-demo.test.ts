import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changeDemoQuantity, demoCartLines, demoCatalogs, demoCategories, isDemoCategory, makeDemoSales } from '../lib/public-demo'
import { calculateRevenueTrend } from '../lib/dashboard-trends'
import { NextRequest } from 'next/server'
import { updateSession } from '../lib/supabase/proxy'

test('public demo has independent catalogs and completed dummy sales for all three categories', () => {
  const now = new Date('2026-11-10T05:00:00Z')
  for (const category of demoCategories) {
    const sales = makeDemoSales(category, now)
    assert.equal(sales.length, 7)
    assert.ok(sales.every(sale => sale.status === 'completed' && sale.business_id === 'public-demo' && sale.actor_id === null))
    for (const sale of sales) assert.equal(sale.total, sale.lines.reduce((sum, line) => sum + line.price * line.quantity, 0))
    const trend = calculateRevenueTrend(sales, '7d', undefined, undefined, now)
    assert.equal(trend.buckets.length, 7)
    assert.ok(trend.buckets.every(bucket => bucket.amount > 0 && bucket.count === 1))
    assert.ok(isDemoCategory(category))
  }
  assert.equal(isDemoCategory('other'), false)
  assert.equal(isDemoCategory('../dashboard'), false)
  assert.equal(makeDemoSales('toko', now).at(-1)!.created_at, '2026-11-10T05:00:00.000Z')
})

test('demo cart totals follow quantity edits/removal without mutating fixtures or other categories', () => {
  const catalog = demoCatalogs.toko, before = JSON.stringify(demoCatalogs)
  const initial = {}, one = changeDemoQuantity(initial, catalog, 'susu', 1), two = changeDemoQuantity(one, catalog, 'susu', 1)
  assert.deepEqual(initial, {})
  assert.deepEqual(one, { susu: 1 })
  assert.equal(demoCartLines(two, catalog)[0].total, 36000)
  assert.deepEqual(changeDemoQuantity(two, catalog, 'susu', -2), {})
  assert.deepEqual(changeDemoQuantity(two, catalog, 'susu', 100000), { susu: 99 })
  assert.deepEqual(changeDemoQuantity(two, catalog, 'kopi-susu', 1), two)
  assert.deepEqual(changeDemoQuantity(two, catalog, 'susu', NaN), two)
  assert.deepEqual(demoCartLines({ susu: -1, roti: 1.5, minyak: 100 }, catalog), [])
  assert.equal(JSON.stringify(demoCatalogs), before)
})

test('demo routes bypass session refresh, keep existing cookies untouched and remain public', async () => {
  for (const path of ['/demo', '/demo/toko', '/demo/restoran?view=kasir', '/demo/salon?view=ai']) {
    const response = await updateSession(new NextRequest('http://localhost:3000' + path, { headers: { Cookie: 'some-existing-session=keep-me' } }))
    assert.equal(response.status, 200)
    assert.deepEqual(response.cookies.getAll(), [])
    assert.equal(response.headers.get('location'), null)
  }
})
