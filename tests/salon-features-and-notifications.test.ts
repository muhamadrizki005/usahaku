import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getNotificationCategories,
  notificationMatchesCategory,
  getNotificationCategoryDefinition,
  type NotificationCategory,
} from '../lib/notifications'
import {
  DEFAULT_SALON_BENEFITS,
  calculateDiscountedPrice,
} from '../lib/salon-benefits'

test('notification categories: business category specific filters and labels', () => {
  // Barbershop
  const salonCats = getNotificationCategories('barbershop')
  const salonKeys = salonCats.map(c => c.key)
  const salonLabels = salonCats.map(c => c.label)

  assert.deepEqual(salonKeys, [
    'all',
    'service',
    'product',
    'appointment',
    'customer',
    'practitioner',
    'transaction',
    'staff',
    'system',
  ])

  assert.deepEqual(salonLabels, [
    'Semua',
    'Layanan',
    'Produk',
    'Janji Temu',
    'Pelanggan',
    'Penata / Terapis',
    'Transaksi',
    'Staf',
    'Sistem',
  ])

  // Explicit verification: NO Meja, NO Reservasi on Barbershop
  assert.equal(salonKeys.includes('table' as any), false)
  assert.equal(salonKeys.includes('reservation' as any), false)
  assert.equal(salonLabels.includes('Meja'), false)
  assert.equal(salonLabels.includes('Reservasi'), false)

  // Restaurant
  const restaurantCats = getNotificationCategories('restaurant')
  const restaurantKeys = restaurantCats.map(c => c.key)
  const restaurantLabels = restaurantCats.map(c => c.label)

  assert.deepEqual(restaurantKeys, [
    'all',
    'menu',
    'order',
    'table',
    'reservation',
    'transaction',
    'staff',
    'system',
  ])
  assert.deepEqual(restaurantLabels, [
    'Semua',
    'Menu',
    'Pesanan',
    'Meja',
    'Reservasi',
    'Transaksi',
    'Staf',
    'Sistem',
  ])

  // Store
  const storeCats = getNotificationCategories('store')
  const storeKeys = storeCats.map(c => c.key)
  const storeLabels = storeCats.map(c => c.label)

  assert.deepEqual(storeKeys, [
    'all',
    'product',
    'inventory',
    'transaction',
    'customer',
    'staff',
    'system',
  ])
  assert.deepEqual(storeLabels, [
    'Semua',
    'Produk',
    'Inventori / Stok',
    'Transaksi',
    'Pelanggan',
    'Staf',
    'Sistem',
  ])
})

test('notification category matching logic respects business category', () => {
  // Barbershop matching
  assert.equal(notificationMatchesCategory('service', 'service', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('product', 'product', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('low_stock', 'product', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('inventory', 'product', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('appointment', 'appointment', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('reservation', 'appointment', 'barbershop'), true) // legacy alias
  assert.equal(notificationMatchesCategory('practitioner', 'practitioner', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('customer', 'customer', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('transaction', 'transaction', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('staff', 'staff', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('system', 'system', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('service', 'all', 'barbershop'), true)
  assert.equal(notificationMatchesCategory('table', 'service', 'barbershop'), false)

  // Restaurant matching
  assert.equal(notificationMatchesCategory('product', 'menu', 'restaurant'), true)
  assert.equal(notificationMatchesCategory('menu', 'menu', 'restaurant'), true)
  assert.equal(notificationMatchesCategory('order', 'order', 'restaurant'), true)
  assert.equal(notificationMatchesCategory('table', 'table', 'restaurant'), true)
  assert.equal(notificationMatchesCategory('reservation', 'reservation', 'restaurant'), true)

  // Store matching
  assert.equal(notificationMatchesCategory('low_stock', 'inventory', 'store'), true)
  assert.equal(notificationMatchesCategory('inventory', 'inventory', 'store'), true)
  assert.equal(notificationMatchesCategory('product', 'product', 'store'), true)
})

test('notification definition resolution per business category', () => {
  const salonServiceDef = getNotificationCategoryDefinition('service', 'barbershop')
  assert.equal(salonServiceDef.label, 'Layanan')
  assert.equal(salonServiceDef.key, 'service')

  const salonProductDef = getNotificationCategoryDefinition('product', 'barbershop')
  assert.equal(salonProductDef.label, 'Produk')
  assert.equal(salonProductDef.key, 'product')

  const salonPracDef = getNotificationCategoryDefinition('practitioner', 'barbershop')
  assert.equal(salonPracDef.label, 'Penata / Terapis')
  assert.equal(salonPracDef.key, 'practitioner')

  const restMenuDef = getNotificationCategoryDefinition('menu', 'restaurant')
  assert.equal(restMenuDef.label, 'Menu')

  const storeProdDef = getNotificationCategoryDefinition('product', 'store')
  assert.equal(storeProdDef.label, 'Produk')
})

test('salon benefits and discount calculations', () => {
  // Default benefits
  assert.deepEqual(DEFAULT_SALON_BENEFITS, [
    'Free Styling',
    'Hot Towel',
    'Free Wash',
    'Hair Consultation',
    'Head Massage',
    'Free Hair Product',
  ])

  // Discount: percentage
  assert.equal(calculateDiscountedPrice(50000, 'percent', 10), 45000)
  assert.equal(calculateDiscountedPrice(50000, 'percent', 25), 37500)
  assert.equal(calculateDiscountedPrice(50000, 'percent', 100), 0)
  assert.equal(calculateDiscountedPrice(50000, 'percent', 150), 0) // clamped
  assert.equal(calculateDiscountedPrice(50000, 'percent', 0), 50000)

  // Discount: amount
  assert.equal(calculateDiscountedPrice(75000, 'amount', 15000), 60000)
  assert.equal(calculateDiscountedPrice(75000, 'amount', 75000), 0)
  assert.equal(calculateDiscountedPrice(75000, 'amount', 100000), 0) // clamped
  assert.equal(calculateDiscountedPrice(75000, 'amount', 0), 75000)

  // Discount: none
  assert.equal(calculateDiscountedPrice(100000, 'none', 20), 100000)
})

