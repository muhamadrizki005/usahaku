import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import DashboardSection from '@/components/dashboard-section'
type Props = { searchParams: Promise<{ category?: string }> }
export default async function ReportsPage({ searchParams }: Props) {
  await requireBusiness(rolesForPath('/dashboard/reports'))
 const { category } = await searchParams; return <DashboardSection title="Laporan" category={category} /> }
