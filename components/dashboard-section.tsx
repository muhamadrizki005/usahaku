'use client'
import { DashboardBrand, DashboardSidebar, DashboardMobileMenu, dashboardItemsForRole } from '@/components/dashboard-chrome'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import { Bell, ChevronDown, Lock, LogOut, Menu, Settings2, Store, User, X } from 'lucide-react'
import { roleNames, type Role } from '@/lib/auth/permissions'
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

  const allowedNav = dashboardItemsForRole(role)

  const nav = (path: string) => {
    setMobileNav(false)
    router.push(`${path}?category=${category}`)
  }

  return (
    <main className="min-h-screen bg-[#1c222e] text-[#ffffff]">
      {/* Top Header Bar (Full-Width Edge-to-Edge matching Gambar 2) */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between bg-[#1c222e]/95 px-4 sm:px-6 backdrop-blur-md">
        {/* Left: Brand / Logo */}
        <DashboardBrand onHome={() => nav('/dashboard')} contentMax={1280} />

        {/* Right: Actions, Lock, Notifications, Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3 lg:ml-auto">
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
            className="lg:hidden rounded-xl border border-[#454d5b]/70 p-2 text-[#c5cbd5] hover:bg-[#273242]"
            onClick={() => setMobileNav(true)}
            aria-label="Buka navigasi"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
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

            <nav aria-label="Navigasi dashboard mobile" className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
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
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1536px]">
        <DashboardSidebar role={role} onNavigate={nav} />

        {/* Content Section */}
        <section className="min-w-0 flex-1 flex flex-col">
          {/* Subheader */}
          <div className="px-4 pt-6 sm:px-6 lg:px-4">
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
          <div className="mx-auto max-w-7xl w-full p-4 sm:p-6 lg:px-4 lg:py-8 flex-1">
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

