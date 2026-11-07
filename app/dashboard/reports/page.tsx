import {requireBusiness} from '@/lib/access'
import {defaultReportFilter,parseReportFilter,type ReportData} from '@/lib/reports'
import {readReport,ReportError} from '@/lib/reports-server'
import ReportManagement from '@/components/report-management'
import {readSalonSummary} from '@/lib/salon-server'
import {reportBounds} from '@/lib/reports'
import SalonReportSummary from '@/components/salon-report-summary'
export default async function ReportsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {supabase,business,member}=await requireBusiness(undefined, false, 'reports:view')
 let filter=defaultReportFilter(),data:ReportData|null=null,error:string|undefined
 try{filter=parseReportFilter(await searchParams)}catch(e){error=(e as Error).message}
 if(!error)try{data=await readReport(supabase,business.id,filter)}catch(e){error=e instanceof ReportError?e.message:'Laporan belum dapat dibaca. Coba lagi.'}
 let salonSummary=null
 if(business.category==='barbershop'&&!error){const bounds=reportBounds(filter);try{salonSummary=await readSalonSummary(supabase,business.id,bounds.start,bounds.end)}catch(e){error=(e as Error).message}}
 return <><ReportManagement business={business} member={member} filter={filter} data={data} error={error}/>{salonSummary&&<SalonReportSummary summary={salonSummary} from={filter.from} to={filter.to}/>}</>
}
