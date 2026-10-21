import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import PosManagement from '@/components/pos-management'

type PosPageProps = { searchParams: Promise<{ category?: string }> }

export default async function PosPage({ searchParams }: PosPageProps) {
  const { business } = await requireBusiness(rolesForPath('/dashboard/pos'))

  const { category } = await searchParams
  const initialCategory = category === 'restoran' || category === 'barbershop' ? category : 'toko'
  return <PosManagement initialCategory={initialCategory} business={business} />
}
