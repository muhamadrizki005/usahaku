import { requireBusiness } from '@/lib/access'
import { StaffManagement } from '@/components/staff-management'

export default async function StaffPage() {
  const { supabase, business } = await requireBusiness(['owner'])
  const { data: members, error } = await supabase
    .from('business_members')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at')

  return (
    <div className="w-full max-w-[1180px] text-white">
      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-300">
          Daftar staf belum dapat dimuat. Muat ulang sebelum mengelola akses.
        </div>
      ) : (
        <StaffManagement members={members || []} business={business} />
      )}
    </div>
  )
}
