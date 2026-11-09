import DashboardSection from '@/components/dashboard-section'
import { SalonResources } from '@/components/salon-resources'
import { readSalonFoundation, requireSalon } from '@/lib/salon-server'
import { readProducts, readCustomCategories, readCustomUnits } from '@/lib/catalog-server'

export default async function ServicesPage() {
  const { business, member, supabase } = await requireSalon()
  const [data, products, customCategories, customUnits] = await Promise.all([
    readSalonFoundation(supabase, business.id),
    readProducts(supabase, business.id),
    readCustomCategories(supabase, business.id),
    readCustomUnits(supabase, business.id),
  ])

  return (
    <DashboardSection title="Layanan & Produk" businessName={business.name}>
      <SalonResources
        resource="service"
        data={data}
        canManage={['owner', 'admin'].includes(member.role)}
        initialProducts={products}
        initialCategories={customCategories}
        initialUnits={customUnits}
      />
    </DashboardSection>
  )
}
