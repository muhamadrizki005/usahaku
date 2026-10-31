'use client'
import Link from 'next/link'
import DashboardSection from './dashboard-section'
import { restaurantPanel, restaurantButton, restaurantPrimary } from './restaurant-forms'
import { restaurantOrderCode, restaurantStages, type RestaurantOverviewData } from '@/lib/restaurant'
import { rupiah } from '@/lib/pos'
import type { Business } from '@/lib/validation'

export default function RestaurantOverview({ business, summary }: { business: Business; summary: RestaurantOverviewData }) {
  return <DashboardSection title="Ringkasan restoran"><section className={restaurantPanel}><h2 className="break-words text-xl font-normal">{business.name}</h2><p className="mt-2 text-sm text-[#c5cbd5]">Pantau pesanan dan penjualan restoran. Ringkasan hari ini menggunakan WIB.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/dashboard/pos" className={restaurantPrimary}>Buka pesanan & kasir</Link><Link href="/dashboard/reports" className={restaurantButton}>Lihat laporan</Link></div></section>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Omzet hari ini', rupiah(Number(summary.revenue))], ['Transaksi hari ini', summary.saleCount], ['Pesanan terbuka', summary.openCount], ['Meja terpakai', summary.occupiedCount]].map(([name, value]) => <div key={name} className={restaurantPanel}><dt className="text-sm text-[#c5cbd5]">{name}</dt><dd className="mt-3 break-words text-2xl font-normal">{value}</dd></div>)}</dl>
    <section className={restaurantPanel + ' mt-6'}><h2 className="text-lg font-normal">Pesanan terbuka</h2><p className="mt-2 text-sm text-[#c5cbd5]">{summary.menuCount} menu tersedia / {summary.tableCount} meja aktif.</p>{summary.recent.length ? <ul className="mt-4 divide-y divide-[#454d5b]">{summary.recent.map(o => <li key={o.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{restaurantOrderCode(o.id)} / {o.table_name || 'Bawa pulang'}<br /><span className="text-[#c5cbd5]">{restaurantStages[o.stage]}</span></span><span>{rupiah(Number(o.subtotal))}</span></li>)}</ul> : <p className="mt-4 text-sm text-[#c5cbd5]">Belum ada pesanan terbuka.</p>}</section>
  </DashboardSection>
}
