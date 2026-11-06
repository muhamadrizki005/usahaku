export type NotificationCategory = 'transaction' | 'product' | 'inventory' | 'low_stock' | 'system'

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
    localStorage.setItem(getNotificationsStorageKey(businessId), JSON.stringify(items.slice(0, 50)))
  } catch {}
}

export function emitAppNotification(item: {
  businessId: string
  title: string
  message: string
  category: NotificationCategory
  link?: string
  linkLabel?: string
}): AppNotification {
  const notif: AppNotification = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
    businessId: item.businessId,
    title: item.title,
    message: item.message,
    category: item.category,
    timestamp: new Date().toISOString(),
    read: false,
    link: item.link,
    linkLabel: item.linkLabel,
  }

  if (typeof window !== 'undefined') {
    const current = loadAppNotifications(item.businessId)
    const updated = [notif, ...current.filter(x => x.id !== notif.id)].slice(0, 50)
    saveAppNotifications(item.businessId, updated)
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

