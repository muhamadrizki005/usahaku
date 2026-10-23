'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Store, CalendarDays, UsersRound } from 'lucide-react'
import { UsahakuLogo } from '@/components/usahaku-logo'
import { LegalModal, type LegalModalType } from '@/components/legal-modal'

export function LoginFrame({title = 'Masuk ke Usahaku', description = 'Lanjutkan mengelola aktivitas usaha Anda dengan akun yang sudah terdaftar.', mode = 'owner', children}: {title?: string; description?: string; mode?: 'owner' | 'staff'; children: ReactNode}) {
  const [legalModal, setLegalModal] = useState<LegalModalType>(null)
  return (
    <main className="min-h-screen bg-[#1c222e] text-white">
      <header className="border-b border-white/10 bg-[#1c222e]">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Usahaku beranda"><UsahakuLogo /></Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[#c5cbd5] transition-colors hover:bg-[#1c222e] hover:text-[#24cbc5]"><ArrowLeft aria-hidden="true" /> Kembali ke beranda</Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-136px)] lg:grid-cols-[42%_58%]">
        <section className="bg-[#273242] px-5 py-12 sm:px-10 lg:flex lg:items-center lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#24cbc5]">RUANG UNTUK USAHA ANDA</p>
            <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl">Selamat datang kembali<br />di ruang usaha Anda.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#c5cbd5]">Satu platform untuk mengelola usaha, pelanggan, dan pertumbuhan bisnis.</p>

            <div className="mt-10 rounded-2xl border border-white/10 bg-[#1c222e] p-6 shadow-sm">
              <h2 className="text-base font-semibold text-white">Mengikuti cara usaha Anda bekerja</h2>
              <div className="mt-6 flex flex-col gap-5">
                <Benefit icon={Store} title="Toko & laundry" description="Stok, transaksi, atau progres pesanan." />
                <Benefit icon={CalendarDays} title="Usaha berbasis jadwal" description="Reservasi dan janji temu sesuai layanan." />
                <Benefit icon={UsersRound} title="Pemilik tetap memegang kendali" description="Pelanggan, laporan, dan akses staf." />
              </div>
            </div>

            <p className="mt-6 flex items-center gap-2 text-sm text-[#c5cbd5]"><ShieldCheck className="text-[#24cbc5]" aria-hidden="true" /> Akses operasional staf mengikuti izin yang Anda tetapkan.</p>
          </div>
        </section>

        <section className="flex items-center bg-[#1c222e] px-5 py-14 sm:px-10 lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-[610px]">
            <nav className="flex gap-3 text-sm" aria-label="Jenis akun">
              <Link href="/login" aria-current={mode === 'owner' ? 'page' : undefined} className={`rounded-lg px-4 py-2 ${mode === 'owner' ? 'bg-white/10 text-[#24cbc5]' : 'text-white'}`}>Pemilik</Link>
              <Link href="/login?mode=staff" aria-current={mode === 'staff' ? 'page' : undefined} className={`rounded-lg px-4 py-2 ${mode === 'staff' ? 'bg-white/10 text-[#24cbc5]' : 'text-white'}`}>Staf</Link>
            </nav>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="mt-3 max-w-lg leading-7 text-[#c5cbd5]">{description}</p>

            {children}
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#1c222e]">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-col justify-center gap-3 px-5 py-4 text-sm text-[#c5cbd5] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><span>© 2026 Usahaku</span><div className="flex flex-wrap gap-5"><button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-[#24cbc5]">Kebijakan Privasi</button><button type="button" onClick={() => setLegalModal('terms')} className="hover:text-[#24cbc5]">Syarat Penggunaan</button></div></div>
      </footer>
      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} onSwitchType={(type) => setLegalModal(type)} />
    </main>
  )
}

function Benefit({ icon: Icon, title, description }: { icon: typeof Store; title: string; description: string }) {
  return <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#273242] text-[#24cbc5]"><Icon aria-hidden="true" /></span><div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-1 text-sm leading-5 text-[#c5cbd5]">{description}</p></div></div>
}
