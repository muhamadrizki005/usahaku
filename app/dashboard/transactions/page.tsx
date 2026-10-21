import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import DashboardSection from '@/components/dashboard-section'
type Props = { searchParams: Promise<{ category?: string }> }
export default async function TransactionsPage({ searchParams }: Props) {
  await requireBusiness(rolesForPath('/dashboard/transactions'))
 const { category } = await searchParams; return <DashboardSection title="Transaksi" category={category} /> }
