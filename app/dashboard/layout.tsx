import { requireBusiness } from '@/lib/access'
import { DashboardAmbient } from '@/components/dashboard-ambient'
import { DashboardShell } from '@/components/dashboard-shell'
import { geminiConfig } from '@/lib/assistant-server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { business, member, user } = await requireBusiness()
  const userAvatar = (user.user_metadata?.avatar_url as string) || null

  return (
    <DashboardAmbient>
      <DashboardShell
        key={business.id + ':' + member.user_id}
        business={business}
        member={member}
        userAvatar={userAvatar}
        assistantConfigured={Boolean(geminiConfig().key)}
      >
        {children}
      </DashboardShell>
    </DashboardAmbient>
  )
}
