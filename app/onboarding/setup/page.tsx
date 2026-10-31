import { readProducts } from '@/lib/catalog-server'
import { requireOnboardingDraft } from '@/lib/access'
import OriginalSetup from '@/components/original/setup'
import type { Member } from '@/lib/validation'
import { redirect } from 'next/navigation'
import { readRestaurantMenu, readRestaurantTables } from '@/lib/restaurant-server'
import { RestaurantSetup } from '@/components/restaurant-onboarding'

export default async function SetupPage() {
  const { business, member, supabase } = await requireOnboardingDraft()
  if (!business || !member) redirect('/onboarding/identity')
  const { data, error } = await supabase.from('business_members').select('*').eq('business_id', business.id).order('created_at')
  if (error) throw new Error('Data staf belum dapat dimuat.')
  if (business.category === 'restaurant') return <RestaurantSetup business={business} ownerName={member.name} members={data as Member[]} menu={await readRestaurantMenu(supabase, business.id)} tables={await readRestaurantTables(supabase, business.id)} />
  return <OriginalSetup business={business} ownerName={member.name} members={data as Member[]} initialProducts={await readProducts(supabase, business.id)} />
}
