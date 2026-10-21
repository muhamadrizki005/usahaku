import { redirect } from 'next/navigation'
import { requireBusiness } from '@/lib/access'
export default async function StaffPage() {
  await requireBusiness(['owner'])
  redirect('/onboarding/setup?category=toko&panel=staff')
}
