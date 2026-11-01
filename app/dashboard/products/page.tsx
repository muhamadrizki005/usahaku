import { readProducts, readCustomCategories, readCustomUnits } from '@/lib/catalog-server'
import { requireBusiness } from '@/lib/access'
import { rolesForPath } from '@/lib/auth/permissions'
import ProductManagement from '@/components/product-management'
import { readRestaurantMenu } from '@/lib/restaurant-server'
import { RestaurantResources } from '@/components/restaurant-forms'
import DashboardSection from '@/components/dashboard-section'

type ProductPageProps = { searchParams: Promise<{ category?: string }> }

export default async function ProductsPage({ searchParams }: ProductPageProps) {
  const { business, member, supabase } = await requireBusiness(rolesForPath('/dashboard/products'))
  if (business.category === 'restaurant') return <DashboardSection title="Menu"><RestaurantResources resource="menu" menu={await readRestaurantMenu(supabase, business.id)} /></DashboardSection>

  const { category } = await searchParams
  const initialCategory = 'toko' as const
  const [products, customCategories, customUnits] = await Promise.all([
    readProducts(supabase, business.id),
    readCustomCategories(supabase, business.id),
    readCustomUnits(supabase, business.id),
  ])

  return (
    <ProductManagement
      role={member.role}
      initialCategory={initialCategory}
      business={business}
      initialProducts={products}
      initialCustomCategories={customCategories}
      initialCustomUnits={customUnits}
      renderedAt={new Date().toISOString()}
    />
  )
}
