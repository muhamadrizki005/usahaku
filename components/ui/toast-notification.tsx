'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  createdAt?: number
}

export type ToastMessage = ToastItem | { type: ToastType; message: string; id?: string }

export function ToastNotification({
  toast,
  toasts,
  onClose,
  onRemove,
}: {
  toast?: ToastMessage | null
  toasts?: ToastItem[]
  onClose?: () => void
  onRemove?: (id: string) => void
}) {
  const items: ToastItem[] =
    toasts && toasts.length > 0
      ? toasts
      : toast
        ? [
            {
              id: (toast as ToastItem).id || 'single',
              type: toast.type || 'success',
              message: toast.message,
            },
          ]
        : []

  if (items.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Pemberitahuan"
      className="fixed top-20 sm:top-24 right-4 sm:right-6 lg:right-8 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-sm sm:max-w-md w-full"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className="pointer-events-auto transition-all duration-300 ease-out transform animate-in fade-in slide-in-from-top-2 w-full"
        >
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md w-full border ${
              item.type === 'success'
                ? 'border-[#24cbc5]/40 bg-[#173d3c]/95 text-white shadow-[#173d3c]/40'
                : item.type === 'error'
                  ? 'border-[#f56f6a]/40 bg-[#4a252b]/95 text-white shadow-[#4a252b]/40'
                  : 'border-[#3b82f6]/40 bg-[#1e293b]/95 text-white shadow-[#1e293b]/40'
            }`}
          >
            {item.type === 'success' ? (
              <CheckCircle2
                className="size-5 shrink-0 text-[#24cbc5]"
                aria-hidden="true"
              />
            ) : item.type === 'error' ? (
              <AlertCircle
                className="size-5 shrink-0 text-[#f56f6a]"
                aria-hidden="true"
              />
            ) : (
              <Info
                className="size-5 shrink-0 text-[#3b82f6]"
                aria-hidden="true"
              />
            )}
            <p className="text-sm font-medium text-white flex-1 leading-snug break-words">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => {
                if (onRemove) {
                  onRemove(item.id)
                } else if (onClose) {
                  onClose()
                }
              }}
              aria-label="Tutup notifikasi"
              className={`ml-2 shrink-0 rounded-lg p-1 transition-colors cursor-pointer ${
                item.type === 'success'
                  ? 'text-[#24cbc5]/70 hover:text-[#24cbc5] hover:bg-[#24cbc5]/10'
                  : item.type === 'error'
                    ? 'text-[#f56f6a]/70 hover:text-[#f56f6a] hover:bg-[#f56f6a]/10'
                    : 'text-[#3b82f6]/70 hover:text-[#3b82f6] hover:bg-[#3b82f6]/10'
              }`}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function useToast(duration = 3500) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const hideToast = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
    setToasts([])
  }, [])

  const showToast = useCallback(
    (type: ToastType, message: string) => {
      if (!message) return
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const item: ToastItem = { id, type, message, createdAt: Date.now() }

      setToasts((prev) => {
        const recentSame = prev.some(
          (t) => t.message === message && t.type === type && item.createdAt! - (t.createdAt || 0) < 350
        )
        if (recentSame) return prev
        const next = [...prev, item]
        return next.length > 5 ? next.slice(-5) : next
      })

      const timer = setTimeout(() => {
        removeToast(id)
      }, duration)

      timersRef.current.set(id, timer)
    },
    [duration, removeToast]
  )

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  const toast = toasts.length > 0 ? toasts[toasts.length - 1] : null

  return { toasts, toast, showToast, hideToast, removeToast }
}
