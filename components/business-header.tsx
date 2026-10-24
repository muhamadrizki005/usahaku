import Link from 'next/link'
import { UsahakuLogo } from '@/components/usahaku-logo'

export function BusinessHeader({ ownerName }: { ownerName: string }) {
  return <header className="sticky top-0 z-20 border-b border-[#454d5b] bg-[#273242]/95 backdrop-blur">
    <div className="relative mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
      <Link href="/" aria-label="Usahaku beranda" className="flex shrink-0 items-center"><UsahakuLogo /></Link>
      <div className="pointer-events-none absolute inset-x-0 hidden items-center justify-center md:flex"><span className="text-sm font-medium text-[#a4a7ac]">Pengaturan usaha</span></div>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1835d9] text-xs font-bold text-white shadow-sm">{ownerName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>
        <span title={ownerName} className="hidden max-w-48 truncate text-sm font-medium text-white sm:block">{ownerName}</span>
      </div>
    </div>
  </header>
}
