import Link from 'next/link'
import { requireAccount } from '@/lib/access'
import { hasRecovery } from '@/lib/auth/recovery'
import { AccountCard } from '@/components/account-shell'
import { PasswordForm } from '@/components/account-forms'
export default async function ResetPasswordPage() {
  const { user, member } = await requireAccount()
  const allowed = user.app_metadata.account_type !== 'staff' && (!member || member.role === 'owner') && await hasRecovery(user.id)
  return <AccountCard title="Atur kata sandi baru">{allowed ? <PasswordForm recovery /> : <><p role="alert" className="text-sm text-[#ffb4ae]">Tautan pemulihan tidak valid atau kedaluwarsa.</p><Link href="/forgot-password" className="mt-5 inline-block text-[#24cbc5] underline">Minta tautan baru</Link></>}</AccountCard>
}
