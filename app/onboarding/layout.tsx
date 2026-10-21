import { requireAccount, redirectAfterLogin } from '@/lib/access'
import { redirect } from 'next/navigation'
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { member, user } = await requireAccount()
  if (member && (!member.active || member.must_change_password || member.role !== 'owner')) return redirectAfterLogin()
  if (!member && user.app_metadata.account_type === 'staff') redirect('/account')
  return children
}
