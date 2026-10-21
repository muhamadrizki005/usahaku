import Link from 'next/link'
import { requireAccount } from '@/lib/access'
import { roleNames, homeForRole } from '@/lib/auth/permissions'
import { AccountCard } from '@/components/account-shell'
import { signOut } from '@/app/actions'
export default async function AccountPage() {
  const { user, member } = await requireAccount()
  const isStaff = user.app_metadata.account_type === 'staff'
  return <AccountCard title={member && !member.active ? 'Akses dinonaktifkan' : 'Akun Anda'}><p className="font-semibold">{member?.name || user.user_metadata.full_name || user.user_metadata.name || 'Pengguna'}</p>{member && <p className="mt-2 text-sm text-[#98a2b3]">{roleNames[member.role]}</p>}{member && !member.active ? <p className="mt-5 text-[#c5cbd5]">Akses Anda dinonaktifkan. Hubungi owner usaha. Sesi ini tidak memiliki akses ke data usaha.</p> : !member && isStaff ? <p className="mt-5 text-[#c5cbd5]">Akun staf belum terhubung dengan usaha. Hubungi owner.</p> : <div className="mt-6 flex flex-wrap gap-4"><Link href={member ? member.must_change_password ? '/account/password' : homeForRole(member.role) : '/onboarding'} className="text-[#24cbc5] underline">{member?.must_change_password ? 'Ganti sandi sementara' : member ? 'Kembali ke ruang usaha' : 'Buat usaha'}</Link><Link href="/account/password" className="text-[#24cbc5] underline">Ubah kata sandi</Link></div>}<form action={signOut} className="mt-8"><button className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Keluar akun</button></form></AccountCard>
}
