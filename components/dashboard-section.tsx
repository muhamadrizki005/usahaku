'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  ChevronDown,
  CreditCard,
  Database,
  HelpCircle,
  Lock,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  User,
  Users,
  X,
} from 'lucide-react'
import { rolesForPath, roleNames, type Role } from '@/lib/auth/permissions'
import { dashboardNavigation } from './dashboard-navigation'
import { signOut } from '@/app/actions'

const labels: Record<string, string> = {
  toko: 'Toko / Minimarket / Kios',
  restoran: 'Restoran / Cafe',
  barbershop: 'Barbershop / Salon',
}

export default function DashboardSection({
  title,
  category = 'toko',
  children,
  role = 'owner',
}: {
  title: string
  category?: string
  children?: ReactNode
  role?: Role
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileNav, setMobileNav] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAccount(false)
        setShowNotifications(false)
        setMobileNav(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const allowedNav = dashboardNavigation.filter(([, , path]) =>
    rolesForPath(path).includes(role)
  )

  const nav = (path: string) => {
    setMobileNav(false)
    router.push(`${path}?category=${category}`)
  }

  return (
    <main className="min-h-screen bg-[#1c222e] text-[#ffffff]">
      {/* Top Header Bar (Full-Width Edge-to-Edge matching Gambar 2) */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-[#454d5b]/60 bg-[#1c222e]/95 px-4 sm:px-6 backdrop-blur-md">
        {/* Left: Brand / Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => nav('/dashboard')}
            className="flex items-center gap-3 text-left transition hover:opacity-90"
          >
            <div className="grid size-9 place-items-center rounded-xl bg-black/40 border border-white/10 shadow-xs">
              <img
                src="/brand/usahaku-logo.png"
                alt="Usahaku"
                width={26}
                height={26}
                className="size-6.5 shrink-0 object-contain"
              />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">Usahaku</span>
          </button>
        </div>

        {/* Center: Horizontal Pill Navigation (Desktop - Gambar 2) */}
        <nav
          className="hidden md:flex items-center gap-1 rounded-full bg-[#273242]/70 p-1 border border-[#454d5b]/60 shadow-inner"
          aria-label="Navigasi utama"
        >
          {allowedNav.map(([label, , path]) => {
            const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path))
            return (
              <button
                key={label}
                onClick={() => nav(path)}
                className={`rounded-full px-4 py-1.5 text-xs transition-all duration-150 ${
                  isActive
                    ? 'bg-[#1c222e] text-white font-semibold shadow-sm border border-[#454d5b]'
                    : 'text-[#c5cbd5] hover:text-white hover:bg-[#303640]/50 font-medium'
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>

        {/* Right: Actions, Lock, Notifications, Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Workspace Pill */}
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#454d5b]/70 bg-[#273242]/80 px-3 py-1 text-xs text-[#c5cbd5] shadow-xs">
            <span className="size-1.5 rounded-full bg-[#24cbc5] animate-pulse" />
            <Store className="size-3 text-[#24cbc5]" />
            <span className="max-w-28 truncate font-medium text-white">{labels[category] || 'Operasional'}</span>
          </div>

          {/* Secure Lock Icon */}
          <div
            className="hidden lg:grid size-9 place-items-center rounded-full border border-[#454d5b]/70 bg-[#273242]/70 text-[#a4a7ac]"
            title="Koneksi aman terenkripsi"
          >
            <Lock className="size-4" />
          </div>

          {/* Notification Button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications)
                setShowAccount(false)
              }}
              aria-label="Notifikasi"
              className={`relative grid size-9.5 place-items-center rounded-full border transition shadow-xs ${
                showNotifications
                  ? 'border-[#24cbc5]/50 bg-[#303640] text-white'
                  : 'border-[#454d5b]/70 bg-[#273242] text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
              }`}
            >
              <Bell className="size-4.5" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-[#454d5b] pb-2.5">
                  <span className="text-sm font-semibold text-white">Notifikasi</span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#1c222e]"
                    aria-label="Tutup notifikasi"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="py-6 text-center text-xs text-[#a4a7ac]">
                  <Bell className="mx-auto size-6 text-[#454d5b] mb-1.5" />
                  <span>Semua operasional sistem berjalan normal.</span>
                </div>
              </div>
            )}
          </div>

          {/* Profile Button */}
          <div className="relative">
            <button
              aria-label="Menu akun"
              className={`flex items-center gap-2 rounded-full border p-1 pl-1 pr-2 transition shadow-xs ${
                showAccount
                  ? 'border-[#24cbc5]/50 bg-[#303640]'
                  : 'border-[#454d5b]/70 bg-[#273242] hover:bg-[#303640]'
              }`}
              onClick={() => {
                setShowAccount(!showAccount)
                setShowNotifications(false)
              }}
            >
              <span className="grid size-8 place-items-center rounded-full bg-[#1835d9] text-xs font-bold text-white shadow-xs">
                {role.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-xs font-semibold text-white leading-tight">Pengguna</span>
                <span className="block text-[10px] text-[#c5cbd5]">{roleNames[role] || role}</span>
              </span>
              <ChevronDown
                className={`size-3 text-[#a4a7ac] hidden sm:block transition-transform duration-200 ${
                  showAccount ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAccount && (
              <div className="absolute right-0 top-12 z-50 w-60 rounded-2xl border border-[#454d5b] bg-[#273242] p-2 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <div className="border-b border-[#454d5b] px-3 py-2.5 mb-1">
                  <p className="text-xs font-semibold text-white">Akun Pengguna</p>
                  <span className="mt-1 inline-block rounded-md bg-[#1835d9]/25 border border-[#1835d9]/40 px-2 py-0.5 text-[10px] font-semibold text-[#24cbc5]">
                    {roleNames[role] || role}
                  </span>
                </div>
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#c5cbd5] hover:bg-[#1c222e] hover:text-white transition"
                  onClick={() => {
                    setShowAccount(false)
                    router.push('/account')
                  }}
                >
                  <User className="size-4 text-[#24cbc5]" /> Akun saya
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#c5cbd5] hover:bg-[#1c222e] hover:text-white transition"
                  onClick={() => {
                    setShowAccount(false)
                    router.push('/dashboard/settings')
                  }}
                >
                  <Settings2 className="size-4 text-[#24cbc5]" /> Pengaturan bisnis
                </button>
                <div className="border-t border-[#454d5b] my-1" />
                <form action={signOut}>
                  <button className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#ffb4ae] hover:bg-[#4a252b]/50 transition">
                    <LogOut className="size-4 text-[#ffb4ae]" /> Keluar akun
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Mobile Menu Hamburger (< md) */}
          <button
            className="md:hidden rounded-xl border border-[#454d5b]/70 p-2 text-[#c5cbd5] hover:bg-[#273242]"
            onClick={() => setMobileNav(true)}
            aria-label="Buka navigasi"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileNav(false)}
          />
          <aside className="relative flex w-72 max-w-[85vw] flex-col border-r border-[#454d5b] bg-[#273242] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <button
                onClick={() => nav('/dashboard')}
                className="flex items-center gap-2 text-left"
              >
                <img
                  src="/brand/usahaku-logo.png"
                  alt="Usahaku"
                  width={30}
                  height={30}
                  className="size-7.5 shrink-0 object-contain"
                />
                <span className="text-lg font-bold tracking-tight text-white">Usahaku</span>
              </button>
              <button
                onClick={() => setMobileNav(false)}
                className="rounded-lg p-1.5 text-[#c5cbd5] hover:bg-[#303640]"
                aria-label="Tutup menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
              {allowedNav.map(([label, Icon, path]) => {
                const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path))
                return (
                  <button
                    key={label}
                    onClick={() => nav(path)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#24cbc5]/15 text-[#24cbc5] font-semibold'
                        : 'text-[#c5cbd5] hover:bg-[#303640]'
                    }`}
                  >
                    <Icon className={`size-4.5 ${isActive ? 'text-[#24cbc5]' : 'text-[#a4a7ac]'}`} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Container: Floating Left Dock + Content Canvas (Gambar 2 Layout) */}
      <div className="flex min-h-[calc(100vh-64px)] w-full">
        {/* Floating Vertical Icon Dock (Sidebar - Gambar 2) */}
        <aside
          className="hidden lg:flex shrink-0 py-6 pl-5 pr-2 flex-col items-center justify-start"
          aria-label="Toolbar pintas"
        >
          <div className="sticky top-22 flex flex-col items-center gap-3 rounded-full border border-[#454d5b]/80 bg-[#273242]/90 p-2 shadow-2xl backdrop-blur-md">
            {/* Quick Search */}
            <button
              onClick={() => nav('/dashboard/products')}
              className="grid size-9.5 place-items-center rounded-full text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition"
              title="Pencarian Cepat"
            >
              <Search className="size-4" />
            </button>

            {/* Quick Plus Action */}
            <button
              onClick={() => nav('/dashboard/products')}
              className="grid size-9.5 place-items-center rounded-full text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition"
              title="Tambah Produk / Transaksi"
            >
              <Plus className="size-4" />
            </button>

            {/* Star (Ringkasan / Favorit) */}
            <button
              onClick={() => nav('/dashboard')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname === '/dashboard'
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Ringkasan Usaha"
            >
              <Star className="size-4" />
            </button>

            {/* Calendar / Kasir POS */}
            <button
              onClick={() => nav('/dashboard/pos')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname.startsWith('/dashboard/pos')
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Buka Kasir (POS)"
            >
              <ShoppingBag className="size-4" />
            </button>

            {/* Smartphone / Inventori */}
            <button
              onClick={() => nav('/dashboard/inventory')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname.startsWith('/dashboard/inventory')
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Inventori & Stok"
            >
              <Database className="size-4" />
            </button>

            {/* Plane / AI Assistant */}
            <button
              onClick={() => nav('/dashboard/assistant')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname.startsWith('/dashboard/assistant')
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Asisten Bisnis AI"
            >
              <Sparkles className="size-4" />
            </button>

            {/* Share / Transaksi */}
            <button
              onClick={() => nav('/dashboard/transactions')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname.startsWith('/dashboard/transactions')
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Riwayat Transaksi"
            >
              <CreditCard className="size-4" />
            </button>

            {/* Download / Laporan */}
            <button
              onClick={() => nav('/dashboard/reports')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname.startsWith('/dashboard/reports')
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Laporan Penjualan"
            >
              <BarChart3 className="size-4" />
            </button>

            <div className="h-px w-6 bg-[#454d5b]/60 my-0.5" />

            {/* Settings */}
            <button
              onClick={() => nav('/dashboard/settings')}
              className={`grid size-9.5 place-items-center rounded-full transition ${
                pathname.startsWith('/dashboard/settings')
                  ? 'bg-[#1c222e] text-[#24cbc5] border border-[#24cbc5]/30 shadow-xs'
                  : 'text-[#a4a7ac] hover:bg-[#303640] hover:text-white'
              }`}
              title="Pengaturan"
            >
              <Settings2 className="size-4" />
            </button>

            {/* Theme Toggle (Gambar 2 Moon) */}
            <button
              className="grid size-9.5 place-items-center rounded-full text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition"
              title="Mode Tampilan Gelap"
            >
              <Moon className="size-4" />
            </button>
          </div>
        </aside>

        {/* Content Section */}
        <section className="min-w-0 flex-1 flex flex-col">
          {/* Subheader */}
          <div className="px-4 pt-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#454d5b]/50 pb-5">
              <div>
                <p className="text-xs text-[#a4a7ac] flex items-center gap-1.5">
                  <span>Usahaku</span>
                  <span className="text-white/30">›</span>
                  <span className="text-[#c5cbd5]">Dashboard</span>
                  <span className="text-white/30">›</span>
                  <span className="text-[#24cbc5] font-medium">{title}</span>
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="mx-auto max-w-7xl w-full p-4 sm:p-6 lg:p-8 flex-1">
            {children || (
              <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-8 shadow-sm">
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm text-[#c5cbd5]">
                  Modul ini siap digunakan untuk membantu operasional usaha Anda.
                </p>
                <span className="mt-5 inline-flex rounded-full border border-[#454d5b] bg-[#1c222e] px-3.5 py-1 text-xs font-medium text-[#24cbc5]">
                  Operasional Aktif
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

