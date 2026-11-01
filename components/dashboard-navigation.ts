import { BarChart3, CreditCard, Database, Home, LayoutDashboard, Package, Settings2, ShoppingBag, Sparkles, Users, Utensils, Table2 } from 'lucide-react'

export const topNavigationItems = [
  ['Ringkasan', LayoutDashboard, '/dashboard'],
  ['Produk', Package, '/dashboard/products'],
  ['Inventori', Database, '/dashboard/inventory'],
  ['Kasir (POS)', ShoppingBag, '/dashboard/pos'],
  ['Transaksi', CreditCard, '/dashboard/transactions'],
  ['Pelanggan', Users, '/dashboard/customers'],
  ['Laporan', BarChart3, '/dashboard/reports'],
] as const

export const sidebarNavigationItems = [
  ['Home', Home, '/dashboard'],
  ['Asisten Bisnis AI', Sparkles, '/dashboard/assistant'],
  ['Pengaturan', Settings2, '/dashboard/settings'],
] as const

export const restaurantTopNavigationItems = [
  ['Ringkasan', LayoutDashboard, '/dashboard'],
  ['Menu', Utensils, '/dashboard/products'],
  ['Meja', Table2, '/dashboard/restaurant/tables'],
  ['Pesanan & kasir', ShoppingBag, '/dashboard/pos'],
  ['Transaksi', CreditCard, '/dashboard/transactions'],
  ['Laporan', BarChart3, '/dashboard/reports'],
] as const
export const restaurantSidebarNavigationItems = [
  ['Home', Home, '/dashboard'],
  ['Pengaturan', Settings2, '/dashboard/settings'],
] as const

export const dashboardNavigation = [
  ...topNavigationItems,
  ['Asisten Bisnis AI', Sparkles, '/dashboard/assistant'],
  ['Pengaturan', Settings2, '/dashboard/settings'],
] as const

export type DashboardNavigationItem = (typeof dashboardNavigation)[number]
export type TopNavigationItem = (typeof topNavigationItems)[number]
export type SidebarNavigationItem = (typeof sidebarNavigationItems)[number]
