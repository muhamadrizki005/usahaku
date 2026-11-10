'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  CircleDollarSign,
  CreditCard,
  Info,
  Package,
  Plus,
  UtensilsCrossed,
  UsersRound,
  Armchair,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { calculateRevenueTrend, getTodayWib, getPeriodSubtitle, type TrendPeriod } from '@/lib/dashboard-trends'
import { CustomSelect } from '@/components/ui/custom-select'
import { DatePicker } from '@/components/ui/date-picker'
import RevenueApexChart from '@/components/revenue-apex-chart'
import { salesSummary, saleCode, paymentLabel, type Sale } from '@/lib/pos'
import {
  restaurantOrderCode,
  restaurantStages,
  type RestaurantOverviewData,
  type RestaurantMenu,
  type RestaurantTable,
  type RestaurantTableUsage,
} from '@/lib/restaurant'
import type { Business, Member } from '@/lib/validation'
import { roleNames } from '@/lib/auth/permissions'

const money = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`

function MenuThumbnail({ id, name }: { id: string; name: string }) {
  const [photo, setPhoto] = useState<string>('')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('usahaku_menu_photo_' + id)
        if (saved) setPhoto(saved)
      } catch {}
    }
  }, [id])

  return (
    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#24cbc5]/10 text-[#24cbc5] border border-[#24cbc5]/20">
      {photo ? (
        <img src={photo} alt={`Foto ${name}`} width={40} height={40} className="size-full object-cover" />
      ) : (
        <UtensilsCrossed className="size-4.5" aria-hidden="true" />
      )}
    </div>
  )
}

function Card({
  title,
  children,
  action,
  subtitle,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  subtitle?: string
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-3">
        <div>
          <h2 className="text-base sm:text-lg font-normal tracking-tight text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[#a4a7ac]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Metric({
  title,
  value,
  note,
  icon: Icon,
  warning,
}: {
  title: string
  value: string
  note: string
  icon: typeof Package
  warning?: boolean
}) {
  return (
    <div
      className={`group rounded-2xl border bg-[#273242] p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        warning ? 'border-amber-500/50 hover:border-amber-400' : 'border-[#454d5b] hover:border-[#24cbc5]/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-medium text-[#c5cbd5]">{title}</span>
        <div
          className={`grid size-9 place-items-center rounded-xl border transition-colors ${
            warning
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              : 'bg-[#24cbc5]/10 border-[#24cbc5]/20 text-[#24cbc5] group-hover:bg-[#24cbc5]/15'
          }`}
        >
          <Icon className="size-4.5" />
        </div>
      </div>
      <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-white">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-[#a4a7ac]">
        {warning && <span className="inline-block size-1.5 rounded-full bg-amber-400" />}
        <span>{note}</span>
      </div>
    </div>
  )
}

function Empty({ label, icon: Icon = Package }: { label: string; icon?: typeof Package }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-[#454d5b] bg-[#1c222e]/60 p-6 text-center">
      <div>
        <Icon className="mx-auto size-7 text-[#a4a7ac]/60" />
        <p className="mt-2 text-sm text-[#a4a7ac]">{label}</p>
      </div>
    </div>
  )
}

