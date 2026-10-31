'use client'
import {useEffect,useRef} from 'react'
import {X} from 'lucide-react'

export function OnboardingExitDialog({close,leave}:{close:()=>void;leave:()=>void}) {
  const box=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    box.current?.querySelector<HTMLButtonElement>('button[data-cancel]')?.focus()
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();close()}
      if(e.key==='Tab'){
        const buttons=box.current?.querySelectorAll<HTMLButtonElement>('button')
        if(!buttons?.length)return
        const first=buttons[0],last=buttons[buttons.length-1]
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    }
    document.addEventListener('keydown',key)
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus()}
  },[close])
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1c222e]/50 p-5" onClick={close}><div ref={box} role="dialog" aria-modal="true" aria-labelledby="exit-onboarding-title" onClick={e=>e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><h2 id="exit-onboarding-title" className="text-lg font-normal">Kembali ke beranda?</h2><button type="button" onClick={close} aria-label="Tutup peringatan" className="grid size-11 shrink-0 place-items-center rounded-lg text-[#a4a7ac] focus-visible:outline-2 focus-visible:outline-[#1835d9]"><X className="size-5"/></button></div><p className="mt-3 text-sm leading-6 text-[#a4a7ac]">Anda yakin ingin meninggalkan pengaturan usaha? Data yang sudah disimpan tetap tersedia. Dashboard baru dapat dibuka setelah Anda menekan Buka dashboard pada ringkasan.</p><div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row"><button type="button" data-cancel onClick={close} className="min-h-11 rounded-xl border border-[#454d5b] px-4 py-3 text-sm font-normal text-[#a4a7ac]">Lanjutkan pengaturan</button><button type="button" onClick={leave} className="min-h-11 rounded-xl bg-[#1835d9] px-4 py-3 text-sm font-normal text-white">Ya, ke beranda</button></div></div></div>
}
