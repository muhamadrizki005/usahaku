'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CircleDollarSign,
  CreditCard,
  CalendarDays,
  CheckCircle2,
  UsersRound,
  Scissors,
  Package,
  Users,
  Plus,
  Clock,
  TrendingUp,
  Tag,
  Sparkles,
} from 'lucide-react'
import DashboardSection from './dashboard-section'
import type { Business, Member } from '@/lib/validation'
import type { SalonFoundation } from '@/lib/salon'
import { salonStatuses, type SalonSummary, type SalonVisitPage } from '@/lib/salon-operations'
import { salesSummary, type Sale, rupiah } from '@/lib/pos'
import type { CatalogProduct } from '@/lib/catalog'
import {
  calculateRevenueTrend,
  getTodayWib,
  getPeriodSubtitle,
  type TrendPeriod,
} from '@/lib/dashboard-trends'
import { CustomSelect } from '@/components/ui/custom-select'
import { DatePicker } from '@/components/ui/date-picker'

function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[#a4a7ac]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string
  value: string
  note: string
  icon: typeof CircleDollarSign
}) {
  return (
    <div className="group rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#24cbc5]/40 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-medium text-[#c5cbd5]">{title}</span>
        <div className="grid size-9 place-items-center rounded-xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 text-[#24cbc5] group-hover:bg-[#24cbc5]/15 transition-colors">
          <Icon className="size-4.5" />
        </div>
      </div>
      <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs text-[#a4a7ac]">{note}</p>
    </div>
  )
}

export default function SalonOverview({
  business,
  member,
  data,
  summary,
  sales = [],
  products = [],
  visits,
  day,
}: {
  business: Business
  member?: Member
  data: SalonFoundation
  summary: SalonSummary
  sales?: Sale[]
  products?: CatalogProduct[]
  visits?: SalonVisitPage
  day: string
}) {
  const router = useRouter()
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('7d')
  const todayWib = getTodayWib()
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d)
  })
  const [customEnd, setCustomEnd] = useState(todayWib)

  const ownerName = member?.name || 'Pengelola Salon'

  // Time greeting
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  )

  // Calculations for today's metrics
  const todayRevenue = summary.practitioners.reduce((n, p) => n + Number(p.revenue), 0)
  const todayVisitsCount = summary.waiting + summary.in_service + summary.finished
  const todayFinishedCount = summary.finished

  // Find sales that occurred today
  const todaySales = sales.filter(s => s.created_at.slice(0, 10) === day && s.status !== 'cancelled')
  const todaySalesCount = todaySales.length

  // Customers served today (unique names)
  const uniqueCustomers = new Set([
    ...(visits?.items.map(v => v.customer) || []),
    ...todaySales.map(s => s.customer || 'Pelanggan'),
  ]).size

  // Trend data
  const trendData = calculateRevenueTrend(sales, trendPeriod, customStart, customEnd)

  // Top services ranking (from completed visits & sales lines)
  const topServices = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>()

    // From visits
    visits?.items.forEach(v => {
      if (v.status !== 'cancelled' && v.status !== 'no_show') {
        v.lines.forEach(l => {
          const current = map.get(l.name) || { name: l.name, count: 0, revenue: 0 }
          current.count += 1
          current.revenue += Number(l.total || l.price || 0)
          map.set(l.name, current)
        })
      }
    })

    // From sales lines matching services
    sales.forEach(s => {
      if (s.status !== 'cancelled') {
        s.lines.forEach(l => {
          if (data.services.some(svc => svc.name === l.name)) {
            const current = map.get(l.name) || { name: l.name, count: 0, revenue: 0 }
            current.count += l.quantity || 1
            current.revenue += Number(l.total || l.price || 0)
            map.set(l.name, current)
          }
        })
      }
    })

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 5)
  }, [visits, sales, data.services])

  // Top products ranking (from sales lines matching physical products)
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>()

    sales.forEach(s => {
      if (s.status !== 'cancelled') {
        s.lines.forEach(l => {
          if (products.some(p => p.name === l.name)) {
            const current = map.get(l.name) || { name: l.name, count: 0, revenue: 0 }
            current.count += l.quantity || 1
            current.revenue += Number(l.total || l.price || 0)
            map.set(l.name, current)
          }
        })
      }
    })

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 5)
  }, [sales, products])

  // Top practitioners ranking
  const topPractitioners = useMemo(() => {
    return [...summary.practitioners]
      .sort((a, b) => b.revenue - a.revenue || b.visits - a.visits)
      .slice(0, 5)
  }, [summary.practitioners])

  return (
    <DashboardSection title="Ringkasan Barbershop & Salon" businessName={business.name}>
      {/* Subheader: Greeting on Left, Summary Pills on Right */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#24cbc5] uppercase tracking-wider">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'Asia/Jakarta',
            })}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Selamat {hour < 12 ? 'pagi' : hour < 18 ? 'siang' : 'malam'}, {ownerName}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#c5cbd5]">
            Pantau omzet kasir, layanan potong rambut, penjualan produk, dan antrean janji temu{' '}
            <strong className="text-white">{business.name}</strong>.
          </p>
        </div>

        {/* Horizontal Quick Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/salon/appointments"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1835d9] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#132c9e] transition shadow-xs active:scale-95 cursor-pointer border-0"
          >
            <Scissors className="size-4" />
            <span>Janji Temu & Kasir</span>
          </Link>
          <Link
            href="/dashboard/salon/services"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#303640] px-4 py-2.5 text-xs sm:text-sm font-medium text-[#c5cbd5] hover:bg-[#3d4653] hover:text-white transition shadow-xs active:scale-95 cursor-pointer border-0"
          >
            <Package className="size-4" />
            <span>Layanan & Produk</span>
          </Link>
          <Link
            href="/dashboard/salon/practitioners"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#303640] px-4 py-2.5 text-xs sm:text-sm font-medium text-[#c5cbd5] hover:bg-[#3d4653] hover:text-white transition shadow-xs active:scale-95 cursor-pointer border-0"
          >
            <Users className="size-4" />
            <span>Penata & Jadwal</span>
          </Link>
        </div>
      </div>

      {/* 5 Metric Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Omzet Hari Ini"
          value={rupiah(todayRevenue)}
          note="Total transaksi kasir & layanan selesai"
          icon={CircleDollarSign}
        />
        <MetricCard
          title="Transaksi Hari Ini"
          value={String(todaySalesCount || todayFinishedCount)}
          note="Transaksi kasir berbayar hari ini"
          icon={CreditCard}
        />
        <MetricCard
          title="Kunjungan Hari Ini"
          value={String(todayVisitsCount)}
          note={`${summary.waiting} menunggu · ${summary.in_service} sedang dilayani`}
          icon={CalendarDays}
        />
        <MetricCard
          title="Layanan Selesai"
          value={String(todayFinishedCount)}
          note="Pelayanan siap dibayar / lunas"
          icon={CheckCircle2}
        />
        <MetricCard
          title="Pelanggan Dilayani"
          value={String(uniqueCustomers)}
          note="Pelanggan walk-in & janji temu"
          icon={UsersRound}
        />
      </div>

      {/* Row 2: Revenue Trend Chart & Quick Schedule Overview */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Trend Omzet Card */}
        <Card
          title="Tren Pendapatan Salon"
          subtitle={getPeriodSubtitle(trendPeriod, trendData.startDate, trendData.endDate)}
          action={
            <div className="w-44 sm:w-48">
              <CustomSelect
                value={trendPeriod}
                onChange={val => setTrendPeriod(val as TrendPeriod)}
                options={[
                  { value: '7d', label: '7 hari terakhir' },
                  { value: '30d', label: '30 hari terakhir' },
                  { value: '1m', label: '1 bulan terakhir' },
                  { value: '3m', label: '3 bulan terakhir' },
                  { value: '6m', label: '6 bulan terakhir' },
                  { value: '1y', label: '1 tahun terakhir' },
                  { value: 'custom', label: 'Periode kustom' },
                ]}
                size="sm"
                ariaLabel="Filter periode tren pendapatan"
              />
            </div>
          }
        >
          {trendPeriod === 'custom' && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#1c222e] p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#a4a7ac]">Dari:</span>
                <DatePicker
                  value={customStart}
                  onChange={val => {
                    if (val > customEnd) {
                      setCustomStart(val)
                      setCustomEnd(val)
                    } else {
                      setCustomStart(val)
                    }
                  }}
                  maxDate={customEnd}
                  label="Tanggal mulai"
                  className="w-36 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#a4a7ac]">Sampai:</span>
                <DatePicker
                  value={customEnd}
                  onChange={val => {
                    if (val < customStart) {
                      setCustomEnd(val)
                    } else {
                      setCustomEnd(val)
                    }
                  }}
                  minDate={customStart}
                  maxDate={todayWib}
                  label="Tanggal akhir"
                  className="w-36 text-xs"
                />
              </div>
              <span className="text-[11px] text-[#c5cbd5]">
                ({trendData.buckets.length}{' '}
                {trendData.aggregation === 'daily'
                  ? 'hari'
                  : trendData.aggregation === 'weekly'
                  ? 'minggu'
                  : 'bulan'}
                )
              </span>
            </div>
          )}

          {trendData.totalCount === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 px-2 text-center border-b border-[#454d5b]/60">
              <CircleDollarSign className="size-8 text-[#a4a7ac]/60" />
              <p className="text-sm text-[#c5cbd5]">
                Belum ada transaksi salon selesai pada periode ini
              </p>
              <p className="text-xs text-[#a4a7ac]">
                Pilih rentang waktu lain atau selesaikan transaksi kasir
              </p>
            </div>
          ) : (
            <div className="flex h-56 items-end gap-1.5 sm:gap-2.5 overflow-x-auto border-b border-[#454d5b]/60 px-2 pb-3 pt-6">
              {trendData.buckets.map(bucket => {
                const maxRev = trendData.maxAmount > 0 ? trendData.maxAmount : 1
                const ratio = bucket.amount > 0 ? bucket.amount / maxRev : 0
                const barHeight = bucket.amount > 0 ? Math.max(8, Math.round(ratio * 140)) : 4

                return (
                  <div
                    key={bucket.key}
                    className="group relative flex flex-1 min-w-[22px] flex-col items-center gap-2"
                  >
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full mb-2 hidden -translate-x-1/2 left-1/2 flex-col items-center group-hover:flex z-20 whitespace-nowrap">
                      <div className="rounded-lg border border-[#454d5b] bg-[#1c222e] px-2.5 py-1.5 text-center text-xs shadow-lg">
                        <p className="font-semibold text-white">{rupiah(bucket.amount)}</p>
                        <p className="text-[10px] text-[#a4a7ac]">
                          {bucket.count} transaksi · {bucket.label}
                        </p>
                      </div>
                      <div className="size-1.5 -mt-0.5 rotate-45 border-b border-r border-[#454d5b] bg-[#1c222e]" />
                    </div>

                    {/* Bar */}
                    <div className="relative flex w-full flex-col justify-end items-center h-36">
                      <div
                        style={{ height: `${barHeight}px` }}
                        className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${
                          bucket.amount > 0
                            ? 'bg-gradient-to-t from-[#1835d9] to-[#24cbc5] group-hover:brightness-110'
                            : 'bg-[#454d5b]/30'
                        }`}
                      />
                    </div>

                    {/* Label */}
                    <span className="text-[10px] text-[#a4a7ac] truncate max-w-[32px] select-none">
                      {bucket.label.slice(0, 3)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Trend Summary Numbers */}
          <div className="mt-4 grid grid-cols-3 gap-3 pt-1 text-center">
            <div>
              <p className="text-xs text-[#a4a7ac]">Total Omzet</p>
              <p className="mt-1 text-sm sm:text-base font-semibold text-white">
                {rupiah(trendData.totalRevenue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#a4a7ac]">Total Transaksi</p>
              <p className="mt-1 text-sm sm:text-base font-semibold text-white">
                {trendData.totalCount} transaksi
              </p>
            </div>
            <div>
              <p className="text-xs text-[#a4a7ac]">Rata-rata / Trx</p>
              <p className="mt-1 text-sm sm:text-base font-semibold text-white">
                {trendData.totalCount > 0
                  ? rupiah(Math.round(trendData.totalRevenue / trendData.totalCount))
                  : 'Rp0'}
              </p>
            </div>
          </div>
        </Card>

        {/* Antrean & Janji Temu Hari Ini */}
        <Card
          title="Kunjungan & Antrean Hari Ini"
          subtitle={`Tanggal ${day} (WIB)`}
          action={
            <Link
              href="/dashboard/salon/appointments"
              className="text-xs text-[#24cbc5] hover:underline"
            >
              Lihat semua →
            </Link>
          }
        >
          {visits?.items && visits.items.length > 0 ? (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {visits.items.slice(0, 6).map(v => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-xl border border-[#454d5b]/50 bg-[#1c222e]/60 p-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">{v.customer}</p>
                    <p className="mt-0.5 text-[#a4a7ac] truncate">
                      {v.practitioner_name} · {v.lines.map(l => l.name).join(', ')}
                    </p>
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        v.status === 'finished'
                          ? 'bg-green-500/15 text-green-400'
                          : v.status === 'in_service'
                          ? 'bg-[#24cbc5]/15 text-[#24cbc5]'
                          : v.status === 'waiting'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-[#1835d9]/15 text-[#a5b4fc]'
                      }`}
                    >
                      {salonStatuses[v.status]}
                    </span>
                    <p className="mt-1 font-semibold text-white">{rupiah(Number(v.subtotal))}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-[#a4a7ac]">
              <CalendarDays className="mx-auto size-7 text-[#454d5b] mb-2" />
              <p className="text-xs">Belum ada kunjungan yang tercatat untuk hari ini.</p>
              <Link
                href="/dashboard/salon/appointments"
                className="mt-3 inline-block rounded-full bg-[#1835d9] px-4 py-1.5 text-xs text-white"
              >
                + Buat janji temu / walk-in
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Row 3: Ranked Performance Lists (Layanan Terlaris, Produk Terlaris, Penata Teraktif) */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Layanan Terlaris */}
        <Card
          title="Layanan Terlaris"
          subtitle="Paling sering dipesan pelanggan"
          action={
            <Link href="/dashboard/salon/services" className="text-xs text-[#24cbc5] hover:underline">
              Kelola →
            </Link>
          }
        >
          {topServices.length > 0 ? (
            <div className="space-y-2.5">
              {topServices.map((svc, idx) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between rounded-xl border border-[#454d5b]/40 bg-[#1c222e]/60 p-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid size-6 place-items-center rounded-full bg-[#24cbc5]/15 font-semibold text-[#24cbc5] text-[11px] shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-white truncate">{svc.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-white">{rupiah(svc.revenue)}</p>
                    <p className="text-[10px] text-[#a4a7ac]">{svc.count} pesanan</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-[#a4a7ac] text-xs">
              <Scissors className="mx-auto size-6 text-[#454d5b] mb-1.5" />
              <span>Belum ada data pesanan layanan.</span>
            </div>
          )}
        </Card>

        {/* Produk Terlaris */}
        <Card
          title="Produk Terlaris"
          subtitle="Grooming & produk perawatan"
          action={
            <Link href="/dashboard/salon/services" className="text-xs text-[#24cbc5] hover:underline">
              Kelola →
            </Link>
          }
        >
          {topProducts.length > 0 ? (
            <div className="space-y-2.5">
              {topProducts.map((prod, idx) => (
                <div
                  key={prod.name}
                  className="flex items-center justify-between rounded-xl border border-[#454d5b]/40 bg-[#1c222e]/60 p-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid size-6 place-items-center rounded-full bg-[#06b6d4]/15 font-semibold text-[#06b6d4] text-[11px] shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-white truncate">{prod.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-white">{rupiah(prod.revenue)}</p>
                    <p className="text-[10px] text-[#a4a7ac]">{prod.count} terjual</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-[#a4a7ac] text-xs">
              <Package className="mx-auto size-6 text-[#454d5b] mb-1.5" />
              <span>Belum ada produk yang terjual.</span>
            </div>
          )}
        </Card>

        {/* Penata Teraktif */}
        <Card
          title="Penata Teraktif"
          subtitle="Performa penata & terapis hari ini"
          action={
            <Link href="/dashboard/salon/practitioners" className="text-xs text-[#24cbc5] hover:underline">
              Kelola →
            </Link>
          }
        >
          {topPractitioners.length > 0 ? (
            <div className="space-y-2.5">
              {topPractitioners.map((p, idx) => (
                <div
                  key={p.practitioner_id}
                  className="flex items-center justify-between rounded-xl border border-[#454d5b]/40 bg-[#1c222e]/60 p-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid size-6 place-items-center rounded-full bg-[#1835d9]/20 font-semibold text-[#a5b4fc] text-[11px] shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-white truncate">{p.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-white">{rupiah(Number(p.revenue))}</p>
                    <p className="text-[10px] text-[#24cbc5]">{p.visits} kunjungan selesai</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-[#a4a7ac] text-xs">
              <Users className="mx-auto size-6 text-[#454d5b] mb-1.5" />
              <span>Belum ada data penata aktif.</span>
            </div>
          )}
        </Card>
      </div>
    </DashboardSection>
  )
}
