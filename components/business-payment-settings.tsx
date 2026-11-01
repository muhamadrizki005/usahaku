'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PaymentSettings } from '@/lib/business-payments'
import { useBusinessPayments } from './business-payment-state'
import { Modal, PaymentsModal } from './original/setup'
import { ToastNotification, useToast, type ToastType } from '@/components/ui/toast-notification'

export default function BusinessPaymentSettings({
  initial,
  businessId,
  onNotify,
}: {
  initial: PaymentSettings
  businessId: string
  onNotify?: (type: ToastType, message: string) => void
}) {
  const state = useBusinessPayments(initial, businessId)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const fallbackToast = useToast(3000)
  const notify = onNotify || fallbackToast.showToast

  const close = () => {
    if (!state.pending) setOpen(false)
  }

  async function save() {
    const ok = await state.save()
    if (ok) {
      notify('success', 'Metode pembayaran berhasil disimpan.')
      setOpen(false)
      router.refresh()
    } else {
      notify('error', state.error || 'Gagal menyimpan metode pembayaran.')
    }
  }

  const activeMethods = ['Tunai', 'QRIS', 'Transfer', 'E-wallet'].filter(
    (_, i) => [state.settings.cash, state.settings.qris, state.settings.transfer, state.settings.ewallet][i]
  ).join(' · ')

  return (
    <section aria-label="Metode pembayaran" className="rounded-xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6">
      <h2 className="text-lg font-medium text-white">Metode pembayaran</h2>
      <p className="mt-2 text-sm text-[#c5cbd5]">
        {state.settings.configured
          ? activeMethods || 'Belum ada metode pembayaran aktif.'
          : 'Belum diatur. Kasir memakai metode pembayaran manual bawaan.'}
      </p>
      <p className="mt-2 text-xs text-[#a4a7ac]">
        Pengaturan berlaku untuk usaha ini di semua perangkat. Penerimaan pembayaran tetap diperiksa manual.
      </p>
      <button
        onClick={() => {
          state.open()
          setOpen(true)
        }}
        className="mt-4 min-h-11 rounded-lg border border-[#454d5b] px-4 text-sm font-medium text-[#24cbc5] hover:border-[#24cbc5] transition-colors"
      >
        Atur pembayaran
      </button>

      {open && (
        <Modal title="Atur pembayaran" pending={state.pending} close={close}>
          <fieldset disabled={state.pending || state.uncertain}>
            <PaymentsModal
              payments={state.draft}
              setPayments={state.setDraft}
              save={save}
              error={state.error}
              cancel={close}
            />
          </fieldset>
        </Modal>
      )}

      {!onNotify && <ToastNotification toast={fallbackToast.toast} onClose={fallbackToast.hideToast} />}
    </section>
  )
}
