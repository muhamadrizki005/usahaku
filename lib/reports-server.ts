import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {reportBounds,type ReportData,type ReportFilter} from './reports'
export class ReportError extends Error{
  status:number
  constructor(code?:string){super(code==='PT413'?'Laporan melebihi 20.000 transaksi atau refund. Persempit rentang tanggal.':code==='42501'?'Akses laporan ditolak.':code==='22023'?'Filter laporan tidak valid.':code==='PGRST202'?'Laporan belum tersedia. Hubungi pengelola aplikasi.':'Laporan belum dapat dibaca. Coba lagi beberapa saat.');this.status=code==='PT413'?413:code==='42501'?403:code==='22023'?400:code==='PGRST202'?503:502}
}
export async function readReport(client:SupabaseClient,businessId:string,filter:ReportFilter):Promise<ReportData>{
  const {start,end}=reportBounds(filter)
  const {data,error}=await client.rpc('read_sales_report',{target_id:businessId,from_ts:start,to_ts:end,payment_method:filter.payment}).abortSignal(AbortSignal.timeout(20000)).retry(false)
  if(error||!data)throw new ReportError(error?.code)
  return data as ReportData
}
export function urlReportParams(params:URLSearchParams){return Object.fromEntries(['from','to','payment'].map(key=>{const values=params.getAll(key);return[key,values.length>1?values:values[0]]}))}
