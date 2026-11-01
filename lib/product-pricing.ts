export type ProductDiscount = { price: number; discountKind?: 'none' | 'percent' | 'amount'; discountValue?: number }

export function discountedPrice(product: ProductDiscount): number {
  const { price, discountKind = 'none', discountValue = 0 } = product
  if (!Number.isSafeInteger(price) || price < 0 || price > 999999999999 || !Number.isFinite(discountValue) || discountValue < 0 || !['none', 'percent', 'amount'].includes(discountKind)) throw Error('Diskon produk tidak valid.')
  if ((discountKind === 'none' && discountValue !== 0) || (discountKind === 'percent' && (discountValue > 100 || Math.abs(discountValue * 100 - Math.round(discountValue * 100)) > 0.00001)) || (discountKind === 'amount' && (!Number.isInteger(discountValue) || discountValue > price))) throw Error('Diskon produk tidak valid.')
  const reduction = discountKind === 'amount' ? discountValue : discountKind === 'percent' ? Number((BigInt(price) * BigInt(Math.round(discountValue * 100)) + BigInt(5000)) / BigInt(10000)) : 0
  return price - reduction
}

export function productQuote(lines: { product: ProductDiscount; quantity: number }[], taxRate = 0) {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || Math.abs(taxRate * 100 - Math.round(taxRate * 100)) > 0.00001) throw Error('Pajak tidak valid.')
  const line = (price: number, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999.999 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.00001) throw Error('Jumlah tidak valid.')
    return Number((BigInt(price) * BigInt(Math.round(quantity * 1000)) + BigInt(500)) / BigInt(1000))
  }
  let subtotal = 0, net = 0
  for (const item of lines) {
    const price = discountedPrice(item.product)
    subtotal += line(item.product.price, item.quantity)
    net += line(price, item.quantity)
  }
  if (!Number.isSafeInteger(subtotal) || subtotal > 999999999999) throw Error('Total melebihi batas transaksi.')
  const tax = Number((BigInt(net) * BigInt(Math.round(taxRate * 100)) + BigInt(5000)) / BigInt(10000))
  if (net + tax > 999999999999) throw Error('Total melebihi batas transaksi.')
  return { subtotal, discount: subtotal - net, net, tax, total: net + tax }
}
