'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Store,
  User,
  Users,
  X,
} from 'lucide-react'
import {
  DashboardBrand,
  DashboardTopNav,
  DashboardSidebar,
  DashboardMobileMenu,
} from './dashboard-chrome'
import { dashboardNavigation } from './dashboard-navigation'
import { signOut } from '@/app/actions'
import { roleNames } from '@/lib/auth/permissions'
import { saleCode, type Sale } from '@/lib/pos'
import type { CatalogProduct } from '@/lib/catalog'
import type { Business, Member } from '@/lib/validation'
import { FloatingBusinessAssistant } from './floating-business-assistant'

type Activity = {
  businessId: string
  lowStock: CatalogProduct[]
  latestSale: Sale | null
}
const ActivityPublisher = createContext<Dispatch<SetStateAction<Activity | null>> | null>(null)

export function useDashboardActivity(
  businessId: string,
  products: CatalogProduct[],
  sales: Sale[]
) {
  const publish = useContext(ActivityPublisher)
  useEffect(() => {
    publish?.({
      businessId,
      lowStock: products.filter((p) => p.stock <= p.minStock),
      latestSale: sales[0] || null,
    })
  }, [publish, businessId, products, sales])
}

export function DashboardShell({
  business,
  member,
  children,
  assistantConfigured = false,
  userAvatar = null,
}: {
  business: Business
  member: Member
  children: ReactNode
  assistantConfigured?: boolean
  userAvatar?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [showAccount, setShowAccount] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null)
  const [publishedActivity, setActivity] = useState<Activity | null>(null)
  const [assistantVisible, setAssistantVisible] = useState(false)
  const assistantAllowed = business.category === 'store' && (member.role === 'owner' || member.role === 'admin')

  const activity =
    publishedActivity?.businessId === business.id ? publishedActivity : null
  const lowStock = activity?.lowStock || []
  const sales = activity?.latestSale ? [activity.latestSale] : []
  const businessName = business.name
  const ownerName = member.name
  const initials = ownerName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const category =
    business.category === 'restaurant'
      ? 'restoran'
      : business.category === 'barbershop'
      ? 'barbershop'
      : 'toko'

  const navigate = (path: string) => {
    setShowAccount(false)
    setShowNotifications(false)
    if (path === '/dashboard/assistant' && assistantAllowed) {
      setAssistantVisible(value => !value)
      return
    }
    setOptimisticPath(path)
    router.push(path === '/account' ? path : path + '?category=' + category)
  }

  const nav = (label: string) => {
    const item = dashboardNavigation.find(([name]) => name === label)
    if (item) navigate(item[2])
  }

  const money = (value: number) => 'Rp' + Math.round(value).toLocaleString('id-ID')

  useEffect(() => {
    setShowAccount(false)
    setShowNotifications(false)
    setOptimisticPath(null)
  }, [pathname])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAccount(false)
        setShowNotifications(false)
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const activePath = optimisticPath || pathname

  return (
    <ActivityPublisher.Provider value={setActivity}>
      <main className="h-full max-h-full w-full flex flex-col overflow-hidden text-white bg-transparent">
        {/* Topbar: 3 parts (Kiri, Tengah, Kanan), outside scroll container, non-sticky, non-fixed */}
        <header className="shrink-0 w-full z-30 print:hidden bg-transparent pt-4 sm:pt-5 pb-4 sm:pb-5">
          <div className="relative mx-auto flex w-full max-w-[1680px] items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
            {/* 1. KIRI: Logo resmi Usahaku + Teks "Usahaku" (sejajar vertikal dengan blok greeting) */}
            <div className="flex items-center shrink-0 z-10 lg:pl-[70px]">
              <DashboardBrand onHome={() => navigate('/dashboard')} />
            </div>

            {/* 2. TENGAH: Menu navigasi horizontal berada di tengah secara horizontal */}
            <div className="hidden min-[1536px]:flex min-w-0 flex-1 items-center justify-center">
              <DashboardTopNav
                role={member.role}
                category={business.category}
                onNavigate={navigate}
                activePath={activePath}
              />
            </div>

            {/* 3. KANAN: Nama usaha, Notifikasi, Akun & Menu Mobile */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 z-10 ml-auto">
              {/* Nama usaha aktif (dynamic) */}
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#454d5b]/70 bg-[#273242]/80 px-3 py-1.5 text-xs text-[#c5cbd5] shadow-xs">
                <span className="size-1.5 rounded-full bg-[#24cbc5] animate-pulse" />
                <Store className="size-3.5 text-[#24cbc5]" />
                <span className="max-w-32 truncate font-medium text-white">
                  {businessName}
                </span>
              </div>

              {/* Notification Bell with Badge & Dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowNotifications(!showNotifications)
                    setShowAccount(false)
                  }}
                  aria-label="Notifikasi"
                  className={`relative grid size-9.5 place-items-center rounded-full border transition shadow-xs cursor-pointer ${
                    showNotifications
                      ? 'border-[#24cbc5]/50 bg-[#303640] text-white'
                      : 'border-[#454d5b]/70 bg-[#273242] text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
                  }`}
                >
                  <Bell className="size-4.5" />
                  {(lowStock.length > 0 || sales.length > 0) && (
                    <span className="absolute -top-0.5 -right-0.5 flex size-3">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#24cbc5] opacity-75" />
                      <span className="relative inline-flex size-3 rounded-full bg-[#24cbc5]" />
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="fixed left-4 right-4 top-20 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-96 rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-[#454d5b] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-normal text-white">
                          Notifikasi
                        </span>
                        <span className="rounded-full bg-[#24cbc5]/15 px-2 py-0.5 text-[11px] font-normal text-[#24cbc5]">
                          {lowStock.length + (sales.length > 0 ? 1 : 0)} aktivitas
                        </span>
                      </div>
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#1c222e] cursor-pointer"
                        aria-label="Tutup notifikasi"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    {activity && pathname !== '/dashboard' && (
                      <p className="mt-3 text-xs text-[#a4a7ac]">
                        Data dari Ringkasan terakhir.
                      </p>
                    )}
                    <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto">
                      {lowStock.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-[#c5cbd5]">
                          <div className="flex items-center gap-1.5 font-normal text-amber-400">
                            <AlertTriangle className="size-3.5" />
                            <span>Peringatan Stok Menipis</span>
                          </div>
                          <p className="mt-1 text-[#c5cbd5]">
                            {lowStock.length} produk mencapai batas minimum:{' '}
                            {lowStock
                              .slice(0, 2)
                              .map((p) => p.name)
                              .join(', ')}
                          </p>
                          <button
                            onClick={() => {
                              setShowNotifications(false)
                              nav('Inventori')
                            }}
                            className="mt-2 text-[11px] font-normal text-[#24cbc5] hover:underline cursor-pointer"
                          >
                            Kelola persediaan stok →
                          </button>
                        </div>
                      )}

                      {sales.length > 0 && (
                        <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 text-xs text-[#c5cbd5]">
                          <div className="flex items-center gap-1.5 font-normal text-[#24cbc5]">
                            <CheckCircle2 className="size-3.5" />
                            <span>Transaksi Terakhir</span>
                          </div>
                          <p className="mt-1 text-white font-medium">
                            {saleCode(sales[0])}
                          </p>
                          <p className="text-[11px] text-[#a4a7ac]">
                            Total {money(Number(sales[0].total))} dicatat oleh{' '}
                            {sales[0].actor_name}
                          </p>
                          <button
                            onClick={() => {
                              setShowNotifications(false)
                              nav('Transaksi')
                            }}
                            className="mt-2 text-[11px] font-normal text-[#24cbc5] hover:underline cursor-pointer"
                          >
                            Lihat riwayat transaksi →
                          </button>
                        </div>
                      )}

                      {!lowStock.length && !sales.length && (
                        <div className="py-6 text-center text-xs text-[#a4a7ac]">
                          <Bell className="mx-auto size-6 text-[#454d5b] mb-1.5" />
                          <span>
                            {activity
                              ? 'Tidak ada pemberitahuan mendesak.'
                              : 'Belum ada pemberitahuan yang dimuat.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Profile Avatar & Menu (dynamic) */}
              <div className="relative">
                <button
                  aria-label="Menu akun"
                  className={`flex items-center gap-2 rounded-full border p-1 pl-1 pr-2.5 transition shadow-xs cursor-pointer ${
                    showAccount
                      ? 'border-[#24cbc5]/50 bg-[#303640]'
                      : 'border-[#454d5b]/70 bg-[#273242] hover:bg-[#303640]'
                  }`}
                  onClick={() => {
                    setShowAccount(!showAccount)
                    setShowNotifications(false)
                  }}
                >
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={ownerName}
                      className="size-8 rounded-full object-cover shrink-0 ring-1 ring-white/20"
                    />
                  ) : (
                    <span className="grid size-8 place-items-center rounded-full bg-[#1835d9] text-xs font-semibold text-white shadow-xs shrink-0">
                      {initials}
                    </span>
                  )}
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-36 truncate text-xs font-normal text-white leading-tight">
                      {ownerName}
                    </span>
                    <span className="block text-[10px] text-[#c5cbd5]">
                      {roleNames[member.role]}
                    </span>
                  </span>
                  <ChevronDown
                    className={`size-3 text-[#a4a7ac] hidden sm:block transition-transform duration-200 ${
                      showAccount ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showAccount && (
                  <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-[#454d5b] bg-[#273242] p-2 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                    <div className="border-b border-[#454d5b] px-3 py-2.5 mb-1 flex items-center gap-3">
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt={ownerName}
                          className="size-9 rounded-full object-cover shrink-0 ring-1 ring-white/20"
                        />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1835d9] text-xs font-semibold text-white shadow-xs">
                          {initials}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-normal text-white truncate">{ownerName}</p>
                        <p className="text-[11px] text-[#a4a7ac] truncate">
                          {businessName}
                        </p>
                        <span className="mt-1 inline-block rounded-md bg-[#1835d9]/25 border border-[#1835d9]/40 px-2 py-0.5 text-[10px] font-normal text-[#24cbc5]">
                          {roleNames[member.role]}
                        </span>
                      </div>
                    </div>
                    <button
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#c5cbd5] hover:bg-[#1c222e] hover:text-white transition cursor-pointer"
                      onClick={() => {
                        setShowAccount(false)
                        router.push('/account')
                      }}
                    >
                      <User className="size-4 text-[#24cbc5]" /> Akun saya
                    </button>
                    {member.role === 'owner' && (
                      <button
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#c5cbd5] hover:bg-[#1c222e] hover:text-white transition cursor-pointer"
                        onClick={() => {
                          setShowAccount(false)
                          router.push('/dashboard/settings/staff')
                        }}
                      >
                        <Users className="size-4 text-[#24cbc5]" /> Staf & akses
                      </button>
                    )}
                    <div className="border-t border-[#454d5b] my-1" />
                    <form action={signOut}>
                      <button className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#ffb4ae] hover:bg-[#4a252b]/50 transition cursor-pointer">
                        <LogOut className="size-4 text-[#ffb4ae]" /> Keluar akun
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Mobile Drawer Navigation Toggle */}
              <DashboardMobileMenu
                role={member.role}
                category={business.category}
                onNavigate={navigate}
                businessName={businessName}
                assistantVisible={assistantAllowed ? assistantVisible : undefined}
              />
            </div>
          </div>
        </header>

        {/* Main Content Area & Capsule Sidebar Rail: Fixed sidebar centered vertically in viewport, vertical scroll solely on main content */}
        <div className="flex-1 min-h-0 flex items-center overflow-hidden w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 gap-5 pt-2 pb-4">
          {/* Vertical Capsule Sidebar (Pill Rail with Asisten Bisnis AI & Pengaturan) */}
          <DashboardSidebar
            role={member.role}
            category={business.category}
            onNavigate={navigate}
            activePath={activePath}
            assistantVisible={assistantAllowed ? assistantVisible : undefined}
          />

          {/* Scrollable Main Content Container (ONLY vertical scroll container) */}
          <div
            id="dashboard-content"
            className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pb-10 focus:outline-none"
            tabIndex={-1}
          >
            {children}
          </div>
        </div>
      </main>
      {assistantAllowed && <FloatingBusinessAssistant visible={assistantVisible} configured={assistantConfigured} />}
    </ActivityPublisher.Provider>
  )
}
