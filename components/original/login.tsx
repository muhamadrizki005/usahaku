'use client'

import { FormEvent, useState, useActionState, useEffect, startTransition } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { LoginFrame } from '@/components/original/login-frame'
import { loginOwner, loginWithGoogle } from '@/app/actions'

export default function OriginalOwnerLogin({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [authState, dispatchLogin, authPending] = useActionState(loginOwner, {})
  const [googleState, dispatchGoogle, googlePending] = useActionState(loginWithGoogle, {})
  const pending = authPending || googlePending
  useEffect(() => { setError(authState.error || googleState.error || '') }, [authState, googleState])

  function handleGoogleSignIn() {
    setError('')
    startTransition(() => dispatchGoogle(new FormData()))
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData()
    data.set('email', email)
    data.set('password', password)
    setError('')
    startTransition(() => dispatchLogin(data))
  }

  return <LoginFrame>
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">{notice === 'password-updated' && <p role="status" className="rounded-xl bg-[#173d3c] p-4 text-sm text-[#7de3dc]">Kata sandi berhasil diperbarui. Silakan masuk kembali.</p>}
              {error && <div role="alert" className="rounded-xl border border-[#f2b8b5] bg-[#fff3f2] p-4 text-[#8f2d2a]"><p className="font-semibold">{error}</p><p className="mt-1 text-sm">Periksa kembali isian Anda, lalu coba lagi.</p>{error.includes('Konfirmasi') && <p className="mt-2 text-xs">{error}</p>}</div>}
              <label className="flex flex-col gap-2 text-sm font-semibold text-white">Email<input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 rounded-xl border border-white/10 bg-[#1c222e] px-4 font-normal outline-none transition-shadow placeholder:text-[#98a2b3] focus:border-[#1835d9] focus:ring-2 focus:ring-[#1835d9]/15" placeholder="nama@usaha.com" /></label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-white">Kata sandi<div className="relative"><input aria-label="Kata sandi" minLength={1} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#1c222e] px-4 pr-12 font-normal outline-none transition-shadow placeholder:text-[#98a2b3] focus:border-[#1835d9] focus:ring-2 focus:ring-[#1835d9]/15" placeholder="Masukkan kata sandi" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#c5cbd5] hover:text-[#1835d9]" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>
              <div className="flex items-center justify-between gap-4 text-sm"><label className="flex items-center gap-2 text-[#c5cbd5]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-[#1835d9]" /> Ingat saya</label><Link href="/forgot-password" className="font-medium text-[#1835d9] hover:underline">Lupa kata sandi?</Link></div>
              <button disabled={pending} className="h-12 rounded-xl bg-[#1835d9] font-semibold text-white transition-colors hover:bg-[#132c9e] disabled:cursor-not-allowed disabled:opacity-60">{pending ? 'Memproses...' : 'Masuk'}</button><div className="flex items-center gap-3 text-xs text-[#98a2b3]"><span className="h-px flex-1 bg-white/10" />atau<span className="h-px flex-1 bg-white/10" /></div><button type="button" disabled={pending} onClick={handleGoogleSignIn} className="flex h-12 items-center justify-center gap-3 rounded-xl border border-[#d0d5dd] bg-white font-semibold text-[#1c222e] transition-colors hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#24cbc5] disabled:cursor-not-allowed disabled:opacity-60"><GoogleMark />{pending ? 'Menghubungkan...' : 'Masuk dengan Google'}</button>
              <p className="text-center text-sm text-[#c5cbd5]">Belum punya akun? <Link className="font-semibold text-[#1835d9] hover:underline" href="/signup">Daftar sebagai pemilik</Link></p>
              <p className="flex items-center justify-center gap-2 text-xs text-[#c5cbd5]"><LockKeyhole aria-hidden="true" /> Jangan bagikan kata sandi kepada siapa pun.</p>
            </form>
  </LoginFrame>
}

function GoogleMark() { return <span aria-hidden="true" className="text-lg font-bold text-[#4285f4]">G</span> }

