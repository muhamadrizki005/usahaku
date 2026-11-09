export interface CustomTaxItem {
  id: string
  name: string
  rate: number
  enabled: boolean
  isService?: boolean
}

export function getDefaultTaxes(category: string, baseTaxRate = 0): CustomTaxItem[] {
  const isResto = category === 'restaurant'
  return [
    {
      id: 'primary-tax',
      name: isResto ? 'Pajak Restoran (PB1)' : 'Pajak Utama (PPN)',
      rate: baseTaxRate > 0 ? baseTaxRate : (isResto ? 10 : 11),
      enabled: baseTaxRate > 0,
      isService: false,
    },
    {
      id: 'service-tax',
      name: 'Pajak Pelayanan / Service Charge',
      rate: isResto ? 5 : 0,
      enabled: false,
      isService: true,
    },
  ]
}

export function getBusinessTaxes(businessId: string, category: string, baseTaxRate = 0): CustomTaxItem[] {
  if (typeof window === 'undefined') {
    return getDefaultTaxes(category, baseTaxRate)
  }
  try {
    const raw = localStorage.getItem(`usahaku_custom_taxes_${businessId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return getDefaultTaxes(category, baseTaxRate)
}

export function saveBusinessTaxes(businessId: string, taxes: CustomTaxItem[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`usahaku_custom_taxes_${businessId}`, JSON.stringify(taxes))
    window.dispatchEvent(new CustomEvent('usahaku:custom_taxes_changed', { detail: { businessId, taxes } }))
  } catch {}
}

export interface CalculatedTax {
  id: string
  name: string
  rate: number
  amount: number
}

export function calculateCustomTaxes(netAmount: number, taxes: CustomTaxItem[]): CalculatedTax[] {
  if (!Number.isFinite(netAmount) || netAmount <= 0) return []
  return taxes
    .filter(t => t.enabled && t.rate > 0)
    .map(t => {
      const rate = Math.min(100, Math.max(0, Number(t.rate) || 0))
      const amount = Math.round((netAmount * rate) / 100)
      return {
        id: t.id,
        name: t.name,
        rate,
        amount,
      }
    })
}

export function calculateTotalCustomTax(netAmount: number, taxes: CustomTaxItem[]): number {
  const calculated = calculateCustomTaxes(netAmount, taxes)
  return calculated.reduce((sum, t) => sum + t.amount, 0)
}

