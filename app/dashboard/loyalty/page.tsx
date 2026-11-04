import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import DashboardSection from '@/components/dashboard-section'
import { redirect } from 'next/navigation'
type Props = { searchParams: Promise<{ category?: string }> }
export default async function LoyaltyPage({ searchParams }: Props) {
  const { business } = await requireBusiness(rolesForPath('/dashboard/loyalty'))
  if (business.category === 'barbershop') redirect('/dashboard/salon/services')
 const { category } = await searchParams; return <DashboardSection title="Poin loyalitas" category={category} /> }
