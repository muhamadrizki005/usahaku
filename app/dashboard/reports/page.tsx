import {requireBusiness} from '@/lib/access'
import {defaultReportFilter,parseReportFilter,type ReportData} from '@/lib/reports'
import {readReport,ReportError} from '@/lib/reports-server'
import ReportManagement from '@/components/report-management'
export default async function ReportsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {supabase,business,member}=await requireBusiness(['owner','admin'])
 let filter=defaultReportFilter(),data:ReportData|null=null,error:string|undefined
 try{filter=parseReportFilter(await searchParams)}catch(e){error=(e as Error).message}
 if(!error)try{data=await readReport(supabase,business.id,filter)}catch(e){error=e instanceof ReportError?e.message:'Laporan belum dapat dibaca. Coba lagi.'}
 return <ReportManagement business={business} member={member} filter={filter} data={data} error={error}/>
}
