'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type CustomSelectOption =
  | string
  | {
      value: string
      label: string
      disabled?: boolean
    }

export interface CustomSelectProps {
  value?: string
  defaultValue?: string
  options: CustomSelectOption[]
  onChange?: (value: string) => void
  name?: string
  id?: string
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  dropdownClassName?: string
  align?: 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
}

export function CustomSelect({
  value,
  defaultValue,
  options,
  onChange,
  name,
  id: explicitId,
  ariaLabel,
  placeholder,
  disabled = false,
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  align = 'left',
  size = 'md',
}: CustomSelectProps) {
  const generatedId = useId()
  const id = explicitId || generatedId
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const normalizedOptions = useMemo(
    () =>
      options.map(opt =>
        typeof opt === 'string'
          ? { value: opt, label: opt, disabled: false }
          : { value: opt.value, label: opt.label, disabled: !!opt.disabled }
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
  const displayLabel = selectedOption?.label ?? (currentValue || placeholder || 'Pilih...')

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelect = (val: string, isDisabled?: boolean) => {
    if (isDisabled) return
    if (!isControlled) {
      setUncontrolledValue(val)
    }
    onChange?.(val)
    setOpen(false)
  }

  const sizeClasses = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-10 px-3.5 text-sm',
    lg: 'h-11 px-4 text-sm',
  }[size]

  const isFullWidth = className.includes('w-full')
  const defaultPopupWidth = isFullWidth
    ? 'w-full min-w-full'
    : 'min-w-full w-max max-w-xs sm:max-w-sm'

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        type="button"
        id={id}
        aria-label={ariaLabel || displayLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen(prev => !prev)}
        className={`inline-flex w-full items-center justify-between gap-2.5 rounded-xl border bg-[#273242] text-white transition-all duration-200 outline-none select-none disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses} ${
          open
            ? 'border-[#24cbc5] ring-2 ring-[#24cbc5]/20'
            : 'border-border hover:border-[#24cbc5]/50 hover:bg-[#303640]'
        } ${triggerClassName}`}
      >
        <span className="truncate text-left">{displayLabel}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#a4a7ac] transition-transform duration-200 ${
            open ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full z-50 mt-2 max-h-60 ${defaultPopupWidth} overflow-y-auto rounded-2xl border border-border bg-[#273242] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-150 ${dropdownClassName}`}
        >
          {normalizedOptions.map(opt => {
            const isSelected = opt.value === currentValue
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => handleSelect(opt.value, opt.disabled)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  opt.disabled
                    ? 'cursor-not-allowed opacity-40 text-[#a4a7ac]'
                    : isSelected
                    ? 'bg-[#1835d9] font-medium text-white shadow-xs'
                    : 'text-[#c5cbd5] hover:bg-[#303640] hover:text-white'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <span className="size-1.5 shrink-0 rounded-full bg-white" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
