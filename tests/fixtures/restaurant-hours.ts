import { businessDays, type BusinessHours } from '../../lib/business-profile'

// Keep a daily maintenance minute six hours away from the short-lived fixture orders.
export function restaurantTestHours(now = Date.now()): BusinessHours {
  const local = new Date(now + 7 * 3600000), gap = (local.getUTCHours() * 60 + local.getUTCMinutes() + 360) % 1440
  const time = (m: number) => String(Math.floor(m / 60)).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0')
  return Object.fromEntries(businessDays.map(day => [day, { open: time((gap + 1) % 1440), close: time(gap), closed: false }])) as BusinessHours
}
