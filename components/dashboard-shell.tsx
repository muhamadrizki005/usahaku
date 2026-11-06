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
  Package,
  Store,
  User,
  Users,
  X,
} from 'lucide-react'
import {
  type AppNotification,
  loadAppNotifications,
  markAllAppNotificationsAsRead,
  saveAppNotifications,
} from '@/lib/notifications'
import { ToastNotification, useToast } from '@/components/ui/toast-notification'
import {
  DashboardBrand,
  DashboardTopNav,
  DashboardSidebar,
  DashboardMobileMenu,
} from './dashboard-chrome'
import { dashboardNavigation } from './dashboard-navigation'
import { signOut } from '@/app/actions'
import { hasPermission } from '@/lib/auth/rbac'
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
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [hasUnread, setHasUnread] = useState(false)
  const { toast, showToast, hideToast } = useToast(4000)

  useEffect(() => {
    if (!business?.id) return
    const loaded = loadAppNotifications(business.id)
    setNotifications(loaded)
    setHasUnread(loaded.some(n => !n.read))
  }, [business?.id])

  useEffect(() => {
    if (!business?.id) return
    const onNotification = (e: Event) => {
      const customEvent = e as CustomEvent<AppNotification>
      const notif = customEvent.detail
      if (notif && notif.businessId === business.id) {
        setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)])
        setHasUnread(true)
        showToast('success', `${notif.title} — ${notif.message}`)
      }
    }
    const onRead = (e: Event) => {
      const customEvent = e as CustomEvent<{ businessId: string }>
      if (customEvent.detail?.businessId === business.id) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        setHasUnread(false)
      }
    }
    window.addEventListener('usahaku:notification', onNotification)
    window.addEventListener('usahaku:notifications_read', onRead)
    return () => {
      window.removeEventListener('usahaku:notification', onNotification)
      window.removeEventListener('usahaku:notifications_read', onRead)
    }
  }, [business?.id, showToast])

  const handleMarkAllRead = () => {
    if (!business?.id) return
    const updated = markAllAppNotificationsAsRead(business.id)
    setNotifications(updated)
    setHasUnread(false)
  }

  const handleMarkOneRead = (id: string) => {
    if (!business?.id) return
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n)
    saveAppNotifications(business.id, updated)
    setNotifications(updated)
    setHasUnread(updated.some(n => !n.read))
  }
  const assistantAllowed = business.category === 'store' && (hasPermission(member.role, member.permissions, 'reports:view') && hasPermission(member.role, member.permissions, 'products:view'))

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
      <ToastNotification toast={toast} onClose={hideToast} />
      <main className="min-h-screen w-full flex flex-col text-white bg-transparent">
        {/* Topbar: 3 parts (Kiri, Tengah, Kanan), outside scroll container, non-sticky, non-fixed */}
        <header className="shrink-0 w-full z-30 print:hidden bg-transparent pt-4 sm:pt-5 pb-4 sm:pb-5">
          <div className="relative mx-auto flex w-full items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 gap-4">
            {/* 1. KIRI: Logo resmi Usahaku + Teks "Usahaku" (sejajar vertikal dengan blok greeting) */}
            <div className="flex items-center shrink-0 z-10 lg:pl-[70px]">
              <DashboardBrand onHome={() => navigate('/dashboard')} />
            </div>

            {/* 2. TENGAH: Menu navigasi horizontal berada di tengah secara horizontal */}
            <div className="hidden min-[1536px]:flex min-w-0 flex-1 items-center justify-center">
              <DashboardTopNav
                role={member.role} permissions={member.permissions}
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
                  {hasUnread && (
                    <span className="absolute -top-0.5 -right-0.5 flex size-3">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#24cbc5] opacity-75" />
                      <span className="relative inline-flex size-3 rounded-full bg-[#24cbc5]" />
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="fixed left-4 right-4 top-20 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-96 rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-[#454d5b] pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-normal text-white">
                          Notifikasi
                        </span>
                        {notifications.filter(n => !n.read).length > 0 ? (
                          <span className="rounded-full bg-[#24cbc5]/15 px-2 py-0.5 text-[11px] font-normal text-[#24cbc5]">
                            {notifications.filter(n => !n.read).length} baru
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#454d5b]/40 px-2 py-0.5 text-[11px] font-normal text-[#a4a7ac]">
                            {notifications.length} total
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          disabled={!hasUnread && !notifications.some(n => !n.read)}
                          className="text-[11px] font-normal text-[#24cbc5] hover:underline cursor-pointer disabled:opacity-40 disabled:hover:no-underline"
                        >
                          Tandai semua telah dibaca
                        </button>
                        <button
                          onClick={() => setShowNotifications(false)}
                          className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#1c222e] cursor-pointer"
                          aria-label="Tutup notifikasi"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {/* App Notifications (Transaction, Product, Inventory, etc.) */}
                      {notifications.map(notif => (
                        <div
                          key={notif.id}
                          className={`rounded-xl border p-3 text-xs transition-colors ${
                            !notif.read
                              ? 'border-[#24cbc5]/40 bg-[#1c222e]'
                              : 'border-[#454d5b]/60 bg-[#1c222e]/60 text-[#a4a7ac]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-medium text-white min-w-0">
                              {notif.category === 'transaction' && <CheckCircle2 className="size-3.5 text-[#24cbc5] shrink-0" />}
                              {notif.category === 'product' && <Package className="size-3.5 text-[#349cb8] shrink-0" />}
                              {notif.category === 'inventory' && <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />}
                              {notif.category === 'low_stock' && <AlertTriangle className="size-3.5 text-red-400 shrink-0" />}
                              {notif.category === 'system' && <Bell className="size-3.5 text-[#24cbc5] shrink-0" />}
                              <span className="truncate">{notif.title}</span>
                            </div>
                            {!notif.read && (
                              <span className="size-1.5 shrink-0 rounded-full bg-[#24cbc5]" />
                            )}
                          </div>
                          <p className="mt-1 text-xs text-[#c5cbd5] leading-relaxed break-words">{notif.message}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-[#a4a7ac]">
                              {new Date(notif.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </span>
                            {notif.link && (
                              <button
                                onClick={() => {
                                  handleMarkOneRead(notif.id)
                                  setShowNotifications(false)
                                  navigate(notif.link!)
                                }}
                                className="text-[11px] font-normal text-[#24cbc5] hover:underline cursor-pointer"
                              >
                                {notif.linkLabel || 'Lihat detail →'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Low Stock Warning */}
                      {lowStock.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-[#c5cbd5]">
                          <div className="flex items-center gap-1.5 font-normal text-amber-400">
                            <AlertTriangle className="size-3.5 shrink-0" />
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

                      {/* Latest sale if not in notifications */}
                      {sales.length > 0 && !notifications.some(n => n.category === 'transaction') && (
                        <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 text-xs text-[#c5cbd5]">
                          <div className="flex items-center gap-1.5 font-normal text-[#24cbc5]">
                            <CheckCircle2 className="size-3.5 shrink-0" />
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

                      {!notifications.length && !lowStock.length && !sales.length && (
                        <div className="py-6 text-center text-xs text-[#a4a7ac]">
                          <Bell className="mx-auto size-6 text-[#454d5b] mb-1.5" />
                          <span>
                            {activity
                              ? 'Tidak ada pemberitahuan mendesak.'
                              : 'Belum ada pemberitahuan baru.'}
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
                      {roleNames[member.role] || member.role_name || 'Staf'}
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
                          {roleNames[member.role] || member.role_name || 'Staf'}
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
                role={member.role} permissions={member.permissions}
                category={business.category}
                onNavigate={navigate}
                businessName={businessName}
                assistantVisible={assistantAllowed ? assistantVisible : undefined}
              />
            </div>
          </div>
        </header>

        {/* Main Content Area & Capsule Sidebar Rail */}
        <div className="flex-1 flex items-start w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 gap-5 pt-2 pb-10">
          {/* Vertical Capsule Sidebar (Pill Rail with Asisten Bisnis AI & Pengaturan) */}
          <DashboardSidebar
            role={member.role} permissions={member.permissions}
            category={business.category}
            onNavigate={navigate}
            activePath={activePath}
            assistantVisible={assistantAllowed ? assistantVisible : undefined}
          />

          {/* Main Content Container */}
          <div
            id="dashboard-content"
            className="flex-1 min-w-0 focus:outline-none"
            tabIndex={-1}
          >
            {children}
          </div>
        </div>
      </main>
      {assistantAllowed && (
        <FloatingBusinessAssistant
          visible={assistantVisible}
          configured={assistantConfigured}
          onClose={() => setAssistantVisible(false)}
        />
      )}
    </ActivityPublisher.Provider>
  )
}
