import DashboardSection from '@/components/dashboard-section'
import { SalonResources } from '@/components/salon-resources'
import { readSalonFoundation,requireSalon } from '@/lib/salon-server'
export default async function PractitionersPage(){
  const {business,member,supabase}=await requireSalon()
  return <DashboardSection title="Penata & terapis" businessName={business.name}><SalonResources resource="practitioner" data={await readSalonFoundation(supabase,business.id)} canManage={['owner','admin'].includes(member.role)}/></DashboardSection>
}
