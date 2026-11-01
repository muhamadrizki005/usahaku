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

  return (
    <section aria-label="Metode pembayaran" className="rounded-xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">Metode pembayaran</h2>
      </div>

      {state.settings.configured ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {state.settings.cash && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#454d5b] bg-[#1c222e] px-2.5 py-1 text-xs text-[#24cbc5]">
                <span className="size-1.5 rounded-full bg-[#24cbc5]" />
                Tunai
              </span>
            )}
            {state.settings.qris && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#454d5b] bg-[#1c222e] px-2.5 py-1 text-xs text-[#24cbc5]">
                <span className="size-1.5 rounded-full bg-[#24cbc5]" />
                QRIS usaha
              </span>
            )}
            {state.settings.transfer && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#454d5b] bg-[#1c222e] px-2.5 py-1 text-xs text-[#24cbc5]">
                <span className="size-1.5 rounded-full bg-[#24cbc5]" />
                Transfer bank ({state.settings.banks.length})
              </span>
            )}
            {state.settings.ewallet && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#454d5b] bg-[#1c222e] px-2.5 py-1 text-xs text-[#24cbc5]">
                <span className="size-1.5 rounded-full bg-[#24cbc5]" />
                E-wallet ({(state.settings.ewallets || []).length})
              </span>
            )}
            {!state.settings.cash && !state.settings.qris && !state.settings.transfer && !state.settings.ewallet && (
              <span className="text-xs text-[#a4a7ac]">Belum ada metode pembayaran yang diaktifkan.</span>
            )}
          </div>

          {state.settings.qris && state.settings.qrisImage && (
            <div className="flex items-center gap-3 rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 text-xs">
              <img
                src={state.settings.qrisImage}
                alt="Preview QRIS"
                className="size-14 rounded-lg bg-white object-contain p-1 shrink-0"
              />
              <div>
                <p className="font-medium text-white">QRIS usaha aktif</p>
                <p className="mt-0.5 text-[#a4a7ac]">Gambar kode QRIS siap ditampilkan pada saat transaksi kasir.</p>
              </div>
            </div>
          )}

          {state.settings.transfer && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[#c5cbd5]">Daftar rekening bank:</p>
              {state.settings.banks.length > 0 ? (
                <div className="space-y-1.5">
                  {state.settings.banks.map((b, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#454d5b]/60 bg-[#1c222e] px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-white">{b.bank}</span>
                        <span className="mx-1.5 text-[#454d5b]">·</span>
                        <span className="font-mono text-[#24cbc5]">{b.account}</span>
                      </div>
                      <span className="text-[#a4a7ac] truncate">a.n. {b.holder}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#a4a7ac] italic">Belum ada nomor rekening terdaftar.</p>
              )}
            </div>
          )}

          {state.settings.ewallet && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[#c5cbd5]">Daftar akun e-wallet:</p>
              {(state.settings.ewallets || []).length > 0 ? (
                <div className="space-y-1.5">
                  {(state.settings.ewallets || []).map((ew, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#454d5b]/60 bg-[#1c222e] px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-white">{ew.ewallet}</span>
                        <span className="mx-1.5 text-[#454d5b]">·</span>
                        <span className="font-mono text-[#24cbc5]">{ew.number}</span>
                      </div>
                      <span className="text-[#a4a7ac] truncate">a.n. {ew.holder}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#a4a7ac] italic">Belum ada akun e-wallet terdaftar.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#c5cbd5]">
          Belum diatur. Kasir memakai metode pembayaran manual bawaan.
        </p>
      )}

      <p className="mt-3 text-xs text-[#a4a7ac]">
        Pengaturan berlaku untuk usaha ini di semua perangkat. Penerimaan pembayaran tetap diperiksa manual.
      </p>

      <button
        onClick={() => {
          state.open()
          setOpen(true)
        }}
        className="mt-4 min-h-11 rounded-lg border border-[#454d5b] px-4 text-sm font-medium text-[#24cbc5] hover:border-[#24cbc5] transition-colors cursor-pointer"
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
