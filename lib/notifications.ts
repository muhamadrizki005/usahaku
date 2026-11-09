export type NotificationCategory =
  | 'product'
  | 'menu'
  | 'service'
  | 'order'
  | 'table'
  | 'reservation'
  | 'appointment'
  | 'customer'
  | 'practitioner'
  | 'transaction'
  | 'staff'
  | 'system'
  | 'inventory'
  | 'low_stock'

export interface CategoryDefinition {
  key: 'all' | NotificationCategory
  label: string
  activeBg: string
  activeText: string
  inactiveBg: string
  inactiveText: string
}

export const STORE_NOTIFICATION_CATEGORIES: CategoryDefinition[] = [
  {
    key: 'all',
    label: 'Semua',
    activeBg: 'bg-[#1835d9]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#303640]',
    inactiveText: 'text-[#c5cbd5] hover:bg-[#3d4653]',
  },
  {
    key: 'product',
    label: 'Produk',
    activeBg: 'bg-[#24cbc5]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#24cbc5]/15',
    inactiveText: 'text-[#24cbc5] hover:bg-[#24cbc5]/25',
  },
  {
    key: 'inventory',
    label: 'Inventori / Stok',
    activeBg: 'bg-[#f59e0b]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#f59e0b]/15',
    inactiveText: 'text-[#fcd34d] hover:bg-[#f59e0b]/25',
  },
  {
    key: 'transaction',
    label: 'Transaksi',
    activeBg: 'bg-[#10b981]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#10b981]/15',
    inactiveText: 'text-[#6ee7b7] hover:bg-[#10b981]/25',
  },
  {
    key: 'customer',
    label: 'Pelanggan',
    activeBg: 'bg-[#3b82f6]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#3b82f6]/15',
    inactiveText: 'text-[#93c5fd] hover:bg-[#3b82f6]/25',
  },
  {
    key: 'staff',
    label: 'Staf',
    activeBg: 'bg-[#eab308]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#eab308]/15',
    inactiveText: 'text-[#fef08a] hover:bg-[#eab308]/25',
  },
  {
    key: 'system',
    label: 'Sistem',
    activeBg: 'bg-[#ec4899]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#ec4899]/15',
    inactiveText: 'text-[#f472b6] hover:bg-[#ec4899]/25',
  },
]

export const RESTAURANT_NOTIFICATION_CATEGORIES: CategoryDefinition[] = [
  {
    key: 'all',
    label: 'Semua',
    activeBg: 'bg-[#1835d9]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#303640]',
    inactiveText: 'text-[#c5cbd5] hover:bg-[#3d4653]',
  },
  {
    key: 'menu',
    label: 'Menu',
    activeBg: 'bg-[#24cbc5]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#24cbc5]/15',
    inactiveText: 'text-[#24cbc5] hover:bg-[#24cbc5]/25',
  },
  {
    key: 'order',
    label: 'Pesanan',
    activeBg: 'bg-[#6366f1]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#6366f1]/15',
    inactiveText: 'text-[#a5b4fc] hover:bg-[#6366f1]/25',
  },
  {
    key: 'table',
    label: 'Meja',
    activeBg: 'bg-[#0ea5e9]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#0ea5e9]/15',
    inactiveText: 'text-[#7dd3fc] hover:bg-[#0ea5e9]/25',
  },
  {
    key: 'reservation',
    label: 'Reservasi',
    activeBg: 'bg-[#8b5cf6]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#8b5cf6]/15',
    inactiveText: 'text-[#c4b5fd] hover:bg-[#8b5cf6]/25',
  },
  {
    key: 'transaction',
    label: 'Transaksi',
    activeBg: 'bg-[#10b981]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#10b981]/15',
    inactiveText: 'text-[#6ee7b7] hover:bg-[#10b981]/25',
  },
  {
    key: 'staff',
    label: 'Staf',
    activeBg: 'bg-[#eab308]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#eab308]/15',
    inactiveText: 'text-[#fef08a] hover:bg-[#eab308]/25',
  },
  {
    key: 'system',
    label: 'Sistem',
    activeBg: 'bg-[#ec4899]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#ec4899]/15',
    inactiveText: 'text-[#f472b6] hover:bg-[#ec4899]/25',
  },
]

