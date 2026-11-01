'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CircleDollarSign, CreditCard, Database, Info, Package, Plus } from 'lucide-react'
import { useDashboardActivity } from './dashboard-shell'
import { salesSummary, saleCode, paymentLabel, type Sale } from '@/lib/pos'
import { roleNames } from '@/lib/auth/permissions'
import type { CatalogProduct } from '@/lib/catalog'
import type { Business, Member } from '@/lib/validation'

type Category = 'toko' | 'restoran' | 'barbershop'
type Product = { name: string; category?: string; price: string; stock: string; minStock?: string }
type Staff = { id: string; name: string; email: string; role: string }
const labels: Record<Category, string> = {
  toko: 'Toko / Minimarket / Kios',
  restoran: 'Restoran / Cafe',
  barbershop: 'Barbershop / Salon',
}

const money = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`

function ProductThumbnail({ image, name }: { image?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#24cbc5]/10 text-[#24cbc5] border border-[#24cbc5]/20">
      {image && !failed ? (
        <img src={image} alt={`Foto ${name}`} width={40} height={40} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : <Package className="size-4.5" aria-hidden="true" />}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="grid min-h-[calc(100dvh-96px)] place-items-center bg-[#1c222e] px-6 text-[#ffffff]">
      <div className="text-center">
        <img
          src="/brand/usahaku-logo.png"
          alt="Usahaku"
          width={64}
          height={64}
          className="mx-auto size-16 object-contain"
        />
        <div className="mx-auto mt-7 size-7 animate-spin rounded-full border-2 border-[#24cbc5]/20 border-t-[#24cbc5]" />
        <h1 className="mt-5 text-xl font-normal">Menyiapkan dashboard usaha Anda</h1>
        <p className="mt-2 text-sm text-[#c5cbd5]">Memproses data usaha dan menyiapkan ringkasan operasional...</p>
        <p className="mt-5 text-xs text-[#24cbc5]">Memuat identitas usaha</p>
      </div>
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

function Empty({ label }: { label: string }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-[#454d5b] bg-[#1c222e]/60 p-6 text-center">
      <div>
        <Package className="mx-auto size-7 text-[#a4a7ac]/60" />
        <p className="mt-2 text-sm text-[#a4a7ac]">{label}</p>
      </div>
    </div>
  )
}

function Inventory({ lowStock, onOpen }: { lowStock: Product[]; onOpen: () => void }) {
  return (
    <Card
      title={`${lowStock.length} produk perlu diisi ulang`}
      action={
        <button className="text-xs sm:text-sm font-normal text-[#24cbc5] hover:underline" onClick={onOpen}>
          Kelola inventori →
        </button>
      }
    >
      {lowStock.length ? (
        <div className="overflow-x-auto">
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs sm:text-sm text-amber-300 leading-relaxed">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-400" />
            <span>Periksa stok yang berada di bawah batas minimum sebelum operasional berikutnya dimulai.</span>
          </div>
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-[#454d5b] text-xs font-medium text-[#a4a7ac]">
              <tr>
                <th className="py-3 px-3">Produk</th>
                <th className="py-3 px-3">Stok tersedia</th>
                <th className="py-3 px-3">Batas minimum</th>
                <th className="py-3 px-3">Kondisi</th>
                <th className="py-3 px-3 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#454d5b]/50">
              {lowStock.map((p) => (
                <tr className="hover:bg-[#1c222e]/40 transition" key={p.name}>
                  <td className="py-3 px-3 font-medium text-white">{p.name}</td>
                  <td className="py-3 px-3 font-normal text-white">{p.stock}</td>
                  <td className="py-3 px-3 text-[#c5cbd5]">{p.minStock ?? 0}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-normal ${
                        Number(p.stock) === 0
                          ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                          : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                      }`}
                    >
                      {Number(p.stock) === 0 ? 'Habis' : 'Menipis'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button onClick={onOpen} className="text-xs font-normal text-[#24cbc5] hover:underline">
                      Catat stok masuk
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty label="Stok aman — belum ada produk di bawah batas minimum." />
      )}
    </Card>
  )
}

