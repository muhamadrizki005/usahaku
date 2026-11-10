import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareStoreCheckout, storeCheckoutQuote } from '../lib/store-checkout'

test('ordinary checkout omits unused redemption fields for every payment method without changing totals', () => {
  for (const payment of ['cash', 'qris', 'transfer', 'ewallet']) {
    const expected = { payment, received: '9000', lines: [{ id: 'product', quantity: '1' }], discountKind: 'percent', discountValue: '10', paymentRevision: 3, confirmed: true }
    const input = { ...expected, pointsRedeemed: 0, redemptionReason: undefined }
    assert.deepEqual(prepareStoreCheckout(input), expected)
    assert.equal(input.pointsRedeemed, 0)
    assert.deepEqual(prepareStoreCheckout(prepareStoreCheckout(input)), expected)
  }
})

test('redemption requires a rule ID and valid points, and cannot be silently discarded', () => {
  for (const pointsRedeemed of [1, 100, -1, 0.5, '0', '100', null, NaN, true]) {
    assert.throws(() => prepareStoreCheckout({ payment: 'qris', pointsRedeemed }), /penukaran poin tidak valid/)
  }
  assert.deepEqual(prepareStoreCheckout({payment:'qris',pointsRedeemed:10,redemptionId:'voucher-10',redemptionReason:'untrusted'}),{payment:'qris',pointsRedeemed:10,redemptionId:'voucher-10'})
})

test('points reduce the taxable base and product rewards use actual discounted quantities', () => {
  const cart=[{product:{id:'milk',price:100000},quantity:1}]
  const quote=storeCheckoutQuote(cart,11,'none','0',{id:'reward',points_required:10,reward_type:'voucher',voucher_amount:10000})
  assert.equal(quote.pointDiscount,10000);assert.equal(quote.tax,9900);assert.equal(quote.total,99900)
  const product=storeCheckoutQuote([{product:{id:'rice',price:16000,discountKind:'percent' as const,discountValue:10},quantity:0.25}],11,'none','0',{id:'rice-reward',points_required:10,reward_type:'product',product_id:'rice'})
  assert.equal(product.pointDiscount,3600);assert.equal(product.tax,0);assert.equal(product.total,0)
  assert.throws(()=>storeCheckoutQuote(cart,11,'none','0',{id:'missing',points_required:10,reward_type:'product',product_id:'other'}),/Tambahkan produk hadiah/)
})

test('other invalid checkout properties remain available for strict database validation', () => {
  const input = { payment: 'qris', unexpectedProperty: 1 }
  assert.deepEqual(prepareStoreCheckout(input), input)
  for (const value of [null, undefined, [], 'invalid', 12]) assert.equal(prepareStoreCheckout(value), value)
})
