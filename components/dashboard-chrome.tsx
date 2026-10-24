'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { dashboardNavigation } from './dashboard-navigation'
import { rolesForPath, type Role } from '@/lib/auth/permissions'

export const dashboardItemsForRole = (role: Role) => dashboardNavigation.filter(([, , path]) => rolesForPath(path).includes(role))

export function DashboardBrand({ onHome, contentMax = 1400 }: { onHome: () => void; contentMax?: number }) {
  return <div className="flex items-center lg:pointer-events-none lg:absolute lg:inset-x-0 lg:inset-y-0 lg:left-56">
    <div className="lg:mx-auto lg:w-full lg:px-4" style={{ maxWidth: contentMax + 32 }}>
      <button onClick={onHome} className="pointer-events-auto flex items-center gap-3 text-left transition hover:opacity-90" aria-label="Usahaku beranda dashboard">
        <div className="grid size-9 place-items-center rounded-xl border border-white/10 bg-black/40 shadow-xs">
          <img src="/brand/usahaku-logo.png" alt="" width={26} height={26} className="size-6.5 shrink-0 object-contain" />
        </div>
        <span className="text-lg font-bold tracking-tight text-white">Usahaku</span>
      </button>
    </div>
  </div>
}

function NavigationItems({ role, onNavigate, activePath }: { role: Role; onNavigate: (path: string) => void; activePath?: string }) {
  const pathname = usePathname()
  const currentPath = activePath || pathname
  return dashboardItemsForRole(role).map(([label, Icon, path]) => {
    const active = currentPath === path || (path !== '/dashboard' && currentPath.startsWith(path + '/'))
    return <button key={path} onClick={() => onNavigate(path)} aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#24cbc5] ${active ? 'border-[#24cbc5]/30 bg-[#1c222e] text-[#24cbc5] shadow-xs' : 'border-transparent text-[#a4a7ac] hover:bg-[#303640] hover:text-white'}`}>
      <Icon className="size-4 shrink-0" aria-hidden="true" /><span className="whitespace-nowrap">{label}</span>
    </button>
  })
}

export function DashboardSidebar({ role, onNavigate, activePath }: { role: Role; onNavigate: (path: string) => void; activePath?: string }) {
  return <aside className="hidden w-56 shrink-0 flex-col items-center py-4 pl-5 pr-2 lg:flex" aria-label="Sidebar dashboard">
    <div className="sticky top-20 w-full rounded-[20px] border border-[#454d5b]/80 bg-[#273242]/90 p-3 shadow-2xl backdrop-blur-md">
      <nav aria-label="Navigasi dashboard" className="flex max-h-[calc(100dvh-8rem)] flex-col gap-1 overflow-y-auto">
        <NavigationItems role={role} onNavigate={onNavigate} activePath={activePath} />
      </nav>
    </div>
  </aside>
}

export function DashboardMobileMenu({ role, onNavigate }: { role: Role; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key !== 'Tab') return
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button') || [])
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', keydown); trigger.current?.focus() }
  }, [open])
  return <>
    <button ref={trigger} onClick={() => setOpen(true)} aria-label="Buka navigasi" aria-expanded={open} className="rounded-xl border border-[#454d5b]/70 p-2 text-[#c5cbd5] hover:bg-[#273242] lg:hidden"><Menu className="size-5" /></button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex lg:hidden">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Menu dashboard" className="relative flex w-72 max-w-[85vw] flex-col border-r border-[#454d5b] bg-[#273242] p-5 shadow-2xl">
        <button onClick={() => setOpen(false)} aria-label="Tutup menu" className="mb-5 self-end rounded-lg p-2 text-[#c5cbd5] hover:bg-[#303640]"><X className="size-5" /></button>
        <nav aria-label="Navigasi dashboard mobile" className="flex flex-col gap-1 overflow-y-auto">
          <NavigationItems role={role} onNavigate={path => { setOpen(false); onNavigate(path) }} />
        </nav>
      </div>
    </div>, document.body)}
  </>
}