export default function RestaurantOverview({
  business,
  member,
  members = [],
  summary,
  sales = [],
  menu = [],
  tables = [],
  usage = [],
}: {
  business: Business
  member?: Member
  members?: Member[]
  summary: RestaurantOverviewData
  sales?: Sale[]
  menu?: RestaurantMenu[]
  tables?: RestaurantTable[]
  usage?: RestaurantTableUsage[]
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

  const trendData = calculateRevenueTrend(sales, trendPeriod, customStart, customEnd)
  const salesStats = salesSummary(sales)

  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  )

  const ownerName = member?.name || 'Pengelola Restoran'
  const revenue = Number(summary.revenue) || 0
  const saleCount = summary.saleCount || 0
  const avgSale = saleCount > 0 ? Math.round(revenue / saleCount) : 0
  const openOrdersCount = summary.openCount || 0
  const occupiedTables = summary.occupiedCount || 0
  const totalTables = summary.tableCount || tables.length
  const availableTables = Math.max(0, totalTables - occupiedTables)

  const activeStaff = useMemo(() => {
    return members
      .filter((m) => m.role !== 'owner' && m.active)
      .map((person) => ({
        id: person.id,
        name: person.name,
        email: person.username || '',
        role: roleNames[person.role] || person.role,
      }))
  }, [members])

  return (
    <div className="w-full">
      {/* Subheader: Greetings on Left, Stat Pills on Right */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-normal text-[#24cbc5] uppercase tracking-wider">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'Asia/Jakarta',
            })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Selamat {hour < 12 ? 'pagi' : hour < 18 ? 'siang' : 'malam'}, {ownerName}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#c5cbd5]">
            Pantau pesanan meja, menu, dan omzet operasional{' '}
            <span className="font-normal text-white">{business.name}</span>.
          </p>
        </div>

        {/* Horizontal Summary Pills */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Stat Pill 1: Omzet Hari Ini */}
          <div className="flex items-center gap-3 rounded-full border border-[#454d5b] bg-[#273242] px-4 py-2 shadow-xs">
            <div className="grid size-8 place-items-center rounded-full bg-[#24cbc5]/10 text-[#24cbc5]">
              <CircleDollarSign className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{money(revenue)}</span>
                <span className="rounded-full bg-[#24cbc5]/15 px-1.5 py-0.5 text-[10px] font-normal text-[#24cbc5]">
                  Hari ini
                </span>
              </div>
              <p className="text-[10px] text-[#a4a7ac]">{saleCount} transaksi selesai</p>
            </div>
          </div>

          {/* Stat Pill 2: Transaksi Hari Ini */}
          <div className="flex items-center gap-3 rounded-full border border-[#454d5b] bg-[#273242] px-4 py-2 shadow-xs">
            <div className="grid size-8 place-items-center rounded-full bg-[#1835d9]/20 text-[#24cbc5]">
              <CreditCard className="size-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">{saleCount} Transaksi</span>
              <p className="text-[10px] text-[#a4a7ac]">Rata-rata {money(avgSale)}</p>
            </div>
          </div>

          {/* Stat Pill 3: Meja Terpakai */}
          <div
            className={`flex items-center gap-3 rounded-full border bg-[#273242] px-4 py-2 shadow-xs ${
              occupiedTables >= totalTables && totalTables > 0 ? 'border-amber-500/40' : 'border-[#454d5b]'
            }`}
          >
            <div
              className={`grid size-8 place-items-center rounded-full ${
                occupiedTables >= totalTables && totalTables > 0
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              <UsersRound className="size-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">
                {occupiedTables} / {totalTables} Meja
              </span>
              <p className="text-[10px] text-[#a4a7ac]">
                {availableTables > 0 ? `${availableTables} meja kosong` : 'Semua meja penuh'}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard/pos')}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1835d9] px-4 py-2 text-xs font-normal text-white hover:bg-[#132c9e] transition shadow-xs active:scale-95"
            >
              <Plus className="size-3.5" /> Buka pesanan & kasir
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/products')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border-0 bg-[#303640] px-3.5 py-2 text-xs font-semibold text-[#24cbc5] hover:bg-[#3d4653] hover:text-white transition-all shadow-xs active:scale-95"
            >
              <Plus className="size-3.5" /> Kelola menu
            </button>
          </div>
        </div>
      </div>

      {/* 4 Stat Metric Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Omzet hari ini"
          value={money(revenue)}
          note={`${saleCount} transaksi selesai hari ini`}
          icon={CircleDollarSign}
        />
        <Metric
          title="Transaksi hari ini"
          value={String(saleCount)}
          note={`Rata-rata ${money(avgSale)} per transaksi`}
          icon={CreditCard}
        />
        <Metric
          title="Pesanan terbuka"
          value={`${openOrdersCount} pesanan`}
          note={openOrdersCount > 0 ? 'Sedang aktif diproses di dapur/kasir' : 'Tidak ada antrean pesanan'}
          icon={UtensilsCrossed}
          warning={openOrdersCount > 5}
        />
        <Metric
          title="Meja terpakai"
          value={`${occupiedTables} / ${totalTables}`}
          note={`${availableTables} meja tersedia untuk tamu`}
          icon={UsersRound}
          warning={occupiedTables >= totalTables && totalTables > 0}
        />
      </div>

      {/* Row 1: Charts & Ranked Menu */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Tren Omzet Card */}
        <Card
          title="Tren omzet"
          subtitle={getPeriodSubtitle(trendPeriod, trendData.startDate, trendData.endDate)}
          action={
            <div className="w-44 sm:w-48">
              <CustomSelect
                value={trendPeriod}
                onChange={(val) => setTrendPeriod(val as TrendPeriod)}
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
                ariaLabel="Filter periode tren omzet"
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
                  onChange={(val) => {
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
                  onChange={(val) => {
                    if (val < customStart) {
                      setCustomEnd(val)
                      setCustomStart(val)
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
              <p className="text-sm text-[#c5cbd5]">Belum ada transaksi restoran selesai pada periode ini</p>
              <p className="text-xs text-[#a4a7ac]">Pilih rentang waktu lain atau selesaikan pesanan di kasir</p>
            </div>
          ) : (
            <div className="border-b border-[#454d5b]/60 pb-2">
              <RevenueApexChart buckets={trendData.buckets} height={230} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#a4a7ac]">Total selesai:</span>
              <strong className="text-sm font-semibold text-white">{money(trendData.totalRevenue)}</strong>
              <span className="text-xs text-[#a4a7ac]">({trendData.totalCount} transaksi)</span>
            </div>
            <button
              type="button"
              className="btn-action"
              onClick={() => router.push('/dashboard/reports')}
            >
              Lihat laporan lengkap →
            </button>
          </div>
          <p className="mt-2 text-xs text-[#a4a7ac]">Hanya penjualan selesai; belum termasuk uang muka (DP).</p>
        </Card>

        {/* Menu Paling Laris Card */}
        <Card
          title="Menu paling laris"
          subtitle="Peringkat penjualan menu teratas"
          action={
            <button
              type="button"
              className="btn-action"
              onClick={() => router.push('/dashboard/products')}
            >
              Lihat semua menu →
            </button>
          }
        >
          <div className="space-y-3">
            {salesStats.best.map((product, i) => (
              <div
                key={product.id}
                className="flex items-center gap-3.5 rounded-xl border border-transparent p-2.5 hover:border-[#454d5b]/60 hover:bg-[#1c222e]/40 transition"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#303640] text-xs font-semibold text-[#c5cbd5]">
                  {i + 1}
                </span>
                <MenuThumbnail id={product.id} name={product.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-normal text-white">{product.name}</p>
                  <p className="text-xs text-[#a4a7ac]">{product.units.toLocaleString('id-ID')} porsi terjual</p>
                </div>
                <span className="text-sm font-normal text-white">{money(product.gross)}</span>
              </div>
            ))}
            {!salesStats.best.length && <Empty label="Belum ada menu yang terjual" icon={UtensilsCrossed} />}
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-3 text-xs text-[#24cbc5] leading-relaxed">
            <Info className="size-4 shrink-0 mt-0.5" />
            <span>Peringkat menu terbentuk otomatis dari pesanan yang lunas dan selesai dicatat di kasir.</span>
          </div>
        </Card>
      </div>

      {/* Row 2: Meja & Operasional */}
      <div className="mt-6">
        <Card
          title="Status meja & kapasitas"
          subtitle={`${occupiedTables} dari ${totalTables} meja sedang digunakan`}
          action={
            <button
              type="button"
              className="btn-action"
              onClick={() => router.push('/dashboard/restaurant/tables')}
            >
              Kelola meja →
            </button>
          }
        >
          {tables.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {tables.map((table) => {
                const isOccupied = usage.some((u) => u.id === table.id && u.occupied)
                const isReserved = usage.some((u) => u.id === table.id && u.reserved)
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => router.push('/dashboard/pos')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                      isOccupied
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : isReserved
                        ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                        : 'border-[#454d5b] bg-[#1c222e]/60 text-white hover:border-[#24cbc5] hover:bg-[#303640]'
                    }`}
                  >
                    <Armchair className="size-5 mb-1 opacity-80" />
                    <span className="line-clamp-1 font-medium text-xs [overflow-wrap:anywhere]">{table.name}</span>
                    <span className="text-[10px] text-[#a4a7ac]">{table.capacity} org</span>
                    <span
                      className={`mt-1.5 inline-block rounded-full px-1.5 py-0.2 text-[9px] font-medium ${
                        isOccupied
                          ? 'bg-amber-500/20 text-amber-400'
                          : isReserved
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {isOccupied ? 'Terpakai' : isReserved ? 'Reservasi' : 'Kosong'}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty label="Belum ada meja terdaftar. Buka manajemen meja untuk mengatur ruang." icon={UsersRound} />
          )}
        </Card>
      </div>

      {/* Row 3: Pesanan Terbuka & Transaksi Kasir Terbaru */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Pesanan Terbuka */}
        <Card
          title="Pesanan aktif"
          subtitle={`${openOrdersCount} pesanan berlangsung di restoran`}
          action={
            <button
              type="button"
              className="btn-action"
              onClick={() => router.push('/dashboard/pos')}
            >
              Buka kasir & pesanan →
            </button>
          }
        >
          {summary.recent && summary.recent.length ? (
            <div className="divide-y divide-[#454d5b]/60">
              {summary.recent.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => router.push('/dashboard/pos')}
                  className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm hover:bg-[#1c222e]/40 px-2 rounded-xl transition"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">
                      {restaurantOrderCode(order.id)} • {order.table_name || 'Bawa pulang'}
                    </p>
                    <p className="mt-0.5 text-xs text-[#a4a7ac]">
                      Status proses:{' '}
                      <span className="font-medium text-[#24cbc5]">
                        {restaurantStages[order.stage] || order.stage}
                      </span>
                    </p>
                  </div>
                  <strong className="text-sm font-semibold text-white">{money(Number(order.subtotal))}</strong>
                </button>
              ))}
            </div>
          ) : (
            <Empty label="Belum ada pesanan aktif saat ini" icon={UtensilsCrossed} />
          )}
        </Card>

        {/* Transaksi Kasir Terbaru */}
        <Card
          title="Transaksi kasir terbaru"
          subtitle="Aktivitas struk dan pembayaran restoran selesai"
          action={
            <button
              type="button"
              className="btn-action"
              onClick={() => router.push('/dashboard/transactions')}
            >
              Semua transaksi →
            </button>
          }
        >
          {sales.length ? (
            <div className="divide-y divide-[#454d5b]/60">
              {sales.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push('/dashboard/transactions/' + s.id)}
                  className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm hover:bg-[#1c222e]/40 px-2 rounded-xl transition"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{saleCode(s)}</p>
                    <p className="mt-0.5 text-xs text-[#a4a7ac]">
                      {s.actor_name} • {paymentLabel[s.payment]} •{' '}
                      <span
                        className={`font-medium ${
                          s.status === 'completed' ? 'text-[#24cbc5]' : 'text-[#ffb4ae]'
                        }`}
                      >
                        {s.status === 'completed' ? 'Selesai' : 'Dibatalkan'}
                      </span>
                    </p>
                  </div>
                  <strong className="text-sm font-semibold text-white">{money(Number(s.total))}</strong>
                </button>
              ))}
            </div>
          ) : (
            <Empty label="Belum ada transaksi kasir selesai" icon={CreditCard} />
          )}
        </Card>
      </div>

      {/* Row 4: Bottom Widgets */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Kasir & staf bertugas" subtitle="Staf operasional restoran sesi ini">
          {activeStaff.length ? (
            <div className="space-y-2">
              {activeStaff.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl bg-[#1c222e]/50 border border-[#454d5b]/40 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="text-xs text-[#a4a7ac]">{s.email || 'Akun staf'}</p>
                  </div>
                  <span className="rounded-full bg-[#1835d9]/20 px-2.5 py-0.5 text-xs font-medium text-[#24cbc5]">
                    {s.role}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty label="Belum ada kasir atau staf tambahan aktif" icon={UsersRound} />
          )}
        </Card>

        <Card title="Catatan Asisten Bisnis AI" subtitle="Rekomendasi dan evaluasi restoran">
          <div className="rounded-2xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-5">
            <p className="font-medium text-[#24cbc5]">Rekomendasi Operasional Restoran</p>
            <p className="mt-1 text-sm text-[#c5cbd5] leading-relaxed">
              Analisis perputaran meja, menu favorit, dan efisiensi pesanan akan otomatis diperbarui seiring
              dengan berjalannya transaksi kasir.
            </p>
            <button
              type="button"
              className="mt-3.5 btn-action"
              onClick={() => router.push('/dashboard/assistant')}
            >
              Buka asisten bisnis →
            </button>
          </div>
        </Card>
      </div>

      {/* Footer Metadata */}
      <footer className="mt-10 flex flex-col gap-1.5 border-t border-[#454d5b]/60 pt-5 text-[11px] text-white/60 sm:flex-row sm:justify-between">
        <span>Data operasional tersinkronisasi • Kategori Restoran & Cafe</span>
        <span>
          Zona waktu WIB • Diperbarui{' '}
          {new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta',
          })}
        </span>
      </footer>
    </div>
  )
}
