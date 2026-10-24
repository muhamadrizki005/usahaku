import { readProducts } from '@/lib/catalog-server'
import { requireOnboardingDraft } from '@/lib/access'
import OriginalSummary from '@/components/original/summary'
import type { Member } from '@/lib/validation'
import { redirect } from 'next/navigation'

export default async function SummaryPage() {
  const { business, member, supabase, user } = await requireOnboardingDraft()
  if (!business || !member) redirect('/onboarding/identity')
  const { data, error } = await supabase.from('business_members').select('*').eq('business_id', business.id).order('created_at')
  if (error) throw new Error('Data staf belum dapat dimuat.')
  return <OriginalSummary business={business} ownerName={member.name} userId={user.id} members={data as Member[]} initialProducts={await readProducts(supabase, business.id)} />
}
