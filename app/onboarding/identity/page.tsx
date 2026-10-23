import { requireAccount, requireBusiness } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
export default async function IdentityPage() {
  const { user, member } = await requireAccount()
  if (member) {
    const context = await requireBusiness(['owner'], true)
    return <OriginalIdentity ownerName={context.member.name} userId={user.id} onboarding business={context.business} />
  }
  const ownerName = String(user.user_metadata.full_name || user.user_metadata.name || 'Pemilik usaha')
  return <OriginalIdentity ownerName={ownerName} userId={user.id} onboarding />
}
