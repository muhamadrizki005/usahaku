import {readSales} from '@/lib/pos-server'
import { readProducts } from '@/lib/catalog-server'
import { requireBusiness } from '@/lib/access'
import UsahakuDashboard from '@/components/usahaku-dashboard'
import type { Member } from '@/lib/validation'
import RestaurantOverview from '@/components/restaurant-overview'
import { readRestaurantOverview, readRestaurantMenu, readRestaurantTables, readRestaurantUsage } from '@/lib/restaurant-server'
import SalonOverview from '@/components/salon-overview'
import { readSalonFoundation,readSalonSummary } from '@/lib/salon-server'
import {wibDate} from '@/lib/reports'
export default async function DashboardPage() {
  const { business, member, supabase } = await requireBusiness(undefined, false, 'overview:view')
  if (business.category === 'barbershop') {const day=wibDate(new Date()),from=new Date(day+'T00:00:00+07:00').toISOString(),to=new Date(Date.parse(from)+86400000).toISOString();return <SalonOverview business={business} data={await readSalonFoundation(supabase,business.id)} summary={await readSalonSummary(supabase,business.id,from,to)} day={day}/>}
  if (business.category === 'restaurant') {
    const [summary, sales, menu, tables, usage] = await Promise.all([
      readRestaurantOverview(supabase, business.id),
      readSales(supabase, business.id),
      readRestaurantMenu(supabase, business.id),
      readRestaurantTables(supabase, business.id),
      readRestaurantUsage(supabase, business.id),
    ])
    const { data } = await supabase.from('business_members').select('*').eq('business_id', business.id)
    return (
      <RestaurantOverview
        business={business}
        member={member}
        members={(data || []) as Member[]}
        summary={summary}
        sales={sales}
        menu={menu}
        tables={tables}
        usage={usage}
      />
    )
  }
  const { data, error } = await supabase.from('business_members').select('*').eq('business_id', business.id)
  if (error) throw new Error('Data akses belum dapat dimuat.')
  return <UsahakuDashboard business={business} member={member} members={data as Member[]} initialProducts={await readProducts(supabase,business.id)} sales={await readSales(supabase,business.id)} />
}
