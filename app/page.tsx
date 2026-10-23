'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Check, Coffee, Scissors, Store } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { UsahakuLogo } from '@/components/usahaku-logo'
import { LegalModal, type LegalModalType } from '@/components/legal-modal'
import { TextEffect } from '@/components/core/text-effect'
import { NumberTicker } from '@/registry/magicui/number-ticker'
import { MenuBars } from '@reui/icons/default/filled/menu-bars'
import { ShapeGrid } from '@/components/shape-grid'
import TiltedCard, { TiltedCardLayer } from '@/components/tilted-card'

const categories = [
  { label: 'Toko / Minimarket / Kios', type: 'toko', icon: Store, description: 'Dari kasir ke stok, jaga catatan barang dan penjualan tetap rapi.', features: ['Kasir & transaksi', 'Stok produk & persediaan', 'Laporan penjualan'], link: 'Tentang modul penjualan' },
  { label: 'Restoran / Cafe', type: 'restoran', icon: Coffee, description: 'Kelola pesanan dan lihat kebutuhan meja sesuai kapasitas usaha.', features: ['Menu, meja & ketersediaan', 'Reservasi & DP terverifikasi', 'Reservasi sesuai kapasitas'], link: 'Tentang modul reservasi' },
  { label: 'Barbershop / Salon', type: 'salon', icon: Scissors, description: 'Permudah alur layanan dan jadwal staf agar lebih tertata.', features: ['Layanan & jadwal stylist', 'Janji temu & DP', 'Slot kursi terisi'], link: 'Tentang modul layanan' },
]

const steps = [
  ['01', 'Buat akun pemilik', 'Daftarkan nama dan kontak Anda untuk mendapatkan akses sebagai pemilik usaha.'],
  ['02', 'Siapkan usaha Anda', 'Tambah akun usaha, isi data usaha dan pilih satu kategori utama. Modul akan menyesuaikan.'],
  ['03', 'Lengkapi, lalu mulai kelola', 'Atur produk atau layanan, akses staf, dan kebutuhan operasional yang sesuai kategori.'],
]

