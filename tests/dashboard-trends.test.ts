import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateRevenueTrend,
  getPeriodRange,
  getTodayWib,
  toWibDateString,
  type TrendPeriod,
} from '../lib/dashboard-trends'
import type { Sale } from '../lib/pos'

const baseSale: Sale = {
  id: 's-1',
  business_id: 'b-1',
  actor_id: 'u-1',
  actor_name: 'Kasir 1',
  customer: 'Umum',
  lines: [],
  subtotal: 100000,
  discount_kind: 'none',
  discount_value: 0,
  discount: 0,
  total: 110000,
  tax_amount: 10000,
  payment: 'cash',
  received: 110000,
  change: 0,
  status: 'completed',
  created_at: '2026-11-07T05:00:00Z', // 12:00 WIB
  cancelled_at: null,
  cancelled_by_name: null,
  cancellation_reason: null,
  refund_amount: null,
}

test('dashboard trends: 7d generates 7 daily buckets in WIB', () => {
  const fixedNow = new Date('2026-11-07T12:00:00+07:00')
  const result = calculateRevenueTrend([], '7d', undefined, undefined, fixedNow)

  assert.equal(result.period, '7d')
  assert.equal(result.aggregation, 'daily')
  assert.equal(result.buckets.length, 7)
  assert.equal(result.startDate, '2026-11-01')
  assert.equal(result.endDate, '2026-11-07')
  assert.equal(result.totalRevenue, 0)
  assert.equal(result.totalCount, 0)
})

test('dashboard trends: calculates net revenue (total - tax) only for completed sales', () => {
  const fixedNow = new Date('2026-11-07T12:00:00+07:00')
  const sales: Sale[] = [
    {
      ...baseSale,
      id: 's-1',
      total: 110000,
      tax_amount: 10000, // net = 100000
      status: 'completed',
      created_at: '2026-11-07T04:00:00Z',
    },
    {
      ...baseSale,
      id: 's-2',
      total: 50000,
      tax_amount: 0, // net = 50000
      status: 'completed',
      created_at: '2026-11-07T06:00:00Z',
    },
    {
      ...baseSale,
      id: 's-cancelled',
      total: 200000,
      tax_amount: 0,
      status: 'cancelled', // MUST BE IGNORED
      created_at: '2026-11-07T05:00:00Z',
    },
    {
      ...baseSale,
      id: 's-outside',
      total: 100000,
      tax_amount: 0,
      status: 'completed',
      created_at: '2026-10-25T05:00:00Z', // Before 2026-11-01
    },
  ]

  const result = calculateRevenueTrend(sales, '7d', undefined, undefined, fixedNow)
  assert.equal(result.totalRevenue, 150000)
  assert.equal(result.totalCount, 2)

  // Last bucket (today, 2026-11-07) should have 150000
  const todayBucket = result.buckets[result.buckets.length - 1]
  assert.equal(todayBucket.amount, 150000)
  assert.equal(todayBucket.count, 2)
  assert.equal(todayBucket.isCurrent, true)
})

test('dashboard trends: weekly aggregation for 1m and 3m', () => {
  const fixedNow = new Date('2026-11-07T12:00:00+07:00')
  const res1m = calculateRevenueTrend([], '1m', undefined, undefined, fixedNow)
  assert.equal(res1m.aggregation, 'weekly')
  assert.ok(res1m.buckets.length >= 4 && res1m.buckets.length <= 6)

  const res3m = calculateRevenueTrend([], '3m', undefined, undefined, fixedNow)
  assert.equal(res3m.aggregation, 'weekly')
  assert.ok(res3m.buckets.length >= 12 && res3m.buckets.length <= 15)
})

test('dashboard trends: monthly aggregation for 6m and 1y', () => {
  const fixedNow = new Date('2026-11-07T12:00:00+07:00')
  const res6m = calculateRevenueTrend([], '6m', undefined, undefined, fixedNow)
  assert.equal(res6m.aggregation, 'monthly')
  assert.equal(res6m.buckets.length, 7) // 6 months back + current month
  assert.equal(res6m.buckets[res6m.buckets.length - 1].label, 'Nov')

  const res1y = calculateRevenueTrend([], '1y', undefined, undefined, fixedNow)
  assert.equal(res1y.aggregation, 'monthly')
  assert.equal(res1y.buckets.length, 13) // 12 months back + current month
  assert.equal(res1y.buckets[res1y.buckets.length - 1].label, 'Nov')
})

test('dashboard trends: custom period with date clamp and aggregation adjustment', () => {
  const fixedNow = new Date('2026-11-07T12:00:00+07:00')

  // Short custom range (7 days) -> daily
  const shortCustom = calculateRevenueTrend([], 'custom', '2026-11-01', '2026-11-07', fixedNow)
  assert.equal(shortCustom.aggregation, 'daily')
  assert.equal(shortCustom.buckets.length, 7)

  // Long custom range (70 days) -> weekly
  const longCustom = calculateRevenueTrend([], 'custom', '2026-08-01', '2026-10-10', fixedNow)
  assert.equal(longCustom.aggregation, 'weekly')

  // Very long custom range (250 days) -> monthly
  const veryLongCustom = calculateRevenueTrend([], 'custom', '2026-01-01', '2026-09-08', fixedNow)
  assert.equal(veryLongCustom.aggregation, 'monthly')

  // Invalid start > end clamps start to end
  const clamped = calculateRevenueTrend([], 'custom', '2026-11-10', '2026-11-05', fixedNow)
  assert.equal(clamped.startDate, '2026-11-05')
  assert.equal(clamped.endDate, '2026-11-05')
})

