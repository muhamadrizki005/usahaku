import { requireBusiness } from '@/lib/access'
import OriginalSetup from '@/components/original/setup'
import type { Member } from '@/lib/validation'
export default async function SetupPage() {
  const { business, member, supabase } = await requireBusiness(['owner'])
  const { data, error } = await supabase.from('business_members').select('*').eq('business_id', business.id).order('created_at')
  if (error) throw new Error('Data staf belum dapat dimuat.')
  return <OriginalSetup business={business} ownerName={member.name} members={data as Member[]} />
}
