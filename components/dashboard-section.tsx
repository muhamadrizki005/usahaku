'use client'
import type { ReactNode } from 'react'
import type { Role } from '@/lib/auth/permissions'

export default function DashboardSection({ title, children }: { title: string; category?: string; children?: ReactNode; role?: Role }) {
  return <section className="min-w-0 w-full">
    <div className="flex flex-col justify-between gap-4 border-b border-[#454d5b]/50 pb-5 sm:flex-row sm:items-center">
      <div>
        <p className="flex items-center gap-1.5 text-xs text-[#a4a7ac]"><span>Usahaku</span><span className="text-white/30">›</span><span className="text-[#c5cbd5]">Dashboard</span><span className="text-white/30">›</span><span className="font-medium text-[#24cbc5]">{title}</span></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
      </div>
    </div>
    <div className="mt-6">{children || (
              <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-8 shadow-sm">
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm text-[#c5cbd5]">
                  Modul ini siap digunakan untuk membantu operasional usaha Anda.
                </p>
                <span className="mt-5 inline-flex rounded-full border border-[#454d5b] bg-[#1c222e] px-3.5 py-1 text-xs font-medium text-[#24cbc5]">
                  Operasional Aktif
                </span>
              </div>
    )}</div>
  </section>
}
