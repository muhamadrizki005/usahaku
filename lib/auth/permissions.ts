import type { Member } from '@/lib/validation'

export type Role = Member['role']
export const roleNames: Record<Role, string> = { owner: 'Pemilik', admin: 'Admin toko', cashier: 'Kasir' }
export function homeForRole(role: Role) {
  return role === 'cashier' ? '/dashboard/pos' : '/dashboard'
}
export function rolesForPath(path: string): Role[] {
  if (path === '/dashboard/pos' || path === '/dashboard/transactions') return ['owner', 'admin', 'cashier']
  if (path === '/dashboard/settings' || path.startsWith('/dashboard/settings/')) return ['owner']
  return ['owner', 'admin']
}
// Reserved for the future transaction module: cashiers retain access to their own sales.
export function transactionVisibility(role: Role): 'business' | 'own' {
  return role === 'cashier' ? 'own' : 'business'
}
