import {readSales} from '@/lib/pos-server'
import { readProducts } from '@/lib/catalog-server'
import { requireBusiness } from '@/lib/access'
import UsahakuDashboard from '@/components/usahaku-dashboard'
import type { Member } from '@/lib/validation'
import RestaurantOverview from '@/components/restaurant-overview'
import { readRestaurantOverview } from '@/lib/restaurant-server'
export default async function DashboardPage() {
  const { business, member, supabase } = await requireBusiness(['owner', 'admin'])
  if (business.category === 'restaurant') return <RestaurantOverview business={business} summary={await readRestaurantOverview(supabase,business.id)} />
  const { data, error } = await supabase.from('business_members').select('*').eq('business_id', business.id)
  if (error) throw new Error('Data akses belum dapat dimuat.')
  return <UsahakuDashboard business={business} member={member} members={data as Member[]} initialProducts={await readProducts(supabase,business.id)} sales={await readSales(supabase,business.id)} />
}
