'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { RestaurantTableUsage } from '@/lib/restaurant'

export default function RestaurantTableRefresh({ usage }: { usage: RestaurantTableUsage[] }) {
  const router = useRouter(), next = usage[0]?.next_change_at, observed = usage[0]?.observed_at
  useEffect(() => {
    if (!usage.length) return
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh() }
    const delay = next && observed ? Math.max(100, Date.parse(next) - Date.parse(observed) + 150) : 30000
    const timer = setTimeout(refresh, Math.min(delay, 30000))
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [router, next, observed, usage.length])
  return null
}
