'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { searchPosCustomers } from '@/app/customer-actions'
import type { PosCustomer } from '@/lib/customers'

export function CustomerSearch({ onSelect, label = 'Cari pelanggan POS', initiallyOpen = false, showPoints = true }: {
  onSelect: (customer: PosCustomer) => void
  label?: string
  initiallyOpen?: boolean
  showPoints?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(initiallyOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [response, setResponse] = useState<{ term: string; customers: PosCustomer[]; error?: string } | null>(null)
  const term = query.trim()
  const ready = response?.term === term
  const customers = ready ? response.customers : []
  const error = ready ? response.error : ''
  const loading = open && !ready

  useEffect(() => {
    if (!open) return
    let current = true
    setResponse(null)
    setActive(-1)
    const timer = setTimeout(async () => {
      try {
        const result = await searchPosCustomers(term)
        if (current) setResponse({ term, ...result })
      } catch {
        if (current) setResponse({ term, customers: [], error: 'Pencarian belum berhasil. Coba lagi.' })
      }
    }, term ? 250 : 0)
    return () => { current = false; clearTimeout(timer) }
  }, [term, open])

  const select = (customer: PosCustomer) => {
    onSelect(customer)
    setOpen(false)
    setQuery('')
    setResponse(null)
    setActive(-1)
    input.current?.focus()
  }

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id])

  return <div className="space-y-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false)
      setResponse(null)
    }
  }}>
    <input ref={input} role="combobox" aria-label={label} aria-autocomplete="list"
      aria-expanded={open} aria-controls={open ? id : undefined}
      aria-activedescendant={open && active >= 0 && customers[active] ? `${id}-${active}` : undefined}
      autoComplete="off" maxLength={100} value={query}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1) }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          if (customers.length) setActive(index => event.key === 'ArrowDown' ? (index + 1) % customers.length : (index <= 0 ? customers.length : index) - 1)
        }
        if (event.key === 'Enter' && open) {
          event.preventDefault()
          if (customers[active]) select(customers[active])
        }
      }}
      placeholder="Cari nama atau telepon pelanggan"
      className="min-h-11 w-full rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5]" />
    {open && <>
      {loading && <p role="status" className="text-xs text-[#c5cbd5]">Memuat pelanggan...</p>}
      {error && <p role="alert" className="text-xs text-[#ffb4ae]">{error} <button type="button" className="underline" onClick={() => { setOpen(false); input.current?.blur() }}>Tutup pencarian</button></p>}
      <div id={id} role="listbox" aria-label="Pelanggan aktif" aria-busy={loading}
        className={customers.length ? 'max-h-48 overflow-y-auto rounded-xl border border-[#454d5b] bg-[#1c222e] p-1.5 space-y-1' : undefined}>
        {customers.map((customer, index) => <button id={`${id}-${index}`} key={customer.id} role="option" aria-selected={active === index}
          type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => select(customer)}
          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs text-[#c5cbd5] outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5] hover:bg-[#273242] ${active === index ? 'bg-[#273242]' : ''}`}>
          <span className="min-w-0"><span className="block break-words font-medium text-white">{customer.name}</span>
            <span className="block break-words text-[#c5cbd5]">{customer.phone || 'Tanpa nomor telepon'}{showPoints ? ` · ${Number(customer.points || 0)} poin` : ''}</span>
          </span><span className="shrink-0 text-[#24cbc5]">Pilih</span>
        </button>)}
      </div>
      {!loading && !error && !customers.length && <p role="status" className="text-xs text-[#c5cbd5]">{term ? 'Tidak ada pelanggan aktif yang cocok.' : 'Belum ada pelanggan aktif.'}</p>}
      {!loading && !error && customers.length === 20 && <p className="text-xs text-[#c5cbd5]">Menampilkan 20 pelanggan. Ketik nama atau telepon untuk mempersempit pilihan.</p>}
    </>}
  </div>
}
