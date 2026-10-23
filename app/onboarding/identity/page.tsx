import { requireOnboardingDraft } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'

export default async function IdentityPage() {
  const { user, member, business } = await requireOnboardingDraft()
  const ownerName = member?.name || String(user.user_metadata.full_name || user.user_metadata.name || 'Pemilik usaha')
  return <OriginalIdentity ownerName={ownerName} userId={user.id} onboarding business={business || undefined} />
}
