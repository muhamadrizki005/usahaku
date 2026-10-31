import { requireAccount } from '@/lib/access'
import { homeForRole } from '@/lib/auth/permissions'
import { AccountSettingsView } from '@/components/account/account-settings-view'
import type { Business } from '@/lib/validation'

export default async function AccountPage() {
  const { supabase, user, member } = await requireAccount()

  let business: Business | null = null
  if (member?.business_id) {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', member.business_id)
      .maybeSingle()
    business = data as Business | null
  }

  const registeredDateFormatted = user.created_at
    ? new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(user.created_at))
    : '-'

  const backHref = member
    ? member.must_change_password
      ? '/account/password'
      : homeForRole(member.role)
    : '/onboarding'

  const backLabel = member
    ? member.must_change_password
      ? 'Ganti sandi sementara'
      : 'Kembali ke Dashboard'
    : 'Lanjut ke Onboarding'

  return (
    <AccountSettingsView
      user={{
        id: user.id,
        email: user.email,
        phone: user.phone,
        created_at: user.created_at,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata,
      }}
      member={member}
      business={business}
      registeredDateFormatted={registeredDateFormatted}
      backHref={backHref}
      backLabel={backLabel}
    />
  )
}
