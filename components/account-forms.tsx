'use client'

import { useActionState, useId, useState, useEffect } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { GoogleSignIn } from '@/components/google-sign-in'
import { loginOwner, loginStaff, registerOwner, resendConfirmation, requestPasswordReset, createStaff, manageStaff, changePassword, recoverPassword } from '@/app/actions'
import type { ActionState, Member } from '@/lib/validation'

function Feedback({ state }: { state: ActionState }) {
  const [showPassword, setShowPassword] = useState(false)
  useEffect(() => {
    setShowPassword(Boolean(state.temporaryPassword))
    const timer = window.setTimeout(() => setShowPassword(false), 120000)
    return () => window.clearTimeout(timer)
  }, [state])
  return <div aria-live="polite" className="space-y-3">{state.error && <p role="alert" className="rounded-lg border border-[#f56f6a]/30 bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{state.error}</p>}{state.success && <p role="status" className="rounded-lg bg-[#173d3c] p-3 text-sm text-[#7de3dc]">{state.success}</p>}{showPassword && state.temporaryPassword && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>Sandi sementara · berikan secara pribadi. Tampilan ini disembunyikan setelah dua menit.</p><code data-testid="temporary-password" className="mt-3 block select-all break-all text-lg font-semibold">{state.temporaryPassword}</code><button type="button" onClick={() => setShowPassword(false)} className="mt-3 underline">Sembunyikan sandi</button></div>}</div>
}

export function Field({ label, name, type = 'text', required = true, defaultValue, minLength, maxLength = 128, autoComplete, placeholder, appearance = 'auth' }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; minLength?: number; maxLength?: number; autoComplete?: string; placeholder?: string; appearance?: 'auth' | 'setup' }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className="block space-y-2 text-sm font-medium"><label htmlFor={id}>{label}</label><span className="relative block"><input id={id} name={name} type={type === 'password' && visible ? 'text' : type} required={required} defaultValue={defaultValue} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} placeholder={placeholder} className={`${appearance === 'setup' ? 'h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20' : 'h-12 rounded-xl border border-white/10 bg-[#1c222e] px-4 font-normal outline-none transition-shadow placeholder:text-[#a4a7ac] focus:border-[#24cbc5] focus:ring-2 focus:ring-[#1835d9]/15'} w-full ${type === 'password' ? 'pr-20' : ''}`} />{type === 'password' && <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#a4a7ac]">{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>}</span></div>
}

function Submit({ pending, children, appearance = 'auth' }: { pending: boolean; children: React.ReactNode; appearance?: 'auth' | 'setup' }) {
  return <button disabled={pending} className={`${appearance === 'setup' ? 'rounded-lg px-4 py-2.5 text-sm' : 'h-12 w-full rounded-xl'} bg-[#1835d9] font-semibold text-white hover:bg-[#132c9e] disabled:cursor-not-allowed disabled:opacity-60`}>{pending ? 'Memproses…' : children}</button>
}

export function AuthForm({ mode }: { mode: 'owner' | 'staff' | 'register' }) {
  const [state, action, pending] = useActionState(mode === 'owner' ? loginOwner : mode === 'staff' ? loginStaff : registerOwner, {})
  return <><form action={action} className="space-y-5"><Feedback state={state} /><fieldset disabled={pending} className="space-y-5">{mode === 'register' && <><Field name="name" label="Nama pemilik" minLength={2} maxLength={100} autoComplete="name" /></>}{mode === 'staff' ? <><Field name="code" label="Kode toko" minLength={8} maxLength={8} autoComplete="organization" placeholder="Contoh: A1B2C3D4" /><Field name="username" label="Username" minLength={3} maxLength={24} autoComplete="username" /></> : <Field name="email" label="Email" type="email" maxLength={254} autoComplete="email" />}{mode === 'register' && <Field name="phone" label="Nomor telepon (opsional)" type="tel" required={false} maxLength={30} autoComplete="tel" />}<Field name="password" label={mode === 'staff' ? 'Kata sandi / sementara' : 'Kata sandi'} type="password" minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />{mode === 'register' && <><Field name="confirmation" label="Konfirmasi kata sandi" type="password" minLength={10} autoComplete="new-password" /><p className="text-xs text-[#94a3b8]">Gunakan minimal 10 karakter. Konfirmasi email diperlukan sebelum membuat usaha.</p></>}<Submit pending={pending}>{mode === 'register' ? 'Buat akun pemilik' : 'Masuk'}</Submit></fieldset>{mode === 'owner' && <Link href="/forgot-password" className="block text-sm text-[#24cbc5]">Lupa kata sandi?</Link>}{mode === 'register' && <Link href="/signup/verify" className="block text-sm text-[#24cbc5]">Kirim ulang email konfirmasi</Link>}</form>{mode !== 'staff' && <GoogleSignIn />}<div className="mt-6"><p className="text-center text-sm text-[#c5cbd5]">{mode === 'register' ? <>Sudah punya akun? <Link href="/login" className="text-[#24cbc5]">Masuk</Link></> : <>Belum punya usaha? <Link href="/signup" className="text-[#24cbc5]">Daftar pemilik</Link></>}</p><p className="mt-5 flex items-center justify-center gap-2 text-xs text-[#c5cbd5]"><LockKeyhole className="size-3.5" />Jangan bagikan kata sandi kepada siapa pun.</p></div></>
}

export function EmailForm({ recovery = false }: { recovery?: boolean }) {
  const [state, action, pending] = useActionState(recovery ? requestPasswordReset : resendConfirmation, {})
  return <form action={action} className="space-y-5"><Feedback state={state} /><fieldset disabled={pending} className="space-y-5"><Field name="email" label="Email pemilik" type="email" maxLength={254} autoComplete="email" /><Submit pending={pending}>{recovery ? 'Kirim tautan pemulihan' : 'Kirim ulang konfirmasi'}</Submit></fieldset><Link href="/login" className="block text-sm text-[#24cbc5]">Kembali ke masuk</Link></form>
}

export function StaffForm({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) {
  const [state, action, pending] = useActionState(createStaff, {})
  const roleId = useId()
  return <form action={action} className="grid gap-3 rounded-xl border border-[#454d5b] bg-[#1c222e] p-4"><Feedback state={state} /><fieldset disabled={pending || disabled} className="grid gap-3"><Field appearance="setup" name="name" label="Nama staf" minLength={2} maxLength={100} /><Field appearance="setup" name="username" label="Username" minLength={3} maxLength={24} autoComplete="off" /><div className="flex flex-col gap-1.5 text-sm font-medium"><label htmlFor={roleId}>Peran</label><select id={roleId} name="role" defaultValue="cashier" className="h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20"><option value="cashier">Kasir</option><option value="admin">Admin toko</option></select></div><p className="text-xs text-[#a4a7ac]">Username terdiri dari 3–24 huruf kecil, angka, atau garis bawah. Staf tidak memerlukan email.</p><div className="mt-4 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-[#a4a7ac]">Batal</button><Submit appearance="setup" pending={pending || disabled}>Buat akses staf</Submit></div></fieldset></form>
}

export function StaffActions({ member }: { member: Member }) {
  const [state, action, pending] = useActionState(manageStaff, {})
  return <form action={action} className="space-y-3"><input type="hidden" name="id" value={member.id} /><div className="flex flex-wrap gap-3"><button name="operation" value={member.active ? 'deactivate' : 'activate'} disabled={pending} className="rounded-lg border border-[#454d5b] px-3 py-2 text-sm">{member.active ? 'Nonaktifkan' : 'Aktifkan'}</button><button name="operation" value="reset" disabled={pending} className="rounded-lg border border-[#454d5b] px-3 py-2 text-sm">Reset kata sandi</button></div><Feedback state={state} /></form>
}

export function PasswordForm({ recovery = false }: { recovery?: boolean }) {
  const [state, action, pending] = useActionState(recovery ? recoverPassword : changePassword, {})
  return <form action={action} className="space-y-5"><Feedback state={state} /><fieldset disabled={pending} className="space-y-5">{!recovery && <Field name="currentPassword" label="Kata sandi saat ini / sementara" type="password" autoComplete="current-password" />}<Field name="password" label="Kata sandi baru" type="password" minLength={10} autoComplete="new-password" /><Field name="confirmation" label="Konfirmasi kata sandi baru" type="password" minLength={10} autoComplete="new-password" /><Submit pending={pending}>Simpan kata sandi</Submit></fieldset></form>
}
