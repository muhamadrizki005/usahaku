import { requireBusiness } from '@/lib/access'
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireBusiness()
  return children
}
