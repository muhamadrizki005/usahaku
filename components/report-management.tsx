'use client'
import {useEffect,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import Link from 'next/link'
import {CircleDollarSign,CreditCard,Package,ReceiptText} from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'
import DashboardSection from './dashboard-section'
import type {Business,Member} from '@/lib/validation'
import {paymentLabel,saleCode,saleDate} from '@/lib/pos'
import {rankProducts,reportMoney,reportPayment,reportQuery,reportSummary,reportUnits,type ReportData,type ReportFilter} from '@/lib/reports'

const card='rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm'
const input='mt-1 h-10 w-full rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm'
const button='rounded-lg border border-[#454d5b] px-3 py-2 text-sm font-normal disabled:opacity-40'
export default function ReportManagement({business,member,filter,data,error}:{business:Business;member:Member;filter:ReportFilter;data:ReportData|null;error?:string}){
  const [mounted,setMounted]=useState(false),[rank,setRank]=useState<'quantity'|'gross'>('quantity')
  useEffect(()=>setMounted(true),[])
  return <DashboardSection
    title="Laporan"
    breadcrumbTitle="Laporan"
    businessName={business.name}
    description="Analisis penjualan, penerimaan kas & non-tunai, dan produk terlaris."
    meta={`Periode filter: ${filter.from} s.d. ${filter.to} • WIB`}
    action={<p className="text-xs text-[#a4a7ac]">Laporan penjualan & ekspor</p>}
    role={member.role}
  ><style>{`@media print { @page { size:A4 landscape; margin:12mm } body { background:white !important } body > :not(#report-print-root) { display:none !important } #report-print-root { display:block !important;color:#0f172a } #report-print-root section { box-shadow:none;margin-bottom:16px;overflow:visible } #report-print-root table { width:100%;table-layout:fixed;font-size:10px } #report-print-root th,#report-print-root td { overflow-wrap:anywhere;padding:6px } #report-print-root thead { display:table-header-group } #report-print-root tr { break-inside:avoid } #report-print-root h2 { break-after:avoid } #report-print-root .report-scroll { overflow:visible } #report-print-root a { color:inherit;text-decoration:none } #report-print-root .report-metrics { grid-template-columns:repeat(4,minmax(0,1fr)) } }`}</style><form action="/dashboard/reports" method="get" className={card+' mb-5'}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Tanggal awal<input type="date" name="from" required min="2000-01-01" max="2100-12-31" defaultValue={filter.from} className={input}/></label><label className="text-sm font-medium">Tanggal akhir<input type="date" name="to" required min="2000-01-01" max="2100-12-31" defaultValue={filter.to} className={input}/></label><label className="text-sm font-medium">Metode pembayaran
  <CustomSelect
    ariaLabel="Metode pembayaran laporan"
    name="payment"
    defaultValue={filter.payment}
    options={[
      { value: 'all', label: 'Semua metode' },
      { value: 'cash', label: 'Tunai' },
      { value: 'qris', label: 'QRIS usaha' },
      { value: 'transfer', label: 'Transfer' },
    ]}
    className="mt-1 w-full"
  />
</label><div className="flex items-end"><button className={button+' h-10 bg-[#1835d9] text-white hover:bg-[#132c9e]'}>Terapkan filter</button></div></div><p className="mt-3 text-xs text-[#a4a7ac]">Tanggal termasuk hari awal dan akhir, dalam WIB. Maksimal 366 hari.</p></form>{error&&<p role="alert" className="mb-5 rounded-xl bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}</p>}{data&&<><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#a4a7ac]">CSV memakai data terbaru saat diunduh. PDF memakai laporan yang ditampilkan.</p><div className="flex gap-2"><a href={'/api/reports/sales?'+reportQuery(filter)} download className={button}>Ekspor CSV</a><button disabled={!mounted} onClick={()=>window.print()} className={button}>Cetak / Simpan PDF</button></div></div><ReportContent business={business} filter={filter} data={data} rank={rank} onRank={setRank}/>{mounted&&createPortal(<div id="report-print-root" className="hidden" aria-hidden="true"><ReportContent business={business} filter={filter} data={data} rank={rank} print/></div>,document.body)}</>}</DashboardSection>
}
function Metric({title,value,note,icon:Icon}:{title:string;value:string;note:string;icon:typeof Package}){return <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-[#c5cbd5]">{title}</span><Icon className="size-4 text-[#24cbc5]"/></div><p className="mt-4 break-words text-2xl font-normal tracking-tight">{value}</p><p className="mt-1 text-xs text-[#a4a7ac]">{note}</p></div>}
function DataTable({title,headers,rows,print,action}:{title:string;headers:string[];rows:ReactNode[][];print:boolean;action?:ReactNode}){
  const [page,setPage]=useState(0)
  const current=Math.min(page,Math.max(0,Math.ceil(rows.length/25)-1))
  return <section className={card+' mt-5'}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-normal">{title}</h2>{action}</div><div className="report-scroll mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#454d5b] text-xs text-[#a4a7ac]"><tr>{headers.map((h,i)=><th key={i} className="p-3 font-medium">{h}</th>)}</tr></thead><tbody>{(print?rows:rows.slice(current*25,current*25+25)).map((cells,i)=><tr key={i} className="border-b border-[#454d5b]">{cells.map((v,j)=><td key={j} className="max-w-64 break-words p-3 align-top">{v}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-center text-sm text-[#a4a7ac]">Belum ada data pada filter ini.</p>}</div>{!print&&rows.length>25&&<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#a4a7ac]"><span>{rows.length} baris · Halaman {current+1}</span><div className="flex gap-2"><button disabled={!current} onClick={()=>setPage(current-1)} className={button}>Sebelumnya</button><button disabled={(current+1)*25>=rows.length} onClick={()=>setPage(current+1)} className={button}>Berikutnya</button></div></div>}</section>
}
function ReportContent({business,filter,data,rank,print=false,onRank}:{business:Business;filter:ReportFilter;data:ReportData;rank:'quantity'|'gross';print?:boolean;onRank?:(v:'quantity'|'gross')=>void}){
  const summary=reportSummary(data)
  const products=rankProducts(data,rank)
  const reference=(id:string)=>print?<span className="break-all">{saleCode({id})}</span>:<Link href={'/dashboard/transactions/'+id} className="break-all font-medium text-[#24cbc5]">{saleCode({id})}</Link>
  return <div data-report-content><section className={card}><h2 className="text-lg font-normal">Laporan penjualan · {business.name}</h2><p className="mt-2 text-sm text-[#c5cbd5]">Periode {filter.from} sampai {filter.to} (WIB) · {reportPayment(filter)}</p><p className="mt-1 text-xs text-[#a4a7ac]">Diambil {saleDate(data.generatedAt)}. Status transaksi saat laporan diambil.</p><p className="mt-3 text-xs leading-5 text-[#a4a7ac]">Omzet mengecualikan pembatalan dari tanggal penjualan asal. Refund manual mengikuti tanggal pembatalan dan tidak dikurangi ulang dari omzet. Harga modal/HPP belum tersedia; ini bukan laporan laba.</p></section><div className="report-metrics mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Omzet selesai" value={reportMoney(summary.net)} note="Setelah diskon; tanpa transaksi dibatalkan" icon={CircleDollarSign}/><Metric title="Transaksi selesai" value={String(summary.count)} note={'Rata-rata '+reportMoney(summary.average)} icon={CreditCard}/><Metric title="Produk terjual" value={reportUnits(summary.units)} note="Gabungan jumlah, satuan berbeda tidak dikonversi" icon={Package}/><Metric title="Refund manual periode ini" value={reportMoney(summary.refund)} note={`${data.refunds.length} pembatalan pada periode ini`} icon={ReceiptText}/></div><section className={card+' mt-5'}><dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-[#a4a7ac]">Subtotal penjualan selesai</dt><dd className="mt-1 font-normal">{reportMoney(summary.gross)}</dd></div><div><dt className="text-[#a4a7ac]">Diskon penjualan selesai</dt><dd className="mt-1 font-normal">{reportMoney(summary.discount)}</dd></div><div><dt className="text-[#a4a7ac]">Dibatalkan dari penjualan periode ini</dt><dd className="mt-1 font-normal">{summary.cancelled} transaksi</dd></div></dl></section><DataTable title="Ringkasan metode pembayaran" headers={['Metode','Transaksi selesai','Omzet selesai','Diskon selesai']} print={print} rows={(['cash','qris','transfer'] as const).filter(m=>filter.payment==='all'||filter.payment===m).map(m=>{const part=reportSummary({...data,sales:data.sales.filter(s=>s.payment===m),refunds:[]});return[paymentLabel[m],part.count,reportMoney(part.net),reportMoney(part.discount)]})}/><DataTable title="Produk terlaris" headers={['Produk','SKU','Jumlah','Satuan','Nilai sebelum diskon']} print={print} action={!print&&<CustomSelect
  ariaLabel="Urutkan produk terlaris"
  size="sm"
  align="right"
  value={rank}
  onChange={val => onRank?.(val as 'quantity' | 'gross')}
  options={[
    { value: 'quantity', label: 'Jumlah terjual' },
    { value: 'gross', label: 'Nilai penjualan' },
  ]}
  className="min-w-[140px]"
/>} rows={products.map(p=>[p.name,p.sku,reportUnits(p.quantity),p.unit,reportMoney(p.gross)])}/><p className="mt-2 text-xs text-[#a4a7ac]">Peringkat memakai penjualan selesai. Jumlah mengikuti satuan produk; nilai barang sebelum diskon total transaksi.</p><DataTable title="Rincian penjualan" headers={['Transaksi / Pelanggan','Tanggal WIB','Kasir','Metode','Subtotal','Diskon','Total','Status']} print={print} rows={data.sales.map(s=>[<div key={s.id}>{reference(s.id)}<p className="mt-1 text-xs text-[#a4a7ac]">{s.customer}</p></div>,saleDate(s.created_at),s.actor_name,paymentLabel[s.payment],reportMoney(BigInt(s.subtotal)),reportMoney(BigInt(s.discount)),reportMoney(BigInt(s.total)),s.status==='completed'?'Selesai':'Dibatalkan'])}/><DataTable title="Pembatalan dan refund manual pada periode ini" headers={['Transaksi','Tanggal penjualan WIB','Tanggal pembatalan WIB','Petugas','Metode','Refund manual','Alasan']} print={print} rows={data.refunds.map(s=>[reference(s.id),saleDate(s.created_at),saleDate(s.cancelled_at!),s.cancelled_by_name,paymentLabel[s.payment],reportMoney(BigInt(s.refund_amount??0)),s.cancellation_reason])}/></div>
}
