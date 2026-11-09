'use client'

import React, { useEffect, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { ModalFrame } from './ui/modal-frame'
import { User, UserPlus, X } from 'lucide-react'
import { CustomSelect, type CustomSelectOption } from '@/components/ui/custom-select'
import { saveCustomer } from '@/app/customer-actions'
import { CustomerSearch } from './customer-search'
import { customerSchema, normalizeCustomerPhone, type PosCustomer } from '@/lib/customers'
import type { Member } from '@/lib/validation'
import { hasPermission } from '@/lib/auth/rbac'

interface PosCustomerPickerProps {
  value: PosCustomer | null
  onChange: (v: PosCustomer | null) => void
  member?: Member
  addLabel?: string
}

export default function PosCustomerPicker({ value, onChange, member, addLabel = 'Tambah pelanggan' }: PosCustomerPickerProps) {
  const [category, setCategory] = useState<'non-pelanggan' | 'pelanggan'>(value ? 'pelanggan' : 'non-pelanggan')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (value) {
      setCategory('pelanggan')
    }
  }, [value])

  const categoryOptions: CustomSelectOption[] = [
    { value: 'non-pelanggan', label: 'Non pelanggan' },
    { value: 'pelanggan', label: 'Pelanggan' },
  ]

  const handleCategoryChange = (val: string) => {
    if (val === 'non-pelanggan') {
      setCategory('non-pelanggan')
      onChange(null)
    } else {
      setCategory('pelanggan')
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <label className="text-xs font-normal text-[#c5cbd5]" htmlFor="customer">
          Pelanggan
        </label>
        {member && hasPermission(member.role, member.permissions, 'customers:view') && hasPermission(member.role, member.permissions, 'customers:create') && <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#1835d9] bg-[#1835d9]/10 px-2.5 py-1 text-xs font-normal text-[#24cbc5] hover:bg-[#1835d9]/25 hover:border-[#2b4af5] hover:text-white transition-all cursor-pointer shadow-xs"
        >
          <UserPlus className="size-3.5" />
          <span>{addLabel}</span>
        </button>}
      </div>

      <CustomSelect
        id="customer"
        ariaLabel="Pilih kategori pelanggan POS"
        value={category}
        options={categoryOptions}
        onChange={handleCategoryChange}
        size="sm"
        className="mt-1.5 w-full"
      />

      {category === 'non-pelanggan' ? (
        <p aria-live="polite" className="mt-1 text-xs text-[#a4a7ac]">
          Transaksi dicatat untuk non pelanggan.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {value ? (
            <div className="flex items-center justify-between rounded-xl border border-[#24cbc5]/30 bg-[#24cbc5]/10 p-2.5 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#24cbc5]/20 text-[#24cbc5]">
                  <User className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{value.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {value.phone ? (
                      <span className="truncate text-[#24cbc5]">{value.phone}</span>
                    ) : (
                      <span className="text-[#a4a7ac]">Tanpa nomor telepon</span>
                    )}
                    <span className="text-[#454d5b]">·</span>
                    <span className="inline-flex items-center rounded-sm bg-[#24cbc5]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#24cbc5]">
                      {Number(value.points || 0)} poin
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#273242] hover:text-[#ffb4ae] transition-colors"
                title="Batalkan pilihan member"
                aria-label="Batalkan pilihan member"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          <CustomerSearch initiallyOpen={!value} onSelect={onChange} />
        </div>
      )}

      {toast && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-[#24cbc5]/10 px-3 py-2 text-xs text-[#24cbc5]">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast('')}
            className="ml-2 text-[#24cbc5] hover:opacity-80"
            aria-label="Tutup notifikasi"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {showModal && createPortal(
        <AddCustomerModal
          title={addLabel}
          member={member}
          onClose={() => setShowModal(false)}
          onSuccess={newCustomer => {
            setCategory('pelanggan')
            onChange(newCustomer)
            setShowModal(false)
            setToast(`Pelanggan ${newCustomer.name} berhasil didaftarkan dan dipilih.`)
          }}
        />, document.body
      )}
    </>
  )
}

function AddCustomerModal({
  title,
  member,
  onClose,
  onSuccess,
}: {
  title: string
  member?: Member
  onClose: () => void
  onSuccess: (customer: PosCustomer) => void
}) {
  const fieldId = useId()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const isCashier = member?.role === 'cashier'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (saving || isCashier) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Nama pelanggan wajib diisi.')
      return
    }

    let normalizedPhone = ''
    try {
      normalizedPhone = normalizeCustomerPhone(phone)
    } catch (err) {
      setFormError((err as Error).message)
      return
    }

    const details = {
      name: trimmedName,
      phone: normalizedPhone,
      notes: notes.trim(),
      active: true,
    }

    const parsed = customerSchema.safeParse(details)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Data pelanggan tidak valid.')
      return
    }

    const customerId = crypto.randomUUID()
    const reqId = crypto.randomUUID()
    const formData = new FormData()
    formData.set('id', customerId)
    formData.set('revision', '')
    formData.set('request', reqId)
    formData.set('details', JSON.stringify(parsed.data))

    setSaving(true)
    setFormError('')

    try {
      const result = await saveCustomer(formData)
      if (result.error) {
        setFormError(result.error)
        setSaving(false)
        return
      }
      if (result.customer) {
        onSuccess({
          id: result.customer.id,
          name: result.customer.name,
          phone: result.customer.phone,
          points: result.customer.points ?? 0,
        })
      } else {
        setFormError('Pelanggan belum dapat disimpan. Coba lagi.')
      }
    } catch {
      setFormError('Gagal mendaftarkan pelanggan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame onDismiss={onClose} busy={saving}
      role="dialog"
      aria-modal="true"
      aria-labelledby={fieldId+'-title'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 border-b border-[#454d5b] pb-3">
          <div>
            <h3 id={fieldId+'-title'} className="text-base font-semibold text-white">
              {title}
            </h3>
            <p className="mt-1 text-xs text-[#a4a7ac]">
              Daftarkan pelanggan langsung dari kasir untuk transaksi ini.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white"
            disabled={saving}
            aria-label="Tutup formulir"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {isCashier && (
            <div className="rounded-lg bg-[#4a252b] p-3 text-xs text-[#ffb4ae]">
              Perhatian: Pendaftaran member baru memerlukan hak akses Pemilik atau Admin toko.
            </div>
          )}

          <div>
            <label htmlFor={fieldId+'-name'} className="block text-xs font-normal text-[#c5cbd5]">
              Nama pelanggan <span className="text-[#24cbc5]">*</span>
            </label>
            <input
              id={fieldId+'-name'}
              required
              autoFocus
              maxLength={100}
              value={name}
              disabled={saving || isCashier}
              onChange={e => setName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="mt-1 h-9 w-full rounded-lg border border-[#454d5b] bg-[#1c222e] px-3 text-sm text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5] disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor={fieldId+'-phone'} className="block text-xs font-normal text-[#c5cbd5]">
              Nomor telepon (opsional)
            </label>
            <input
              id={fieldId+'-phone'}
              type="tel"
              maxLength={40}
              value={phone}
              disabled={saving || isCashier}
              onChange={e => setPhone(e.target.value)}
              placeholder="08… atau +62…"
              className="mt-1 h-9 w-full rounded-lg border border-[#454d5b] bg-[#1c222e] px-3 text-sm text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5] disabled:opacity-50"
            />
            <p className="mt-1 text-[11px] text-[#a4a7ac]">
              Format: 0812... atau kode negara +62812...
            </p>
          </div>

          <div>
            <label className="block text-xs font-normal text-[#c5cbd5]">
              Catatan (opsional)
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={notes}
              disabled={saving || isCashier}
              onChange={e => setNotes(e.target.value)}
              placeholder="Preferensi atau info pelanggan..."
              className="mt-1 w-full rounded-lg border border-[#454d5b] bg-[#1c222e] px-3 py-2 text-sm text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5] disabled:opacity-50"
            />
          </div>

          {formError && (
            <div role="alert" className="rounded-lg bg-[#4a252b] p-2.5 text-xs text-[#ffb4ae]">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl border border-[#454d5b] px-4 py-2 text-xs font-normal text-[#c5cbd5] hover:bg-[#303640]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || isCashier}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1835d9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132c9e] disabled:opacity-40"
            >
              <UserPlus className="size-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan & Pilih'}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  )
}
