import type {Sale} from './pos'
import {paymentLabel,saleCode,saleDate} from './pos'
export type ReportFilter={from:string;to:string;payment:'all'|'cash'|'qris'|'transfer'}
export type ReportData={sales:Sale[];refunds:Sale[];generatedAt:string}
export const wibDate=(date:Date)=>new Date(date.getTime()+7*3600000).toISOString().slice(0,10)
export function defaultReportFilter(now=new Date()):ReportFilter{return{from:wibDate(new Date(now.getTime()-6*86400000)),to:wibDate(now),payment:'all'}}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2100-12-31'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
export function parseReportFilter(params:Record<string,unknown>,now=new Date()):ReportFilter{
  const defaults=defaultReportFilter(now),from=params.from===undefined?defaults.from:params.from,to=params.to===undefined?defaults.to:params.to,payment=params.payment===undefined?'all':params.payment
  if(typeof from!=='string'||typeof to!=='string'||!validDate(from)||!validDate(to))throw Error('Tanggal tidak valid. Gunakan tanggal kalender tahun 2000–2100.')
  const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1
  if(days<1||days>366)throw Error('Tanggal akhir harus setelah atau sama dengan tanggal awal; maksimal 366 hari.')
  if(typeof payment!=='string'||!['all','cash','qris','transfer'].includes(payment))throw Error('Metode pembayaran tidak valid.')
  return{from,to,payment:payment as ReportFilter['payment']}
}
export function reportBounds(filter:ReportFilter){return{start:new Date(filter.from+'T00:00:00+07:00').toISOString(),end:new Date(Date.parse(filter.to+'T00:00:00+07:00')+86400000).toISOString()}}
export function reportQuery(filter:ReportFilter){return new URLSearchParams(filter).toString()}
export const reportPayment=(filter:ReportFilter)=>filter.payment==='all'?'Semua metode':paymentLabel[filter.payment]
const whole=(value:number)=>{if(!Number.isSafeInteger(Number(value))||Number(value)<0)throw Error('Nilai uang laporan tidak valid.');return BigInt(value)}
const scaled=(value:number)=>{const n=Number(value),s=Math.round(n*1000);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(s)||Math.abs(n*1000-s)>0.001)throw Error('Jumlah produk tidak valid.');return BigInt(s)}
export function reportSummary(data:ReportData){
  let gross=BigInt(0),discount=BigInt(0),net=BigInt(0),units=BigInt(0),refund=BigInt(0)
  const completed=data.sales.filter(s=>s.status==='completed'),best=new Map<string,{id:string;name:string;sku:string;unit:string;quantity:bigint;gross:bigint}>()
  for(const s of completed){gross+=whole(s.subtotal);discount+=whole(s.discount);net+=whole(Number(s.total)-Number(s.tax_amount||0));for(const l of s.lines){const qty=scaled(l.quantity);units+=qty;const key=l.id+'|'+l.unit,p=best.get(key)||{id:l.id,name:l.name,sku:l.sku,unit:l.unit,quantity:BigInt(0),gross:BigInt(0)};p.quantity+=qty;p.gross+=whole(l.original_total??l.total);best.set(key,p)}}
  for(const s of data.refunds)refund+=whole(s.refund_amount??0)
  const count=BigInt(completed.length)
  return{gross,discount,net,units,refund,count:completed.length,cancelled:data.sales.length-completed.length,average:count?(net+count/BigInt(2))/count:BigInt(0),best:Array.from(best.values())}
}
export const reportMoney=(value:bigint)=>'Rp'+value.toLocaleString('id-ID')
export const reportUnits=(value:bigint)=>{const remainder=(value%BigInt(1000)).toString().padStart(3,'0').replace(/0+$/,'');return(value/BigInt(1000)).toLocaleString('id-ID')+(remainder?','+remainder:'')}
export function rankProducts(data:ReportData,by:'quantity'|'gross'='quantity'){
  return reportSummary(data).best.sort((a,b)=>{const av=by==='quantity'?a.quantity:a.gross,bv=by==='quantity'?b.quantity:b.gross;return av===bv?a.id.localeCompare(b.id):av>bv?-1:1})
}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s\uFEFF]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
export function reportCsv(data:ReportData,filter:ReportFilter,businessName:string){
  const summary=reportSummary(data),lines:string[]=[]
  const row=(values:unknown[])=>lines.push(values.map(csvCell).join(','))
  row(['Laporan penjualan',businessName]);row(['Tanggal awal WIB',filter.from,'Tanggal akhir WIB',filter.to]);row(['Pembayaran',reportPayment(filter),'Diambil',saleDate(data.generatedAt)])
  row([]);row(['RINGKASAN']);row(['Metrik','Nilai'])
  for(const [label,value] of [['Subtotal selesai',summary.gross.toString()],['Diskon selesai',summary.discount.toString()],['Omzet selesai',summary.net.toString()],['Transaksi selesai',String(summary.count)],['Rata-rata transaksi selesai',summary.average.toString()],['Produk terjual (gabungan satuan)',reportUnits(summary.units)],['Dibatalkan dari penjualan periode ini',String(summary.cancelled)],['Refund manual menurut tanggal pembatalan',summary.refund.toString()]])row([label,value])
  row([]);row(['PENJUALAN']);row(['Referensi','Tanggal penjualan WIB','Kasir','Pelanggan','Pembayaran','Status','Subtotal rupiah','Diskon rupiah','Pajak rupiah','Total transaksi asli rupiah','Omzet diakui rupiah','Tanggal pembatalan WIB','Alasan pembatalan'])
  for(const s of data.sales)row([saleCode(s),saleDate(s.created_at),s.actor_name,s.customer,paymentLabel[s.payment],s.status==='completed'?'Selesai':'Dibatalkan',s.subtotal,s.discount,s.tax_amount||0,s.total,s.status==='completed'?Number(s.total)-Number(s.tax_amount||0):0,s.cancelled_at?saleDate(s.cancelled_at):'',s.cancellation_reason||''])
  row([]);row(['REFUND']);row(['Referensi','Tanggal penjualan WIB','Tanggal pembatalan WIB','Petugas pembatalan','Pelanggan','Pembayaran','Refund manual rupiah','Alasan'])
  for(const s of data.refunds)row([saleCode(s),saleDate(s.created_at),saleDate(s.cancelled_at!),s.cancelled_by_name,s.customer,paymentLabel[s.payment],s.refund_amount,s.cancellation_reason])
  row([]);row(['PRODUK']);row(['Produk','SKU','Satuan','Jumlah terjual','Nilai sebelum diskon rupiah'])
  for(const p of rankProducts(data,'gross'))row([p.name,p.sku,p.unit,reportUnits(p.quantity),p.gross.toString()])
  row([]);row(['CATATAN','Omzet tidak termasuk pajak. Total transaksi termasuk pajak. Omzet mengecualikan pembatalan dari tanggal asal. Refund mengikuti tanggal pembatalan dan tidak dikurangi ulang. Harga modal/HPP belum tersedia; ini bukan laporan laba.'])
  return '\uFEFF'+lines.join('\r\n')+'\r\n'
}
