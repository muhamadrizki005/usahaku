'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import BusinessAssistant from './business-assistant'
import { assistantFloatingLayout, clampAssistantLauncher, type FloatingPoint, type FloatingViewport } from '@/lib/assistant-floating'

export const assistantLauncherId = 'dashboard-floating-assistant-launcher'

export function FloatingBusinessAssistant({ visible, configured }: { visible: boolean; configured: boolean }) {
  const [mounted, setMounted] = useState(false), [open, setOpen] = useState(false), [opened, setOpened] = useState(false)
  const [viewport, setViewport] = useState<FloatingViewport | null>(null), [position, setPosition] = useState<FloatingPoint | null>(null)
  const drag = useRef<{ pointer: number; start: FloatingPoint; origin: FloatingPoint; moved: boolean } | null>(null), suppressClick = useRef(false)
  const panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const id = useId(), title = id + '-title', hint = id + '-hint'
  useEffect(() => {
    const resize = () => {
      const vv = window.visualViewport
      const next = { x: vv?.offsetLeft || 0, y: vv?.offsetTop || 0, width: vv?.width || innerWidth, height: vv?.height || innerHeight }
      setViewport(next); setPosition(current => current ? clampAssistantLauncher(current, next) : null)
      if (drag.current) suppressClick.current = drag.current.moved
      drag.current = null
    }
    resize(); setMounted(true)
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize) }
  }, [])
  useEffect(() => { if (!visible) setOpen(false) }, [visible])
  useEffect(() => {
    if (!visible || !open) return
    const previous = document.activeElement
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target instanceof Element ? event.target.closest('[role="dialog"],dialog') : null
      if (target && target !== panel.current) return
      event.preventDefault(); setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('keydown', close)
      if (panel.current?.contains(document.activeElement) || document.activeElement === document.body) {
        if (trigger.current?.isConnected) trigger.current.focus()
        else if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
      }
    }
  }, [visible, open])
  if (!mounted || !viewport) return null
  const layout = assistantFloatingLayout(viewport, position)
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    suppressClick.current = false
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: layout.launcher, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y
    if (!current.moved && Math.hypot(dx, dy) < 6) return
    current.moved = true
    setPosition(clampAssistantLauncher({ x: current.origin.x + dx, y: current.origin.y + dy }, viewport))
  }
  return createPortal(<>
    <div ref={panel} id={id} role="dialog" aria-modal="false" aria-labelledby={title}
      className={(visible && open ? 'flex' : 'hidden') + ' fixed z-40 flex-col rounded-2xl bg-[#1c222e] text-white shadow-2xl print:hidden'}
      style={{ left: layout.panel.x, top: layout.panel.y, width: layout.panel.width, height: layout.panel.height }}>
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-t-2xl border border-[#454d5b] bg-[#273242] px-3 py-2">
        <h2 id={title} className="text-sm font-semibold">Asisten Bisnis AI</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Tutup panel Asisten AI" className="grid size-11 shrink-0 place-items-center rounded-xl text-[#c5cbd5] hover:bg-[#303640] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5]"><X aria-hidden="true" className="size-5" /></button>
      </div>
      {opened && <BusinessAssistant configured={configured} variant="floating" active={visible && open} />}
    </div>
    <p id={hint} className="sr-only">Geser tombol untuk memindahkan Asisten. Gunakan tombol panah saat tombol mendapat fokus.</p>
    {visible && <button id={assistantLauncherId} ref={trigger} type="button" aria-label={open ? 'Tutup Asisten AI' : 'Buka Asisten AI'} aria-expanded={open} aria-controls={id} aria-haspopup="dialog" aria-describedby={hint}
      onPointerDown={startDrag} onPointerMove={moveDrag}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { suppressClick.current = drag.current.moved; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = false }}
      onLostPointerCapture={() => { if (drag.current) { suppressClick.current = drag.current.moved; drag.current = null } }}
      onKeyDown={event => { const deltas: Record<string, FloatingPoint> = { ArrowLeft: { x: -16, y: 0 }, ArrowRight: { x: 16, y: 0 }, ArrowUp: { x: 0, y: -16 }, ArrowDown: { x: 0, y: 16 } }; const delta = deltas[event.key]; if (delta) { event.preventDefault(); setPosition(clampAssistantLauncher({ x: layout.launcher.x + delta.x, y: layout.launcher.y + delta.y }, viewport)) } }}
      onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return } suppressClick.current = false; setOpened(true); setOpen(value => !value) }}
      className="fixed z-40 grid size-14 touch-none select-none cursor-grab place-items-center rounded-full border border-[#24cbc5]/60 bg-[#273242] shadow-lg hover:bg-[#303640] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#24cbc5] print:hidden" style={{ left: layout.launcher.x, top: layout.launcher.y }}>
      {open ? <X aria-hidden="true" className="pointer-events-none size-6 text-white" /> : <img src="/brand/usahaku-logo.png" width={32} height={32} draggable={false} alt="" className="pointer-events-none size-8 object-contain" />}
    </button>}
  </>, document.body)
}
