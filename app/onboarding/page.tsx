import { requireOnboardingDraft } from '@/lib/access'
import OriginalCategory from '@/components/original/category'

export default async function OnboardingPage() {
  const { user, member, business } = await requireOnboardingDraft()
  const ownerName = member?.name || String(user.user_metadata.full_name || user.user_metadata.name || 'Pemilik usaha')
  return <OriginalCategory ownerName={ownerName} userId={user.id} lockedCategory={business?.category === 'restaurant' ? 'restoran' : business ? 'toko' : undefined} />
}
