'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'

export type CustomSelectOption =
  | string
  | {
      value: string
      label: string
      disabled?: boolean
      group?: string
    }

export interface CustomSelectProps {
  value?: string
  defaultValue?: string
  options: CustomSelectOption[]
  onChange?: (value: string) => void
  name?: string
  id?: string
  ariaLabel?: string
  'aria-labelledby'?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  dropdownClassName?: string
  align?: 'left' | 'right'
  contentAlign?: 'left' | 'center' | 'right'
  size?: 'sm' | 'md' | 'lg'
  dropdownFooter?: React.ReactNode | ((helpers: { close: () => void }) => React.ReactNode)
}

export function CustomSelect({
  value,
  defaultValue,
  options,
  onChange,
  name,
  id: explicitId,
  ariaLabel,
  'aria-labelledby': labelledBy,
  placeholder,
  disabled = false,
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  align = 'left',
  contentAlign = 'left',
  size = 'md',
  dropdownFooter,
}: CustomSelectProps) {
  const generatedId = useId()
  const id = explicitId || generatedId
  const [open, setOpen] = useState(false)
  const [portalContainer,setPortalContainer]=useState<HTMLElement|null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const openAt = useRef<'selected' | 'first' | 'last'>('selected')
  const searchRef = useRef({ text: '', at: 0 })

  const normalizedOptions = useMemo(
    () =>
      options.map(opt =>
        typeof opt === 'string'
          ? { value: opt, label: opt, disabled: false, group: undefined }
          : { value: opt.value, label: opt.label, disabled: !!opt.disabled, group: opt.group }
      ),
    [options]
  )

  const isControlled = value !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(
    defaultValue !== undefined
      ? defaultValue
      : normalizedOptions[0]?.value || ''
  )

  useEffect(() => {
    if (!isControlled && defaultValue !== undefined) {
      setUncontrolledValue(defaultValue)
    }
  }, [defaultValue, isControlled])

  const currentValue = isControlled ? value : uncontrolledValue

  const selectedOption = normalizedOptions.find(opt => opt.value === currentValue)
  const changeOpen=(next:boolean)=>{if(next)setPortalContainer(triggerRef.current?.closest('dialog')||null);setOpen(next)}
  const displayLabel = selectedOption?.label ?? (currentValue || placeholder || 'Pilih...')

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || [])
    const target = openAt.current === 'last' ? options.at(-1) : openAt.current === 'first' ? options[0] : options.find(option => option.getAttribute('aria-selected') === 'true') || options[0]
    target?.focus()
    openAt.current = 'selected'
  }, [open])

  const menuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).matches('input,textarea')) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); return
    }
    if (event.key === 'Tab') { setOpen(false); triggerRef.current?.focus(); return }
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || [])
    if (!options.length) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    let next: HTMLButtonElement | undefined
    if (event.key === 'ArrowDown') next = options[(current + 1) % options.length]
    else if (event.key === 'ArrowUp') next = options[(current - 1 + options.length) % options.length]
    else if (event.key === 'Home') next = options[0]
    else if (event.key === 'End') next = options.at(-1)
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      searchRef.current = { text: now - searchRef.current.at < 600 ? searchRef.current.text + event.key : event.key, at: now }
      next = [...options.slice(current + 1), ...options.slice(0, current + 1)].find(option => option.textContent?.trim().toLocaleLowerCase('id-ID').startsWith(searchRef.current.text.toLocaleLowerCase('id-ID')))
    }
    if (next) { event.preventDefault(); event.stopPropagation(); next.focus() }
  }

  const handleSelect = (val: string, isDisabled?: boolean) => {
    if (isDisabled) return
    if (!isControlled) {
      setUncontrolledValue(val)
    }
    onChange?.(val)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const sizeClasses = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-10 px-3.5 text-sm',
    lg: 'h-11 px-4 text-sm',
  }[size]

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}><div ref={containerRef} className={`relative inline-block ${className}`}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <Popover.Trigger
        type="button"
        id={id}
        ref={triggerRef}
        aria-controls={open ? id + '-listbox' : undefined}
        onKeyDown={event => {
          if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
            event.preventDefault(); openAt.current = event.key === 'ArrowUp' || event.key === 'End' ? 'last' : event.key === 'Home' ? 'first' : 'selected'; changeOpen(true)
          }
        }}
        aria-label={labelledBy?undefined:ariaLabel || displayLabel}
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-value={currentValue}
        disabled={disabled}
        className={`inline-flex w-full items-center justify-between gap-2.5 rounded-xl border bg-[#273242] text-white transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5] select-none disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses} ${
          open
            ? 'border-[#24cbc5] ring-2 ring-[#24cbc5]/20'
            : 'border-border hover:border-[#24cbc5]/50 hover:bg-[#303640]'
        } ${triggerClassName}`}
      >
        <span className={`truncate ${contentAlign === 'center' ? 'text-center flex-1' : contentAlign === 'right' ? 'text-right flex-1' : 'text-left'}`}>{displayLabel}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#a4a7ac] transition-transform duration-200 ${
            open ? 'rotate-180 text-white' : ''
          }`}
        />
      </Popover.Trigger>

      {open && (
        <Popover.Portal container={portalContainer||undefined}><Popover.Positioner side="bottom" align={align==='right'?'end':'start'} sideOffset={8} collisionPadding={12} positionMethod="fixed" className="z-[110] max-w-[calc(100vw-24px)]"><Popover.Popup
          role="listbox"
          id={id + '-listbox'}
          aria-labelledby={id}
          ref={menuRef}
          finalFocus={triggerRef}
          initialFocus={()=>{const enabled=Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')||[]);return openAt.current==='last'?enabled.at(-1):openAt.current==='first'?enabled[0]:enabled.find(el=>el.getAttribute('aria-selected')==='true')||enabled[0]}}
          onKeyDown={menuKeyDown}
          tabIndex={-1}
          style={{minWidth:'var(--anchor-width)',maxHeight:'min(15rem,var(--available-height))'}}
          className={`max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-border bg-[#273242] p-1.5 shadow-2xl outline-none ${dropdownClassName}`}
        >
          {normalizedOptions.map((opt, idx) => {
            const isSelected = opt.value === currentValue
            const prevOpt = normalizedOptions[idx - 1]
            const showGroupHeader = Boolean(opt.group && (!prevOpt || prevOpt.group !== opt.group))
            return (
              <React.Fragment key={opt.value}>
                {showGroupHeader && (
                  <div
                    className={`px-3 ${
                      idx > 0 ? 'mt-2 pt-2 border-t border-[#454d5b]/40' : 'pt-1'
                    } pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#24cbc5] select-none`}
                  >
                    {opt.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  data-value={opt.value}
                  tabIndex={-1}
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value, opt.disabled)}
                  onFocus={event=>event.currentTarget.scrollIntoView({block:'nearest'})}
                  className={`relative flex w-full items-center ${
                    contentAlign === 'center'
                      ? 'justify-center text-center'
                      : contentAlign === 'right'
                      ? 'justify-end text-right'
                      : 'justify-between text-left'
                  } gap-2 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#24cbc5] focus-visible:outline-offset-[-2px] ${
                    opt.disabled
                      ? 'cursor-not-allowed opacity-40 text-[#a4a7ac]'
                      : isSelected
                      ? 'bg-[#1835d9] font-medium text-white shadow-xs'
                      : 'text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
                  }`}
                >
                  <span className="break-words [overflow-wrap:anywhere]">{opt.label}</span>
                  {isSelected && (
                    <span
                      className={`size-1.5 shrink-0 rounded-full bg-white ${
                        contentAlign === 'center' ? 'absolute right-3' : ''
                      }`}
                    />
                  )}
                </button>
              </React.Fragment>
            )
          })}
          {dropdownFooter && (
            <div className="mt-1.5 border-t border-[#454d5b]/60 pt-1.5">
              {typeof dropdownFooter === 'function'
                ? dropdownFooter({ close: () => setOpen(false) })
                : dropdownFooter}
            </div>
          )}
        </Popover.Popup></Popover.Positioner></Popover.Portal>
      )}
    </div></Popover.Root>
  )
}
