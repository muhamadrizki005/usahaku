import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import DashboardSection from '@/components/dashboard-section'
type Props = { searchParams: Promise<{ category?: string }> }
export default async function LoyaltyPage({ searchParams }: Props) {
  await requireBusiness(rolesForPath('/dashboard/loyalty'))
 const { category } = await searchParams; return <DashboardSection title="Poin loyalitas" category={category} /> }
