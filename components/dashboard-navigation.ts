import { BarChart3, CreditCard, Database, LayoutDashboard, Package, Settings2, ShoppingBag, Sparkles, Users } from 'lucide-react'

export const dashboardNavigation = [
  ['Ringkasan', LayoutDashboard, '/dashboard'],
  ['Produk', Package, '/dashboard/products'],
  ['Inventori', Database, '/dashboard/inventory'],
  ['Kasir (POS)', ShoppingBag, '/dashboard/pos'],
  ['Transaksi', CreditCard, '/dashboard/transactions'],
  ['Pelanggan', Users, '/dashboard/customers'],
  ['Laporan', BarChart3, '/dashboard/reports'],
  ['Asisten Bisnis AI', Sparkles, '/dashboard/assistant'],
  ['Pengaturan', Settings2, '/dashboard/settings'],
] as const

export type DashboardNavigationItem = (typeof dashboardNavigation)[number]
