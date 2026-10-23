import { requireAccount, requireBusiness, redirectAfterLogin } from '@/lib/access'
import OriginalCategory from '@/components/original/category'
export default async function OnboardingPage() {
  const { user, member } = await requireAccount()
  if (member) {
    if (member.role !== 'owner') return redirectAfterLogin()
    const context = await requireBusiness(['owner'], true)
    return <OriginalCategory ownerName={context.member.name} userId={user.id} />
  }
  const ownerName = String(user.user_metadata.full_name || user.user_metadata.name || 'Pemilik usaha')
  return <OriginalCategory ownerName={ownerName} userId={user.id} />
}
