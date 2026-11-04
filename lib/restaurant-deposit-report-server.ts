import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reportBounds, type ReportFilter } from './reports'
import { ReportError } from './reports-server'
import type { DepositReport } from './restaurant-deposit-report'
export async function readRestaurantDepositReport(client: SupabaseClient, id: string, filter: ReportFilter): Promise<DepositReport> {
  const { start, end } = reportBounds(filter)
  const { data, error } = await client.rpc('read_restaurant_deposit_report', { target_id: id, from_ts: start, to_ts: end, payment_method: filter.payment }).abortSignal(AbortSignal.timeout(20000)).retry(false)
  if (error || !data) throw new ReportError(error?.code)
  return data
}