export default function UsahakuDashboard({
  initialCategory = 'toko',
  business,
  member,
  members,
  initialProducts,
  sales,
}: {
  sales: Sale[]
  initialProducts: CatalogProduct[]
  initialCategory?: Category
  business: Business
  member: Member
  members: Member[]
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [category] = useState<Category>(initialCategory)
  const [identity, setIdentity] = useState<{ form: Record<string, string>; owner: { name: string } } | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [staff, setStaff] = useState<Staff[]>([])

  useEffect(() => {
    setIdentity({
      form: { name: business.name, address: business.address, phone: business.phone },
      owner: { name: member.name },
    })
    setProducts(
      initialProducts.map((p) => ({
        ...p,
        price: String(p.price),
        stock: String(p.stock),
        minStock: String(p.minStock),
      }))
    )
    setStaff(
      members
        .filter((person) => person.role !== 'owner')
        .map((person) => ({
          id: person.id,
          name: person.name,
          email: person.username || '',
          role: roleNames[person.role],
        }))
    )
    setReady(true)
  }, [business, member, members, initialProducts])


  const form = identity?.form || {}
  const businessName = business.name
  const ownerName = identity?.owner?.name || form.owner || 'Pemilik usaha'
  const lowStock = products.filter((p) => Number(p.stock) <= Number(p.minStock ?? 0))
  const configured = products.length > 0 || staff.length > 0

  const nav = (label: string) => {
    const routes: Record<string, string> = {
      Ringkasan: '/dashboard',
      Produk: '/dashboard/products',
      Inventori: '/dashboard/inventory',
      'Kasir (POS)': '/dashboard/pos',
      Transaksi: '/dashboard/transactions',
      Pelanggan: '/dashboard/customers',
      'Poin loyalitas': '/dashboard/loyalty',
      Laporan: '/dashboard/reports',
      'Asisten Bisnis AI': '/dashboard/assistant',
      Pengaturan: '/dashboard/settings',
    }
    if (routes[label]) router.push(`${routes[label]}?category=${category}`)
  }

  const summary = salesSummary(sales)
  const productImages = new Map(initialProducts.map(product => [product.id, product.image]))
  const { revenue } = summary
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  )
  const maxDaily = Math.max(1, ...summary.daily)
  const bars = summary.daily.map((n) => (n / maxDaily) * 90)

  useDashboardActivity(business.id, initialProducts, sales)

  if (!ready) return <LoadingScreen />

  const content = (
      <>
        {/* 4 Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            title="Omzet hari ini"
            value={configured ? money(revenue) : 'Rp0'}
            note={`${summary.count} transaksi selesai`}
            icon={CircleDollarSign}
          />
          <Metric
            title="Transaksi hari ini"
            value={String(summary.count)}
            note={`Rata-rata ${money(summary.count ? Math.round(revenue / summary.count) : 0)}`}
            icon={CreditCard}
          />
          <Metric
            title="Produk terjual"
            value={`${summary.units.toLocaleString('id-ID')} unit`}
            note="Penjualan selesai hari ini"
            icon={Package}
          />
          <Metric
            title="Produk stok menipis"
            value={String(lowStock.length)}
            note={lowStock.length > 0 ? 'Perlu tindakan segera' : 'Batas minimum stok'}
            icon={Database}
            warning={lowStock.length > 0}
          />
        </div>

        {/* Charts & Ranked Products Row */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          {/* Tren Omzet Card */}
          <Card
            title="Tren omzet"
            subtitle="Ringkasan aktivitas penjualan mingguan"
            action={
              <span className="rounded-full border border-[#454d5b] bg-[#1c222e] px-3 py-1 text-xs font-medium text-[#c5cbd5]">
                7 hari terakhir
              </span>
            }
          >
            <div className="flex h-56 items-end gap-2.5 sm:gap-4 border-b border-[#454d5b] px-2 pb-3 pt-6">
              {bars.map((height, i) => {
                const isToday = i === 6
                const dayAmount = summary.daily[i]
                return (
                  <div key={i} className="group relative flex flex-1 flex-col items-center gap-2">
                    <div className="pointer-events-none absolute -top-8 z-10 hidden rounded-md bg-[#1c222e] border border-[#454d5b] px-2 py-1 text-[10px] font-normal text-white shadow-md group-hover:block whitespace-nowrap">
                      {money(dayAmount)}
                    </div>
                    <div
                      className={`w-full max-w-10 rounded-t-lg transition-all duration-300 ${
                        isToday
                          ? 'bg-[#24cbc5] shadow-[0_0_12px_rgba(36,203,197,0.35)]'
                          : 'bg-[#24cbc5]/35 hover:bg-[#24cbc5]/60'
                      }`}
                      style={{ height: `${Math.max(6, height * 1.5)}px` }}
                    />
                    <span
                      className={`text-[11px] font-medium ${
                        isToday ? 'text-[#24cbc5] font-normal' : 'text-[#c5cbd5]'
                      }`}
                    >
                      {summary.labels[i]}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#a4a7ac]">Total selesai:</span>
                <strong className="text-sm font-normal text-white">
                  {money(summary.daily.reduce((a, b) => a + b, 0))}
                </strong>
              </div>
              <button
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-normal text-[#24cbc5] hover:underline"
                onClick={() => nav('Laporan')}
              >
                Lihat laporan lengkap →
              </button>
            </div>
            <p className="mt-2 text-xs text-[#a4a7ac]">Hanya penjualan selesai; belum termasuk uang muka.</p>
          </Card>

          {/* Produk Paling Laris Card */}
          <Card
            title="Produk paling laris"
            subtitle="Peringkat penjualan produk teratas"
            action={
              <button
                className="text-xs sm:text-sm font-normal text-[#24cbc5] hover:underline"
                onClick={() => nav('Produk')}
              >
                Lihat semua →
              </button>
            }
          >
            <div className="space-y-3">
              {summary.best.map((product, i) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3.5 rounded-xl border border-transparent p-2.5 hover:border-[#454d5b]/60 hover:bg-[#1c222e]/40 transition"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#303640] text-xs font-semibold text-[#c5cbd5]">
                    {i + 1}
                  </span>
                  <ProductThumbnail key={productImages.get(product.id) || 'no-image'} image={productImages.get(product.id)} name={product.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-normal text-white">{product.name}</p>
                    <p className="text-xs text-[#a4a7ac]">{product.units.toLocaleString('id-ID')} terjual</p>
                  </div>
                  <span className="text-sm font-normal text-white">{money(product.gross)}</span>
                </div>
              ))}
              {!summary.best.length && <Empty label="Belum ada produk terlaris" />}
            </div>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-3 text-xs text-[#24cbc5] leading-relaxed">
              <Info className="size-4 shrink-0 mt-0.5" />
              <span>Data penjualan akan membentuk peringkat produk setelah transaksi selesai dicatat.</span>
            </div>
          </Card>
        </div>

        {/* Low Stock Alert Section */}
        <div className="mt-6">
          <Inventory lowStock={lowStock} onOpen={() => nav('Inventori')} />
        </div>

        {/* Recent Transactions */}
        <div className="mt-6">
          <Card
            title="Transaksi kasir terbaru"
            subtitle="Aktivitas struk dan transaksi yang tercatat hari ini"
            action={
              <button
                className="text-xs sm:text-sm font-normal text-[#24cbc5] hover:underline"
                onClick={() => nav('Transaksi')}
              >
                Semua transaksi →
              </button>
            }
          >
            {sales.length ? (
              <div className="mt-2 divide-y divide-[#454d5b]/60">
                {sales.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => router.push('/dashboard/transactions/' + s.id)}
                    className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm hover:bg-[#1c222e]/40 px-2 rounded-xl transition"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-normal text-white">{saleCode(s)}</p>
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
                    <strong className="text-sm font-normal text-white">{money(Number(s.total))}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <Empty label="Belum ada transaksi kasir" />
            )}
          </Card>
        </div>

        {/* Bottom Widgets */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Kasir bertugas" subtitle="Staf operasional kasir sesi ini">
            <Empty label="Belum ada kasir aktif" />
          </Card>
          <Card title="Catatan Asisten Bisnis AI" subtitle="Rekomendasi dan evaluasi otomatis">
            <div className="rounded-2xl border border-[#24cbc5]/20 bg-[#24cbc5]/10 p-5">
              <p className="font-normal text-[#24cbc5]">Belum ada insight operasional</p>
              <p className="mt-1 text-sm text-[#c5cbd5]">
                Catatan analisis performa usaha akan otomatis muncul setelah data penjualan dan inventori tersedia.
              </p>
              <button
                className="mt-3.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-normal text-[#24cbc5] hover:underline"
                onClick={() => nav('Asisten Bisnis AI')}
              >
                Buka asisten bisnis →
              </button>
            </div>
          </Card>
        </div>
      </>
    )

  return <div className="w-full">
            {/* Subheader Matching Gambar 2: Title on Left, Horizontal Stat Badges on Right */}
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
                  Pantau penjualan dan kelola operasional <span className="font-normal text-white">{businessName}</span>.
                </p>
              </div>

              {/* Horizontal Summary Pills (Matching Gambar 2 Rapport) */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Stat Pill 1: Won this month / Omzet */}
                <div className="flex items-center gap-3 rounded-full border border-[#454d5b] bg-[#273242] px-4 py-2 shadow-xs">
                  <div className="grid size-8 place-items-center rounded-full bg-[#24cbc5]/10 text-[#24cbc5]">
                    <CircleDollarSign className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {configured ? money(revenue) : 'Rp0'}
                      </span>
                      <span className="rounded-full bg-[#24cbc5]/15 px-1.5 py-0.5 text-[10px] font-normal text-[#24cbc5]">
                        Hari ini
                      </span>
                    </div>
                    <p className="text-[10px] text-[#a4a7ac]">{summary.count} transaksi selesai</p>
                  </div>
                </div>

                {/* Stat Pill 2: Open pipeline / Transaksi */}
                <div className="flex items-center gap-3 rounded-full border border-[#454d5b] bg-[#273242] px-4 py-2 shadow-xs">
                  <div className="grid size-8 place-items-center rounded-full bg-[#1835d9]/20 text-[#24cbc5]">
                    <CreditCard className="size-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">{summary.count} Transaksi</span>
                    <p className="text-[10px] text-[#a4a7ac]">
                      Rata-rata {money(summary.count ? Math.round(revenue / summary.count) : 0)}
                    </p>
                  </div>
                </div>

                {/* Stat Pill 3: Win rate / Stok menipis */}
                <div
                  className={`flex items-center gap-3 rounded-full border bg-[#273242] px-4 py-2 shadow-xs ${
                    lowStock.length ? 'border-amber-500/40' : 'border-[#454d5b]'
                  }`}
                >
                  <div
                    className={`grid size-8 place-items-center rounded-full ${
                      lowStock.length ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    <Package className="size-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">{lowStock.length} Stok Menipis</span>
                    <p className="text-[10px] text-[#a4a7ac]">
                      {lowStock.length ? 'Perlu isi ulang' : 'Semua stok aman'}
                    </p>
                  </div>
                </div>

                {/* Action CTA Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => nav('Kasir (POS)')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1835d9] px-4 py-2 text-xs font-normal text-white hover:bg-[#132c9e] transition shadow-xs active:scale-95"
                  >
                    <Plus className="size-3.5" /> Buka kasir
                  </button>
                  <button
                    onClick={() => nav('Produk')}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#454d5b] bg-[#273242] px-3.5 py-2 text-xs font-normal text-[#24cbc5] hover:bg-[#303640] transition shadow-xs"
                  >
                    <Plus className="size-3.5" /> Tambah produk
                  </button>
                </div>
              </div>
            </div>

            {/* Dashboard Content */}
            <div className="mt-6">{content}</div>

            {/* Footer Metadata */}
            <footer className="mt-10 flex flex-col gap-1.5 border-t border-[#454d5b]/60 pt-5 text-[11px] text-white/60 sm:flex-row sm:justify-between">
              <span>
                {configured ? 'Data operasional tersinkronisasi' : 'Data usaha — belum ada aktivitas operasional'}
              </span>
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
}

