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

  // Resize direction & state
  type ResizeDirection = 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw'
  const isResizing = useRef<{
    pointerId: number
    direction: ResizeDirection
    startX: number
    startY: number
    startW: number
    startH: number
    originX: number
    originY: number
  } | null>(null)

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

  // Multi-directional resize handlers (Sides: e, w, s, n & Corners: se, sw, ne, nw)
  const onResizePointerDown = (e: PointerEvent<HTMLDivElement>, direction: ResizeDirection) => {
    if (e.button !== 0 || !viewport) return
    e.preventDefault()
    e.stopPropagation()
    isResizing.current = {
      pointerId: e.pointerId,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startW: currentWidth,
      startH: currentHeight,
      originX: left,
      originY: top
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onResizePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const cur = isResizing.current
    if (!cur || cur.pointerId !== e.pointerId || !viewport) return
    e.stopPropagation()
    const dx = e.clientX - cur.startX
    const dy = e.clientY - cur.startY

    const minW = 320
    const minH = 380
    const maxW = viewport.width - 32
    const maxH = viewport.height - 32

    let newW = cur.startW
    let newH = cur.startH
    let newX = cur.originX
    let newY = cur.originY

    // Horizontal resizing (e: right edge, w: left edge)
    if (cur.direction.includes('e')) {
      newW = Math.min(Math.max(minW, cur.startW + dx), maxW)
      if (newX + newW > viewport.x + viewport.width - 16) {
        newW = viewport.x + viewport.width - 16 - newX
      }
    } else if (cur.direction.includes('w')) {
      const clampedW = Math.min(Math.max(minW, cur.startW - dx), maxW)
      newX = cur.originX + (cur.startW - clampedW)
      if (newX < viewport.x + 16) {
        newX = viewport.x + 16
        newW = cur.originX + cur.startW - newX
      } else {
        newW = clampedW
      }
    }

    // Vertical resizing (s: bottom edge, n: top edge)
    if (cur.direction.includes('s')) {
      newH = Math.min(Math.max(minH, cur.startH + dy), maxH)
      if (newY + newH > viewport.y + viewport.height - 16) {
        newH = viewport.y + viewport.height - 16 - newY
      }
    } else if (cur.direction.includes('n')) {
      const clampedH = Math.min(Math.max(minH, cur.startH - dy), maxH)
      newY = cur.originY + (cur.startH - clampedH)
      if (newY < viewport.y + 16) {
        newY = viewport.y + 16
        newH = cur.originY + cur.startH - newY
      } else {
        newH = clampedH
      }
    }

    setSize({ width: Math.round(newW), height: Math.round(newH) })
    if (newX !== cur.originX || newY !== cur.originY) {
      setPosition({ x: Math.round(newX), y: Math.round(newY) })
    }
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
          className="fixed z-50 flex flex-col rounded-2xl bg-[#273242] text-white shadow-2xl border border-[#454d5b] print:hidden"
          style={{
            left,
            top,
            width: currentWidth,
            height: currentHeight,
            minWidth: 320,
            minHeight: 380,
            maxWidth: viewport.width - 32,
            maxHeight: viewport.height - 32,
            resize: 'none',
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
                  Geser header untuk memindahkan · Tarik sisi atau sudut untuk ubah ukuran
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
          </div>

          {/* Interactive Resize Edge Handles (Adjust Panjang [P] / Tinggi & Lebar [L] individually) */}
          {/* Right edge (Lebar / Width) */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'e')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute top-6 bottom-6 right-0 w-2.5 cursor-ew-resize z-50 touch-none select-none hover:bg-[#24cbc5]/30 transition-colors"
            title="Tarik sisi kanan untuk mengubah lebar"
            aria-label="Ubah lebar ke kanan"
          />

          {/* Left edge (Lebar / Width) */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'w')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute top-6 bottom-6 left-0 w-2.5 cursor-ew-resize z-50 touch-none select-none hover:bg-[#24cbc5]/30 transition-colors"
            title="Tarik sisi kiri untuk mengubah lebar"
            aria-label="Ubah lebar ke kiri"
          />

          {/* Bottom edge (Tinggi / Panjang / Height) */}
          <div
            onPointerDown={e => onResizePointerDown(e, 's')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute bottom-0 left-6 right-6 h-2.5 cursor-ns-resize z-50 touch-none select-none hover:bg-[#24cbc5]/30 transition-colors"
            title="Tarik sisi bawah untuk mengubah tinggi/panjang"
            aria-label="Ubah tinggi ke bawah"
          />

          {/* Top edge (Tinggi / Panjang / Height) */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'n')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute top-0 left-6 right-6 h-2.5 cursor-ns-resize z-50 touch-none select-none hover:bg-[#24cbc5]/30 transition-colors"
            title="Tarik sisi atas untuk mengubah tinggi/panjang"
            aria-label="Ubah tinggi ke atas"
          />

          {/* Corner Handles */}
          {/* Bottom-Right Corner (Panjang & Lebar Sekaligus) */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'se')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute bottom-0 right-0 size-6 cursor-nwse-resize flex items-center justify-center text-[#a4a7ac] hover:text-[#24cbc5] select-none touch-none z-50 group hover:bg-[#24cbc5]/20 rounded-br-2xl transition-colors"
            title="Tarik sudut untuk menyesuaikan panjang dan lebar tab"
            aria-label="Ubah ukuran sudut kanan bawah"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="stroke-current opacity-70 group-hover:opacity-100 transition-opacity">
              <line x1="11" y1="3" x2="3" y2="11" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="11" y1="7" x2="7" y2="11" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Bottom-Left Corner */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'sw')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute bottom-0 left-0 size-5 cursor-nesw-resize select-none touch-none z-50 hover:bg-[#24cbc5]/20 rounded-bl-2xl transition-colors"
            title="Tarik sudut kiri bawah untuk mengubah ukuran"
            aria-label="Ubah ukuran sudut kiri bawah"
          />

          {/* Top-Right Corner */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'ne')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute top-0 right-0 size-5 cursor-nesw-resize select-none touch-none z-50 hover:bg-[#24cbc5]/20 rounded-tr-2xl transition-colors"
            title="Tarik sudut kanan atas untuk mengubah ukuran"
            aria-label="Ubah ukuran sudut kanan atas"
          />

          {/* Top-Left Corner */}
          <div
            onPointerDown={e => onResizePointerDown(e, 'nw')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={() => { isResizing.current = null }}
            className="absolute top-0 left-0 size-5 cursor-nwse-resize select-none touch-none z-50 hover:bg-[#24cbc5]/20 rounded-tl-2xl transition-colors"
            title="Tarik sudut kiri atas untuk mengubah ukuran"
            aria-label="Ubah ukuran sudut kiri atas"
          />
        </div>
      )}
    </>,
    document.body
  )
}
