'use client'

import { useState, useTransition, useId } from 'react'
import Link from 'next/link'
import {
  User,
  Shield,
  KeyRound,
  Building2,
  Calendar,
  Mail,
  Phone,
  Eye,
  EyeOff,
  LogOut,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Info,
  BadgeCheck,
} from 'lucide-react'
import { UsahakuLogo } from '@/components/usahaku-logo'
import { ProfileAvatarEditor } from './profile-avatar-editor'
import { updateAccountProfile, updateAccountPassword, signOut } from '@/app/actions'
import { roleNames, homeForRole, type Role } from '@/lib/auth/permissions'
import type { Business, Member } from '@/lib/validation'

interface AccountSettingsViewProps {
  user: {
    id: string
    email?: string
    phone?: string
    created_at?: string
    app_metadata?: {
      account_type?: string
      provider?: string
      providers?: string[]
    }
    user_metadata?: {
      full_name?: string
      name?: string
      phone?: string
      avatar_url?: string
    }
  }
  member: Member | null
  business: Business | null
  registeredDateFormatted: string
  backHref: string
  backLabel: string
}

type TabType = 'personal' | 'security' | 'account' | 'session'

export function AccountSettingsView({
  user,
  member,
  business,
  registeredDateFormatted,
  backHref,
  backLabel,
}: AccountSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('personal')
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(
    user.user_metadata?.avatar_url || null
  )

  // Profile Form State
  const [name, setName] = useState(
    user.user_metadata?.full_name || user.user_metadata?.name || member?.name || ''
  )
  const [phone, setPhone] = useState(
    user.user_metadata?.phone || user.phone || ''
  )
  const [profilePending, startProfileTransition] = useTransition()
  const [profileFeedback, setProfileFeedback] = useState<{
    error?: string
    success?: string
  } | null>(null)

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [passwordPending, startPasswordTransition] = useTransition()
  const [passwordFeedback, setPasswordFeedback] = useState<{
    error?: string
    success?: string
  } | null>(null)

  // Logout State
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [logoutPending, startLogoutTransition] = useTransition()

  // Copy ID state
  const [copiedId, setCopiedId] = useState(false)

  // IDs for accessibility
  const nameInputId = useId()
  const phoneInputId = useId()
  const emailInputId = useId()
  const currentPassId = useId()
  const newPassId = useId()
  const confirmPassId = useId()

  const displayName = name || 'Pengguna'
  const displayRole = member?.role
    ? roleNames[member.role]
    : user.app_metadata?.account_type === 'staff'
    ? 'Staf Usaha'
    : 'Pemilik Usaha'

  const isActive = member ? member.active : true

  // Password Validation
  const hasMinLength = newPassword.length >= 10
  const hasLetter = /[a-zA-Z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmation
  const isPasswordValid = hasMinLength && hasLetter && hasNumber && passwordsMatch

  // Handle Profile Update
  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setProfileFeedback(null)

    if (name.trim().length < 2) {
      setProfileFeedback({ error: 'Nama lengkap minimal 2 karakter.' })
      return
    }

    const formData = new FormData()
    formData.set('name', name.trim())
    formData.set('phone', phone.trim())

    startProfileTransition(async () => {
      const res = await updateAccountProfile({}, formData)
      if (res.error) {
        setProfileFeedback({ error: res.error })
      } else {
        setProfileFeedback({ success: res.success || 'Profil berhasil diperbarui.' })
      }
    })
  }

  // Handle Password Update
  const handlePasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPasswordFeedback(null)

    if (!currentPassword) {
      setPasswordFeedback({ error: 'Masukkan kata sandi saat ini atau sementara.' })
      return
    }

    if (!isPasswordValid) {
      setPasswordFeedback({
        error: 'Kata sandi baru belum memenuhi persyaratan keamanan.',
      })
      return
    }

    const formData = new FormData()
    formData.set('currentPassword', currentPassword)
    formData.set('password', newPassword)
    formData.set('confirmation', confirmation)

    startPasswordTransition(async () => {
      const res = await updateAccountPassword({}, formData)
      if (res.error) {
        setPasswordFeedback({ error: res.error })
      } else {
        setPasswordFeedback({ success: res.success || 'Kata sandi berhasil diperbarui.' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmation('')
      }
    })
  }

  // Handle Logout
  const handleLogout = () => {
    startLogoutTransition(async () => {
      await signOut()
    })
  }

  // Handle Copy User ID
  const handleCopyId = () => {
    navigator.clipboard.writeText(user.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  return (
    <main className="landing-page relative min-h-screen overflow-x-clip text-white pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1c222e]/85 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Usahaku beranda">
            <UsahakuLogo />
          </Link>

          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#273242]/80 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#c5cbd5] transition hover:bg-[#303640] hover:text-[#24cbc5]"
          >
            <ArrowLeft className="size-4" />
            <span>{backLabel}</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">
        {/* Page Title */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                Pengaturan Akun & Profil
              </h1>
              <p className="mt-1.5 text-sm text-[#c5cbd5]">
                Kelola foto profil, informasi pribadi, keamanan kata sandi, dan status akun Anda.
              </p>
            </div>

            {/* Quick Status Pill */}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#273242] px-3.5 py-1.5 text-xs text-[#c5cbd5]">
              <span
                className={`size-2 rounded-full ${
                  isActive ? 'bg-[#24cbc5] shadow-[0_0_8px_#24cbc5]' : 'bg-red-400'
                }`}
              />
              <span>Akses {isActive ? 'Aktif' : 'Dinonaktifkan'}</span>
            </div>
          </div>
        </div>

        {/* Hero Profile Overview Card */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-[#273242] p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Interactive Circular Avatar Editor */}
            <ProfileAvatarEditor
              currentAvatarUrl={currentAvatarUrl}
              userName={displayName}
              onAvatarChange={(newUrl) => setCurrentAvatarUrl(newUrl)}
              size="hero"
            />

            {/* Profile Overview Details */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className="text-xl sm:text-2xl font-semibold text-white">
                  {displayName}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#24cbc5]/15 border border-[#24cbc5]/30 px-2.5 py-0.5 text-xs font-medium text-[#24cbc5]">
                  <BadgeCheck className="size-3.5" />
                  {displayRole}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-y-2 gap-x-5 text-xs text-[#c5cbd5]">
                {user.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5 text-[#24cbc5]" />
                    {user.email}
                  </span>
                )}
                {phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5 text-[#24cbc5]" />
                    {phone}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[#a4a7ac]">
                    <Phone className="size-3.5" />
                    Nomor telepon belum diatur
                  </span>
                )}
                {business && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-[#24cbc5]" />
                    {business.name}
                  </span>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-[#a4a7ac]">
                <span>
                  Terdaftar sejak: <strong className="text-white font-medium">{registeredDateFormatted}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5 font-mono">
                  ID: <span className="text-[#c5cbd5]">{user.id.slice(0, 8)}...</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1 text-[#a4a7ac] hover:text-white transition cursor-pointer"
                    title="Salin ID lengkap"
                    aria-label="Salin User ID"
                  >
                    {copiedId ? (
                      <Check className="size-3 text-[#24cbc5]" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Navigation and Panels Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Side / Top Tab Navigation */}
          <div className="lg:col-span-4 w-full">
            <nav className="rounded-2xl border border-white/10 bg-[#273242] p-2 sm:p-3 space-y-1 shadow-lg">
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer text-left ${
                  activeTab === 'personal'
                    ? 'bg-[#1835d9] text-white shadow-md'
                    : 'text-[#c5cbd5] hover:bg-white/5 hover:text-white'
                }`}
              >
                <User className={`size-4 ${activeTab === 'personal' ? 'text-white' : 'text-[#24cbc5]'}`} />
                <div className="flex-1">
                  <span className="block leading-tight">Informasi Pribadi</span>
                  <span className="block text-[11px] opacity-75 font-normal mt-0.5">
                    Nama & nomor telepon
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer text-left ${
                  activeTab === 'security'
                    ? 'bg-[#1835d9] text-white shadow-md'
                    : 'text-[#c5cbd5] hover:bg-white/5 hover:text-white'
                }`}
              >
                <KeyRound className={`size-4 ${activeTab === 'security' ? 'text-white' : 'text-[#24cbc5]'}`} />
                <div className="flex-1">
                  <span className="block leading-tight">Keamanan & Sandi</span>
                  <span className="block text-[11px] opacity-75 font-normal mt-0.5">
                    Ganti kata sandi akun
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer text-left ${
                  activeTab === 'account'
                    ? 'bg-[#1835d9] text-white shadow-md'
                    : 'text-[#c5cbd5] hover:bg-white/5 hover:text-white'
                }`}
              >
                <Shield className={`size-4 ${activeTab === 'account' ? 'text-white' : 'text-[#24cbc5]'}`} />
                <div className="flex-1">
                  <span className="block leading-tight">Informasi Akun</span>
                  <span className="block text-[11px] opacity-75 font-normal mt-0.5">
                    Peran & data usaha terhubung
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('session')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer text-left ${
                  activeTab === 'session'
                    ? 'bg-[#1835d9] text-white shadow-md'
                    : 'text-[#c5cbd5] hover:bg-white/5 hover:text-white'
                }`}
              >
                <LogOut className={`size-4 ${activeTab === 'session' ? 'text-white' : 'text-red-400'}`} />
                <div className="flex-1">
                  <span className="block leading-tight">Sesi & Keluar</span>
                  <span className="block text-[11px] opacity-75 font-normal mt-0.5">
                    Keluar dari akun
                  </span>
                </div>
              </button>
            </nav>
          </div>

          {/* Active Tab Panel */}
          <div className="lg:col-span-8 w-full">
            {/* TAB 1: INFORMASI PRIBADI */}
            {activeTab === 'personal' && (
              <div className="rounded-2xl border border-white/10 bg-[#273242] p-6 sm:p-8 shadow-xl animate-in fade-in duration-150">
                <div className="border-b border-white/10 pb-4 mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    Informasi Pribadi
                  </h3>
                  <p className="text-xs text-[#c5cbd5] mt-1">
                    Perbarui nama dan kontak Anda untuk memudahkan komunikasi dan identifikasi dalam sistem.
                  </p>
                </div>

                {profileFeedback?.error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-xs text-red-200"
                  >
                    <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
                    <span>{profileFeedback.error}</span>
                  </div>
                )}

                {profileFeedback?.success && (
                  <div
                    role="status"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#24cbc5]/30 bg-[#173d3c] p-4 text-xs text-[#7de3dc]"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-[#24cbc5] mt-0.5" />
                    <span>{profileFeedback.success}</span>
                  </div>
                )}

                <form onSubmit={handleProfileSubmit} className="space-y-5">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={nameInputId}
                      className="block text-xs font-medium text-white"
                    >
                      Nama Lengkap <span className="text-[#24cbc5]">*</span>
                    </label>
                    <input
                      id={nameInputId}
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-4 py-2.5 text-sm text-white placeholder-[#a4a7ac] focus:border-[#24cbc5] focus:ring-1 focus:ring-[#24cbc5] focus:outline-none transition"
                    />
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={phoneInputId}
                      className="block text-xs font-medium text-white"
                    >
                      Nomor Telepon
                    </label>
                    <input
                      id={phoneInputId}
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-4 py-2.5 text-sm text-white placeholder-[#a4a7ac] focus:border-[#24cbc5] focus:ring-1 focus:ring-[#24cbc5] focus:outline-none transition"
                    />
                    <p className="text-[11px] text-[#a4a7ac]">
                      Format nomor seluler aktif (contoh: 081234567890 atau +6281234567890).
                    </p>
                  </div>

                  {/* Email (Read-only with explanation) */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={emailInputId}
                      className="block text-xs font-medium text-white"
                    >
                      Alamat Email
                    </label>
                    <div className="relative">
                      <input
                        id={emailInputId}
                        type="email"
                        disabled
                        value={user.email || ''}
                        className="w-full rounded-xl border border-white/10 bg-[#1c222e]/60 px-4 py-2.5 text-sm text-[#c5cbd5] opacity-80 cursor-not-allowed"
                      />
                      <span className="absolute right-3.5 top-2.5 rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-[#c5cbd5]">
                        Terkunci
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5 text-[11px] text-[#a4a7ac] pt-1">
                      <Info className="size-3.5 shrink-0 text-[#24cbc5] mt-0.5" />
                      <span>
                        Email terhubung dengan kredensial autentikasi utama Anda. Demi keamanan akun, perubahan alamat email memerlukan tautan verifikasi.
                      </span>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-white/10 flex justify-end">
                    <button
                      type="submit"
                      disabled={profilePending}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1835d9] hover:bg-[#132c9e] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1835d9]/30 transition cursor-pointer disabled:opacity-50"
                    >
                      {profilePending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Menyimpan...
                        </>
                      ) : (
                        'Simpan Perubahan'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: KEAMANAN & KATA SANDI */}
            {activeTab === 'security' && (
              <div className="rounded-2xl border border-white/10 bg-[#273242] p-6 sm:p-8 shadow-xl animate-in fade-in duration-150">
                <div className="border-b border-white/10 pb-4 mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    Keamanan & Kata Sandi
                  </h3>
                  <p className="text-xs text-[#c5cbd5] mt-1">
                    Ganti kata sandi secara berkala untuk menjaga keamanan akun dan operasional usaha Anda.
                  </p>
                </div>

                {passwordFeedback?.error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-xs text-red-200"
                  >
                    <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
                    <span>{passwordFeedback.error}</span>
                  </div>
                )}

                {passwordFeedback?.success && (
                  <div
                    role="status"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#24cbc5]/30 bg-[#173d3c] p-4 text-xs text-[#7de3dc]"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-[#24cbc5] mt-0.5" />
                    <span>{passwordFeedback.success}</span>
                  </div>
                )}

                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  {/* Current Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={currentPassId}
                      className="block text-xs font-medium text-white"
                    >
                      Kata Sandi Saat Ini / Sementara <span className="text-[#24cbc5]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id={currentPassId}
                        type={showCurrentPass ? 'text' : 'password'}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Masukkan kata sandi saat ini"
                        className="w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-4 py-2.5 pr-11 text-sm text-white placeholder-[#a4a7ac] focus:border-[#24cbc5] focus:ring-1 focus:ring-[#24cbc5] focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-3.5 top-2.5 text-[#c5cbd5] hover:text-white transition cursor-pointer"
                        aria-label={showCurrentPass ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                      >
                        {showCurrentPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={newPassId}
                      className="block text-xs font-medium text-white"
                    >
                      Kata Sandi Baru <span className="text-[#24cbc5]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id={newPassId}
                        type={showNewPass ? 'text' : 'password'}
                        required
                        minLength={10}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 10 karakter"
                        className="w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-4 py-2.5 pr-11 text-sm text-white placeholder-[#a4a7ac] focus:border-[#24cbc5] focus:ring-1 focus:ring-[#24cbc5] focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3.5 top-2.5 text-[#c5cbd5] hover:text-white transition cursor-pointer"
                        aria-label={showNewPass ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                      >
                        {showNewPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={confirmPassId}
                      className="block text-xs font-medium text-white"
                    >
                      Konfirmasi Kata Sandi Baru <span className="text-[#24cbc5]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id={confirmPassId}
                        type={showConfirmPass ? 'text' : 'password'}
                        required
                        minLength={10}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        placeholder="Ketik ulang kata sandi baru"
                        className="w-full rounded-xl border border-[#454d5b] bg-[#1c222e] px-4 py-2.5 pr-11 text-sm text-white placeholder-[#a4a7ac] focus:border-[#24cbc5] focus:ring-1 focus:ring-[#24cbc5] focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3.5 top-2.5 text-[#c5cbd5] hover:text-white transition cursor-pointer"
                        aria-label={showConfirmPass ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                      >
                        {showConfirmPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Password Requirements Checklist */}
                  <div className="rounded-xl border border-white/5 bg-[#1c222e]/60 p-4 space-y-2 text-xs">
                    <span className="font-medium text-[#c5cbd5] block mb-2">
                      Persyaratan kata sandi:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                            hasMinLength
                              ? 'bg-[#24cbc5] text-[#1c222e]'
                              : 'bg-white/10 text-[#a4a7ac]'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={hasMinLength ? 'text-white' : 'text-[#a4a7ac]'}>
                          Minimal 10 karakter
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                            hasLetter && hasNumber
                              ? 'bg-[#24cbc5] text-[#1c222e]'
                              : 'bg-white/10 text-[#a4a7ac]'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={hasLetter && hasNumber ? 'text-white' : 'text-[#a4a7ac]'}>
                          Kombinasi huruf & angka
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                            passwordsMatch
                              ? 'bg-[#24cbc5] text-[#1c222e]'
                              : 'bg-white/10 text-[#a4a7ac]'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={passwordsMatch ? 'text-white' : 'text-[#a4a7ac]'}>
                          Konfirmasi sandi cocok
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-white/10 flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordPending || !isPasswordValid}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1835d9] hover:bg-[#132c9e] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1835d9]/30 transition cursor-pointer disabled:opacity-50"
                    >
                      {passwordPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Memperbarui Sandi...
                        </>
                      ) : (
                        'Perbarui Kata Sandi'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: INFORMASI AKUN */}
            {activeTab === 'account' && (
              <div className="rounded-2xl border border-white/10 bg-[#273242] p-6 sm:p-8 shadow-xl animate-in fade-in duration-150">
                <div className="border-b border-white/10 pb-4 mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    Detail Informasi Akun
                  </h3>
                  <p className="text-xs text-[#c5cbd5] mt-1">
                    Informasi teknis mengenai peran, status keanggotaan, dan usaha yang terhubung.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Role Detail */}
                  <div className="rounded-xl border border-white/5 bg-[#1c222e]/60 p-4">
                    <span className="text-[11px] text-[#a4a7ac] block uppercase tracking-wider mb-1">
                      Peran Akun
                    </span>
                    <span className="text-base font-semibold text-white flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full bg-[#24cbc5]" />
                      {displayRole}
                    </span>
                    <p className="text-xs text-[#c5cbd5] mt-1.5">
                      {member?.role === 'owner'
                        ? 'Memiliki akses penuh untuk mengelola usaha, inventori, laporan, dan staf.'
                        : member?.role === 'admin'
                        ? 'Dapat mengelola katalog produk, stok inventori, dan kasir.'
                        : 'Memiliki akses langsung ke transaksi operasional Kasir (POS).'}
                    </p>
                  </div>

                  {/* Status Detail */}
                  <div className="rounded-xl border border-white/5 bg-[#1c222e]/60 p-4">
                    <span className="text-[11px] text-[#a4a7ac] block uppercase tracking-wider mb-1">
                      Status Keanggotaan
                    </span>
                    <span className="text-base font-semibold text-[#7de3dc] flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-[#24cbc5]" />
                      {isActive ? 'Aktif' : 'Dinonaktifkan'}
                    </span>
                    <p className="text-xs text-[#c5cbd5] mt-1.5">
                      {isActive
                        ? 'Sesi Anda terverifikasi dan aktif di sistem Usahaku.'
                        : 'Akses dinonaktifkan oleh pemilik usaha.'}
                    </p>
                  </div>

                  {/* Connected Business */}
                  <div className="rounded-xl border border-white/5 bg-[#1c222e]/60 p-4">
                    <span className="text-[11px] text-[#a4a7ac] block uppercase tracking-wider mb-1">
                      Usaha Terhubung
                    </span>
                    <span className="text-base font-semibold text-white flex items-center gap-2">
                      <Building2 className="size-4 text-[#24cbc5]" />
                      {business ? business.name : 'Belum Terhubung'}
                    </span>
                    {business && (
                      <p className="text-xs text-[#c5cbd5] mt-1.5">
                        Kode Usaha: <span className="font-mono text-white">{business.code}</span>
                      </p>
                    )}
                  </div>

                  {/* Registered Date */}
                  <div className="rounded-xl border border-white/5 bg-[#1c222e]/60 p-4">
                    <span className="text-[11px] text-[#a4a7ac] block uppercase tracking-wider mb-1">
                      Tanggal Pendaftaran
                    </span>
                    <span className="text-base font-semibold text-white flex items-center gap-2">
                      <Calendar className="size-4 text-[#24cbc5]" />
                      {registeredDateFormatted}
                    </span>
                    <p className="text-xs text-[#c5cbd5] mt-1.5">
                      Akun terdaftar di database cloud Usahaku.
                    </p>
                  </div>
                </div>

                {/* Account Technical Details */}
                <div className="mt-6 rounded-xl border border-white/5 bg-[#1c222e]/40 p-4 text-xs space-y-2">
                  <span className="font-medium text-white block mb-2">Metadata Autentikasi</span>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-[#a4a7ac]">User ID (UUID):</span>
                    <span className="font-mono text-white select-all">{user.id}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-[#a4a7ac]">Tipe Akun:</span>
                    <span className="text-white capitalize">
                      {user.app_metadata?.account_type || 'Owner (Reguler)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span className="text-[#a4a7ac]">Penyedia Autentikasi:</span>
                    <span className="text-white capitalize">
                      {user.app_metadata?.provider || 'Email & Kata Sandi'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SESI & KELUAR */}
            {activeTab === 'session' && (
              <div className="rounded-2xl border border-white/10 bg-[#273242] p-6 sm:p-8 shadow-xl animate-in fade-in duration-150">
                <div className="border-b border-white/10 pb-4 mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    Sesi & Keluar Akun
                  </h3>
                  <p className="text-xs text-[#c5cbd5] mt-1">
                    Kelola sesi login aktif Anda pada peramban ini.
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-5 mb-6">
                  <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-2">
                    <LogOut className="size-4 text-red-400" />
                    Keluar dari Sesi
                  </h4>
                  <p className="text-xs text-[#c5cbd5] leading-relaxed mb-4">
                    Menekan tombol keluar akan mengakhiri sesi autentikasi pada peramban ini. Anda harus memasukkan kredensial login kembali saat membuka Usahaku berikutnya.
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowLogoutModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600/90 hover:bg-red-600 px-5 py-2.5 text-xs font-semibold text-white transition shadow-lg shadow-red-900/30 cursor-pointer"
                  >
                    <LogOut className="size-3.5" />
                    Keluar dari Akun
                  </button>
                </div>

                <div className="text-xs text-[#a4a7ac]">
                  <p>
                    Catatan: Jika Anda menggunakan perangkat bersama, pastikan selalu keluar setelah selesai menggunakan sistem kasir atau dashboard.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logout Confirmation Dialog Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-2xl text-white">
            <div className="size-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
              <LogOut className="size-6" />
            </div>

            <h3 className="text-base font-semibold text-white mb-1.5">
              Konfirmasi Keluar Akun
            </h3>
            <p className="text-xs text-[#c5cbd5] mb-6 leading-relaxed">
              Apakah Anda yakin ingin keluar dari akun <strong className="text-white">{displayName}</strong>? Sesi Anda pada perangkat ini akan diakhiri.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                disabled={logoutPending}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#c5cbd5] hover:bg-white/10 transition cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition shadow-lg shadow-red-900/40 cursor-pointer disabled:opacity-50"
              >
                {logoutPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Keluar...
                  </>
                ) : (
                  'Ya, Keluar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
