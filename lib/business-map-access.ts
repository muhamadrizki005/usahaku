import 'server-only'
import { createClient } from '@/lib/supabase/server'

const budgets = new Map<string, { count: number; expires: number }>()
export function allowMapRequest(userId: string, kind: 'tile' | 'geocode') {
  const now = Date.now(), key = kind + ':' + userId
  for (const [id, budget] of budgets) if (budget.expires <= now) budgets.delete(id)
  const budget = budgets.get(key) || { count: 0, expires: now + 60000 }
  if (budget.count >= (kind === 'tile' ? 240 : 25)) return false
  budget.count++; budgets.set(key, budget); return true
}
export async function mapOwner() {
  const supabase = await createClient(), { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: member, error: memberError } = await supabase.from('business_members').select('role,active,must_change_password').eq('user_id', user.id).maybeSingle()
  if (memberError || (member ? member.role !== 'owner' || !member.active || member.must_change_password : user.app_metadata.account_type === 'staff')) return null
  return user.id
}
