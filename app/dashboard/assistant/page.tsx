import { requireBusiness } from '@/lib/access'
import BusinessAssistant from '@/components/business-assistant'
import { geminiConfig } from '@/lib/assistant-server'

export default async function AssistantPage() {
  const { business } = await requireBusiness(undefined, false, ['reports:view', 'products:view'])
  if (!['store','restaurant'].includes(business.category)) return <p>Asisten tersedia untuk toko dan restoran/cafe.</p>
  return <BusinessAssistant category={business.category === 'restaurant' ? 'restaurant' : 'store'} configured={Boolean(geminiConfig().key)} />
}
