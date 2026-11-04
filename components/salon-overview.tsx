import Link from 'next/link'
import DashboardSection from './dashboard-section'
import type { Business } from '@/lib/validation'
import type { SalonFoundation } from '@/lib/salon'
import { restaurantPanel as panel,restaurantPrimary as primary,restaurantButton as button } from './restaurant-forms'
export default function SalonOverview({business,data}:{business:Business;data:SalonFoundation}){
  return <DashboardSection title="Ringkasan salon" businessName={business.name}><section className={panel}><h2 className="break-words text-xl">{business.name}</h2><p className="mt-3 text-sm leading-6 text-[#c5cbd5]">Siapkan layanan, penata/terapis dan jadwal kerja. Janji temu dan pembayaran belum tersedia pada tahap fondasi.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/dashboard/salon/services" className={primary}>Kelola layanan</Link><Link href="/dashboard/salon/practitioners" className={button}>Kelola penata & jadwal</Link></div></section><dl className="mt-6 grid gap-4 sm:grid-cols-3">{[['Layanan aktif',data.services.filter(s=>s.active).length],['Penata/terapis aktif',data.practitioners.filter(p=>p.active).length],['Penata dengan jadwal',data.practitioners.filter(p=>p.active&&p.schedule).length]].map(([name,value])=><div key={name} className={panel}><dt className="text-sm text-[#c5cbd5]">{name}</dt><dd className="mt-3 text-2xl">{value}</dd></div>)}</dl></DashboardSection>
}
