import { z } from 'zod'
import { profileCoordinates, coordinatePairProblem } from './business-map'

export const businessDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const
export type BusinessDay = typeof businessDays[number]
export type BusinessHours = Record<BusinessDay, { open: string; close: string; closed: boolean }>
export const businessTimezone = 'Asia/Jakarta'
export const defaultBusinessHours = (): BusinessHours => Object.fromEntries(businessDays.map(day => [day, { open: '09:00', close: '21:00', closed: true }])) as BusinessHours

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Gunakan jam HH:mm yang valid.')
const daySchema = z.object({ open: time, close: time, closed: z.boolean() }).strict()
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
export function hoursProblem(hours: BusinessHours): string | null {
  const intervals = businessDays.flatMap((day, index) => {
    const value = hours[day]
    if (value.closed) return []
    const start = minutes(value.open), end = minutes(value.close)
    return [{ day, start: index * 1440 + start, end: index * 1440 + end + (end < start ? 1440 : 0) }]
  })
  if (!intervals.length) return 'Pilih minimal satu hari buka.'
  if (intervals.some(value => value.start === value.end)) return 'Jam buka dan tutup tidak boleh sama; buka 24 jam belum didukung.'
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
    for (const shift of [-10080, 0, 10080]) {
      if (Math.max(intervals[i].start, intervals[j].start + shift) < Math.min(intervals[i].end, intervals[j].end + shift)) return `Jadwal ${intervals[i].day} dan ${intervals[j].day} bertumpang tindih.`
    }
  }
  return null
}
export const businessHoursSchema = z.object(Object.fromEntries(businessDays.map(day => [day, daySchema])) as Record<BusinessDay, typeof daySchema>).strict().superRefine((hours, ctx) => {
  const message = hoursProblem(hours)
  if (message) ctx.addIssue({ code: 'custom', message })
})
export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Nama usaha minimal 2 karakter.').max(100),
  phone: z.string().trim().max(30),
  address: z.string().trim().min(1, 'Isi alamat usaha.').max(300),
  city: z.string().trim().min(1, 'Isi kota/kabupaten.').max(100),
  province: z.string().trim().min(1, 'Isi provinsi.').max(100),
  district: z.string().trim().max(100).default(''),
  village: z.string().trim().max(100).default(''),
  ...profileCoordinates,
  description: z.string().trim().max(300),
}).superRefine((value, ctx) => {
  const coordinateError = coordinatePairProblem(value)
  if (coordinateError) ctx.addIssue({ code: 'custom', message: coordinateError })
  if ([value.address, value.village, value.district, value.city, value.province].filter(Boolean).join(', ').length > 500) ctx.addIssue({ code: 'custom', message: 'Alamat lengkap maksimal 500 karakter.' })
})
export function businessInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'U'
}
export function describeHours(day: BusinessHours[BusinessDay]) {
  return day.closed ? 'Tutup' : `${day.open}–${day.close}${day.close < day.open ? ' (+1 hari)' : ''}`
}
