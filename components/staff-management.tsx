'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  Crown,
  KeyRound,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { StaffForm, StaffActions } from '@/components/account-forms'
import { roleNames } from '@/lib/auth/permissions'
import type { Member } from '@/lib/validation'

interface StaffManagementProps {
  members: Member[]
  business?: {
    code: string
    name?: string
  }
}

export function StaffManagement({ members, business }: StaffManagementProps) {
  const [staffForm, setStaffForm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'cashier'>('all')

  const copyStoreCode = () => {
    if (!business?.code) return
    navigator.clipboard?.writeText(business.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const owner = members.find(m => m.role === 'owner') || {
    id: 'owner',
    name: 'Pemilik usaha',
    role: 'owner' as const,
    active: true,
  }

  const staffMembers = members.filter(m => m.role !== 'owner')

  const filteredStaff = staffMembers.filter(person => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      person.name.toLowerCase().includes(q) ||
      (person.username && person.username.toLowerCase().includes(q))
    const matchesRole = filterRole === 'all' || person.role === filterRole
    return matchesSearch && matchesRole
  })

  const adminCount = staffMembers.filter(m => m.role === 'admin').length
  const cashierCount = staffMembers.filter(m => m.role === 'cashier').length
  const activeCount = staffMembers.filter(m => m.active).length

  return (
    <div className="space-y-6">
      {/* Top Header & Store Code */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-[#a4a7ac]">
            <span>{business?.name || 'Usahaku'}</span>
            <span className="text-white/30">›</span>
            <span className="font-medium text-[#24cbc5]">Staf & akses</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Staf & akses
          </h1>
          <p className="mt-1 text-sm text-[#a4a7ac]">
            Atur siapa saja yang dapat mengakses dan mengelola usaha Anda.
          </p>
          <p className="mt-3 text-xs text-[#a4a7ac]">
            {members.length} anggota terdaftar • {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })} • WIB
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {business?.code && (
            <div className="flex items-center gap-2 rounded-xl border border-[#454d5b] bg-[#273242] px-3.5 py-2 text-xs shadow-sm">
              <KeyRound className="size-4 text-[#24cbc5]" />
              <span className="text-[#a4a7ac]">Kode toko:</span>
              <strong className="text-sm tracking-wider text-white">
                {business.code}
              </strong>
              <button
                type="button"
                onClick={copyStoreCode}
                className="ml-1 rounded-md p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors"
                title="Salin kode toko"
                aria-label="Salin kode toko"
              >
                {copied ? <Check className="size-3.5 text-[#24cbc5]" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStaffForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1835d9] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#132c9e] transition-colors"
          >
            <UserPlus className="size-4" />
            <span>Tambah staf</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#a4a7ac]">
            <Users className="size-4 text-[#24cbc5]" />
            <span className="text-xs font-normal">Total Anggota</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-white">{members.length}</p>
          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">Termasuk pemilik toko</p>
        </div>

        <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#a4a7ac]">
            <ShieldCheck className="size-4 text-[#93c5fd]" />
            <span className="text-xs font-normal">Admin Toko</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-white">{adminCount}</p>
          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">Akses kelola katalog & inventori</p>
        </div>

        <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#a4a7ac]">
            <CreditCard className="size-4 text-[#24cbc5]" />
            <span className="text-xs font-normal">Petugas Kasir</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-white">{cashierCount}</p>
          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">Akses penjualan & struk POS</p>
        </div>

        <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#a4a7ac]">
            <span className="size-2 rounded-full bg-[#24cbc5]" />
            <span className="text-xs font-normal">Staf Aktif</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-white">{activeCount}</p>
          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">Dapat login ke sistem</p>
        </div>
      </div>

      {/* Owner Card */}
      <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Crown className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-white">{owner.name}</h2>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/20">
                  Pemilik usaha
                </span>
              </div>
              <p className="mt-1 text-xs text-[#a4a7ac]">
                Owner (Pemilik) • Akses penuh ke seluruh pengaturan usaha, katalog, staf, dan laporan keuangan.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start rounded-xl border border-[#454d5b] bg-[#1c222e] px-3 py-1.5 text-xs text-[#c5cbd5] sm:self-center">
            <span className="size-2 rounded-full bg-[#24cbc5]" />
            <span>Akun Utama</span>
          </div>
        </div>
      </div>

      {/* Staff Operational Section */}
      <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#454d5b] pb-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Staf Operasional ({staffMembers.length})
            </h2>
            <p className="mt-0.5 text-xs text-[#a4a7ac]">
              Kelola status akun staf atau lakukan reset kata sandi sementara.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-2.5 size-4 text-[#a4a7ac]" />
              <input
                aria-label="Cari staf"
                placeholder="Cari nama atau username..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-[#454d5b] bg-[#1c222e] pl-9 pr-3 text-xs text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5]"
              />
            </div>
            <div className="flex gap-1 rounded-xl border border-[#454d5b] bg-[#1c222e] p-1">
              {(['all', 'admin', 'cashier'] as const).map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setFilterRole(role)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-normal transition-colors ${
                    filterRole === role
                      ? 'bg-[#1835d9] text-white'
                      : 'text-[#c5cbd5] hover:text-white'
                  }`}
                >
                  {role === 'all' ? 'Semua' : role === 'admin' ? 'Admin' : 'Kasir'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Staff Cards */}
        <div className="mt-4 space-y-3">
          {filteredStaff.length > 0 ? (
            filteredStaff.map(person => (
              <div
                key={person.id}
                data-testid={`staff-${person.username}`}
                className="flex flex-col gap-3 rounded-xl border border-[#454d5b] bg-[#1c222e] p-4 transition-all hover:border-[#24cbc5]/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#273242] text-sm font-semibold text-white border border-[#454d5b]">
                    {person.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {person.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                          person.role === 'admin'
                            ? 'bg-[#1835d9]/15 text-[#93c5fd] border-[#1835d9]/40'
                            : 'bg-[#24cbc5]/10 text-[#24cbc5] border-[#24cbc5]/30'
                        }`}
                      >
                        {roleNames[person.role] || person.role}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[#a4a7ac]">
                      <span className="text-[#c5cbd5]">@{person.username}</span>
                      <span className="mx-1.5">•</span>
                      <span
                        className={
                          !person.active
                            ? 'font-medium text-rose-400'
                            : person.must_change_password
                            ? 'font-medium text-amber-400'
                            : 'font-medium text-[#24cbc5]'
                        }
                      >
                        {!person.active
                          ? 'Nonaktif'
                          : person.must_change_password
                          ? 'Wajib ganti kata sandi'
                          : 'Aktif'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <StaffActions member={person} />
                </div>
              </div>
            ))
          ) : (
            <div className="grid place-items-center rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e] p-8 text-center">
              <Users className="size-8 text-[#a4a7ac]" />
              <p className="mt-2 text-sm font-medium text-white">
                {search.trim() || filterRole !== 'all'
                  ? 'Tidak ada staf yang cocok dengan pencarian'
                  : 'Belum ada staf terdaftar'}
              </p>
              <p className="mt-1 text-xs text-[#a4a7ac]">
                {search.trim() || filterRole !== 'all'
                  ? 'Coba gunakan kata kunci pencarian atau filter yang berbeda.'
                  : 'Tambahkan kasir atau admin toko untuk membantu operasional harian usaha.'}
              </p>
              {!search.trim() && filterRole === 'all' && (
                <button
                  type="button"
                  onClick={() => setStaffForm(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#1835d9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132c9e]"
                >
                  <UserPlus className="size-3.5" />
                  <span>Tambah staf</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Back button */}
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-[#454d5b] bg-[#273242] px-4 py-2.5 text-sm font-normal text-[#c5cbd5] hover:bg-[#303640] hover:text-white transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali</span>
        </Link>
      </div>

      {/* Modal Tambah Staf */}
      {staffForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-start justify-between border-b border-[#454d5b] pb-3">
              <div>
                <h3 id="staff-modal-title" className="text-lg font-semibold text-white">
                  Tambah Staf Baru
                </h3>
                <p className="mt-1 text-xs text-[#a4a7ac]">
                  Buat akun akses operasional untuk kasir atau admin toko Anda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStaffForm(false)}
                className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors"
                aria-label="Tutup formulir"
              >
                <X className="size-5" />
              </button>
            </div>

            <StaffForm disabled={false} onCancel={() => setStaffForm(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
