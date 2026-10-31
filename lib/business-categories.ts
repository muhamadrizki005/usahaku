import { z } from 'zod'

export const businessCategorySchema = z.enum(['store', 'restaurant'])
export type BusinessCategory = z.infer<typeof businessCategorySchema>
export const categorySlug = { store: 'toko', restaurant: 'restoran' } as const
export const categoryName = { store: 'Toko / Minimarket / Kios', restaurant: 'Restoran / Cafe' } as const

export function categoryFromSlug(value: unknown): BusinessCategory | null {
  return value === 'toko' ? 'store' : value === 'restoran' ? 'restaurant' : null
}

export function businessSlug(value: string): 'toko' | 'restoran' {
  const category = businessCategorySchema.parse(value)
  return categorySlug[category]
}
