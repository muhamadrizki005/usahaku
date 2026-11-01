'use client'
import type { ReactNode } from 'react'
import type { Role } from '@/lib/auth/permissions'

export default function DashboardSection({
  title,
  businessName,
  breadcrumbTitle,
  description,
  meta,
  action,
  children,
  role,
}: {
  title: string
  businessName?: string
  breadcrumbTitle?: string
  description?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  category?: string
  children?: ReactNode
  role?: Role
}) {
  return (
    <section className="min-w-0 w-full">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-[#a4a7ac]">
            <span>{businessName || 'Usahaku'}</span>
            <span className="text-white/30">›</span>
            <span className="font-medium text-[#24cbc5]">{breadcrumbTitle || title}</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[#a4a7ac]">{description}</p>
          )}
          {meta && (
            <p className="mt-3 text-xs text-[#a4a7ac]">{meta}</p>
          )}
        </div>
        {action && (
          <div className="flex flex-wrap items-center gap-3">{action}</div>
        )}
      </div>
      <div>
        {children || (
          <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-8 shadow-sm">
            <h2 className="text-lg font-normal text-white">{title}</h2>
            <p className="mt-2 text-sm text-[#c5cbd5]">
              Modul ini siap digunakan untuk membantu operasional usaha Anda.
            </p>
            <span className="mt-5 inline-flex rounded-full border border-[#454d5b] bg-[#1c222e] px-3.5 py-1 text-xs font-medium text-[#24cbc5]">
              Operasional Aktif
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