export default function LandingPage() {
  const [showDemos, setShowDemos] = useState(false)
  const [legalModal, setLegalModal] = useState<LegalModalType>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <main className="landing-page min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Floating Fully Rounded Pill Navbar with Fade In */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed top-4 sm:top-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      >
        <div className="relative pointer-events-auto flex items-center justify-between w-full max-w-4xl lg:max-w-5xl rounded-full border border-white/15 bg-black/90 px-4 py-2 sm:px-6 sm:py-2.5 shadow-2xl backdrop-blur-xl">
          {/* Logo */}
          <Link href="/" aria-label="Usahaku beranda" className="flex items-center gap-2">
            <UsahakuLogo wordmarkClassName="text-white" />
          </Link>

          {/* Center Navigation Links (Desktop/Laptop) */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-xs lg:text-sm font-medium text-white/70" aria-label="Navigasi utama">
            <a href="#kategori-usaha" className="transition-colors hover:text-white">
              Kategori Usaha
            </a>
            <a href="#fitur" className="transition-colors hover:text-white">
              Fitur
            </a>
            <a href="#cara-memulai" className="transition-colors hover:text-white">
              Cara Memulai
            </a>
          </nav>

          {/* Right Actions (Desktop/Laptop) */}
          <div className="hidden md:flex items-center gap-4 lg:gap-5">
            <Link
              href="/login"
              className="text-xs lg:text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              Masuk
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-[#1835d9] px-5 py-2 text-xs lg:text-sm font-semibold text-white shadow-md transition-all hover:bg-[#132c9e] hover:shadow-lg active:scale-95"
            >
              Mulai Sekarang
            </Link>
          </div>

          {/* Mobile Right Controls */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/signup"
              className="rounded-full bg-[#1835d9] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#132c9e]"
            >
              Mulai
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="grid size-9 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
              aria-label={mobileNavOpen ? 'Tutup navigasi' : 'Buka navigasi'}
              aria-expanded={mobileNavOpen}
            >
              <MenuBars className="size-5" />
            </button>
          </div>

          {/* Responsive Mobile Menu Dropdown */}
          <AnimatePresence>
            {mobileNavOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute top-full left-0 right-0 mt-3 w-full rounded-3xl border border-white/15 bg-black/95 p-5 shadow-2xl backdrop-blur-2xl text-white"
              >
                <div className="flex flex-col gap-2">
                  <a
                    href="#kategori-usaha"
                    onClick={() => setMobileNavOpen(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Kategori Usaha
                  </a>
                  <a
                    href="#fitur"
                    onClick={() => setMobileNavOpen(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Fitur
                  </a>
                  <a
                    href="#cara-memulai"
                    onClick={() => setMobileNavOpen(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Cara Memulai
                  </a>
                  <div className="my-1 h-px w-full bg-white/10" />
                  <div className="flex flex-col gap-2 pt-1">
                    <Link
                      href="/login"
                      onClick={() => setMobileNavOpen(false)}
                      className="w-full rounded-full border border-white/20 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Masuk
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setMobileNavOpen(false)}
                      className="w-full rounded-full bg-[#1835d9] py-2.5 text-center text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#132c9e]"
                    >
                      Mulai Sekarang
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#1c222e] px-5 pt-24 pb-16 text-white sm:px-8 sm:pt-28 sm:pb-20 lg:px-12 lg:pt-32 lg:pb-24">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <ShapeGrid
            shape="square"
            direction="diagonal"
            lineColor="#283344"
            hoverColor="#24cbc5"
            hoverFillColor="#24cbc5"
            fillOpacity={0.15}
            cellSize={40}
            speed={0.5}
            tiltX={0}
            tiltY={0}
            rainbow={false}
            lineWidth={1}
            radius={1.5}
            trail={0.6}
            glow={0.35}
            twinkle={0}
            fade={1}
            clickCascade
            intro
          />
        </div>
        <div className="relative z-10 mx-auto grid max-w-[1800px] items-center gap-10 xl:grid-cols-[1.05fr_.95fr] 2xl:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            <p className="mb-6 text-xs font-semibold tracking-[0.18em] text-[#24cbc5]">UNTUK BERBAGAI USAHA INDONESIA</p>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl 2xl:text-[5rem]">
              <TextEffect per="char" preset="fade" as="span" className="inline">
                Beda usaha,
              </TextEffect>
              <br />
              <TextEffect per="char" preset="fade" as="span" delay={0.25} className="inline">
                satu platform.
              </TextEffect>
              <br />
              <span className="text-[#24cbc5]">
                <TextEffect per="char" preset="fade" as="span" delay={0.5} className="inline text-[#24cbc5]">
                  Tetap sesuai caranya.
                </TextEffect>
              </span>
            </h1>
            <p className="mt-7 text-lg leading-8 text-white/75">Satu platform untuk mengelola usaha, pelanggan, dan pertumbuhan bisnis.</p>
            <p className="mt-4 max-w-xl leading-7 text-white/60">Dari kasir toko hingga janji temu salon, Usahaku menyesuaikan modul operasional dengan kategori usaha Anda.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-5 py-3.5 font-semibold text-white">
                Mulai Sekarang <ArrowRight aria-hidden="true" />
              </Link>
              <a href="#fitur" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 py-3.5 font-semibold text-white">
                Jelajahi Fitur
              </a>
            </div>
            <p className="mt-5 text-sm text-white/55">Praktis untuk pemilik usaha, sesuai dengan kebutuhan usaha Anda.</p>
            <button type="button" onClick={() => setShowDemos(true)} className="mt-6 text-left text-sm font-semibold text-[#24cbc5] underline-offset-4 hover:underline">
              Coba demo
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full xl:self-center xl:-translate-y-6 2xl:-translate-y-8"
          >
            <TiltedCard
              containerHeight="auto"
              containerWidth="100%"
              imageHeight="auto"
              imageWidth="100%"
              rotateAmplitude={12}
              scaleOnHover={1.03}
              glare={0.4}
              shadow={0.5}
              radius={28}
              showTooltip={false}
              flipOnClick={true}
              backContent={
                <div className="flex h-full w-full flex-col justify-between rounded-[1.75rem] border border-[#454d5b] bg-[#273242] p-6 text-white shadow-2xl">
                  <div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#24cbc5]">
                        <Coffee className="size-4" /> Kopi Senja
                      </div>
                      <span className="rounded-lg bg-[#24cbc5]/15 px-2 py-0.5 text-[10px] font-semibold text-[#24cbc5]">
                        Modul Restoran
                      </span>
                    </div>
                    <p className="mt-4 text-xl font-medium text-white">Operasional Kopi Senja</p>
                    <p className="mt-2 text-xs leading-relaxed text-white/70">
                      Kasir POS, menu & ketersediaan, reservasi meja dengan DP terverifikasi, serta pencatatan omzet harian otomatis sesuai alur usaha kafe.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                        <p className="text-[10px] text-white/50">Status Kasir</p>
                        <p className="mt-0.5 font-medium text-[#24cbc5]">Aktif & Terhubung</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                        <p className="text-[10px] text-white/50">Kategori</p>
                        <p className="mt-0.5 font-medium text-white">F&B / Restoran</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-white/10 pt-3 text-center text-[10px] text-white/50">
                    Klik untuk membalik kembali ke tampilan ilustrasi
                  </div>
                </div>
              }
            >
              <div className="w-full rounded-[1.75rem] border border-[#454d5b] bg-[#303640] p-3 shadow-2xl">
                <div className="overflow-hidden rounded-[1.25rem] bg-[#f7f9fc] text-[#1c222e]">
                  <div className="flex items-center justify-between border-b border-[#dfe6f0] bg-white px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Coffee className="text-[#168d86]" aria-hidden="true" />
                      <span className="font-semibold">Kopi Senja</span>
                      <span className="text-[#667085]">/ Restoran/Cafe</span>
                    </div>
                    <span className="rounded-lg bg-[#e9fbf8] px-2 py-1 text-[10px] font-semibold text-[#168d86]">Data demo ilustratif</span>
                  </div>
                  <div className="grid xl:grid-cols-[8.5rem_1fr]">
                    <aside className="hidden border-r border-[#dfe6f0] bg-white p-3 xl:block">
                      <div className="flex flex-col gap-1 text-[10px] text-[#52627a]">
                        <div className="rounded-lg bg-[#e9fbf8] px-2 py-2 font-semibold text-[#168d86]">▦ Ringkasan</div>
                        <div className="px-2 py-2">☷ Menu & layanan</div>
                        <div className="px-2 py-2">▣ Kasir (POS)</div>
                        <div className="px-2 py-2">▦ Reservasi</div>
                        <div className="px-2 py-2">◉ Verifikasi DP</div>
                        <div className="px-2 py-2">♧ Pelanggan</div>
                        <div className="px-2 py-2">⌁ Laporan</div>
                      </div>
                    </aside>
                    <div className="min-w-0 bg-[#f7f9fc] p-4 2xl:p-6">
                      <p className="text-xl font-medium">Selamat siang, Pak Arief</p>
                      <p className="mt-1 text-[10px] text-[#667085]">Senin, 19 Oktober 2026 • 14.30 WIB</p>
                      
                      {/* Number Ticker Cards */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-[#dfe6f0] bg-white p-3">
                          <p className="text-[10px] text-[#667085]">Omzet hari ini</p>
                          <p className="mt-1 text-lg font-medium text-[#1c222e]">
                            Rp<NumberTicker value={2450000} className="text-lg font-medium text-[#1c222e] dark:text-[#1c222e]" />
                          </p>
                        </div>
                        <div className="rounded-lg border border-[#dfe6f0] bg-white p-3">
                          <p className="text-[10px] text-[#667085]">Transaksi hari ini</p>
                          <p className="mt-1 text-lg font-medium text-[#1c222e]">
                            <NumberTicker value={38} className="text-lg font-medium text-[#1c222e] dark:text-[#1c222e]" />
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-[#dfe6f0] bg-white p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">Tren omzet</p>
                          <span className="text-[9px] text-[#667085]">13–19 Oktober 2026</span>
                        </div>
                        <div className="mt-3 flex h-20 items-end gap-1 2xl:mt-5 2xl:h-28">
                          {[42, 58, 50, 76, 92, 82, 65].map((height, index) => (
                            <div key={index} className="flex flex-1 flex-col items-center gap-1">
                              <span
                                className={`w-full rounded-t ${index === 6 ? 'bg-[#117c75]' : 'bg-[#b7ddd8]'}`}
                                style={{ height: `${Math.round(height * 0.7)}px` }}
                              />
                              <span className="text-[7px] text-[#667085]">
                                {['13 Okt', '14 Okt', '15 Okt', '16 Okt', '17 Okt', '18 Okt', '19 Okt'][index]}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-[9px] text-[#667085]">Penjualan selesai • Tidak termasuk DP</p>
                      </div>
                      <div className="mt-3 flex items-center gap-1 rounded-lg bg-[#fff8e6] px-2 py-2 text-[9px] text-[#a65200]">
                        ⓘ 2 bukti DP perlu diperiksa secara manual
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[#dfe6f0] bg-white px-3 py-2 text-[9px] text-[#667085]">
                    Ilustrasi antarmuka • Tidak terhubung ke aktivitas usaha nyata
                  </div>
                </div>
              </div>
            </TiltedCard>
          </motion.div>
        </div>
      </section>

      {/* Highlights Bar */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="border-b border-border bg-card"
      >
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-center gap-6 px-5 py-8 sm:flex-row sm:flex-wrap sm:gap-10 lg:gap-16">
          {['Operasional sesuai kategori', 'Pelanggan dan data usaha', 'Akses dari berbagai perangkat'].map((item, idx) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: idx * 0.1 }}
              className="flex items-center justify-center gap-3 text-sm font-medium"
            >
              <Check className="text-accent" aria-hidden="true" />
              {item}
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Kategori Usaha Section */}
      <motion.section
        id="kategori-usaha"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-[1800px] px-5 py-20 sm:px-8 lg:px-12"
      >
        <p className="text-xs font-semibold tracking-[0.18em] text-accent">SATU PLATFORM, LIMA KATEGORI</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight">Usaha Anda punya cara kerja sendiri. Kami mengikutinya.</h2>
        <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">Pilih satu kategori utama saat menyiapkan usaha. Navigasi, data ringkasan, dan modul yang tampil akan menyesuaikan kebutuhan operasionalnya.</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {categories.map(({ label, icon: Icon, description, features: items, link }, index) => (
            <motion.article
              key={label}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-xl font-semibold">{label}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              <ul className="mt-6 flex flex-col gap-3 text-sm">
                {items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="text-accent" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <a href="#fitur" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
                {link} <ArrowRight aria-hidden="true" />
              </a>
            </motion.article>
          ))}
        </div>
      </motion.section>

      {/* Fitur Section */}
      <motion.section
        id="fitur"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="bg-[#1c222e] px-5 py-20 text-white sm:px-8 lg:px-12"
      >
        <div className="mx-auto grid max-w-[1800px] items-center gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[#24cbc5]">LEBIH JELAS, DARI AWAL HINGGA AKHIR</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight text-white">Operasional tertata.<br />Keputusan tetap<br />di tangan Anda.</h2>
            <p className="mt-5 leading-7 text-[#c5cbd5]">Satu ruang kerja untuk aktivitas harian, dengan alur dan kontrol yang relevan untuk usaha Anda.</p>
            <div className="mt-8 flex flex-col gap-6">
              {[
                ['Transaksi sampai pesanan selesai', 'Kasir dan stok untuk toko; paket, progres, dan estimasi selesai untuk laundry.'],
                ['Booking hanya saat dibutuhkan', 'Reservasi restoran dan janji temu barbershop atau salon, sesuai kapasitas dan jadwal.'],
                ['Verifikasi DP, bukan asumsi', 'Pemilik atau staf berizin memeriksa bukti dan nominal, lalu memastikan slot sebelum konfirmasi.'],
              ].map(([title, description], idx) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                >
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#c5cbd5]">{description}</p>
                </motion.div>
              ))}
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-white/15 bg-[#1c222e] p-5 text-white sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-semibold text-[#24cbc5]">Kopi Senja • Restoran/Cafe</p>
                <p className="mt-1 text-2xl font-semibold">Reservasi mendatang</p>
                <p className="mt-1 text-xs text-[#c5cbd5]">Data operasional ilustratif</p>
              </div>
              <span className="rounded-full bg-[#24cbc5]/15 px-3 py-1 text-xs font-semibold text-[#24cbc5]">Terkonfirmasi</span>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#273242] p-4">
                <p className="text-xs text-[#c5cbd5]">Booking hari ini</p>
                <p className="mt-1 text-2xl font-semibold text-[#24cbc5]">6</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#273242] p-4">
                <p className="text-xs text-[#c5cbd5]">DP menunggu verifikasi</p>
                <p className="mt-1 text-2xl font-semibold text-[#1665CF]">Rp350.000</p>
              </div>
            </div>
            <div className="mt-6 hidden grid-cols-[44%_25%_31%] gap-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-[#c5cbd5] sm:grid">
              <span>Pelanggan & jadwal</span>
              <span>Status booking</span>
              <span>Status pembayaran</span>
            </div>
            <div className="mt-2 flex flex-col gap-3">
              <div className="grid gap-3 rounded-xl bg-[#273242] p-4 sm:grid-cols-[44%_25%_31%] sm:items-center">
                <div>
                  <p className="font-medium">Rani Putri</p>
                  <p className="mt-1 text-xs text-[#c5cbd5]">15.00 • Meja 02 • 2 tamu</p>
                </div>
                <div><span className="inline-flex rounded-full bg-[#24cbc5]/15 px-2.5 py-1 text-xs font-medium text-[#24cbc5]">Terkonfirmasi</span></div>
                <div><span className="inline-flex rounded-full bg-[#1665CF]/15 px-2.5 py-1 text-xs font-medium text-[#7db2ff]">Terverifikasi</span></div>
              </div>
              <div className="grid gap-3 rounded-xl bg-[#273242] p-4 sm:grid-cols-[44%_25%_31%] sm:items-center">
                <div>
                  <p className="font-medium">Dinda Maharani</p>
                  <p className="mt-1 text-xs text-[#c5cbd5]">17.00 • Meja 03 • 4 tamu</p>
                </div>
                <div><span className="inline-flex max-w-full rounded-full bg-[#24cbc5]/15 px-2.5 py-1 text-xs font-medium text-[#24cbc5]">Menunggu verifikasi</span></div>
                <div><span className="inline-flex max-w-full rounded-full bg-[#1665CF]/15 px-2.5 py-1 text-xs font-medium text-[#7db2ff]">Menunggu pemeriksaan</span></div>
              </div>
            </div>
            <div className="mt-5 flex gap-3 rounded-xl bg-[#fff7e8] p-3 text-xs leading-5 text-[#7a4b18]">
              <span aria-hidden="true">ⓘ</span>
              <p>Unggah bukti belum mengonfirmasi reservasi. Periksa bukti, nominal, dan ketersediaan meja secara manual.</p>
            </div>
            <p className="mt-4 text-[11px] text-[#c5cbd5]">19 Oktober 2026 • Ilustrasi, bukan aktivitas usaha nyata</p>
          </motion.div>
        </div>
      </motion.section>

      {/* Dari Aktivitas Menjadi Pemahaman Section */}
      <motion.section
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-[1800px] px-5 py-20 sm:px-8 lg:px-12"
      >
        <p className="text-xs font-semibold tracking-[0.18em] text-accent">DARI AKTIVITAS MENJADI PEMAHAMAN</p>
        <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight">Bukan hanya mengelola hari ini.<br />Kenali usaha Anda lebih baik.</h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {[
            ['Kenali pelanggan, bukan sekadar transaksi.', 'Simpan riwayat pelanggan dan catat poin loyalitas agar layanan berikutnya lebih personal.', 'CONTOH CATATAN PELANGGAN', 'Dina Pratama · 240 poin'],
            ['Pahami usaha dari catatan yang nyata.', 'Tinjau transaksi dan laporan per periode. Bedakan penjualan selesai dari DP yang perlu diperiksa.', 'RINGKASAN HARI INI', 'Rp 8.420.000 · 128 transaksi'],
            ['Tanyakan data. Pahami konteksnya.', 'AI Business Assistant membantu menjelaskan data usaha yang tercatat, bukan membaca angka tanpa alasan.', 'ASISTEN USAHA', '“Produk apa yang paling laris minggu ini?”'],
          ].map(([title, description, label, preview], index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              <div className="mt-8 rounded-xl bg-accent/10 p-4">
                <p className="text-[10px] font-semibold tracking-[0.16em] text-accent">{label}</p>
                <p className="mt-3 text-sm font-medium">{preview}</p>
              </div>
            </motion.article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-6 text-muted-foreground">Usahaku mencatat dan menampilkan perkembangan di satu tempat. Untuk keputusan penting, pemilik tetap memeriksa data, melakukan konfirmasi, dan menjaga pengelolaan usahanya.</p>
      </motion.section>

      {/* Cara Memulai Section */}
      <motion.section
        id="cara-memulai"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="border-y border-border bg-card/50 px-5 py-20 sm:px-8 lg:px-12"
      >
        <div className="mx-auto max-w-[1800px]">
          <p className="text-xs font-semibold tracking-[0.18em] text-accent">CARA MEMULAI</p>
          <h2 className="mt-4 text-4xl font-semibold">Mulai dari akun, lanjut sesuai usaha Anda.</h2>
          <p className="mt-5 text-muted-foreground">Tidak perlu menyiapkan semuanya sekaligus. Ikuti langkah yang relevan untuk usaha Anda.</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map(([number, title, description], index) => (
              <motion.article
                key={number}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.55, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-border bg-background p-6"
              >
                <span className="text-sm font-semibold text-accent">{number}</span>
                <h3 className="mt-8 font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 30 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-5 my-20 rounded-3xl border border-[#24cbc5]/30 bg-[#24cbc5]/10 px-6 py-14 text-center sm:mx-8 lg:mx-auto lg:max-w-[1800px]"
      >
        <h2 className="text-4xl font-semibold">Usaha Anda, lebih tertata.<br />Mulai dari satu langkah hari ini.</h2>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">Buat akun pemilik dan bangun ruang kerja yang sesuai usaha Anda.</p>
        <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground">
          Mulai Sekarang <ArrowRight aria-hidden="true" />
        </Link>
        <p className="mt-5 text-sm text-muted-foreground">Sudah punya akun? <Link href="/login" className="font-semibold text-accent hover:underline">Masuk</Link></p>
      </motion.section>

      {/* Demos Modal */}
      {showDemos && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#1c222e]/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="demo-title">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-border bg-background p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-accent">Demo berdasarkan kategori usaha</p>
                <h2 id="demo-title" className="mt-2 text-3xl font-semibold tracking-tight">Pilih alur kerja usaha Anda.</h2>
              </div>
              <button type="button" onClick={() => setShowDemos(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Tutup demo">×</button>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {categories.map(({ label, type, icon: Icon, description }, index) => (
                <article key={type} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon aria-hidden="true" /></span>
                    <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="mt-7 text-xl font-semibold">{label}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
                  <Link href={`/dashboard?category=${type}`} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
                    Lihat demo {type === 'toko' ? 'toko' : type === 'restoran' ? 'restoran' : 'salon'} <ArrowRight aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border bg-[#1c222e] text-white">
        <div className="mx-auto grid max-w-[1800px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.3fr_.7fr_.7fr_.7fr] lg:px-12">
          <div>
            <UsahakuLogo dark />
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/60">Satu platform untuk mengelola usaha, pelanggan, dan pertumbuhan bisnis.</p>
          </div>
          <div>
            <p className="font-semibold">Platform</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white/60">
              <a href="#kategori-usaha">Kategori Usaha</a>
              <a href="#fitur">Fitur</a>
              <a href="#cara-memulai">Cara Memulai</a>
            </div>
          </div>
          <div>
            <p className="font-semibold">Akun</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white/60">
              <Link href="/login">Masuk</Link>
              <Link href="/signup">Daftar Pemilik</Link>
            </div>
          </div>
          <div>
            <p className="font-semibold">Informasi</p>
            <div className="mt-4 flex flex-col items-start gap-3 text-sm text-white/60">
              <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-white transition-colors">Kebijakan Privasi</button>
              <button type="button" onClick={() => setLegalModal('terms')} className="hover:text-white transition-colors">Syarat Penggunaan</button>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-5 py-5 text-xs text-white/45 sm:px-8 md:flex-row md:justify-between lg:px-12">
            <span>© 2026 Usahaku. Seluruh hak dilindungi.</span>
            <span>Dirancang untuk beragam UMKM Indonesia.</span>
          </div>
        </div>
      </footer>
      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} onSwitchType={(type) => setLegalModal(type)} />
    </main>
  )
}
