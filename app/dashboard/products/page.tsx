import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import ProductManagement from '@/components/product-management'

type ProductPageProps = { searchParams: Promise<{ category?: string }> }

export default async function ProductsPage({ searchParams }: ProductPageProps) {
  const { business } = await requireBusiness(rolesForPath('/dashboard/products'))

  const { category } = await searchParams
  const initialCategory = category === 'restoran' || category === 'barbershop' ? category : 'toko'
  return <ProductManagement initialCategory={initialCategory} business={business} />
}
