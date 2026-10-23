'use client'

import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { rolesForPath, type Role } from '@/lib/auth/permissions'
import { dashboardNavigation } from './dashboard-navigation'

export default function DashboardSection({ title, category = 'toko',children,role='owner' }: { title: string; category?: string;children?:ReactNode;role?:Role }) {
  const router = useRouter()
  const pathname = usePathname()
  return <main className="min-h-screen bg-[#1c222e] text-[#ffffff]"><div className="flex min-h-screen"><aside className="hidden w-64 shrink-0 border-r border-[#454d5b] bg-[#273242] p-4 lg:flex lg:flex-col"><button onClick={() => router.push(`/dashboard?category=${category}`)} className="flex items-center gap-2 text-xl font-bold text-[#24cbc5]"><img src="/brand/usahaku-logo.png" alt="" aria-hidden="true" width={36} height={36} className="size-9 shrink-0 object-contain" />Usahaku</button><nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Navigasi dashboard">{dashboardNavigation.filter(([, ,path])=>rolesForPath(path).includes(role)).map(([label, Icon, path]) => <button key={label} onClick={() => router.push(`${path}?category=${category}`)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${pathname === path ? 'bg-[#24cbc5]/10 text-[#24cbc5]' : 'text-[#c5cbd5] hover:bg-[#24cbc5]/10'}`}><Icon className="size-4" />{label}</button>)}</nav><p className="text-xs text-[#a4a7ac]">{role} • Data usaha</p></aside><section className="min-w-0 flex-1"><header className="border-b border-[#454d5b] bg-[#273242] px-5 py-5 sm:px-8"><p className="text-xs text-[#a4a7ac]">Usahaku <span className="mx-1">›</span> Dashboard</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1></header><div className="mx-auto max-w-5xl p-5 sm:p-8">{children||<div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-8 shadow-sm"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-[#a4a7ac]">Modul ini siap digunakan untuk membantu operasional usaha Anda.</p><span className="mt-5 inline-flex rounded-full bg-[#303640] px-3 py-1 text-xs font-medium text-[#a4a7ac]">Data demo</span></div>}</div></section></div></main>
}
