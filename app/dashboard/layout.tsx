import { requireBusiness } from '@/lib/access'
import { DashboardAmbient } from '@/components/dashboard-ambient'
import { DashboardShell } from '@/components/dashboard-shell'
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { business, member } = await requireBusiness()
  return <DashboardAmbient><DashboardShell business={business} member={member}>{children}</DashboardShell></DashboardAmbient>
}
