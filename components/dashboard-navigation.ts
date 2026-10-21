import { BarChart3, CircleDollarSign, CreditCard, Database, LayoutDashboard, Package, Search, Settings2, ShoppingBag, Users } from 'lucide-react'

export const dashboardNavigation = [
  ['Ringkasan', LayoutDashboard, '/dashboard'],
  ['Produk', Package, '/dashboard/products'],
  ['Inventori', Database, '/dashboard/inventory'],
  ['Kasir (POS)', ShoppingBag, '/dashboard/pos'],
  ['Transaksi', CreditCard, '/dashboard/transactions'],
  ['Pelanggan', Users, '/dashboard/customers'],
  ['Poin loyalitas', CircleDollarSign, '/dashboard/loyalty'],
  ['Laporan', BarChart3, '/dashboard/reports'],
  ['Asisten Bisnis AI', Search, '/dashboard/assistant'],
  ['Pengaturan', Settings2, '/dashboard/settings'],
] as const

export type DashboardNavigationItem = (typeof dashboardNavigation)[number]
