import { readProducts } from '@/lib/catalog-server'
import { requireBusiness } from '@/lib/access'
import OriginalSummary from '@/components/original/summary'
import type { Member } from '@/lib/validation'
export default async function SummaryPage() {
  const { business, member, supabase, user } = await requireBusiness(['owner'], true)
  const { data, error } = await supabase.from('business_members').select('*').eq('business_id', business.id).order('created_at')
  if (error) throw new Error('Data staf belum dapat dimuat.')
  return <OriginalSummary business={business} ownerName={member.name} userId={user.id} members={data as Member[]} initialProducts={await readProducts(supabase,business.id)} />
}
