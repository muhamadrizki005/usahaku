import { requireBusiness } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
import RestaurantBillingSettings from '@/components/restaurant-billing-settings'
import { readRestaurantBilling } from '@/lib/restaurant-billing-server'
import { readBusinessPayments } from '@/lib/business-payments-server'

export default async function SettingsPage() {
  const { user, member, business, supabase } = await requireBusiness(['owner'])
  const payments = await readBusinessPayments(supabase, business.id)

  return (
    <OriginalIdentity
      ownerName={member.name}
      userId={user.id}
      business={business}
      embedded
      payments={payments}
      restaurantBillingNode={business.category === 'restaurant' ? <RestaurantBillingSettings initial={await readRestaurantBilling(supabase,business.id)}/> : undefined}
    />
  )
}
