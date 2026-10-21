import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import InventoryManagement from '@/components/inventory-management'

type InventoryPageProps = { searchParams: Promise<{ category?: string }> }

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const { business } = await requireBusiness(rolesForPath('/dashboard/inventory'))

  const { category } = await searchParams
  const initialCategory = category === 'restoran' || category === 'barbershop' ? category : 'toko'
  return <InventoryManagement initialCategory={initialCategory} business={business} />
}
