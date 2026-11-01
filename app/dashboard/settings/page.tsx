import { requireBusiness } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
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
    />
  )
}
