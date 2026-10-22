import { readProducts, readStockHistory } from '@/lib/catalog-server'
import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import ProductManagement from '@/components/product-management'

type ProductPageProps = { searchParams: Promise<{ category?: string }> }

export default async function ProductsPage({ searchParams }: ProductPageProps) {
  const { business, member, supabase } = await requireBusiness(rolesForPath('/dashboard/products'))

  const { category } = await searchParams
  const initialCategory = 'toko' as const
  return <ProductManagement initialCategory={initialCategory} business={business} initialProducts={await readProducts(supabase,business.id)} />
}
