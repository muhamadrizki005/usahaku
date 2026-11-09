import { requireSalon, readSalonFoundation, readSalonVisits, readSalonBusy, readSalonSettings } from '@/lib/salon-server'
import { readBusinessPayments } from '@/lib/business-payments-server'
import { readProducts } from '@/lib/catalog-server'
import { wibDate } from '@/lib/reports'
import { calendarDate } from '@/lib/calendar-date'
import SalonAppointments from '@/components/salon-appointments'

export default async function SalonAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { supabase, business, member } = await requireSalon()
  const query = await searchParams
  const day =
    typeof query.day === 'string' && calendarDate(query.day)
      ? query.day
      : wibDate(new Date())
  const page =
    typeof query.page === 'string' && /^\d{1,5}$/.test(query.page)
      ? Number(query.page)
      : 0
  const from = new Date(day + 'T00:00:00+07:00').toISOString()
  const to = new Date(Date.parse(from) + 86400000).toISOString()

  const [foundation, visits, busy, settings, payments, products] = await Promise.all([
    readSalonFoundation(supabase, business.id),
    readSalonVisits(supabase, business.id, from, to, page),
    readSalonBusy(supabase, business.id, from, to),
    readSalonSettings(supabase, business.id),
    readBusinessPayments(supabase, business.id),
    readProducts(supabase, business.id),
  ])

  return (
    <SalonAppointments
      business={business}
      member={member}
      foundation={foundation}
      visits={visits}
      busySlots={busy}
      settings={settings}
      payments={payments}
      products={products}
      day={day}
    />
  )
}
