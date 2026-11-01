'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type Option = { value: string; label: string }
export function RegionCombobox({ label, value, options, placeholder, disabled, onChange }: { label: string; value: string; options: Option[]; placeholder: string; disabled?: boolean; onChange: (value: string) => void }) {
  const id = useId(), root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const selected = options.find(option => option.value === value)?.label || ''
  const [query, setQuery] = useState(selected), [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const filtered = options.filter(option => option.label.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID')))
  useEffect(() => { setQuery(selected) }, [selected])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => { if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, open, id])
  function close() { setOpen(false); setQuery(selected) }
  function choose(option: Option) { onChange(option.value); setQuery(option.label); setOpen(false); input.current?.focus() }
  return <div ref={root} className="relative min-w-0" onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node)) close() }}>
    <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
    <div className="relative">
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off" value={query} placeholder={placeholder} disabled={disabled}
        className="h-10 w-full min-w-0 rounded-xl border border-[#454d5b] bg-[#273242] pl-3 pr-9 text-sm font-normal text-white placeholder:font-normal placeholder:text-[#a4a7ac] outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20 disabled:cursor-not-allowed disabled:opacity-50"
        onFocus={event => event.currentTarget.select()} onClick={() => { setQuery(''); setOpen(true) }}
        onChange={event => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); close() }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) { setQuery(''); setOpen(true) } else setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (filtered[active]) choose(filtered[active]) }
        }} />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-[#c5cbd5]" />
    </div>
    {open && !disabled && <div id={`${id}-list`} role="listbox" aria-label={label} className="absolute top-full z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-[#454d5b] bg-[#273242] p-1.5 shadow-lg">
      {filtered.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={option.value === value} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)} className={`block w-full break-words rounded-lg px-3 py-2 text-left text-sm font-normal text-white hover:bg-[#303640] ${index === active ? 'bg-[#303640]' : ''}`}>{option.label}</button>)}
      {!filtered.length && <p role="status" className="px-3 py-2 text-sm text-[#c5cbd5]">Tidak ada wilayah yang cocok.</p>}
    </div>}
  </div>
}
