import { requireBusiness } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
import BusinessPaymentSettings from '@/components/business-payment-settings'
import {readBusinessPayments} from '@/lib/business-payments-server'
export default async function SettingsPage() {
  const { user, member, business,supabase } = await requireBusiness(['owner'])
  return <><OriginalIdentity ownerName={member.name} userId={user.id} business={business} embedded />{business.category==='store'&&<BusinessPaymentSettings initial={await readBusinessPayments(supabase,business.id)} businessId={business.id}/>}</>
}
