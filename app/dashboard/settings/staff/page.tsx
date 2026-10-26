import { requireBusiness } from '@/lib/access'
import { StaffManagement } from '@/components/staff-management'
import Link from 'next/link'
export default async function StaffPage() {
  const { supabase, member, business } = await requireBusiness(['owner'])
  const { data: members, error } = await supabase.from('business_members').select('*').eq('business_id', business.id).order('created_at')
  return <div className="w-full max-w-[1180px] text-white">
      <h1 className="text-3xl font-semibold sm:text-4xl">Staf & akses</h1>
      <p className="mt-3 text-[#a4a7ac]">Kode toko: <strong className="text-white">{business.code}</strong></p>
      <section className="mt-8 rounded-xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6">
        {error ? <p role="alert">Daftar staf belum dapat dimuat. Muat ulang sebelum mengelola akses.</p> : <StaffManagement members={members || []} />}
      </section>
      <Link href="/dashboard" className="mt-6 inline-block rounded-xl border border-[#454d5b] bg-[#273242] px-5 py-3 text-sm font-semibold text-[#a4a7ac]">Kembali</Link>
  </div>
}
