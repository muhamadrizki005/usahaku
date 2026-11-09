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
  Trash2,
  User,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import {
  type AppNotification,
  type NotificationCategory,
  getNotificationCategories,
  notificationMatchesCategory,
  getNotificationCategoryDefinition,
  loadAppNotifications,
  markAllAppNotificationsAsRead,
  markAppNotificationAsRead,
  deleteAppNotification,
  saveAppNotifications,
  setActiveBusinessId,
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
import { dashboardHref } from '@/lib/dashboard-href'

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
  const [activeCategory, setActiveCategory] = useState<'all' | NotificationCategory>('all')
  const [hasUnread, setHasUnread] = useState(false)
  const { toast, showToast, hideToast } = useToast(2500)

  useEffect(() => {
    if (!business?.id) return
    setActiveBusinessId(business.id)
    const loaded = loadAppNotifications(business.id)
    setNotifications(loaded)
    setHasUnread(loaded.some(n => !n.read))
  }, [business?.id])

  useEffect(() => {
    if (!business?.id) return
    setActiveBusinessId(business.id)
    const onNotification = (e: Event) => {
      const customEvent = e as CustomEvent<AppNotification>
      const notif = customEvent.detail
      if (notif && notif.businessId === business.id) {
        setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)])
        setHasUnread(true)
        showToast('success', `${notif.title} — ${notif.message}`)
      }
    }
    const onToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: 'success' | 'error'; message: string }>
      if (customEvent.detail) {
        showToast(customEvent.detail.type, customEvent.detail.message)
      }
    }
    const onRead = (e: Event) => {
      const customEvent = e as CustomEvent<{ businessId: string }>
      if (customEvent.detail?.businessId === business.id) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        setHasUnread(false)
      }
    }
    const onDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ businessId: string; id: string }>
      if (customEvent.detail?.businessId === business.id) {
        setNotifications(prev => prev.filter(n => n.id !== customEvent.detail.id))
      }
    }
    const onCleared = (e: Event) => {
      const customEvent = e as CustomEvent<{ businessId: string }>
      if (customEvent.detail?.businessId === business.id) {
        setNotifications([])
        setHasUnread(false)
      }
    }
    window.addEventListener('usahaku:notification', onNotification)
    window.addEventListener('usahaku:toast', onToast)
    window.addEventListener('usahaku:notifications_read', onRead)
    window.addEventListener('usahaku:notifications_deleted', onDeleted)
    window.addEventListener('usahaku:notifications_cleared', onCleared)
    return () => {
      window.removeEventListener('usahaku:notification', onNotification)
      window.removeEventListener('usahaku:toast', onToast)
      window.removeEventListener('usahaku:notifications_read', onRead)
      window.removeEventListener('usahaku:notifications_deleted', onDeleted)
      window.removeEventListener('usahaku:notifications_cleared', onCleared)
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
    const updated = markAppNotificationAsRead(business.id, id)
    setNotifications(updated)
    setHasUnread(updated.some(n => !n.read))
  }

  const handleDeleteOne = (id: string) => {
    if (!business?.id) return
    const updated = deleteAppNotification(business.id, id)
    setNotifications(updated)
    setHasUnread(updated.some(n => !n.read))
  }
  const assistantAllowed = ['store', 'restaurant', 'barbershop'].includes(business.category) && (hasPermission(member.role, member.permissions, 'reports:view') && hasPermission(member.role, member.permissions, 'products:view'))

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
  const navigate = (path: string) => {
    setShowAccount(false)
    setShowNotifications(false)
    if (path === '/dashboard/assistant' && assistantAllowed) {
      setAssistantVisible(value => !value)
      return
    }
    setOptimisticPath(path)
    router.push(dashboardHref(path, business.category))
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
                  <div className="fixed left-4 right-4 top-20 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[420px] rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#454d5b] pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-white">
                          Notifikasi
                        </span>
                        {notifications.filter(n => !n.read).length > 0 ? (
                          <span className="rounded-full bg-[#24cbc5]/15 px-2 py-0.5 text-[11px] font-medium text-[#24cbc5]">
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
                          className="btn-action !text-[11px] !py-1 !px-2.5 disabled:opacity-40"
                        >
                          Tandai semua telah dibaca
                        </button>
                        <button
                          onClick={() => setShowNotifications(false)}
                          className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#1c222e] hover:text-white transition-colors cursor-pointer"
                          aria-label="Tutup notifikasi"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="mt-3 flex flex-wrap gap-1.5 pb-2.5 border-b border-[#454d5b]/60">
                      {getNotificationCategories(business?.category).map(cat => {
                        const isActive = activeCategory === cat.key
                        const count = cat.key === 'all'
                          ? notifications.length
                          : notifications.filter(n => notificationMatchesCategory(n.category, cat.key, business?.category)).length
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setActiveCategory(cat.key)}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-normal border-0 transition-all ${
                              isActive ? `${cat.activeBg} ${cat.activeText}` : `${cat.inactiveBg} ${cat.inactiveText}`
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                isActive ? 'bg-black/20 text-inherit' : 'bg-white/10 text-inherit'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Notifications List */}
                    <div className="mt-3 space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {notifications
                        .filter(n => notificationMatchesCategory(n.category, activeCategory, business?.category))
                        .map(notif => {
                          const catDef = getNotificationCategoryDefinition(notif.category, business?.category)

                          return (
                            <div
                              key={notif.id}
                              className={`relative rounded-xl border p-3 text-xs transition-colors ${
                                !notif.read
                                  ? 'border-[#24cbc5]/40 bg-[#1c222e]'
                                  : 'border-[#454d5b]/60 bg-[#1c222e]/60 text-[#a4a7ac]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  {catDef && (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium border-0 ${catDef.inactiveBg} ${catDef.inactiveText}`}
                                    >
                                      {catDef.label}
                                    </span>
                                  )}
                                  <span className="font-medium text-white truncate max-w-[200px]">
                                    {notif.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!notif.read && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkOneRead(notif.id)}
                                      title="Tandai telah dibaca"
                                      className="size-2 rounded-full bg-[#24cbc5] hover:ring-2 hover:ring-[#24cbc5]/50 transition-all cursor-pointer"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteOne(notif.id)}
                                    title="Hapus notifikasi"
                                    aria-label="Hapus notifikasi"
                                    className="rounded-lg p-1 text-[#a4a7ac] hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="mt-1.5 text-xs text-[#c5cbd5] leading-relaxed break-words">
                                {notif.message}
                              </p>
                              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#454d5b]/40 pt-2">
                                <span className="text-[10px] text-[#a4a7ac]">
                                  {new Date(notif.timestamp).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}{' '}
                                  WIB
                                </span>
                                {notif.link && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleMarkOneRead(notif.id)
                                      setShowNotifications(false)
                                      navigate(notif.link!)
                                    }}
                                    className="btn-action !text-[10px] !py-0.5 !px-2"
                                  >
                                    {notif.linkLabel || 'Lihat detail →'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}

                      {/* Low Stock Warning within product/all filter */}
                      {(activeCategory === 'all' || activeCategory === 'product') && lowStock.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-[#c5cbd5]">
                          <div className="flex items-center gap-1.5 font-normal text-amber-400">
                            <AlertTriangle className="size-3.5 shrink-0" />
                            <span>Peringatan Stok Menipis</span>
                          </div>
                          <p className="mt-1 text-[#c5cbd5]">
                            {lowStock.length} produk mencapai batas minimum:{' '}
                            {lowStock
                              .slice(0, 2)
                              .map(p => p.name)
                              .join(', ')}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowNotifications(false)
                              nav('Inventori')
                            }}
                            className="mt-2 btn-action !text-[11px] !py-1 !px-2.5"
                          >
                            Kelola persediaan stok →
                          </button>
                        </div>
                      )}

                      {/* Empty state when no notifications in active filter */}
                      {notifications.filter(n => notificationMatchesCategory(n.category, activeCategory, business?.category)).length === 0 && (!lowStock.length || (activeCategory !== 'all' && activeCategory !== 'product')) && (
                        <div className="py-8 text-center text-xs text-[#a4a7ac]">
                          <Bell className="mx-auto size-6 text-[#454d5b] mb-2" />
                          <span>
                            {activeCategory === 'all'
                              ? 'Belum ada notifikasi.'
                              : `Belum ada notifikasi untuk kategori ${
                                  getNotificationCategories(business?.category).find(c => c.key === activeCategory)?.label || ''
                                }.`}
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
          category={business.category as 'store' | 'restaurant' | 'barbershop'}
          visible={assistantVisible}
          configured={assistantConfigured}
          onClose={() => setAssistantVisible(false)}
        />
      )}
    </ActivityPublisher.Provider>
  )
}
