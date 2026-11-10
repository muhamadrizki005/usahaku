import { salonStatuses, type SalonSummary } from '@/lib/salon-operations'
import { rupiah } from '@/lib/pos'
import { restaurantPanel } from './restaurant-forms'

const statusDotColors: Record<keyof typeof salonStatuses, string> = {
  scheduled: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]',
  waiting: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  in_service: 'bg-[#24cbc5] shadow-[0_0_8px_rgba(36,203,197,0.6)]',
  finished: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  cancelled: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]',
  no_show: 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.6)]',
}

export default function SalonReportSummary({
  summary,
  from,
  to,
}: {
  summary: SalonSummary
  from: string
  to: string
}) {
  return (
    <section className={restaurantPanel + ' mt-6'}>
      <h2 className="text-xl font-normal">Ringkasan kunjungan salon</h2>
      <p className="mt-2 text-sm text-[#c5cbd5]">
        {from} hingga {to}, WIB. Jumlah kunjungan berdasarkan jadwal mulai; pendapatan penata berdasarkan waktu pembayaran, tanpa pajak, hanya transaksi yang masih sah. Pembayaran/pengembalian DP belum menjadi penjualan dan tidak dikurangkan lagi dari pendapatan.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Object.entries(salonStatuses).map(([key, label]) => (
          <div
            key={key}
            className="rounded-2xl border border-[#454d5b] bg-[#1a222f] p-4 shadow-sm transition-colors hover:border-[#5a6679]"
          >
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs font-medium text-[#c5cbd5]">{label}</dt>
              <span
                className={`size-2.5 rounded-full ${statusDotColors[key as keyof typeof salonStatuses] || 'bg-[#24cbc5]'}`}
                aria-hidden="true"
              />
            </div>
            <dd className="mt-2 text-2xl font-semibold text-white tracking-tight">
              {summary[key as keyof typeof salonStatuses]}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-5 text-sm">
        <p>DP diterima pada periode ini: {rupiah(Number(summary.deposits))}</p>
        <p>Refund DP sebelum pelunasan: {rupiah(Number(summary.depositRefunds))}</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Penata', 'Kunjungan dibayar', 'Pendapatan tanpa pajak'].map(h => (
                <th key={h} className="border-b border-[#454d5b] p-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.practitioners.map(p => (
              <tr key={p.practitioner_id}>
                <td className="break-words p-3">{p.name}</td>
                <td className="p-3">{p.visits}</td>
                <td className="p-3">{rupiah(Number(p.revenue))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!summary.practitioners.length && (
        <p className="mt-3 text-sm text-[#c5cbd5]">
          Belum ada pelayanan berbayar yang sesuai periode ini.
        </p>
      )}
    </section>
  )
}
