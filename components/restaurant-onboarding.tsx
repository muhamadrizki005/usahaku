'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { completeOnboarding } from '@/app/actions'
import type { Business, Member } from '@/lib/validation'
import type { RestaurantMenu, RestaurantTable } from '@/lib/restaurant'
import { businessDays, describeHours } from '@/lib/business-profile'
import { rupiah } from '@/lib/pos'
import { BusinessHeader } from './business-header'
import { BusinessLogo } from './business-logo'
import { BusinessHoursSettings } from './business-hours'
import { StaffManagement } from './staff-management'
import { RestaurantResources, restaurantPanel, restaurantButton, restaurantPrimary } from './restaurant-forms'

type Props = { business: Business; members: Member[]; menu: RestaurantMenu[]; tables: RestaurantTable[]; ownerName: string }
function Progress() { return <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><div className="grid gap-4 md:grid-cols-3">{['Kategori usaha', 'Identitas usaha', 'Setup usaha'].map((name, i) => <div key={name} className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1835d9] text-white">{i + 1}</div><span className="text-sm font-normal">{name}</span></div>)}</div></div> }
export function RestaurantSetup({ business, members, menu, tables, ownerName }: Props) {
  const done = [menu.length > 0, tables.length > 0, Boolean(business.operating_hours), members.some(m => m.role !== 'owner' && m.active)]
  return <main className="min-h-screen bg-[#1c222e] text-white"><BusinessHeader ownerName={ownerName} /><div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 lg:py-8"><Progress />
    <p className="mt-8 text-sm text-[#24cbc5]">PENGATURAN USAHA · LANGKAH 3 DARI 3</p><h1 className="mt-3 text-3xl font-normal sm:text-4xl">Siapkan {business.name}, selangkah demi selangkah</h1><p className="mt-3 text-[#c5cbd5]">Menu, meja, jam dan staf disimpan di database. Pembayaran tunai, QRIS atau transfer dicatat manual saat pesanan dibayar. Pengaturan ini opsional dan dapat dilengkapi setelah membuka dashboard.</p>
    <section className={restaurantPanel + ' mt-6'}><h2 className="text-lg font-normal">Checklist restoran</h2><p className="mt-2 text-sm text-[#c5cbd5]">{done.filter(Boolean).length} dari 4 pengaturan tersimpan</p><ul className="mt-4 space-y-3 text-sm">{[['Menu', 'restaurant-menu'], ['Meja & kapasitas', 'restaurant-tables'], ['Jam operasional', 'restaurant-hours'], ['Staf & akses', 'restaurant-staff']].map(([name, id], i) => <li key={id} className="flex flex-wrap justify-between gap-3 border-b border-[#454d5b]/50 py-2"><a href={`#${id}`} className="min-h-11 py-3 text-[#24cbc5] underline underline-offset-4">{name}</a><span className="py-3 text-[#c5cbd5]">{done[i] ? 'Tersimpan' : 'Belum diatur'}</span></li>)}</ul></section>
    <div id="restaurant-menu" className="mt-6 scroll-mt-24"><RestaurantResources resource="menu" menu={menu} /></div>
    <div id="restaurant-tables" className="mt-6 scroll-mt-24"><RestaurantResources resource="table" tables={tables} /></div>
    <div id="restaurant-hours" className="scroll-mt-24"><BusinessHoursSettings business={business} /></div>
    <section id="restaurant-staff" className={restaurantPanel + ' mt-6 scroll-mt-24'}><h2 className="mb-4 text-lg font-normal">Staf & akses</h2><StaffManagement members={members} /></section>
    <div className="mt-8 flex flex-wrap justify-between gap-3"><Link href="/onboarding/identity?category=restoran" className={restaurantButton}>Kembali</Link><Link href="/onboarding/summary?category=restoran" className={restaurantPrimary}>Masuk ke ringkasan</Link></div>
  </div></main>
}
export function RestaurantSummary({ business, members, menu, tables, ownerName }: Props) {
  const [state, finish, pending] = useActionState(completeOnboarding, {})
  return <main className="min-h-screen bg-[#1c222e] text-white"><BusinessHeader ownerName={ownerName} /><div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
    <section className={restaurantPanel}><div className="flex items-center gap-5"><div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#1835d9]/15 text-2xl text-[#24cbc5]"><BusinessLogo business={business} /></div><div className="min-w-0"><p className="text-sm text-[#24cbc5]">Restoran / Cafe</p><h1 className="mt-2 text-3xl font-normal">Ringkasan pengaturan usaha</h1><p className="mt-3 break-words">{business.name}</p></div></div><dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-[#c5cbd5]">Alamat</dt><dd className="mt-1 break-words">{[business.street_address || business.address, business.city, business.province].filter(Boolean).join(', ')}</dd></div><div><dt className="text-sm text-[#c5cbd5]">Nomor kontak</dt><dd className="mt-1">{business.phone}</dd></div><div><dt className="text-sm text-[#c5cbd5]">Menu aktif</dt><dd className="mt-1">{menu.filter(m => m.active).length}</dd></div><div><dt className="text-sm text-[#c5cbd5]">Meja aktif</dt><dd className="mt-1">{tables.filter(t => t.active).length}</dd></div></dl></section>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className={restaurantPanel}><h2 className="text-lg font-normal">Menu tersimpan</h2>{menu.length ? <ul className="mt-4 divide-y divide-[#454d5b]">{menu.slice(0, 5).map(m => <li key={m.id} className="flex justify-between gap-3 py-3 text-sm"><span className="break-words">{m.name}<br /><span className="text-[#c5cbd5]">{!m.active ? 'Nonaktif' : m.available ? 'Tersedia' : 'Habis'}</span></span><span>{rupiah(Number(m.price))}</span></li>)}</ul> : <p className="mt-4 text-sm text-[#c5cbd5]">Belum ada menu. Tambahkan melalui Menu setelah membuka dashboard.</p>}</section>
    <section className={restaurantPanel}><h2 className="text-lg font-normal">Jam operasional (WIB)</h2>{business.operating_hours ? <dl className="mt-4 space-y-2 text-sm">{businessDays.map(day => <div key={day} className="flex justify-between gap-3"><dt>{day}</dt><dd>{business.operating_hours![day].closed ? 'Tutup' : describeHours(business.operating_hours![day])}</dd></div>)}</dl> : <p className="mt-4 text-sm text-[#c5cbd5]">Belum diatur.</p>}<p className="mt-5 text-sm text-[#c5cbd5]">{members.filter(m => m.role !== 'owner' && m.active).length} staf aktif. Reservasi/DP dan stok bahan baku belum termasuk tahap ini.</p></section></div>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><Link href="/onboarding/setup?category=restoran" className={restaurantButton}>Kembali ke pengaturan</Link><form action={finish}>{state.error && <p role="alert" className="mb-3 text-sm text-[#ffb4ae]">{state.error}</p>}<button disabled={pending} className={restaurantPrimary}>{pending ? 'Membuka dashboard...' : 'Buka dashboard'}</button></form></div>
  </div></main>
}
