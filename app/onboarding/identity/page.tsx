import { requireOnboardingDraft } from '@/lib/access'
import OriginalIdentity from '@/components/original/identity'
import { categoryFromSlug, businessSlug } from '@/lib/business-categories'

export default async function IdentityPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { user, member, business } = await requireOnboardingDraft()
  const ownerName = member?.name || String(user.user_metadata.full_name || user.user_metadata.name || 'Pemilik usaha')
  const requested = categoryFromSlug((await searchParams).category) || 'store'
  return <OriginalIdentity ownerName={ownerName} userId={user.id} onboarding business={business || undefined} initialCategory={businessSlug(business?.category || requested)} />
}
