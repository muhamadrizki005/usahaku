'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Bell, Coffee, CreditCard, Minus, Package, Plus, Scissors, Search, ShoppingBag, Trash2, TrendingUp, User, X } from 'lucide-react'
import { DashboardBrand, DashboardMobileMenu, DashboardSidebar, DashboardTopNav } from './dashboard-chrome'
import { DashboardAmbient } from './dashboard-ambient'
import { CustomSelect } from './ui/custom-select'
import { ModalFrame } from './ui/modal-frame'
import RevenueApexChart from './revenue-apex-chart'
import { calculateRevenueTrend } from '@/lib/dashboard-trends'
import { rupiah, saleDate } from '@/lib/pos'
import { changeDemoQuantity, demoBusinesses, demoCartLines, demoCatalogs, demoCategories, makeDemoSales, type DemoCategory } from '@/lib/public-demo'
import { dashboardNavigation, restaurantTopNavigationItems, salonTopNavigationItems } from './dashboard-navigation'
import { useReducedMotionPreference } from '@/lib/use-reduced-motion'
import { useDemoCart } from './public-demo-cart'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5]'
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#454d5b] bg-[#273242] px-4 text-sm text-[#c5cbd5] hover:bg-[#303640] ' + focus
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-4 text-sm text-white hover:bg-[#132c9e] ' + focus

export function PublicBusinessDemo({ category, screen, gated, now }: { category: DemoCategory; screen: 'ringkasan' | 'kasir'; gated: boolean; now: string }) {
  const router = useRouter(), business = demoBusinesses[category], catalog = demoCatalogs[category]
  const reducedMotion = useReducedMotionPreference()
  const { cart, setCart } = useDemoCart(category)
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all')
  const [gate, setGate] = useState<string | null>(gated ? 'Fitur lainnya' : null), [announcement, setAnnouncement] = useState('')
  const searchId = useId(), modalId = useId(), modalDescription = useId()
  useEffect(() => { if (gated) setGate('Fitur lainnya') }, [gated])
  const sales = useMemo(() => makeDemoSales(category, new Date(now)), [category, now])
  const trend = useMemo(() => calculateRevenueTrend(sales, '7d', undefined, undefined, new Date(now)), [sales, now])
  const lines = demoCartLines(cart, catalog), total = lines.reduce((sum, line) => sum + line.total, 0)
  const activePath = screen === 'ringkasan' ? '/dashboard' : category === 'salon' ? '/dashboard/salon/appointments' : '/dashboard/pos'
  const categoryIcon = category === 'restoran' ? Coffee : category === 'salon' ? Scissors : Package
  const CategoryIcon = categoryIcon
  const navigation = [...(category === 'salon' ? salonTopNavigationItems : category === 'restoran' ? restaurantTopNavigationItems : dashboardNavigation), ...dashboardNavigation]
  function navigate(path: string) {
    if (path === '/dashboard') router.push(`/demo/${category}`, { scroll: false })
    else if (path === '/dashboard/pos' || path === '/dashboard/salon/appointments') router.push(`/demo/${category}?view=kasir`, { scroll: false })
    else setGate(navigation.find(([, , href]) => href === path)?.[0] || 'Fitur lainnya')
  }
  const add = (id: string) => {
    setCart(previous => changeDemoQuantity(previous, catalog, id, 1))
    setAnnouncement(`${catalog.find(item => item.id === id)!.name} ditambahkan ke keranjang.`)
  }
  const today = sales.at(-1)!
  return <DashboardAmbient><main data-public-demo={category} className="flex min-h-screen w-full flex-col bg-transparent text-white">
    <header className="z-30 w-full shrink-0 bg-transparent pb-4 pt-4 sm:pb-5 sm:pt-5">
      <div className="relative mx-auto flex w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="z-10 flex shrink-0 items-center lg:pl-[70px]"><DashboardBrand onHome={() => navigate('/dashboard')} /></div>
        <div className="hidden min-w-0 flex-1 items-center justify-center min-[1536px]:flex"><DashboardTopNav role="owner" category={business.category} activePath={activePath} onNavigate={navigate} prefetchEnabled={false} /></div>
        <div className="z-10 ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <button className={secondary + ' !size-10 !min-h-10 !p-0'} aria-label="Notifikasi" onClick={() => setGate('Notifikasi')}><Bell className="size-4" /></button>
          <button className={secondary + ' !size-10 !min-h-10 !p-0'} aria-label="Akun saya" onClick={() => setGate('Akun saya')}><User className="size-4" /></button>
          <DashboardMobileMenu role="owner" category={business.category} businessName={business.name + ' · Demo'} activePath={activePath} onNavigate={navigate} assistantVisible={false} prefetchEnabled={false} />
        </div>
      </div>
    </header>
    <div className="mx-auto flex w-full flex-1 items-start gap-5 px-4 pb-10 pt-2 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
      <DashboardSidebar role="owner" category={business.category} activePath={activePath} onNavigate={navigate} assistantVisible={false} prefetchEnabled={false} />
      <div className="min-w-0 flex-1 space-y-6">
        <section aria-label="Informasi demo" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#454d5b] bg-[#273242] p-4">
          <div className="min-w-0"><p className="text-sm font-semibold text-[#24cbc5]">Mode demo · {business.name}</p><p className="mt-1 text-xs leading-5 text-[#c5cbd5]">Semua data adalah contoh. Coba Ringkasan dan keranjang kasir tanpa menyimpan transaksi.</p></div>
          <div className="flex max-w-full flex-wrap items-center gap-3"><CustomSelect ariaLabel="Kategori demo" value={category} onChange={value => router.push(`/demo/${value}`)} options={demoCategories.map(value => ({ value, label: demoBusinesses[value].label }))} /><Link href="/" prefetch={false} className={'inline-flex min-h-11 items-center gap-2 text-sm text-[#c5cbd5] hover:text-white ' + focus}><ArrowLeft className="size-4" />Beranda</Link></div>
        </section>
        <div><p className="mb-2 text-xs text-[#c5cbd5]">Usahaku › Demo {business.label}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{screen === 'ringkasan' ? `Ringkasan ${business.name}` : business.cashier}</h1><p className="mt-2 text-sm text-[#c5cbd5]">{screen === 'ringkasan' ? 'Lihat contoh penjualan dan aktivitas usaha yang sudah selesai.' : 'Pilih produk atau layanan untuk mencoba keranjang. Pembayaran memerlukan akun.'}</p></div>
        {screen === 'ringkasan' ? <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[['Omzet hari ini', rupiah(today.total), TrendingUp], ['Transaksi selesai hari ini', '1', CreditCard], [category === 'salon' ? 'Layanan & produk contoh' : category === 'restoran' ? 'Menu contoh' : 'Produk contoh', String(catalog.length), CategoryIcon], ['Omzet 7 hari', rupiah(trend.totalRevenue), ShoppingBag]].map(([label, value, Icon]) => {
              const MetricIcon = Icon as typeof Package
              return <div key={String(label)} className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs text-[#c5cbd5]">{String(label)}</p><MetricIcon className="size-5 shrink-0 text-[#24cbc5]" /></div><p className="mt-4 break-words text-2xl font-semibold">{String(value)}</p><p className="mt-2 text-xs text-[#c5cbd5]">Data contoh demo</p></div>
            })}
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
            <DemoPanel title="Tren omzet" action={<button className={'min-h-11 text-sm text-[#24cbc5] ' + focus} onClick={() => setGate('Laporan')}>Lihat laporan →</button>}><p className="mb-4 text-xs text-[#c5cbd5]">7 hari terakhir · {sales.length} transaksi contoh berstatus selesai</p><div data-demo-chart="true" className="min-h-60 min-w-0"><RevenueApexChart buckets={trend.buckets} animate={!reducedMotion} /></div><p className="mt-3 text-xs text-[#c5cbd5]">Diagram menggunakan transaksi dummy, bukan penjualan usaha nyata.</p></DemoPanel>
            <DemoPanel title={category === 'salon' ? 'Layanan & produk populer' : category === 'restoran' ? 'Menu populer' : 'Produk paling laris'} action={<button className={'min-h-11 text-sm text-[#24cbc5] ' + focus} onClick={() => setGate(business.catalog)}>Lihat semua →</button>}><ol className="divide-y divide-[#454d5b]">{catalog.slice(0, 3).map((item, index) => <li key={item.id} className="flex items-center gap-3 py-4"><span className="text-xs text-[#c5cbd5]">{index + 1}</span><CategoryIcon className="size-5 shrink-0 text-[#24cbc5]" /><div className="min-w-0 flex-1"><p className="break-words text-sm">{item.name}</p><p className="mt-1 text-xs text-[#c5cbd5]">{sales.reduce((sum, sale) => sum + (sale.lines.find(line => line.id === item.id)?.quantity || 0), 0)} terjual · contoh</p></div><span className="shrink-0 text-xs">{rupiah(item.price)}</span></li>)}</ol></DemoPanel>
          </div>
          <DemoPanel title="Transaksi contoh terbaru" action={<button className={'min-h-11 text-sm text-[#24cbc5] ' + focus} onClick={() => setGate('Transaksi')}>Lihat semua →</button>}><div className="divide-y divide-[#454d5b]">{sales.slice(-3).reverse().map((sale, index) => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm">Transaksi contoh {3 - index}</p><p className="mt-1 text-xs text-[#c5cbd5]">{saleDate(sale.created_at)}</p></div><div className="text-right"><p className="text-sm">{rupiah(sale.total)}</p><p className="mt-1 text-xs text-[#24cbc5]">Selesai · dummy</p></div></div>)}</div></DemoPanel>
        </> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <DemoPanel title={business.catalog}>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><label className="sr-only" htmlFor={searchId}>Cari {business.catalog.toLowerCase()}</label><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#c5cbd5]" /><input id={searchId} value={search} onChange={event => setSearch(event.target.value)} placeholder={`Cari ${business.catalog.toLowerCase()}...`} className="min-h-11 w-full rounded-xl border border-[#454d5b] bg-[#1c222e] py-2 pl-10 pr-3 text-sm" /></div><CustomSelect ariaLabel="Filter kategori katalog demo" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Semua kategori' }, ...[...new Set(catalog.map(item => item.category))].map(value => ({ value, label: value }))]} /></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">{catalog.filter(item => (filter === 'all' || item.category === filter) && item.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))).map(item => <button key={item.id} aria-label={`Tambahkan ${item.name}`} onClick={() => add(item.id)} disabled={cart[item.id] >= 99} className={'flex min-w-0 flex-col rounded-2xl border border-[#454d5b] bg-[#1c222e] p-4 text-left hover:border-[#24cbc5] disabled:opacity-50 ' + focus}><div className="mb-4 grid h-24 w-full place-items-center rounded-xl bg-[#273242]"><CategoryIcon className="size-10 text-[#24cbc5]" /></div><span className="text-[11px] text-[#c5cbd5]">{item.category}</span><span className="mt-1 flex-1 break-words text-sm font-medium">{item.name}</span><span className="mt-3 text-sm text-[#24cbc5]">{rupiah(item.price)}</span><span className="mt-1 text-[11px] text-[#c5cbd5]">per {item.unit}</span></button>)}</div>
            {!catalog.some(item => (filter === 'all' || item.category === filter) && item.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))) && <p role="status" className="py-10 text-center text-sm text-[#c5cbd5]">Tidak ada hasil. Coba kata atau kategori lain.</p>}
          </DemoPanel>
          <DemoPanel title="Keranjang aktif" action={<span className="text-xs text-[#c5cbd5]">{lines.length} jenis item</span>}>
            {!lines.length ? <div className="rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] px-4 py-10 text-center"><ShoppingBag className="mx-auto mb-3 size-8 text-[#c5cbd5]" /><p className="text-sm font-medium">Belum ada produk atau layanan</p><p className="mt-2 text-xs text-[#c5cbd5]">Pilih dari katalog untuk mulai mencoba.</p></div> : <>
              <ul className="divide-y divide-[#454d5b]">{lines.map(line => <li key={line.id} className="py-4"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm">{line.name}</p><button aria-label={`Hapus ${line.name}`} className={'grid size-11 shrink-0 place-items-center rounded-xl text-[#ffb4ae] hover:bg-[#303640] ' + focus} onClick={() => { setCart(previous => changeDemoQuantity(previous, catalog, line.id, -previous[line.id])); setAnnouncement(`${line.name} dihapus dari keranjang.`) }}><Trash2 className="size-4" /></button></div><p className="text-xs text-[#c5cbd5]">{rupiah(line.price)} / {line.unit}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button aria-label={`Kurangi ${line.name}`} disabled={line.quantity <= 1} className={secondary + ' !size-11 !p-0 disabled:opacity-40'} onClick={() => setCart(previous => changeDemoQuantity(previous, catalog, line.id, -1))}><Minus className="size-4" /></button><output aria-label={`Jumlah ${line.name}`} className="min-w-6 text-center text-sm">{line.quantity}</output><button aria-label={`Tambah jumlah ${line.name}`} disabled={line.quantity >= 99} className={secondary + ' !size-11 !p-0 disabled:opacity-40'} onClick={() => setCart(previous => changeDemoQuantity(previous, catalog, line.id, 1))}><Plus className="size-4" /></button></div><span className="text-sm">{rupiah(line.total)}</span></div></li>)}</ul>
              <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-[#24cbc5]/10 p-4"><span className="text-sm">Total</span><strong data-demo-total className="text-xl font-semibold text-[#24cbc5]">{rupiah(total)}</strong></div><p className="mt-3 text-xs leading-5 text-[#c5cbd5]">Simulasi keranjang saja. Tidak ada pesanan, janji temu, pembayaran, atau perubahan stok yang disimpan.</p><button onClick={() => setGate('Pembayaran')} className={primary + ' mt-4 w-full'}>Bayar <ArrowRight className="size-4" /></button>
            </>}
          </DemoPanel>
        </div>}
        <p aria-live="polite" className="sr-only">{announcement}</p>
      </div>
    </div>
    {gate && <ModalFrame onDismiss={() => setGate(null)} aria-labelledby={modalId} aria-describedby={modalDescription} className="bg-transparent"><div className="fixed inset-0 grid place-items-center bg-[#1c222e]/80 p-4 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) setGate(null) }}><section className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><h2 id={modalId} className="pt-2 text-xl font-semibold">Daftar untuk melanjutkan</h2><button aria-label="Tutup ajakan daftar" className={secondary + ' !size-11 !shrink-0 !p-0'} onClick={() => setGate(null)}><X className="size-5" /></button></div><p id={modalDescription} className="mt-4 text-sm leading-6 text-[#c5cbd5]">{gate === 'Pembayaran' ? 'Pembayaran dan penyimpanan transaksi tersedia setelah membuat akun.' : `${gate} tersedia setelah membuat akun.`} Demo ini hanya membuka Ringkasan dan keranjang kasir.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/signup" prefetch={false} className={primary}>Daftar sekarang <ArrowRight className="size-4" /></Link><button className={secondary} onClick={() => setGate(null)}>Lanjutkan demo</button></div><p className="mt-4 text-xs text-[#c5cbd5]">Sudah punya akun? <Link href="/login" prefetch={false} className={'inline-flex min-h-11 items-center text-[#24cbc5] underline ' + focus}>Masuk</Link></p></section></div></ModalFrame>}
  </main></DashboardAmbient>
}

function DemoPanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-3"><h2 className="text-base font-normal tracking-tight sm:text-lg">{title}</h2>{action}</div>{children}</section>
}
