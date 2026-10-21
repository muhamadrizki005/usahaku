import { redirect } from 'next/navigation'
import { requireAccount } from '@/lib/access'
import { AccountCard } from '@/components/account-shell'
import { PasswordForm } from '@/components/account-forms'
import { signOut } from '@/app/actions'
export default async function PasswordPage() {
  const { member } = await requireAccount()
  if (member && !member.active) redirect('/account')
  return <AccountCard title={member?.must_change_password ? 'Ganti kata sandi sementara' : 'Ubah kata sandi'}><p className="mb-6 text-sm leading-6 text-[#c5cbd5]">Masukkan sandi saat ini atau sementara, lalu pilih sandi baru minimal 10 karakter. Akses usaha dibuka setelah penggantian berhasil.</p><PasswordForm /><form action={signOut} className="mt-6"><button className="text-sm text-[#c5cbd5] underline">Keluar akun</button></form></AccountCard>
}