export const SALON_NOTIFICATION_CATEGORIES: CategoryDefinition[] = [
  {
    key: 'all',
    label: 'Semua',
    activeBg: 'bg-[#1835d9]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#303640]',
    inactiveText: 'text-[#c5cbd5] hover:bg-[#3d4653]',
  },
  {
    key: 'service',
    label: 'Layanan',
    activeBg: 'bg-[#24cbc5]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#24cbc5]/15',
    inactiveText: 'text-[#24cbc5] hover:bg-[#24cbc5]/25',
  },
  {
    key: 'product',
    label: 'Produk',
    activeBg: 'bg-[#06b6d4]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#06b6d4]/15',
    inactiveText: 'text-[#67e8f9] hover:bg-[#06b6d4]/25',
  },
  {
    key: 'appointment',
    label: 'Janji Temu',
    activeBg: 'bg-[#6366f1]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#6366f1]/15',
    inactiveText: 'text-[#a5b4fc] hover:bg-[#6366f1]/25',
  },
  {
    key: 'customer',
    label: 'Pelanggan',
    activeBg: 'bg-[#3b82f6]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#3b82f6]/15',
    inactiveText: 'text-[#93c5fd] hover:bg-[#3b82f6]/25',
  },
  {
    key: 'practitioner',
    label: 'Penata / Terapis',
    activeBg: 'bg-[#14b8a6]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#14b8a6]/15',
    inactiveText: 'text-[#5eead4] hover:bg-[#14b8a6]/25',
  },
  {
    key: 'transaction',
    label: 'Transaksi',
    activeBg: 'bg-[#10b981]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#10b981]/15',
    inactiveText: 'text-[#6ee7b7] hover:bg-[#10b981]/25',
  },
  {
    key: 'staff',
    label: 'Staf',
    activeBg: 'bg-[#eab308]',
    activeText: 'text-[#1c222e] font-semibold',
    inactiveBg: 'bg-[#eab308]/15',
    inactiveText: 'text-[#fef08a] hover:bg-[#eab308]/25',
  },
  {
    key: 'system',
    label: 'Sistem',
    activeBg: 'bg-[#ec4899]',
    activeText: 'text-white font-medium',
    inactiveBg: 'bg-[#ec4899]/15',
    inactiveText: 'text-[#f472b6] hover:bg-[#ec4899]/25',
  },
]

export const NOTIFICATION_CATEGORIES: CategoryDefinition[] = STORE_NOTIFICATION_CATEGORIES

export function getNotificationCategories(businessCategory?: string): CategoryDefinition[] {
  if (businessCategory === 'barbershop') {
    return SALON_NOTIFICATION_CATEGORIES
  }
  if (businessCategory === 'restaurant') {
    return RESTAURANT_NOTIFICATION_CATEGORIES
  }
  return STORE_NOTIFICATION_CATEGORIES
}

export function notificationMatchesCategory(
  notifCategory: NotificationCategory,
  filterKey: 'all' | NotificationCategory,
  businessCategory?: string
): boolean {
  if (filterKey === 'all') return true
  if (filterKey === notifCategory) return true

  if (businessCategory === 'barbershop') {
    if (filterKey === 'service') return notifCategory === 'service'
    if (filterKey === 'product') return notifCategory === 'product' || notifCategory === 'inventory' || notifCategory === 'low_stock'
    if (filterKey === 'appointment') return notifCategory === 'appointment' || notifCategory === 'reservation'
    if (filterKey === 'practitioner') return notifCategory === 'practitioner'
    if (filterKey === 'customer') return notifCategory === 'customer'
    if (filterKey === 'transaction') return notifCategory === 'transaction'
    if (filterKey === 'staff') return notifCategory === 'staff'
    if (filterKey === 'system') return notifCategory === 'system'
    return false
  }

  if (businessCategory === 'restaurant') {
    if (filterKey === 'menu') return notifCategory === 'menu' || notifCategory === 'product'
    if (filterKey === 'order') return notifCategory === 'order'
    if (filterKey === 'table') return notifCategory === 'table'
    if (filterKey === 'reservation') return notifCategory === 'reservation'
    if (filterKey === 'transaction') return notifCategory === 'transaction'
    if (filterKey === 'staff') return notifCategory === 'staff'
    if (filterKey === 'system') return notifCategory === 'system'
    return false
  }

  // store default
  if (filterKey === 'product') return notifCategory === 'product' || notifCategory === 'menu'
  if (filterKey === 'inventory') return notifCategory === 'inventory' || notifCategory === 'low_stock'
  if (filterKey === 'transaction') return notifCategory === 'transaction'
  if (filterKey === 'customer') return notifCategory === 'customer'
  if (filterKey === 'staff') return notifCategory === 'staff'
  if (filterKey === 'system') return notifCategory === 'system'
  return false
}

