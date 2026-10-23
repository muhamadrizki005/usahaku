import {createClient} from '@/lib/supabase/server'
import {parseReportFilter,reportCsv} from '@/lib/reports'
import {readReport,ReportError,urlReportParams} from '@/lib/reports-server'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}
export async function GET(request:Request){
  const client=await createClient()
  const {data:{user},error:authError}=await client.auth.getUser()
  if(authError||!user)return Response.json({error:'Silakan login.'},{status:401,headers})
  const {data:member,error:memberError}=await client.from('business_members').select('*').eq('user_id',user.id).maybeSingle()
  if(memberError)return Response.json({error:'Akses belum dapat diperiksa.'},{status:502,headers})
  if(!member||!member.active||member.must_change_password||!['owner','admin'].includes(member.role))return Response.json({error:'Akses laporan ditolak.'},{status:403,headers})
  let filter;try{filter=parseReportFilter(urlReportParams(new URL(request.url).searchParams))}catch(e){return Response.json({error:(e as Error).message},{status:400,headers})}
  const {data:business,error:businessError}=await client.from('businesses').select('name,onboarding_completed_at').eq('id',member.business_id).single()
  if(businessError||!business)return Response.json({error:'Usaha belum dapat dibaca.'},{status:502,headers})
  if(!business.onboarding_completed_at)return Response.json({error:'Selesaikan pengaturan usaha terlebih dahulu.'},{status:403,headers})
  try{
    const report=await readReport(client,member.business_id,filter)
    return new Response(reportCsv(report,filter,business.name),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="laporan-${filter.from}-${filter.to}-${filter.payment}.csv"`}})
  }catch(e){return Response.json({error:e instanceof ReportError?e.message:'Ekspor laporan belum berhasil. Coba lagi.'},{status:e instanceof ReportError?e.status:502,headers})}
}
