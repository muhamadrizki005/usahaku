'use client'

import React, { useEffect, useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ModalFrame } from '@/components/ui/modal-frame'
import {
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  Crown,
  KeyRound,
  Search,
  ShieldCheck,
  ShieldPlus,
  Shield,
  Trash2,
  Edit3,
  UserPlus,
  Users,
  X,
  AlertTriangle,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react'
import { StaffForm, StaffActions } from '@/components/account-forms'
import {
  MODULE_DEFINITIONS,
  findBusinessRole,
  roleValue,
  rolePermissionLimit,
  toggleRolePermission,
  type BusinessRole,
  normalizeRoleKey,
  getRoleDisplayName,
} from '@/lib/auth/rbac'
import {
  createBusinessRole,
  updateBusinessRole,
  deleteBusinessRole,
} from '@/app/role-actions'
import { updateStaffRole } from '@/app/actions'
import { roleNames } from '@/lib/auth/permissions'
import type { Member } from '@/lib/validation'
import { ToastNotification, useToast } from '@/components/ui/toast-notification'
import { CustomSelect } from '@/components/ui/custom-select'

interface StaffManagementProps {
  members: Member[]
  business?: {
    code: string
    name?: string
    id?: string
  }
  initialRoles?: BusinessRole[]
  roleCounts?: Record<string, number>
}

const emptyRoleCounts: Record<string, number> = {}

export function StaffManagement({
  members,
  business,
  initialRoles = [],
  roleCounts = emptyRoleCounts,
}: StaffManagementProps) {
  const router = useRouter()
  const roleNameId = useId(), roleDescriptionId = useId()
  const [roles, setRoles] = useState<BusinessRole[]>(initialRoles)
  const [counts, setCounts] = useState<Record<string, number>>(roleCounts)
  const [staffForm, setStaffForm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')

  // Toast
  const { toast, showToast, hideToast } = useToast(3500)

  // Role Modal (Create & Edit)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<BusinessRole | null>(null)
  const [roleName, setRoleName] = useState('')
  const [roleDesc, setRoleDesc] = useState('')
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set())
  const [roleError, setRoleError] = useState('')
  const [isRolePending, startRoleTransition] = useTransition()

  // Delete Role Modal
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<BusinessRole | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [isDeletePending, startDeleteTransition] = useTransition()

  // Change Staff Role Modal
  const [changeRoleMember, setChangeRoleMember] = useState<Member | null>(null)
  const [newSelectedRole, setNewSelectedRole] = useState('')
  const [changeRoleError, setChangeRoleError] = useState('')
  const [isChangeRolePending, startChangeRoleTransition] = useTransition()

  useEffect(() => setRoles(initialRoles), [initialRoles])
  useEffect(() => setCounts(roleCounts), [roleCounts])

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
    const matchesRole =
      filterRole === 'all' ||
      person.role === filterRole ||
      normalizeRoleKey(person.role) === normalizeRoleKey(filterRole)
    return matchesSearch && matchesRole
  })

  // Open Create Role Modal
  const handleOpenCreateRole = () => {
    setEditingRole(null)
    setRoleName('')
    setRoleDesc('')
    setSelectedPerms(new Set())
    setRoleError('')
    setRoleModalOpen(true)
  }

  // Open Edit Role Modal
  const handleOpenEditRole = (role: BusinessRole) => {
    setEditingRole(role)
    setRoleName(role.name)
    setRoleDesc(role.description || '')
    setSelectedPerms(new Set(role.permissions || []))
    setRoleError('')
    setRoleModalOpen(true)
  }

  // Toggle single permission
  const handleTogglePermission = (permKey: string) => {
    setSelectedPerms(prev => toggleRolePermission(prev, permKey))
  }

  // Toggle Select All for a module
  const handleToggleModuleAll = (modulePerms: string[]) => {
    const allSelected = modulePerms.every(p => selectedPerms.has(p))
    setSelectedPerms(prev => {
      const next = new Set(prev)
      if (allSelected) {
        modulePerms.forEach(p => next.delete(p))
      } else {
        modulePerms.forEach(p => next.add(p))
      }
      return next
    })
  }

  // Save Role (Create or Update)
  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault()
    setRoleError('')

    if (!roleName.trim()) {
      setRoleError('Nama role wajib diisi.')
      return
    }

    const fd = new FormData()
    if (editingRole) {
      fd.set('id', editingRole.id)
    }
    fd.set('name', roleName.trim())
    fd.set('description', roleDesc.trim())
    fd.set('permissions', JSON.stringify(Array.from(selectedPerms)))

    startRoleTransition(async () => {
      try {
        const res = editingRole
          ? await updateBusinessRole({}, fd)
          : await createBusinessRole({}, fd)

        if (res.error) {
          setRoleError(res.error)
        } else {
          showToast('success', res.success || 'Role berhasil disimpan.')
          setRoleModalOpen(false)
          // Update local roles state
          if (res.role) {
            setRoles(prev => {
              if (editingRole) {
                return prev.map(r => (r.id === res.role.id ? res.role : r))
              } else {
                return [...prev, res.role]
              }
            })
          }
        }
      } catch (err: any) {
        setRoleError(err?.message || 'Gagal menyimpan role. Coba lagi.')
      }
    })
  }

  // Delete Role
  const handleDeleteRole = (role: BusinessRole) => {
    setDeleteRoleTarget(role)
    setDeleteError('')
  }

  const handleConfirmDelete = () => {
    if (!deleteRoleTarget) return
    setDeleteError('')

    startDeleteTransition(async () => {
      try {
        const res = await deleteBusinessRole(deleteRoleTarget.id)
        if (res.error) {
          setDeleteError(res.error)
        } else {
          showToast('success', res.success || 'Role berhasil dihapus.')
          setRoles(prev => prev.filter(r => r.id !== deleteRoleTarget.id))
          setDeleteRoleTarget(null)
        }
      } catch (err: any) {
        setDeleteError(err?.message || 'Gagal menghapus role.')
      }
    })
  }

  // Change staff role
  const handleOpenChangeRole = (member: Member) => {
    setChangeRoleMember(member)
    setNewSelectedRole(findBusinessRole(member.role, roles) ? roleValue(findBusinessRole(member.role, roles)!) : member.role)
    setChangeRoleError('')
  }

  const handleSaveStaffRole = () => {
    if (!changeRoleMember || !newSelectedRole) return
    setChangeRoleError('')

    startChangeRoleTransition(async () => {
      try {
        const res = await updateStaffRole(changeRoleMember.id, newSelectedRole)
        if (res.error) {
          setChangeRoleError(res.error)
        } else {
          showToast('success', res.success || 'Role staf berhasil diubah.')
          setChangeRoleMember(null)
          // update counts
          const newCounts: Record<string, number> = {}
          staffMembers.forEach(m => {
            const r = m.id === changeRoleMember.id ? newSelectedRole : m.role
            const k = findBusinessRole(r, roles) ? roleValue(findBusinessRole(r, roles)!) : r
            newCounts[k] = (newCounts[k] || 0) + 1
          })
          setCounts(newCounts)
          router.refresh()
        }
      } catch (err: any) {
        setChangeRoleError(err?.message || 'Gagal mengubah role staf.')
      }
    })
  }

  const activeCount = staffMembers.filter(m => m.active).length

  return (
    <div className="space-y-6">
      {/* Top Header & Store Code */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-[#a4a7ac]">
            <span>{business?.name || 'Usahaku'}</span>
            <span className="text-white/30">&gt;</span>
            <span className="font-medium text-[#24cbc5]">Staf & akses</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Staf & akses
          </h1>
          <p className="mt-1 text-sm text-[#a4a7ac]">
            Atur peran operasional (RBAC) dan batasan hak akses fitur untuk staf usaha Anda.
          </p>
          <p className="mt-3 text-xs text-[#a4a7ac]">
            {members.length} anggota terdaftar • {roles.length} role tersedia • WIB
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
                className="ml-1 rounded-md p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer"
                title="Salin kode toko"
                aria-label="Salin kode toko"
              >
                {copied ? <Check className="size-3.5 text-[#24cbc5]" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenCreateRole}
            className="inline-flex items-center gap-2 rounded-xl border border-[#1835d9] bg-[#1835d9]/10 px-4 py-2 text-sm font-semibold text-[#24cbc5] shadow-sm hover:bg-[#1835d9]/25 hover:border-[#2b4af5] hover:text-white transition-all cursor-pointer"
          >
            <ShieldPlus className="size-4" />
            <span>Tambah role</span>
          </button>

          <button
            type="button"
            onClick={() => setStaffForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1835d9] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#132c9e] transition-colors cursor-pointer"
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
            <Shield className="size-4 text-[#93c5fd]" />
            <span className="text-xs font-normal">Total Role</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-white">{roles.length}</p>
          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">Role bawaan & kustom</p>
        </div>

        <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#a4a7ac]">
            <CreditCard className="size-4 text-[#24cbc5]" />
            <span className="text-xs font-normal">Staf Operasional</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-white">{staffMembers.length}</p>
          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">Akun staf aktif terdaftar</p>
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

      {/* Role & Hak Akses Section */}
      <section aria-labelledby="roles-section-title" className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#454d5b] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-[#24cbc5]" />
              <h2 id="roles-section-title" className="text-base font-semibold text-white">
                Role & Hak Akses ({roles.length})
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#a4a7ac]">
              Tentukan fitur apa saja yang dapat diakses oleh setiap role staf operasional.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateRole}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-[#24cbc5]/30 bg-[#24cbc5]/10 px-3.5 py-1.5 text-xs font-medium text-[#24cbc5] hover:bg-[#24cbc5]/20 transition cursor-pointer"
          >
            <ShieldPlus className="size-3.5" />
            <span>Buat role kustom</span>
          </button>
        </div>

        {/* Roles Card Grid */}
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map(role => {
            const memberCount = counts[roleValue(role)] ?? 0

            return (
              <div
                key={role.id}
                data-testid={`role-card-${role.id}`}
                className="flex flex-col justify-between rounded-xl border border-[#454d5b] bg-[#1c222e] p-4.5 transition-all hover:border-[#24cbc5]/40 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white truncate">{role.name}</h3>
                    {role.is_default ? (
                      <span className="shrink-0 rounded-full border border-[#1835d9]/40 bg-[#1835d9]/15 px-2 py-0.5 text-[10px] font-medium text-[#93c5fd]">
                        Bawaan
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-[#24cbc5]/30 bg-[#24cbc5]/10 px-2 py-0.5 text-[10px] font-medium text-[#24cbc5]">
                        Kustom
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-[#a4a7ac] line-clamp-2 leading-relaxed min-h-[32px]">
                    {role.description || 'Tidak ada deskripsi.'}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-[#454d5b]/50 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[#c5cbd5]">
                      <Users className="size-3.5 text-[#a4a7ac]" />
                      <strong>{memberCount}</strong> staf
                    </span>
                    <span className="text-[#454d5b]">•</span>
                    <span className="text-[#24cbc5] font-medium">
                      {role.permissions?.length || 0} izin aktif
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-[#454d5b]/40">
                  <button
                    type="button"
                    onClick={() => handleOpenEditRole(role)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#454d5b] bg-[#273242] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#303640] hover:border-[#24cbc5] transition cursor-pointer"
                  >
                    <Edit3 className="size-3.5 text-[#24cbc5]" />
                    <span>Kelola hak akses</span>
                  </button>

                  {!role.is_default && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(role)}
                      className="inline-flex items-center gap-1 rounded-lg border border-transparent p-1.5 text-xs text-[#a4a7ac] hover:bg-[#4a252b]/50 hover:text-rose-300 transition cursor-pointer"
                      title="Hapus role"
                      aria-label={`Hapus role ${role.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

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
                Owner (Pemilik) • Akses penuh tanpa batas ke seluruh modul, keuangan, dan pengaturan usaha.
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
              Kelola status akun, ubah role penugasan, atau reset kata sandi sementara.
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
            <div className="flex flex-wrap gap-1 rounded-xl border border-[#454d5b] bg-[#1c222e] p-1">
              <button
                type="button"
                onClick={() => setFilterRole('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-normal transition-colors cursor-pointer ${
                  filterRole === 'all'
                    ? 'bg-[#1835d9] text-white'
                    : 'text-[#c5cbd5] hover:text-white'
                }`}
              >
                Semua
              </button>
              {roles.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setFilterRole(r.name)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-normal transition-colors cursor-pointer ${
                    filterRole === r.name
                      ? 'bg-[#1835d9] text-white'
                      : 'text-[#c5cbd5] hover:text-white'
                  }`}
                >
                  {r.name}
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
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium border bg-[#1835d9]/15 text-[#93c5fd] border-[#1835d9]/40">
                        {getRoleDisplayName(person.role, roles)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenChangeRole(person)}
                        className="text-[11px] text-[#24cbc5] hover:underline cursor-pointer"
                      >
                        Ubah role
                      </button>
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
                  ? 'Coba gunakan kata kunci pencarian atau filter role yang berbeda.'
                  : 'Tambahkan kasir, admin, atau role kustom untuk membantu operasional usaha.'}
              </p>
              {!search.trim() && filterRole === 'all' && (
                <button
                  type="button"
                  onClick={() => setStaffForm(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#1835d9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132c9e] cursor-pointer"
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
          className="inline-flex items-center gap-2 rounded-xl border border-[#454d5b] bg-[#273242] px-4 py-2.5 text-sm font-normal text-[#c5cbd5] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali ke dashboard</span>
        </Link>
      </div>

      {/* MODAL: Tambah Staf Baru */}
      {staffForm && (
        <ModalFrame onDismiss={() => setStaffForm(false)} busy={false}
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
                  Buat akun akses operasional dengan role yang tersedia pada usaha ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStaffForm(false)}
                className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup formulir"
              >
                <X className="size-5" />
              </button>
            </div>

            <StaffForm
              disabled={false}
              onCancel={() => setStaffForm(false)}
              availableRoles={roles}
            />
          </div>
        </ModalFrame>
      )}

      {/* MODAL: Tambah & Edit Role (RBAC) */}
      {roleModalOpen && (
        <ModalFrame onDismiss={() => setRoleModalOpen(false)} busy={isRolePending}
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
        >
          <div className="relative my-8 w-full max-w-2xl rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="mb-4 flex items-start justify-between border-b border-[#454d5b] pb-3 shrink-0">
              <div>
                <h3 id="role-modal-title" className="text-lg font-semibold text-white">
                  {editingRole
                    ? `Ubah Hak Akses: ${editingRole.name}`
                    : 'Tambah Role & Hak Akses Baru'}
                </h3>
                <p className="mt-1 text-xs text-[#a4a7ac]">
                  Tentukan modul dan batas aksi yang boleh dijalankan oleh anggota role ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup formulir role"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="flex-1 overflow-y-auto pr-1 space-y-5">
              {roleError && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {roleError}
                </div>
              )}

              {/* Role Name & Description */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={roleNameId} className="block text-xs font-medium text-[#c5cbd5]">
                    Nama Role <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id={roleNameId}
                    required
                    maxLength={60}
                    disabled={editingRole?.is_default}
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                    placeholder="Contoh: Supervisor, Staf Gudang"
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-3.5 text-xs text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5] disabled:opacity-50"
                  />
                  {editingRole?.is_default && (
                    <p className="mt-1 text-[11px] text-[#a4a7ac]">
                      Nama role bawaan sistem tidak dapat diubah.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={roleDescriptionId} className="block text-xs font-medium text-[#c5cbd5]">
                    Deskripsi Ringkas
                  </label>
                  <input
                    id={roleDescriptionId}
                    maxLength={255}
                    value={roleDesc}
                    onChange={e => setRoleDesc(e.target.value)}
                    placeholder="Contoh: Bertanggung jawab atas stok & kasir"
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-3.5 text-xs text-white placeholder-[#a4a7ac] outline-none focus:border-[#24cbc5]"
                  />
                </div>
              </div>

              {/* Module Permissions Groups */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#24cbc5]">
                    Pengaturan Hak Akses per Modul
                  </h4>
                  <span className="text-xs text-[#a4a7ac]">
                    {selectedPerms.size} izin dipilih
                  </span>
                </div>

                {MODULE_DEFINITIONS.map(mod => {
                  const modPermKeys = mod.permissions.map(p => p.key).filter(key => rolePermissionLimit(editingRole ? roleValue(editingRole) : '').includes(key))
                  const isAllSelected = modPermKeys.length > 0 && modPermKeys.every(k => selectedPerms.has(k))

                  return (
                    <div
                      key={mod.id}
                      className="rounded-xl border border-[#454d5b] bg-[#1c222e] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#454d5b]/60 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-sm font-semibold text-white">{mod.label}</h5>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#a4a7ac]">{mod.description}</p>
                        </div>

                        <button
                          type="button"
                          disabled={!modPermKeys.length}
                          onClick={() => handleToggleModuleAll(modPermKeys)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#454d5b] bg-[#273242] px-2.5 py-1 text-[11px] text-[#24cbc5] hover:bg-[#303640] transition cursor-pointer"
                        >
                          {isAllSelected ? (
                            <>
                              <CheckSquare className="size-3.5" />
                              <span>Batalkan Semua</span>
                            </>
                          ) : (
                            <>
                              <Square className="size-3.5" />
                              <span>Pilih Semua</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {mod.permissions.map(perm => {
                          const checked = selectedPerms.has(perm.key)
                          return (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition cursor-pointer ${
                                checked
                                  ? 'border-[#24cbc5]/40 bg-[#24cbc5]/10 text-white'
                                  : 'border-[#454d5b]/40 bg-[#273242]/50 text-[#c5cbd5] hover:border-[#454d5b]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!rolePermissionLimit(editingRole ? roleValue(editingRole) : '').includes(perm.key)}
                                onChange={() => handleTogglePermission(perm.key)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-white">{perm.label}</p>
                                <p className="mt-0.5 text-[10px] text-[#a4a7ac] leading-tight">
                                  {perm.description}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#454d5b] shrink-0">
                <button
                  type="button"
                  disabled={isRolePending}
                  onClick={() => setRoleModalOpen(false)}
                  className="rounded-xl border border-[#454d5b] bg-[#273242] px-4 py-2 text-xs font-normal text-[#c5cbd5] hover:bg-[#303640] transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isRolePending}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1835d9] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#132c9e] transition disabled:opacity-50 cursor-pointer"
                >
                  {isRolePending ? (
                    'Menyimpan...'
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      <span>{editingRole ? 'Perbarui Hak Akses' : 'Simpan Role Baru'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </ModalFrame>
      )}

      {/* MODAL: Konfirmasi Hapus Role */}
      {deleteRoleTarget && (
        <ModalFrame onDismiss={() => setDeleteRoleTarget(null)} busy={isDeletePending}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-role-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-start justify-between border-b border-[#454d5b] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="size-5" />
                <h3 id="delete-role-modal-title" className="text-base font-semibold text-white">
                  Hapus Role Kustom
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteRoleTarget(null)}
                className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup konfirmasi"
              >
                <X className="size-5" />
              </button>
            </div>

            {deleteError && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {deleteError}
              </div>
            )}

            {(() => {
              const assignedCount = counts[roleValue(deleteRoleTarget)] ?? 0

              if (assignedCount > 0) {
                return (
                  <div className="space-y-4">
                    <p className="text-xs text-[#c5cbd5] leading-relaxed">
                      Role <strong className="text-white">"{deleteRoleTarget.name}"</strong> sedang
                      digunakan oleh <strong className="text-rose-400">{assignedCount} anggota staf</strong>.
                    </p>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 leading-relaxed">
                      Demi keamanan konsistensi akses staf, role yang masih memiliki anggota tidak dapat
                      dihapus. Silakan ubah role staf tersebut terlebih dahulu.
                    </div>
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteRoleTarget(null)}
                        className="rounded-xl bg-[#1835d9] px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-[#132c9e]"
                      >
                        Mengerti
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div className="space-y-4">
                  <p className="text-xs text-[#c5cbd5] leading-relaxed">
                    Apakah Anda yakin ingin menghapus role <strong className="text-white">"{deleteRoleTarget.name}"</strong>?
                    Role ini tidak sedang digunakan oleh staf manapun. Tindakan ini tidak dapat dibatalkan.
                  </p>
                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={isDeletePending}
                      onClick={() => setDeleteRoleTarget(null)}
                      className="rounded-xl border border-[#454d5b] bg-[#273242] px-4 py-2 text-xs font-normal text-[#c5cbd5] hover:bg-[#303640] transition cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={isDeletePending}
                      onClick={handleConfirmDelete}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition disabled:opacity-50 cursor-pointer"
                    >
                      {isDeletePending ? 'Menghapus...' : 'Hapus Role'}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </ModalFrame>
      )}

      {/* MODAL: Ubah Role Staf */}
      {changeRoleMember && (
        <ModalFrame onDismiss={() => setChangeRoleMember(null)} busy={isChangeRolePending}
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-role-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-start justify-between border-b border-[#454d5b] pb-3">
              <div>
                <h3 id="change-role-modal-title" className="text-base font-semibold text-white">
                  Ubah Role Staf
                </h3>
                <p className="mt-1 text-xs text-[#a4a7ac]">
                  Ubah penugasan role untuk <strong className="text-white">{changeRoleMember.name}</strong> (@{changeRoleMember.username}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChangeRoleMember(null)}
                className="rounded-lg p-1 text-[#a4a7ac] hover:bg-[#303640] hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <X className="size-5" />
              </button>
            </div>

            {changeRoleError && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {changeRoleError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#c5cbd5]">
                  Pilih Role Baru
                </label>
                <CustomSelect
                  ariaLabel="Pilih role baru"
                  value={newSelectedRole}
                  options={roles.map(r => ({ value: roleValue(r), label: r.name }))}
                  onChange={val => setNewSelectedRole(val)}
                  className="mt-1.5 w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isChangeRolePending}
                  onClick={() => setChangeRoleMember(null)}
                  className="rounded-xl border border-[#454d5b] bg-[#273242] px-4 py-2 text-xs font-normal text-[#c5cbd5] hover:bg-[#303640] transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isChangeRolePending}
                  onClick={handleSaveStaffRole}
                  className="rounded-xl bg-[#1835d9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132c9e] transition disabled:opacity-50 cursor-pointer"
                >
                  {isChangeRolePending ? 'Menyimpan...' : 'Simpan Role'}
                </button>
              </div>
            </div>
          </div>
        </ModalFrame>
      )}

      {/* Toast Notification */}
      <ToastNotification toast={toast} onClose={hideToast} />
    </div>
  )
}
