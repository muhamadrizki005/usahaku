import { requireBusiness } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
import RestaurantBillingSettings from '@/components/restaurant-billing-settings'
import { readRestaurantBilling } from '@/lib/restaurant-billing-server'
import { readBusinessPayments } from '@/lib/business-payments-server'
import { readSalonSettings } from '@/lib/salon-server'
import SalonOperationSettings from '@/components/salon-operation-settings'
import RestaurantLoyaltySettings from '@/components/restaurant-loyalty-settings'

export default async function SettingsPage() {
  const { user, member, business, supabase } = await requireBusiness(['owner'])
  const payments = await readBusinessPayments(supabase, business.id)
  const restaurantBilling = business.category === 'restaurant' ? await readRestaurantBilling(supabase,business.id) : null

  return (
    <OriginalIdentity
      ownerName={member.name}
      userId={user.id}
      business={business}
      embedded
      payments={payments}
      restaurantBillingNode={restaurantBilling ? <><RestaurantBillingSettings initial={restaurantBilling}/><RestaurantLoyaltySettings key={restaurantBilling.revision} initial={restaurantBilling}/></> : business.category==='barbershop' ? <SalonOperationSettings initial={await readSalonSettings(supabase,business.id)}/> : undefined}
    />
  )
}
