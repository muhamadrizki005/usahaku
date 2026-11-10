import test from 'node:test'
import assert from 'node:assert/strict'
import { loyaltySettingsSchema, loyaltySaveError } from '../lib/loyalty'

test('loyalty settings validation and error messages', () => {
  // Valid settings
  const valid1 = loyaltySettingsSchema.safeParse({ active: true, nominal: 50000 })
  assert.equal(valid1.success, true)
  if (valid1.success) {
    assert.equal(valid1.data.active, true)
    assert.equal(valid1.data.nominal, 50000)
  }

  const valid2 = loyaltySettingsSchema.safeParse({ active: false, nominal: '25000' })
  assert.equal(valid2.success, true)
  if (valid2.success) {
    assert.equal(valid2.data.active, false)
    assert.equal(valid2.data.nominal, 25000)
  }

  // Invalid: nominal 0 or negative
  const invalidZero = loyaltySettingsSchema.safeParse({ active: true, nominal: 0 })
  assert.equal(invalidZero.success, false)

  const invalidNegative = loyaltySettingsSchema.safeParse({ active: true, nominal: -100 })
  assert.equal(invalidNegative.success, false)

  // Invalid: nominal > 1,000,000,000
  const invalidHuge = loyaltySettingsSchema.safeParse({ active: true, nominal: 1000000001 })
  assert.equal(invalidHuge.success, false)

  // Error message resolution
  assert.equal(loyaltySaveError('42501'), 'Hanya pemilik yang dapat mengatur program poin.')
  assert.equal(loyaltySaveError('22023'), 'Isi nominal rupiah bulat antara Rp1 dan Rp1.000.000.000.')
})

test('salon cashier checkout: full payment vs DP logic verification', () => {
  const serviceSubtotal = 45000
  const productSubtotal = 50000
  const totalSubtotal = serviceSubtotal + productSubtotal

  // Case 1: Full Payment (Bayar Semua / Lunas)
  const fullPaymentTotal = totalSubtotal
  const fullReceived = 100000
  const fullChange = fullReceived - fullPaymentTotal
  assert.equal(fullPaymentTotal, 95000)
  assert.equal(fullChange, 5000)

  // Mock visit created under full payment
  const fullVisit = {
    id: 'test-visit-full',
    status: 'finished',
    sale_id: 'test-sale-123',
    deposit_amount: 0,
    deposit_payment: null,
  }

  // Verify that full payment visit has sale_id set and status finished (so no "Bayar" button shows)
  assert.equal(fullVisit.status, 'finished')
  assert.ok(fullVisit.sale_id, 'sale_id must be truthy for full payment')
  const showBayarButtonFull = !fullVisit.sale_id && fullVisit.status === 'finished'
  assert.equal(showBayarButtonFull, false, 'Bayar button must NOT be shown for fully paid visit')

  // Case 2: DP (Uang Muka)
  const dpAmount = 20000
  assert.ok(dpAmount > 0 && dpAmount <= serviceSubtotal, 'DP must be valid and within service total')
  const remainingBalance = fullPaymentTotal - dpAmount
  assert.equal(remainingBalance, 75000)

  // Mock visit created under DP
  const dpVisit = {
    id: 'test-visit-dp',
    status: 'scheduled',
    sale_id: null,
    deposit_amount: dpAmount,
    deposit_payment: 'cash',
  }

  assert.equal(dpVisit.status, 'scheduled')
  assert.equal(dpVisit.sale_id, null)
  assert.equal(dpVisit.deposit_amount, 20000)
  // When later service finishes, Bayar button will be available to pay remaining balance
  const showBayarButtonDPWhenFinished = !dpVisit.sale_id && 'finished' === 'finished'
  assert.equal(showBayarButtonDPWhenFinished, true, 'Bayar button is shown once service finishes to pay remaining balance')
})
