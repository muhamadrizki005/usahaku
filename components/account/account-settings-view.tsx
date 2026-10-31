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
  BadgeCheck,
  ExternalLink,
  X,
} from 'lucide-react'
import { UsahakuLogo } from '@/components/usahaku-logo'
import { ProfileAvatarEditor } from './profile-avatar-editor'
import {
  updateAccountProfile,
  updateAccountPassword,
  requestPasswordReset,
  signOut,
} from '@/app/actions'
import { roleNames } from '@/lib/auth/permissions'
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

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotPending, startForgotTransition] = useTransition()
  const [forgotFeedback, setForgotFeedback] = useState<{
    error?: string
    success?: string
  } | null>(null)

  // Logout State
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [logoutPending, startLogoutTransition] = useTransition()

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
  const isStaffAccount = user.app_metadata?.account_type === 'staff' || (user.email && user.email.endsWith('@staff.usahaku.invalid'))

  // Password Validation: min 8 karakter, kombinasi huruf, angka, simbol
  const hasMinLength = newPassword.length >= 8
  const hasLetter = /[a-zA-Z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const hasSymbol = /[^a-zA-Z0-9]/.test(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmation
  const isPasswordValid =
    hasMinLength && hasLetter && hasNumber && hasSymbol && passwordsMatch

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
        error: 'Kata sandi baru harus minimal 8 karakter dan kombinasi huruf, angka, serta simbol.',
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

  // Handle Forgot Password Request
  const handleForgotPassword = () => {
    setForgotFeedback(null)

    if (isStaffAccount || !user.email) {
      setForgotFeedback({
        error: 'Akun staf tidak menggunakan email. Silakan minta reset sandi kepada pemilik usaha (owner).',
      })
      return
    }

    const formData = new FormData()
    formData.set('email', user.email)

    startForgotTransition(async () => {
      const res = await requestPasswordReset({}, formData)
      if (res.error) {
        setForgotFeedback({ error: res.error })
      } else {
        setForgotFeedback({
          success: `Tautan pemulihan kata sandi telah dikirim ke ${user.email}. Silakan periksa kotak masuk (inbox) atau folder spam di Gmail Anda.`,
        })
      }
    })
  }

  // Handle Logout
  const handleLogout = () => {
    startLogoutTransition(async () => {
      await signOut()
    })
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

              {/* Revision 1: Removed ID next to registration date */}
              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-[#a4a7ac]">
                <span>
                  Terdaftar sejak: <strong className="text-white font-medium">{registeredDateFormatted}</strong>
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

                  {/* Email: Revision 2 - Removed "Terkunci" badge */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={emailInputId}
                      className="block text-xs font-medium text-white"
                    >
                      Alamat Email
                    </label>
                    <input
                      id={emailInputId}
                      type="email"
                      disabled
                      value={user.email || ''}
                      className="w-full rounded-xl border border-white/10 bg-[#1c222e]/60 px-4 py-2.5 text-sm text-[#c5cbd5] opacity-80 cursor-not-allowed"
                    />
                    <div className="flex items-start gap-1.5 text-[11px] text-[#a4a7ac] pt-1">
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
                <div className="border-b border-white/10 pb-4 mb-6 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Keamanan & Kata Sandi
                    </h3>
                    <p className="text-xs text-[#c5cbd5] mt-1">
                      Ganti kata sandi secara berkala untuk menjaga keamanan akun dan operasional usaha Anda.
                    </p>
                  </div>
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
                  {/* Current Password with "Lupa kata sandi?" link (Revision 4) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={currentPassId}
                        className="block text-xs font-medium text-white"
                      >
                        Kata Sandi Saat Ini / Sementara <span className="text-[#24cbc5]">*</span>
                      </label>

                      {/* Revision 4: Trigger lupa kata sandi */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotModal(true)
                          setForgotFeedback(null)
                        }}
                        className="text-xs text-[#24cbc5] hover:underline cursor-pointer font-medium"
                      >
                        Lupa kata sandi?
                      </button>
                    </div>

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

                  {/* New Password: Revision 3 - min 8 karakter */}
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
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 8 karakter"
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
                        minLength={8}
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

                  {/* Password Requirements Checklist (Revision 3: min 8, angka, huruf, simbol) */}
                  <div className="rounded-xl border border-white/5 bg-[#1c222e]/60 p-4 space-y-2 text-xs">
                    <span className="font-medium text-[#c5cbd5] block mb-2">
                      Persyaratan kata sandi:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                          Minimal 8 karakter
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                            hasLetter
                              ? 'bg-[#24cbc5] text-[#1c222e]'
                              : 'bg-white/10 text-[#a4a7ac]'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={hasLetter ? 'text-white' : 'text-[#a4a7ac]'}>
                          Kombinasi huruf (A-Z, a-z)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                            hasNumber
                              ? 'bg-[#24cbc5] text-[#1c222e]'
                              : 'bg-white/10 text-[#a4a7ac]'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={hasNumber ? 'text-white' : 'text-[#a4a7ac]'}>
                          Kombinasi angka (0-9)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                            hasSymbol
                              ? 'bg-[#24cbc5] text-[#1c222e]'
                              : 'bg-white/10 text-[#a4a7ac]'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={hasSymbol ? 'text-white' : 'text-[#a4a7ac]'}>
                          Kombinasi simbol (!@#$...)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 sm:col-span-2">
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
                          Konfirmasi kata sandi cocok
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Revision 4: Helpful Reset Callout Banner */}
                  <div className="rounded-xl border border-white/10 bg-[#1c222e]/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-white flex items-center gap-1.5">
                        <KeyRound className="size-3.5 text-[#24cbc5]" />
                        Lupa kata sandi akun?
                      </span>
                      <p className="text-[11px] text-[#c5cbd5]">
                        Kirim tautan pemulihan pengaturan sandi langsung ke email Gmail terdaftar Anda.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotModal(true)
                        setForgotFeedback(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#24cbc5]/40 bg-[#24cbc5]/10 hover:bg-[#24cbc5]/20 px-3.5 py-1.5 text-xs font-medium text-[#24cbc5] transition shrink-0 cursor-pointer"
                    >
                      <Mail className="size-3.5" />
                      Kirim Tautan Reset
                    </button>
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

      {/* Revision 4: Forgot Password Modal Dialog */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-[#454d5b] bg-[#273242] p-6 sm:p-7 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-[#24cbc5]/15 border border-[#24cbc5]/30 flex items-center justify-center text-[#24cbc5]">
                  <KeyRound className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Pemulihan Kata Sandi
                  </h3>
                  <p className="text-xs text-[#c5cbd5]">
                    Kirim tautan reset ke email Gmail Anda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false)
                  setForgotFeedback(null)
                }}
                className="p-1.5 rounded-lg text-[#c5cbd5] hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Tutup"
              >
                <X className="size-4" />
              </button>
            </div>

            {forgotFeedback?.error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 p-3.5 text-xs text-red-200"
              >
                <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
                <span>{forgotFeedback.error}</span>
              </div>
            )}

            {forgotFeedback?.success ? (
              <div className="space-y-4">
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-xl border border-[#24cbc5]/30 bg-[#173d3c] p-4 text-xs text-[#7de3dc]"
                >
                  <CheckCircle2 className="size-5 shrink-0 text-[#24cbc5] mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Email Pemulihan Terkirim!</p>
                    <p className="leading-relaxed">{forgotFeedback.success}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#24cbc5] hover:bg-[#1bb8b2] text-[#1c222e] transition shadow cursor-pointer"
                  >
                    <ExternalLink className="size-3.5" />
                    Buka Gmail
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false)
                      setForgotFeedback(null)
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-[#c5cbd5] hover:bg-white/10 transition cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {isStaffAccount ? (
                  <p className="text-xs text-[#c5cbd5] leading-relaxed">
                    Akun Anda terdaftar sebagai akun staf toko tanpa email pribadi. Pemulihan dan reset kata sandi dilakukan langsung oleh pemilik usaha (owner) melalui menu pengaturan staf.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-[#c5cbd5] leading-relaxed">
                      Kami akan mengirimkan email berisi tautan pengaturan kata sandi baru ke alamat Gmail terdaftar Anda:
                    </p>
                    <div className="rounded-xl border border-white/10 bg-[#1c222e] p-3 text-xs font-medium text-white flex items-center gap-2">
                      <Mail className="size-4 text-[#24cbc5] shrink-0" />
                      <span className="truncate">{user.email || 'Email belum diatur'}</span>
                    </div>
                    <p className="text-[11px] text-[#a4a7ac]">
                      Setelah menerima email di inbox atau spam, klik tautan tersebut untuk membuat kata sandi baru.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false)
                      setForgotFeedback(null)
                    }}
                    disabled={forgotPending}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#c5cbd5] hover:bg-white/10 transition cursor-pointer"
                  >
                    Batal
                  </button>

                  {!isStaffAccount && user.email && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotPending}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#1835d9] hover:bg-[#132c9e] text-white transition shadow-lg shadow-[#1835d9]/30 cursor-pointer disabled:opacity-50"
                    >
                      {forgotPending ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Mengirim Email...
                        </>
                      ) : (
                        <>
                          <Mail className="size-3.5" />
                          Kirim ke Gmail
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
