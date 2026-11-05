'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import BusinessAssistant from './business-assistant'
import type { FloatingPoint, FloatingViewport } from '@/lib/assistant-floating'

export const assistantLauncherId = 'dashboard-floating-assistant-launcher'

export function FloatingBusinessAssistant({
  visible,
  configured,
  onClose
}: {
  visible: boolean
  configured: boolean
  onClose?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [opened, setOpened] = useState(false)
  const [viewport, setViewport] = useState<FloatingViewport | null>(null)

  // Window sizing & positioning
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 460, height: 620 })
  const [position, setPosition] = useState<FloatingPoint | null>(null)

  // Dragging window position
  const isDraggingHeader = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  // Dragging resize handle
  const isResizing = useRef<{ pointerId: number; startX: number; startY: number; startW: number; startH: number } | null>(null)

  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const title = id + '-title'

  // Initialize viewport and position
  useEffect(() => {
    const updateViewport = () => {
      const vv = window.visualViewport
      const vp: FloatingViewport = {
        x: vv?.offsetLeft || 0,
        y: vv?.offsetTop || 0,
        width: vv?.width || window.innerWidth,
        height: vv?.height || window.innerHeight
      }
      setViewport(vp)

      // Clamp size to viewport
      setSize(prev => ({
        width: Math.min(Math.max(320, prev.width), vp.width - 32),
        height: Math.min(Math.max(380, prev.height), vp.height - 32)
      }))

      // Clamp position to viewport
      setPosition(prev => {
        if (!prev) {
          const w = Math.min(460, vp.width - 32)
          const h = Math.min(620, vp.height - 32)
          return {
            x: Math.max(16, vp.x + vp.width - w - 24),
            y: Math.max(16, vp.y + vp.height - h - 24)
          }
        }
        const maxX = Math.max(16, vp.x + vp.width - 320 - 16)
        const maxY = Math.max(16, vp.y + vp.height - 380 - 16)
        return {
          x: Math.min(Math.max(vp.x + 16, prev.x), maxX),
          y: Math.min(Math.max(vp.y + 16, prev.y), maxY)
        }
      })
    }

    updateViewport()
    setMounted(true)

    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)

    return () => {
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  // Auto-mount assistant content when visible
  useEffect(() => {
    if (visible) setOpened(true)
  }, [visible])

  // Escape key to close
  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  if (!mounted || !viewport) return null

  // Calculate current panel coordinates
  const currentWidth = Math.min(Math.max(320, size.width), viewport.width - 32)
  const currentHeight = Math.min(Math.max(380, size.height), viewport.height - 32)

  const left = position
    ? Math.min(Math.max(viewport.x + 16, position.x), viewport.x + viewport.width - currentWidth - 16)
    : Math.max(16, viewport.x + viewport.width - currentWidth - 24)

  const top = position
    ? Math.min(Math.max(viewport.y + 16, position.y), viewport.y + viewport.height - currentHeight - 16)
    : Math.max(16, viewport.y + viewport.height - currentHeight - 24)

  // Header drag handlers (Move window)
  const onHeaderPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return // don't drag if clicking close button
    isDraggingHeader.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: left,
      originY: top
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onHeaderPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const cur = isDraggingHeader.current
    if (!cur || cur.pointerId !== e.pointerId) return
    const dx = e.clientX - cur.startX
    const dy = e.clientY - cur.startY
    const minX = viewport.x + 16
    const maxX = viewport.x + viewport.width - currentWidth - 16
    const minY = viewport.y + 16
    const maxY = viewport.y + viewport.height - currentHeight - 16

    setPosition({
      x: Math.min(Math.max(minX, cur.originX + dx), maxX),
      y: Math.min(Math.max(minY, cur.originY + dy), maxY)
    })
  }

  const onHeaderPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isDraggingHeader.current?.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      isDraggingHeader.current = null
    }
  }

  // Corner resize handlers (Resize width & height)
  const onResizePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    isResizing.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startW: currentWidth,
      startH: currentHeight
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onResizePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const cur = isResizing.current
    if (!cur || cur.pointerId !== e.pointerId) return
    e.stopPropagation()
    const dw = e.clientX - cur.startX
    const dh = e.clientY - cur.startY

    const maxW = viewport.width - 32
    const maxH = viewport.height - 32

    setSize({
      width: Math.min(Math.max(320, cur.startW + dw), maxW),
      height: Math.min(Math.max(380, cur.startH + dh), maxH)
    })
  }

  const onResizePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isResizing.current?.pointerId === e.pointerId) {
      e.stopPropagation()
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      isResizing.current = null
    }
  }

  return createPortal(
    <>
      {visible && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-modal="false"
          aria-labelledby={title}
          className="fixed z-50 flex flex-col rounded-2xl bg-[#1c222e] text-white shadow-2xl border border-[#454d5b] print:hidden"
          style={{
            left,
            top,
            width: currentWidth,
            height: currentHeight,
            minWidth: 320,
            minHeight: 380,
            maxWidth: viewport.width - 32,
            maxHeight: viewport.height - 32,
            resize: 'both',
            overflow: 'hidden'
          }}
        >
          {/* Draggable Header */}
          <div
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={() => { isDraggingHeader.current = null }}
            className="flex shrink-0 items-center justify-between gap-3 border-b border-[#454d5b] bg-[#273242] px-4 py-3 cursor-move select-none touch-none rounded-t-2xl"
            title="Klik dan tahan untuk memindahkan posisi tab Asisten"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="grid size-7 place-items-center rounded-lg bg-[#24cbc5]/15 text-[#24cbc5] shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 id={title} className="text-sm font-semibold text-white leading-tight truncate">
                  Asisten Bisnis AI
                </h2>
                <p className="text-[11px] text-[#a4a7ac] leading-tight">
                  Geser header untuk memindahkan · Tarik sudut untuk ubah ukuran
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onClose?.()}
                aria-label="Tutup panel Asisten AI"
                className="grid size-8 place-items-center rounded-lg text-[#c5cbd5] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#24cbc5]"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>

          {/* Assistant Content */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
            {opened && (
              <BusinessAssistant
                configured={configured}
                variant="floating"
                active={visible}
              />
            )}

            {/* Visual & Interactive Resize Corner Grip */}
            <div
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={() => { isResizing.current = null }}
              className="absolute bottom-0 right-0 size-6 cursor-se-resize flex items-center justify-center text-[#a4a7ac] hover:text-[#24cbc5] select-none touch-none z-30 group"
              title="Tarik sudut untuk menyesuaikan panjang dan lebar tab"
              aria-label="Ubah ukuran panjang dan lebar tab asisten"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="stroke-current opacity-70 group-hover:opacity-100 transition-opacity">
                <line x1="11" y1="3" x2="3" y2="11" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="11" y1="7" x2="7" y2="11" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
