'use client'

import { useEffect, useRef, type ComponentProps } from 'react'

export function ModalFrame({ onDismiss, busy = false, children, className = '', ...props }: Omit<ComponentProps<'dialog'>, 'open' | 'onCancel'> & { onDismiss: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    const initial = dialog?.querySelector<HTMLElement>('input:not(:disabled):not([type="hidden"]),textarea:not(:disabled)')
      || dialog?.querySelector<HTMLElement>('button:not(:disabled)')
    initial?.focus()
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return <dialog {...props} ref={ref} className={className + ' text-white backdrop:bg-transparent'}
    style={{ ...props.style, margin: 0, maxWidth: 'none', maxHeight: 'none', width: '100%', height: '100%', border: 0, color: 'inherit' }}
    onCancel={event => { event.preventDefault(); if (!busy) onDismiss() }}
    onKeyDown={event => {
      if (event.key === 'Escape' && ref.current?.querySelector('[role="listbox"]')) { event.preventDefault(); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"]') || []).filter(control => !control.matches(':disabled,[tabindex="-1"]') && control.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>{children}</dialog>
}
