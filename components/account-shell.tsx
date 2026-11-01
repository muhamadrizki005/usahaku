import Link from 'next/link'
import { UsahakuLogo } from '@/components/usahaku-logo'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

export function AccountCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="landing-page relative min-h-screen overflow-x-clip text-white">
      <header className="relative z-10 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Usahaku beranda"><UsahakuLogo /></Link>
          <Link href="/login" className="inline-flex items-center gap-2 text-sm text-[#c5cbd5] transition-colors hover:text-[#24cbc5]"><ArrowLeft className="size-4" />Kembali ke masuk</Link>
        </div>
      </header>
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-136px)] max-w-xl items-center px-5 py-14">
        <div className="w-full rounded-2xl border border-white/10 bg-[#273242]/70 backdrop-blur-sm p-6 sm:p-10">
          <h1 className="mb-6 text-3xl font-normal tracking-tight">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  )
}
