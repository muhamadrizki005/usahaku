import { requireBusiness } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
export default async function SettingsPage() {
  const { user, member, business } = await requireBusiness(['owner'])
  return <OriginalIdentity ownerName={member.name} userId={user.id} business={business} />
}
