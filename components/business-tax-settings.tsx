'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ReceiptText } from 'lucide-react'
import {
  type CustomTaxItem,
  getBusinessTaxes,
  saveBusinessTaxes,
  calculateCustomTaxes,
} from '@/lib/business-taxes'
import { showSuccessToast, showErrorToast } from '@/lib/notifications'
import type { Business } from '@/lib/validation'

interface Props {
  business: Business
  canManage?: boolean
  onSaved?: (taxes: CustomTaxItem[]) => void
}

export default function BusinessTaxSettings({
  business,
  canManage = true,
  onSaved,
}: Props) {
  const [taxes, setTaxes] = useState<CustomTaxItem[]>(() =>
    getBusinessTaxes(business.id, business.category, business.tax_rate || 0)
  )
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setTaxes(getBusinessTaxes(business.id, business.category, business.tax_rate || 0))
  }, [business.id, business.category, business.tax_rate])

  const updateTax = (id: string, updates: Partial<CustomTaxItem>) => {
    setTaxes(prev =>
      prev.map(t => (t.id === id ? { ...t, ...updates } : t))
    )
  }

  const addCustomTax = () => {
    const newTax: CustomTaxItem = {
      id: crypto.randomUUID(),
      name: 'Pajak Kustom',
      rate: 5,
      enabled: true,
      isService: false,
    }
    setTaxes(prev => [...prev, newTax])
  }

  const removeTax = (id: string) => {
    setTaxes(prev => prev.filter(t => t.id !== id))
  }

  const handleSave = () => {
    if (!canManage) return
    setSaving(true)
    setNotice('')

    try {
      saveBusinessTaxes(business.id, taxes)
      showSuccessToast('Pengaturan pajak usaha berhasil disimpan.')
      setNotice('Pengaturan pajak berhasil disimpan.')
      onSaved?.(taxes)
    } catch {
      showErrorToast('Gagal menyimpan pengaturan pajak.')
    } finally {
      setSaving(false)
    }
  }

  // Simulation on Rp100.000
  const simSubtotal = 100000
  const calculated = calculateCustomTaxes(simSubtotal, taxes)
  const totalTax = calculated.reduce((sum, t) => sum + t.amount, 0)
  const simTotal = simSubtotal + totalTax

  return (
    <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm transition-all duration-300">
      <div className="flex items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-[#24cbc5]/15 text-[#24cbc5]">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Pengaturan Pajak Usaha</h2>
            <p className="mt-0.5 text-xs text-[#a4a7ac]">
              Kelola pajak utama, pajak pelayanan, atau pajak kustom yang berlaku pada transaksi kasir.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div className="mt-3.5 rounded-lg bg-[#24cbc5]/15 px-3 py-2 text-xs font-medium text-[#24cbc5]">
          {notice}
        </div>
      )}

      {/* Tax Items List */}
      <div className="mt-5 space-y-4">
        {taxes.map((t, idx) => (
          <div
            key={t.id}
            className="flex flex-col gap-3 rounded-xl border border-[#454d5b]/80 bg-[#1c222e] p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={t.enabled}
                onClick={() => updateTax(t.id, { enabled: !t.enabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] ${t.enabled ? 'bg-[#24cbc5]' : 'bg-[#303640] border-[#454d5b]'
                  }`}
                aria-label={`Aktifkan ${t.name}`}
              >
                <span
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${t.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>

              {/* Tax Name (Editable for custom taxes, static for default) */}
              <div className="min-w-0 flex-1">
                {idx < 2 ? (
                  <div>
                    <span className="text-sm font-medium text-white">{t.name}</span>
                    <p className="text-[11px] text-[#a4a7ac]">
                      {t.isService
                        ? 'Dikenakan sebagai biaya pelayanan / servis'
                        : 'Pajak standar yang ditambahkan ke total transaksi'}
                    </p>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={t.name}
                    onChange={e => updateTax(t.id, { name: e.target.value })}
                    placeholder="Nama jenis pajak..."
                    className="h-8 w-full max-w-[220px] rounded-lg border border-[#454d5b] bg-[#273242] px-2.5 text-xs text-white placeholder:text-[#a4a7ac] outline-none focus:border-[#24cbc5]"
                  />
                )}
              </div>
            </div>

            {/* Tax Rate & Actions */}
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={t.rate}
                  onChange={e =>
                    updateTax(t.id, {
                      rate: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  disabled={!t.enabled}
                  className="h-8 w-16 rounded-lg border border-[#454d5b] bg-[#273242] px-2 text-center text-xs font-semibold text-white outline-none focus:border-[#24cbc5] disabled:opacity-40"
                />
                <span className="text-xs font-semibold text-[#c5cbd5]">%</span>
              </div>

              {/* Delete button only for custom items beyond default */}
              {idx >= 2 && (
                <button
                  type="button"
                  onClick={() => removeTax(t.id)}
                  aria-label={`Hapus ${t.name}`}
                  title="Hapus jenis pajak"
                  className="grid size-8 place-items-center rounded-lg bg-red-500/15 text-[#ffb4ae] hover:bg-red-500/25 transition border-0 cursor-pointer shrink-0"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add custom tax button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={addCustomTax}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#24cbc5] hover:text-[#5eead4] transition cursor-pointer border-0 bg-transparent"
          >
            <Plus className="size-4" />
            <span>Tambah jenis pajak kustom</span>
          </button>
        </div>
      </div>

      {/* Simulation Box */}
      <div className="mt-5 overflow-hidden rounded-xl border border-[#454d5b]/80 bg-[#1c222e]">
        <div className="border-b border-[#454d5b]/80 bg-[#273242]/70 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-[#a4a7ac]">
          Simulasi Penerapan Pajak pada Transaksi Kasir
        </div>
        <div className="p-3.5 space-y-2 text-xs">
          <div className="flex justify-between text-[#c5cbd5]">
            <span>Subtotal Transaksi (Contoh)</span>
            <span className="font-medium text-white">Rp{simSubtotal.toLocaleString('id-ID')}</span>
          </div>

          {calculated.map(c => (
            <div key={c.id} className="flex justify-between text-[#24cbc5]">
              <span>
                {c.name} ({c.rate}%)
              </span>
              <span>+Rp{c.amount.toLocaleString('id-ID')}</span>
            </div>
          ))}

          {calculated.length === 0 && (
            <p className="text-[11px] text-[#a4a7ac] italic">
              Tidak ada pajak aktif. Transaksi akan dikenakan tanpa tambahan pajak.
            </p>
          )}

          <div className="flex justify-between border-t border-[#454d5b]/60 pt-2 font-bold text-white">
            <span>Total Tagihan Pelanggan</span>
            <span className="text-[#24cbc5]">Rp{simTotal.toLocaleString('id-ID')}</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      {canManage && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#132c9e] transition-colors disabled:opacity-50 border-0 cursor-pointer shadow-sm"
        >
          {saving ? 'Menyimpan...' : 'Simpan pengaturan pajak'}
        </button>
      )}
    </section>
  )
}
