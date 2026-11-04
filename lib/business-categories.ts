import { z } from 'zod'

export const businessCategorySchema = z.enum(['store', 'restaurant', 'barbershop'])
export type BusinessCategory = z.infer<typeof businessCategorySchema>
export const categorySlug = { store: 'toko', restaurant: 'restoran', barbershop: 'barbershop' } as const
export const categoryName = { store: 'Toko / Minimarket / Kios', restaurant: 'Restoran / Cafe', barbershop: 'Barbershop / Salon' } as const

export function categoryFromSlug(value: unknown): BusinessCategory | null {
  return value === 'toko' ? 'store' : value === 'restoran' ? 'restaurant' : value === 'barbershop' ? 'barbershop' : null
}

export function businessSlug(value: string): 'toko' | 'restoran' | 'barbershop' {
  const category = businessCategorySchema.parse(value)
  return categorySlug[category]
}
