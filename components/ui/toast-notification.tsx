'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type ToastType = 'success' | 'error'

export interface ToastMessage {
  type: ToastType
  message: string
}

export function ToastNotification({
  toast,
  onClose,
}: {
  toast: ToastMessage | null
  onClose: () => void
}) {
  if (!toast) return null

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className="fixed top-[88px] right-4 sm:right-6 lg:right-8 z-50 pointer-events-auto transition-all duration-300 ease-out transform animate-in fade-in slide-in-from-top-2"
    >
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl backdrop-blur-md max-w-md ${
          toast.type === 'success'
            ? 'border border-[#24cbc5]/40 bg-[#173d3c] text-white shadow-[#173d3c]/30'
            : 'border border-[#f56f6a]/40 bg-[#4a252b] text-white shadow-[#4a252b]/30'
        }`}
      >
        {toast.type === 'success' ? (
          <CheckCircle2
            className="size-5 shrink-0 text-[#24cbc5]"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle
            className="size-5 shrink-0 text-[#f56f6a]"
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-medium text-white">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className={`ml-2 rounded-lg p-0.5 transition-colors ${
            toast.type === 'success'
              ? 'text-[#24cbc5]/70 hover:text-[#24cbc5] hover:bg-[#24cbc5]/10'
              : 'text-[#f56f6a]/70 hover:text-[#f56f6a] hover:bg-[#f56f6a]/10'
          }`}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function useToast(duration = 3000) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const showToast = useCallback(
    (type: ToastType, message: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setToast({ type, message })
      timerRef.current = setTimeout(() => {
        setToast(null)
        timerRef.current = null
      }, duration)
    },
    [duration]
  )

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setToast(null)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return { toast, showToast, hideToast }
}

