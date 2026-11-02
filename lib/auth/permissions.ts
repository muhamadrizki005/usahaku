import type { Member } from '@/lib/validation'

export type Role = Member['role']
export const roleNames: Record<string, string> = {
  owner: 'Pemilik',
  admin: 'Admin toko',
  cashier: 'Kasir',
}

export function homeForRole(role: string, permissions?: string[]): string {
  if (role === 'owner') return '/dashboard'
  if (role === 'cashier') return '/dashboard/pos'
  if (role === 'admin') return '/dashboard'

  if (permissions && Array.isArray(permissions)) {
    if (permissions.includes('overview:view')) return '/dashboard'
    if (permissions.includes('pos:view')) return '/dashboard/pos'
    if (permissions.includes('products:view')) return '/dashboard/products'
    if (permissions.includes('inventory:view')) return '/dashboard/inventory'
    if (permissions.includes('transactions:view')) return '/dashboard/transactions'
    if (permissions.includes('customers:view')) return '/dashboard/customers'
    if (permissions.includes('reports:view')) return '/dashboard/reports'
  }

  return '/dashboard'
}

export function rolesForPath(path: string): string[] {
  if (path === '/dashboard/pos' || path === '/dashboard/transactions') return ['owner', 'admin', 'cashier']
  if (path === '/dashboard/settings' || path.startsWith('/dashboard/settings/')) return ['owner']
  return ['owner', 'admin']
}

// Reserved for the future transaction module: cashiers retain access to their own sales.
export function transactionVisibility(role: string): 'business' | 'own' {
  return role === 'cashier' ? 'own' : 'business'
}
