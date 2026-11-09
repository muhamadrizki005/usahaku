'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { completeOnboarding } from '@/app/actions'
import type { Business, Member } from '@/lib/validation'
import type { BusinessRole } from '@/lib/auth/rbac'
import type { SalonFoundation } from '@/lib/salon'
import type { CatalogProduct } from '@/lib/catalog'
import { businessDays, describeHours } from '@/lib/business-profile'
import { BusinessHeader } from './business-header'
import { BusinessLogo } from './business-logo'
import { BusinessHoursSettings } from './business-hours'
import { StaffManagement } from './staff-management'
import { SalonResources } from './salon-resources'
import BusinessTaxSettings from './business-tax-settings'
import { restaurantPanel as panel, restaurantButton as button, restaurantPrimary as primary } from './restaurant-forms'

type Props = {
  business: Business
  ownerName: string
  data: SalonFoundation
  members: Member[]
  roles?: BusinessRole[]
  roleCounts?: Record<string, number>
  products?: CatalogProduct[]
}

export function SalonSetup({ business, ownerName, data, members, roles, roleCounts, products = [] }: Props) {
  const steps = [
    ['Layanan', 'salon-services', data.services.length > 0],
    ['Produk', 'salon-services', products.length > 0],
    ['Penata & terapis', 'salon-practitioners', data.practitioners.length > 0],
    ['Jadwal kerja', 'salon-practitioners', data.practitioners.some(p => Boolean(p.schedule))],
    ['Jam operasional', 'salon-hours', Boolean(business.operating_hours)],
  ] as const

  return (
    <main className="min-h-screen bg-[#1c222e] text-white">
      <BusinessHeader ownerName={ownerName} />
      <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 lg:py-8">
        <div className={panel}>
          <ol className="grid gap-4 text-sm md:grid-cols-3">
            {['Kategori usaha', 'Identitas usaha', 'Setup usaha'].map((name, i) => (
              <li key={name} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1835d9]">
                  {i + 1}
                </span>
                {name}
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-8 text-sm text-[#24cbc5]">PENGATURAN USAHA · LANGKAH 3 DARI 3</p>
        <h1 className="mt-3 break-words text-3xl font-normal sm:text-4xl">Siapkan {business.name}</h1>
        <p className="mt-3 leading-6 text-[#c5cbd5]">
          Atur layanan, produk fisik, penata/terapis, dan jadwal kerja. Setelah membuka dashboard, catat janji temu atau walk-in, proses pelayanan, serta pembayaran di kasir.
        </p>

        {/* Compact, minimal, easy to scan checklist */}
        <section className={panel + ' mt-6'}>
          <div className="flex items-center justify-between border-b border-[#454d5b]/60 pb-3">
            <h2 className="text-base sm:text-lg font-medium text-white">Checklist salon</h2>
            <span className="rounded-full bg-[#24cbc5]/15 px-2.5 py-0.5 text-xs font-normal text-[#24cbc5]">
              {steps.filter(s => s[2]).length} dari {steps.length} pengaturan tersimpan
            </span>
          </div>
          <ul className="divide-y divide-[#454d5b]/40">
            {steps.map(([name, id, done]) => (
              <li key={name} className="flex items-center justify-between py-2.5 text-sm">
                <a
                  className="text-white hover:text-[#24cbc5] font-normal transition"
                  href={'#' + id}
                >
                  {name}
                </a>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-normal ${
                    done
                      ? 'bg-[#24cbc5]/15 text-[#24cbc5]'
                      : 'bg-[#454d5b]/30 text-[#a4a7ac]'
                  }`}
                >
                  {done ? 'Tersimpan' : 'Belum diatur'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Services & Products */}
        <div id="salon-services" className="mt-6 scroll-mt-24">
          <SalonResources
            resource="service"
            data={data}
            canManage
            initialProducts={products}
          />
        </div>

        {/* Practitioners & Schedule */}
        <div id="salon-practitioners" className="mt-6 scroll-mt-24">
          <SalonResources resource="practitioner" data={data} canManage />
        </div>

        {/* Business Hours */}
        <div id="salon-hours" className="mt-6 scroll-mt-24">
          <BusinessHoursSettings business={business} />
        </div>

        {/* Business Taxes */}
        <div id="salon-taxes" className="mt-6 scroll-mt-24">
          <BusinessTaxSettings business={business} canManage />
        </div>

        {/* Staff & Access */}
        <section className={panel + ' mt-6'}>
          <h2 className="mb-4 text-lg">Staf & akses</h2>
          <StaffManagement
            business={business}
            members={members}
            initialRoles={roles}
            roleCounts={roleCounts}
          />
        </section>

        <div className="mt-8 flex flex-wrap justify-between gap-3">
          <Link href="/onboarding/identity?category=barbershop" className={button}>
            Kembali
          </Link>
          <Link href="/onboarding/summary?category=barbershop" className={primary}>
            Masuk ke ringkasan
          </Link>
        </div>
      </div>
    </main>
  )
}

export function SalonSummary({ business, ownerName, data, products = [] }: Props) {
  const [state, finish, pending] = useActionState(completeOnboarding, {})

  return (
    <main className="min-h-screen bg-[#1c222e] text-white">
      <BusinessHeader ownerName={ownerName} />
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
        <section className={panel}>
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#1835d9]/15">
              <BusinessLogo business={business} />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-[#24cbc5]">Barbershop / Salon</p>
              <h1 className="mt-2 text-3xl font-normal">Ringkasan pengaturan usaha</h1>
              <p className="mt-3 break-words text-white font-medium">{business.name}</p>
            </div>
          </div>
          <p className="mt-4 break-words text-sm text-[#c5cbd5]">{business.address}</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              ['Layanan aktif', data.services.filter(s => s.active).length],
              ['Produk aktif', products.filter(p => p.active).length],
              ['Penata/terapis aktif', data.practitioners.filter(p => p.active).length],
            ].map(([name, count]) => (
              <div key={name} className="rounded-xl border border-[#454d5b]/40 bg-[#1c222e]/60 p-4">
                <dt className="text-xs text-[#c5cbd5]">{name}</dt>
                <dd className="mt-1.5 text-2xl font-semibold text-white">{count}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={panel + ' mt-6'}>
          <h2 className="text-lg">Jam operasional (WIB)</h2>
          {business.operating_hours ? (
            <dl className="mt-4 space-y-2 text-sm">
              {businessDays.map(day => (
                <div className="flex justify-between gap-3" key={day}>
                  <dt className="text-[#a4a7ac]">{day}</dt>
                  <dd className="text-white">{describeHours(business.operating_hours![day])}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[#c5cbd5]">Belum diatur.</p>
          )}
          <p className="mt-4 text-sm leading-6 text-[#c5cbd5]">
            Dashboard menyediakan janji temu, walk-in, proses pelayanan, kasir terpadu, riwayat pelanggan, dan laporan. Atur metode pembayaran melalui Pengaturan.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Link href="/onboarding/setup?category=barbershop" className={button}>
            Kembali ke pengaturan
          </Link>
          <form action={finish}>
            {state.error && (
              <p role="alert" className="mb-3 text-sm text-[#ffb4ae]">
                {state.error}
              </p>
            )}
            <button disabled={pending} className={primary}>
              {pending ? 'Membuka dashboard...' : 'Buka dashboard'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
