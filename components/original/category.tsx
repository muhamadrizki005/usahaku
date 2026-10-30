'use client'
import { BusinessHeader } from '@/components/business-header'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, Gauge, LayoutGrid, Scissors, ShoppingBag, Store, Utensils, UsersRound } from 'lucide-react'
import { OnboardingExitDialog } from '@/components/onboarding-exit-dialog'
import { LegalModal, type LegalModalType } from '@/components/legal-modal'

const categories = [
  { id: 'toko', title: 'Toko / Minimarket / Kios', description: 'Kelola produk, stok harian, dan penjualan langsung di kasir.', features: 'Produk & stok • Kasir • Pembayaran', icon: ShoppingBag },
  { id: 'restoran', title: 'Restoran / Cafe', description: 'Kelola menu, transaksi kasir, serta reservasi meja atau ruangan.', features: 'Menu • Meja & kapasitas • Reservasi & DP', icon: Utensils },
  { id: 'barbershop', title: 'Barbershop / Salon', description: 'Susun layanan, durasi, dan ketersediaan penata rambut.', features: 'Layanan • Penata rambut • Janji temu & DP', icon: Scissors },
] as const

export default function OriginalCategory({ ownerName, userId }: { ownerName: string; userId: string }) {
  const router = useRouter()
  const [exitOpen,setExitOpen] = useState(false)
  const closeExit = useCallback(()=>setExitOpen(false),[])
  const [legalModal, setLegalModal] = useState<LegalModalType>(null)
  const [selected, setSelected] = useState<(typeof categories)[number]['id']>('toko')
  const active = categories.find((category) => category.id === selected) ?? categories[0]

  function continueOnboarding() {
    window.sessionStorage.setItem(`usahaku_category:${userId}`, selected)
    router.push(`/onboarding/identity?category=${selected}`)
  }

  return <main className="min-h-screen bg-[#1c222e] text-[#ffffff]">
    <BusinessHeader ownerName={ownerName} />
    <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 lg:py-8"><div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 sm:p-5"><div className="grid gap-4 md:grid-cols-3">{categories.map((category, index) => <div key={category.id} className="flex items-center gap-3"><div className={`grid size-9 shrink-0 place-items-center rounded-full ${index === 0 ? 'bg-[#1835d9] text-white' : 'border border-[#454d5b] bg-[#273242] text-[#a4a7ac]'}`}>{index === 0 ? <Check className="size-4" /> : <span className="text-sm font-normal">{index + 1}</span>}</div><div><p className={`text-sm font-normal ${index === 0 ? 'text-[#24cbc5]' : 'text-[#a4a7ac]'}`}>{category.id === 'toko' ? 'Kategori usaha' : category.id === 'restoran' ? 'Identitas usaha' : 'Setup usaha'}</p><p className="text-xs text-[#a4a7ac]">{index === 0 ? 'Sedang diatur' : 'Berikutnya'}</p></div>{index < 2 && <span className="hidden h-px flex-1 bg-[#e5eaf2] md:block" />}</div>)}</div></div>
      <div className="mx-auto mt-10 max-w-[1020px]"><p className="text-sm font-normal text-[#24cbc5]">01 / 03</p><h1 className="mt-3 text-3xl font-normal tracking-tight sm:text-4xl">Usaha apa yang Anda jalankan?</h1><p className="mt-3 max-w-2xl leading-7 text-[#a4a7ac]">Pilih satu kategori utama. Kami akan menyesuaikan pengalaman aplikasi, navigasi, dan fitur dengan operasional usaha Anda.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">{categories.map((category) => { const Icon = category.icon; const isSelected = selected === category.id; return <button key={category.id} type="button" disabled={category.id !== 'toko'} onClick={() => setSelected(category.id)} aria-pressed={isSelected} className={`relative flex min-h-[255px] flex-col rounded-2xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-[#24cbc5] ${isSelected ? 'border-[#1835d9] bg-[#1835d9]/15 shadow-[0_0_0_3px_rgba(24,53,217,0.08)]' : 'border-[#454d5b] bg-[#273242] hover:border-[#24cbc5]/50 hover:bg-[#303640]'}`}><span className={`absolute right-5 top-5 grid size-5 place-items-center rounded-full border ${isSelected ? 'border-[#1835d9] bg-[#1835d9]' : 'border-[#b5bfce] bg-[#273242]'}`}>{isSelected && <span className="size-2 rounded-full bg-[#273242]" />}</span><span className={`grid size-11 place-items-center rounded-xl ${isSelected ? 'bg-[#1835d9] text-white' : 'bg-[#1835d9]/15 text-[#24cbc5]'}`}><Icon className="size-5" /></span><span className="mt-5 pr-5 text-base font-normal">{category.title}</span><span className="mt-3 text-sm leading-6 text-[#a4a7ac]">{category.description}</span><span className={`mt-auto pt-5 text-xs font-normal ${isSelected ? 'text-[#24cbc5]' : 'text-[#a4a7ac]'}`}>{category.features}</span></button> })}</div>
        <div className="mt-5 rounded-2xl border border-[#454d5b] bg-[#1835d9]/15 p-5"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1835d9]/15 text-[#24cbc5]"><BriefcaseBusiness className="size-4" /></span><div><h2 className="font-normal">Satu usaha, satu kategori utama</h2><p className="mt-1 text-sm leading-6 text-[#a4a7ac]">Pilih berdasarkan aktivitas utama usaha. Pengaturan selanjutnya hanya menampilkan kebutuhan kategori yang dipilih.</p></div></div></div>
        <div className="mt-5 rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><p className="text-sm font-normal text-[#24cbc5]">{active.title} dipilih</p><p className="mt-1 text-sm text-[#a4a7ac]">Berikutnya, lengkapi identitas usaha sebelum menyiapkan {active.id === 'toko' ? 'produk dan stok' : active.id === 'restoran' ? 'menu dan reservasi' : 'layanan dan janji temu'}.</p></div>
        <div className="mt-8 flex flex-col gap-4 border-t border-[#454d5b] pt-6 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setExitOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#454d5b] bg-[#273242] px-5 py-3 text-sm font-normal text-[#a4a7ac] hover:border-[#1835d9] hover:text-[#24cbc5]"><ArrowLeft className="size-4" />Kembali</button><p className="order-first text-center text-xs text-[#a4a7ac] sm:order-none">Kategori utama dapat diubah nanti dari pengaturan usaha.</p><button type="button" onClick={continueOnboarding} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-6 py-3 text-sm font-normal text-white hover:bg-[#132c9e] focus:outline-none focus:ring-2 focus:ring-[#24cbc5]">Lanjutkan<ArrowRight className="size-4" /></button></div>
      </div></div><footer className="mx-auto flex max-w-[1180px] flex-col gap-3 border-t border-[#454d5b] px-5 py-6 text-xs text-[#a4a7ac] sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>© 2026 Usahaku. Semua hak dilindungi.</span><div className="flex gap-5"><button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-[#24cbc5]">Kebijakan Privasi</button><button type="button" onClick={() => setLegalModal('terms')} className="hover:text-[#24cbc5]">Syarat Penggunaan</button></div></footer><LegalModal type={legalModal} onClose={() => setLegalModal(null)} onSwitchType={(type) => setLegalModal(type)} />
  {exitOpen&&<OnboardingExitDialog close={closeExit} leave={()=>router.push('/')} />}
  </main>
}
