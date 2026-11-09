import { requireBusiness } from '@/lib/access'
import BusinessAssistant from '@/components/business-assistant'
import { geminiConfig } from '@/lib/assistant-server'

export default async function AssistantPage() {
  const { business } = await requireBusiness(undefined, false, ['reports:view', 'products:view'])
  if (!['store','restaurant','barbershop'].includes(business.category)) return <p>Asisten tersedia untuk toko, restoran/cafe, dan barbershop/salon.</p>
  return <BusinessAssistant category={business.category as 'store' | 'restaurant' | 'barbershop'} configured={Boolean(geminiConfig().key)} />
}
