import { csvCell, reportMoney, reportPayment, type ReportFilter } from './reports'
import { paymentLabel, saleDate, type Sale } from './pos'
export const depositEventLabel = { received: 'DP diterima', applied: 'DP dipakai untuk pelunasan', refund_reservation: 'Refund DP reservasi', refund_sale: 'Bagian DP dalam refund penjualan' }
export type DepositEvent = { reservation_id: string; customer: string; table_name: string; starts_at: string; status: string; event_at: string; event_kind: keyof typeof depositEventLabel; payment: Sale['payment']; amount: string }
export type DepositBalance = Omit<DepositEvent, 'event_at' | 'event_kind'>
export type DepositReport = { summary: { opening: string; closing: string; received: string; applied: string; refundReservation: string; refundSale: string; cashNet: string }; events: DepositEvent[]; outstanding: DepositBalance[]; generatedAt: string }
export function depositMoney(value: string) { if (!/^-?\d+$/.test(value)) throw Error('Nilai laporan DP tidak valid.'); return reportMoney(BigInt(value)) }
export function depositReportCsv(data: DepositReport, filter: ReportFilter, business: string) {
  const rows: unknown[][] = [['Laporan DP reservasi',business],['Awal WIB',filter.from,'Akhir WIB',filter.to],['Metode DP',reportPayment(filter)],['Diambil',saleDate(data.generatedAt)],[],['RINGKASAN']]
  const names: Record<keyof DepositReport['summary'], string> = { opening:'Saldo DP awal',closing:'Saldo DP akhir',received:'DP diterima',applied:'DP dipakai untuk pelunasan',refundReservation:'Refund DP sebelum pelunasan',refundSale:'Bagian DP dalam refund penjualan',cashNet:'Arus kas DP bersih' }
  for (const key of Object.keys(names) as (keyof typeof names)[]) rows.push([names[key],data.summary[key]])
  rows.push([],['RIWAYAT DP'],['Reservasi','Pelanggan','Meja','Tanggal kejadian WIB','Kejadian','Metode DP','Nominal rupiah'])
  for (const e of data.events) rows.push([e.reservation_id,e.customer,e.table_name,saleDate(e.event_at),depositEventLabel[e.event_kind],paymentLabel[e.payment],e.amount])
  rows.push([],['SALDO DP PADA AKHIR PERIODE'],['Reservasi','Pelanggan','Meja','Jadwal WIB','Status reservasi saat ini','Metode DP','Saldo rupiah'])
  for (const e of data.outstanding) rows.push([e.reservation_id,e.customer,e.table_name,saleDate(e.starts_at),e.status,paymentLabel[e.payment],e.amount])
  rows.push([],['CATATAN','Filter mengikuti metode DP. Saldo akhir = saldo awal + DP diterima - DP dipakai - refund reservasi. Bagian DP dalam refund penjualan sudah keluar dari saldo saat pelunasan, sehingga tidak dikurangi lagi dari saldo. Bagian tersebut sudah termasuk refund penjualan pada laporan penjualan, bukan refund tambahan. Semua refund dikonfirmasi manual.'])
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
