import { readProducts, readStockHistory } from '@/lib/catalog-server'
import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import InventoryManagement from '@/components/inventory-management'
import { redirect } from 'next/navigation'

type InventoryPageProps = { searchParams: Promise<{ category?: string }> }

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const { business, member, supabase } = await requireBusiness(rolesForPath('/dashboard/inventory'))
  if (business.category === 'restaurant') redirect('/dashboard/restaurant/tables')

  const { category } = await searchParams
  const initialCategory = 'toko' as const
  return <InventoryManagement role={member.role} initialCategory={initialCategory} business={business} initialProducts={await readProducts(supabase,business.id)} initialMovements={await readStockHistory(supabase,business.id)} memberName={member.name} />
}
