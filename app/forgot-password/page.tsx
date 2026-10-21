import { AccountCard } from '@/components/account-shell'
import { EmailForm } from '@/components/account-forms'
export default function ForgotPasswordPage() {
  return <AccountCard title="Pulihkan akun pemilik"><p className="mb-6 text-sm leading-7 text-[#c5cbd5]">Kami akan mengirim tautan pengaturan sandi baru ke email pemilik. Untuk akun staf, minta reset kepada owner.</p><EmailForm recovery /></AccountCard>
}
