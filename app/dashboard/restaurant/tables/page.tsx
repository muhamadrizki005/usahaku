import { redirect } from 'next/navigation'
import { requireBusiness } from '@/lib/access'
import { readRestaurantTables, readRestaurantUsage } from '@/lib/restaurant-server'
import { RestaurantResources } from '@/components/restaurant-forms'
import DashboardSection from '@/components/dashboard-section'

export default async function RestaurantTablesPage() {
  const { business, supabase } = await requireBusiness(['owner', 'admin'])
  if (business.category !== 'restaurant') redirect('/dashboard')
  return <DashboardSection title="Meja & kapasitas"><RestaurantResources resource="table" tables={await readRestaurantTables(supabase, business.id)} usage={await readRestaurantUsage(supabase, business.id)} /></DashboardSection>
}
