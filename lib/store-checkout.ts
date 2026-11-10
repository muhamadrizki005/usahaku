import { checkoutQuote, discountedPrice, productQuote, type ProductDiscount } from './product-pricing'
import { lineAmount } from './pos'
import type { LoyaltyRedemptionRule } from './loyalty'

export function prepareStoreCheckout(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const { pointsRedeemed, redemptionId, redemptionReason: _reason, ...details } = input as Record<string, unknown>
  if (pointsRedeemed === undefined || pointsRedeemed === 0) {
    if (redemptionId) throw new Error('Pilih kembali hadiah penukaran poin dan periksa total.')
    return details
  }
  if (typeof pointsRedeemed !== 'number' || !Number.isSafeInteger(pointsRedeemed) || pointsRedeemed < 1 || pointsRedeemed > 1000000 || typeof redemptionId !== 'string' || !redemptionId.trim() || redemptionId.length > 200) {
    throw new Error('Pilihan penukaran poin tidak valid. Pilih kembali hadiah dan periksa total.')
  }
  return { ...details, redemptionId, pointsRedeemed }
}

export function storeCheckoutQuote(lines: {product: ProductDiscount & {id: string}; quantity: number}[], taxRate = 0, kind = 'none', value = '0', reward?: LoyaltyRedemptionRule | null) {
  const base = checkoutQuote(lines, taxRate, kind, value)
  let pointDiscount = 0
  if (reward) {
    if (reward.reward_type === 'voucher') {
      const amount = reward.voucher_amount
      if (!Number.isSafeInteger(amount) || !amount || amount < 1 || amount > 999999999999) throw new Error('Nominal voucher poin tidak valid.')
      pointDiscount = Math.min(base.net, amount)
    } else if (reward.reward_type === 'product') {
      const line = lines.find(item => item.product.id === reward.product_id)
      if (!line) throw new Error('Tambahkan produk hadiah ke keranjang sebelum menukar poin.')
      pointDiscount = Math.min(base.net, lineAmount(discountedPrice(line.product), Math.min(1, line.quantity)))
    } else throw new Error('Hadiah ini tidak berlaku untuk kasir toko.')
    if (pointDiscount <= 0) throw new Error('Hadiah tidak dapat dipakai pada tagihan nol.')
  }
  const taxed = productQuote([{product: {price: base.net - pointDiscount}, quantity: 1}], taxRate)
  return {...base, pointDiscount, tax: taxed.tax, total: taxed.total}
}
