export const DEFAULT_SALON_BENEFITS = [
  'Free Styling',
  'Hot Towel',
  'Free Wash',
  'Hair Consultation',
  'Head Massage',
  'Free Hair Product',
] as const

export type SalonDiscount = {
  enabled: boolean
  kind: 'none' | 'percent' | 'amount'
  value: number
  basePrice: number
  discountedPrice: number
}

export function calculateDiscountedPrice(price: number, kind: 'none' | 'percent' | 'amount', value: number): number {
  if (kind === 'none' || value <= 0) return price
  if (kind === 'percent') {
    const discount = Math.round((price * Math.min(100, Math.max(0, value))) / 100)
    return Math.max(0, price - discount)
  }
  if (kind === 'amount') {
    return Math.max(0, Math.round(price - Math.min(price, Math.max(0, value))))
  }
  return price
}

export function getServiceBenefits(serviceId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('usahaku_service_benefits_' + serviceId)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveServiceBenefits(serviceId: string, benefits: string[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('usahaku_service_benefits_' + serviceId, JSON.stringify(benefits))
    window.dispatchEvent(new CustomEvent('usahaku:service_benefits_changed', { detail: { serviceId, benefits } }))
  } catch {}
}

export function getCustomBenefits(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('usahaku_salon_custom_benefits')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomBenefits(benefits: string[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('usahaku_salon_custom_benefits', JSON.stringify(benefits))
    window.dispatchEvent(new CustomEvent('usahaku:custom_benefits_changed', { detail: { benefits } }))
  } catch {}
}

export function getServiceDiscount(serviceId: string, basePrice: number): SalonDiscount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('usahaku_service_discount_' + serviceId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.enabled) {
      return {
        enabled: true,
        kind: parsed.kind || 'percent',
        value: Number(parsed.value || 0),
        basePrice,
        discountedPrice: calculateDiscountedPrice(basePrice, parsed.kind, Number(parsed.value || 0)),
      }
    }
  } catch {}
  return null
}

export function saveServiceDiscount(serviceId: string, discount: SalonDiscount | null) {
  if (typeof window === 'undefined') return
  try {
    if (discount && discount.enabled) {
      localStorage.setItem('usahaku_service_discount_' + serviceId, JSON.stringify(discount))
    } else {
      localStorage.removeItem('usahaku_service_discount_' + serviceId)
    }
    window.dispatchEvent(new CustomEvent('usahaku:service_discount_changed', { detail: { serviceId, discount } }))
  } catch {}
}

export function getProductDiscount(productId: string, basePrice: number): SalonDiscount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('usahaku_product_discount_' + productId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.enabled) {
      return {
        enabled: true,
        kind: parsed.kind || 'percent',
        value: Number(parsed.value || 0),
        basePrice,
        discountedPrice: calculateDiscountedPrice(basePrice, parsed.kind, Number(parsed.value || 0)),
      }
    }
  } catch {}
  return null
}

export function saveProductDiscount(productId: string, discount: SalonDiscount | null) {
  if (typeof window === 'undefined') return
  try {
    if (discount && discount.enabled) {
      localStorage.setItem('usahaku_product_discount_' + productId, JSON.stringify(discount))
    } else {
      localStorage.removeItem('usahaku_product_discount_' + productId)
    }
    window.dispatchEvent(new CustomEvent('usahaku:product_discount_changed', { detail: { productId, discount } }))
  } catch {}
}

export function getProductDescription(productId: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem('usahaku_product_description_' + productId) || ''
  } catch {
    return ''
  }
}

export function saveProductDescription(productId: string, description: string) {
  if (typeof window === 'undefined') return
  try {
    if (description.trim()) {
      localStorage.setItem('usahaku_product_description_' + productId, description.trim())
    } else {
      localStorage.removeItem('usahaku_product_description_' + productId)
    }
    window.dispatchEvent(new CustomEvent('usahaku:product_description_changed', { detail: { productId, description } }))
  } catch {}
}

export function getProductPhoto(productId: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem('usahaku_product_photo_' + productId) || ''
  } catch {
    return ''
  }
}

export function saveProductPhoto(productId: string, photo: string) {
  if (typeof window === 'undefined') return
  try {
    if (photo) {
      localStorage.setItem('usahaku_product_photo_' + productId, photo)
    } else {
      localStorage.removeItem('usahaku_product_photo_' + productId)
    }
    window.dispatchEvent(new CustomEvent('usahaku:product_photo_changed', { detail: { productId, photo } }))
  } catch {}
}
