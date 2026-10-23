import { requireOnboardingDraft } from '@/lib/access'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardingDraft()
  return children
}