export function getNotificationCategoryDefinition(
  notifCategory: NotificationCategory,
  businessCategory?: string
): CategoryDefinition {
  const categories = getNotificationCategories(businessCategory)
  const exact = categories.find(c => c.key === notifCategory)
  if (exact) return exact

  if (businessCategory === 'barbershop') {
    if (notifCategory === 'reservation') return categories.find(c => c.key === 'appointment') || categories[0]
    if (notifCategory === 'inventory' || notifCategory === 'low_stock') return categories.find(c => c.key === 'product') || categories[0]
  }

  if (businessCategory === 'restaurant') {
    if (notifCategory === 'product') return categories.find(c => c.key === 'menu') || categories[0]
    if (notifCategory === 'appointment') return categories.find(c => c.key === 'reservation') || categories[0]
  }

  if (notifCategory === 'low_stock' || notifCategory === 'inventory') {
    return categories.find(c => c.key === 'inventory' || c.key === 'product') || categories[0]
  }

  return categories.find(c => c.key === 'system') || categories[0]
}

export interface AppNotification {
  id: string
  businessId: string
  title: string
  message: string
  category: NotificationCategory
  timestamp: string
  read: boolean
  link?: string
  linkLabel?: string
}

export function getNotificationsStorageKey(businessId: string) {
  return `usahaku_notifications:${businessId}`
}

export function getActiveBusinessId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem('usahaku_active_business_id')
  } catch {
    return null
  }
}

export function setActiveBusinessId(id: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('usahaku_active_business_id', id)
  } catch {}
}

export function loadAppNotifications(businessId: string): AppNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(getNotificationsStorageKey(businessId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAppNotifications(businessId: string, items: AppNotification[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getNotificationsStorageKey(businessId), JSON.stringify(items.slice(0, 100)))
  } catch {}
}

export function emitAppNotification(item: {
  businessId?: string
  title: string
  message: string
  category: NotificationCategory
  link?: string
  linkLabel?: string
}): AppNotification {
  const bId = item.businessId || getActiveBusinessId() || 'global'
  const notif: AppNotification = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
    businessId: bId,
    title: item.title,
    message: item.message,
    category: item.category,
    timestamp: new Date().toISOString(),
    read: false,
    link: item.link,
    linkLabel: item.linkLabel,
  }

  if (typeof window !== 'undefined') {
    const current = loadAppNotifications(bId)
    const updated = [notif, ...current.filter(x => x.id !== notif.id)].slice(0, 100)
    saveAppNotifications(bId, updated)
    window.dispatchEvent(new CustomEvent('usahaku:notification', { detail: notif }))
  }

  return notif
}

export function markAllAppNotificationsAsRead(businessId: string): AppNotification[] {
  if (typeof window === 'undefined') return []
  const current = loadAppNotifications(businessId)
  const updated = current.map(item => ({ ...item, read: true }))
  saveAppNotifications(businessId, updated)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('usahaku:notifications_read', { detail: { businessId } }))
  }
  return updated
}

export function markAppNotificationAsRead(businessId: string, id: string): AppNotification[] {
  if (typeof window === 'undefined') return []
  const current = loadAppNotifications(businessId)
  const updated = current.map(item => item.id === id ? { ...item, read: true } : item)
  saveAppNotifications(businessId, updated)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('usahaku:notifications_read', { detail: { businessId, id } }))
  }
  return updated
}

export function deleteAppNotification(businessId: string, id: string): AppNotification[] {
  if (typeof window === 'undefined') return []
  const current = loadAppNotifications(businessId)
  const updated = current.filter(item => item.id !== id)
  saveAppNotifications(businessId, updated)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('usahaku:notifications_deleted', { detail: { businessId, id } }))
  }
  return updated
}

export function clearAllAppNotifications(businessId: string): AppNotification[] {
  if (typeof window === 'undefined') return []
  saveAppNotifications(businessId, [])
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('usahaku:notifications_cleared', { detail: { businessId } }))
  }
  return []
}

export function notify(item: {
  businessId?: string
  title: string
  message: string
  category: NotificationCategory
  link?: string
  linkLabel?: string
  type?: 'success' | 'error' | 'info'
}): AppNotification {
  return emitAppNotification(item)
}

export function showErrorToast(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('usahaku:toast', { detail: { type: 'error', message } }))
  }
}

export function showSuccessToast(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('usahaku:toast', { detail: { type: 'success', message } }))
  }
}
