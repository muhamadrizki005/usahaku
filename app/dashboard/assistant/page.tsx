import { requireBusiness } from '@/lib/access'
import BusinessAssistant from '@/components/business-assistant'
import { geminiConfig } from '@/lib/assistant-server'

export default async function AssistantPage() {
  const { business } = await requireBusiness(['owner', 'admin'])
  if (business.category !== 'store') return <p>Asisten saat ini tersedia untuk kategori toko.</p>
  return <BusinessAssistant configured={Boolean(geminiConfig().key)} />
}
