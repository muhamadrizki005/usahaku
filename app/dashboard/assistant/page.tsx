import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import DashboardSection from '@/components/dashboard-section'
type Props = { searchParams: Promise<{ category?: string }> }
export default async function AssistantPage({ searchParams }: Props) {
  await requireBusiness(rolesForPath('/dashboard/assistant'))
 const { category } = await searchParams; return <DashboardSection title="Asisten Bisnis AI" category={category} /> }
