import { redirect } from 'next/navigation'
import { requireBusiness } from '@/lib/access'
import { defaultReportFilter, parseReportFilter } from '@/lib/reports'
import { readRestaurantDepositReport } from '@/lib/restaurant-deposit-report-server'
import { ReportError } from '@/lib/reports-server'
import type { DepositReport } from '@/lib/restaurant-deposit-report'
import RestaurantDepositReport from '@/components/restaurant-deposit-report'
export default async function DepositsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const { supabase, business, member } = await requireBusiness(['owner','admin'], false, 'reports:view')
  if (business.category !== 'restaurant') redirect('/dashboard/reports')
  let filter = defaultReportFilter(), data: DepositReport | null = null, error: string | undefined
  try { filter = parseReportFilter(await searchParams) } catch(e) { error = (e as Error).message }
  if (!error) try { data = await readRestaurantDepositReport(supabase,business.id,filter) } catch(e) { error = e instanceof ReportError ? e.message : 'Laporan DP belum dapat dimuat. Coba lagi.' }
  return <RestaurantDepositReport business={business} member={member} filter={filter} data={data} error={error}/>
}
