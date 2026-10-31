'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { Menu, X } from 'lucide-react'
import {
  dashboardNavigation,
  topNavigationItems,
  sidebarNavigationItems,
  restaurantTopNavigationItems,
  restaurantSidebarNavigationItems,
} from './dashboard-navigation'
import { rolesForPath, type Role } from '@/lib/auth/permissions'
import { useReducedMotionPreference } from '@/lib/use-reduced-motion'

export const topItemsForRole = (role: Role, category = 'store') =>
  (category === 'restaurant' ? restaurantTopNavigationItems : topNavigationItems).filter(([, , path]) => rolesForPath(path).includes(role))

export const sidebarItemsForRole = (role: Role, category = 'store') =>
  (category === 'restaurant' ? restaurantSidebarNavigationItems : sidebarNavigationItems).filter(([, , path]) => rolesForPath(path).includes(role))

export const dashboardItemsForRole = (role: Role, category = 'store') =>
  (category === 'restaurant' ? [...restaurantTopNavigationItems, ...restaurantSidebarNavigationItems] : dashboardNavigation).filter(([, , path]) => rolesForPath(path).includes(role))

export function DashboardBrand({ onHome }: { onHome: () => void }) {
  return (
    <button
      onClick={onHome}
      className="flex shrink-0 items-center gap-3 text-left transition hover:opacity-90 cursor-pointer"
      aria-label="Usahaku beranda dashboard"
    >
      <div className="grid size-9.5 place-items-center rounded-xl border border-white/10 bg-black/40 shadow-xs">
        <img
          src="/brand/usahaku-logo.png"
          alt="Logo Usahaku"
          width={28}
          height={28}
          className="size-7 shrink-0 object-contain"
        />
      </div>
      <span className="text-lg font-semibold tracking-tight text-white">Usahaku</span>
    </button>
  )
}

export function DashboardTopNav({
  role,
  onNavigate,
  activePath,
  category = 'store',
}: {
  role: Role
  onNavigate: (path: string) => void
  activePath?: string
  category?: string
}) {
  const pathname = usePathname()
  const currentPath = activePath || pathname
  const reducedMotion = useReducedMotionPreference()
  const items = topItemsForRole(role, category)

  return (
    <nav
      aria-label="Navigasi utama dashboard"
      className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-1"
    >
      {items.map(([label, , path]) => {
        const active =
          currentPath === path ||
          (path !== '/dashboard' && currentPath.startsWith(path + '/'))
        return (
          <button
            key={path}
            onClick={() => onNavigate(path)}
            aria-current={active ? 'page' : undefined}
            className={`relative rounded-full px-4 py-2 text-xs sm:text-sm font-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] whitespace-nowrap cursor-pointer ${
              active ? 'text-[#1c222e]' : 'text-[#c5cbd5] hover:text-white font-medium'
            }`}
          >
            {active && (
              <motion.div
                layoutId="active-topbar-indicator"
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 30 }
                }
              />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function DashboardSidebar({
  role,
  onNavigate,
  activePath,
  category = 'store',
}: {
  role: Role
  onNavigate: (path: string) => void
  activePath?: string
  category?: string
}) {
  const pathname = usePathname()
  const currentPath = activePath || pathname
  const items = sidebarItemsForRole(role, category)

  if (items.length === 0) return null

  return (
    <aside
      className="hidden lg:flex flex-col items-center shrink-0 self-center my-auto z-20 print:hidden lg:-ml-4"
      aria-label="Sidebar navigasi sekunder"
    >
      <div className="flex flex-col items-center gap-3 rounded-full border border-[#454d5b]/80 bg-[#273242]/90 p-2 sm:p-2.5 shadow-2xl backdrop-blur-md">
        {items.map(([label, Icon, path]) => {
          const active =
            currentPath === path || currentPath.startsWith(path + '/')
          return (
            <button
              key={path}
              onClick={() => onNavigate(path)}
              aria-current={active ? 'page' : undefined}
              aria-pressed={undefined}
              aria-label={label}
              title={label}
              className={`group relative grid size-10 sm:size-11 place-items-center rounded-full border transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] cursor-pointer ${
                active
                  ? 'border-transparent bg-white text-[#1c222e] shadow-sm'
                  : 'border-transparent text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
              }`}
            >
              <Icon
                className="size-5 shrink-0 transition-transform duration-200 group-hover:scale-110"
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function NavigationItems({
  role,
  onNavigate,
  activePath,
  category = 'store',
}: {
  role: Role
  onNavigate: (path: string) => void
  activePath?: string
  category?: string
}) {
  const pathname = usePathname()
  const currentPath = activePath || pathname
  return dashboardItemsForRole(role, category).map(([label, Icon, path]) => {
    const active =
      currentPath === path ||
      (path !== '/dashboard' && currentPath.startsWith(path + '/'))
    return (
      <button
        key={path}
        onClick={() => onNavigate(path)}
        aria-current={active ? 'page' : undefined}
        aria-pressed={undefined}
        className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-[12px] border px-3 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#24cbc5] cursor-pointer ${
          active
            ? 'border-[#24cbc5]/30 bg-[#1c222e] text-[#24cbc5] shadow-xs'
            : 'border-transparent text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
        }`}
      >
        <Icon className="size-4.5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
      </button>
    )
  })
}

export function DashboardMobileMenu({
  role,
  onNavigate,
  businessName,
  category = 'store',
}: {
  role: Role
  onNavigate: (path: string) => void
  businessName: string
  category?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
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
      const buttons = Array.from(
        dialog.current?.querySelectorAll<HTMLButtonElement>('button') || []
      )
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const resized = () => {
      if (desktop.matches) setOpen(false)
    }
    desktop.addEventListener('change', resized)
    window.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', keydown)
      desktop.removeEventListener('change', resized)
      trigger.current?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={trigger}
        onClick={() => setOpen(true)}
        aria-label="Buka navigasi"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#454d5b]/70 text-[#c5cbd5] hover:bg-[#273242] lg:hidden cursor-pointer"
      >
        <Menu className="size-5" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div
              ref={dialog}
              id={id}
              role="dialog"
              aria-modal="true"
              aria-label="Menu dashboard"
              className="relative flex h-dvh w-72 max-w-[85vw] flex-col border-r border-[#454d5b] bg-[#273242] p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <DashboardBrand
                  onHome={() => {
                    setOpen(false)
                    onNavigate('/dashboard')
                  }}
                />
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Tutup menu"
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-[#c5cbd5] hover:bg-[#303640] cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <p className="mb-4 truncate text-sm text-[#c5cbd5]">{businessName}</p>
              <nav aria-label="Navigasi dashboard mobile" className="flex flex-col gap-1 overflow-y-auto">
                <NavigationItems
                  role={role}
                  category={category}
                  onNavigate={(path) => {
                    setOpen(false)
                    onNavigate(path)
                  }}
                />
              </nav>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
