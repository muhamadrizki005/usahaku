'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { UsahakuLogo } from '@/components/usahaku-logo'
import { createClient } from '@/lib/supabase/client'

// Display length only; Supabase remains responsible for validating and expiring codes.
const OTP_LENGTH = process.env.NEXT_PUBLIC_EMAIL_OTP_LENGTH === '8' ? 8 : 6
function remainingCooldown() {
  const sentAt = Number(window.sessionStorage.getItem('usahaku_signup_sent_at'))
  return sentAt > 0 ? Math.max(0, Math.min(60, Math.ceil((sentAt + 60000 - Date.now()) / 1000))) : 0
}

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const busy = useRef(false)

  useEffect(() => {
    const savedEmail = window.sessionStorage.getItem('usahaku_signup_email') ?? ''
    setEmail(savedEmail)
    if (!savedEmail) setError('Email pendaftaran tidak ditemukan. Kembali ke pendaftaran untuk melanjutkan.')
    setCooldown(remainingCooldown())
  }, [])

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setCooldown(remainingCooldown()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  function updateCode(index: number, value: string) {
    const digits = value.replace(/\D/g, '')
    setCode(current => {
      const next = [...current]
      if (!digits) next[index] = ''
      else digits.slice(0, OTP_LENGTH - index).split('').forEach((digit, offset) => { next[index + offset] = digit })
      return next
    })
    if (digits && index < OTP_LENGTH - 1) refs.current[Math.min(index + digits.length, OTP_LENGTH - 1)]?.focus()
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !code[index] && index > 0) refs.current[index - 1]?.focus()
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault()
    if (busy.current || !email || code.join('').length !== OTP_LENGTH) return
    busy.current = true
    setPending(true)
    setError('')
    setMessage('')
    try {
      const { data, error: verifyError } = await createClient().auth.verifyOtp({ email, token: code.join(''), type: 'email' })
      if (verifyError) {
        setError(verifyError.status === 429 ? 'Terlalu banyak percobaan verifikasi. Tunggu sebentar, lalu coba lagi.' : 'Kode verifikasi tidak valid atau sudah kedaluwarsa. Minta kode baru lalu coba lagi.')
        return
      }
      if (!data.session) {
        setError('Sesi belum berhasil dibuat. Coba verifikasi kembali sebelum melanjutkan.')
        return
      }
      window.sessionStorage.removeItem('usahaku_signup_email')
      window.sessionStorage.removeItem('usahaku_signup_sent_at')
      window.location.replace('/onboarding')
    } catch {
      setError('Layanan verifikasi belum dapat dihubungi. Coba lagi sebentar.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  async function resendCode() {
    if (busy.current || !email || cooldown > 0) return
    busy.current = true
    setPending(true)
    setError('')
    setMessage('')
    try {
      const { error: resendError } = await createClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` } })
      if (resendError) {
        setError(resendError.status === 429 ? 'Batas pengiriman kode tercapai. Tunggu beberapa saat, lalu coba lagi.' : 'Kode belum dapat dikirim ulang. Tunggu sebentar lalu coba lagi.')
        if (resendError.status === 429) {
          window.sessionStorage.setItem('usahaku_signup_sent_at', String(Date.now()))
          setCooldown(60)
        }
      } else {
        window.sessionStorage.setItem('usahaku_signup_sent_at', String(Date.now()))
        setCode(Array(OTP_LENGTH).fill(''))
        setMessage('Jika pendaftaran masih menunggu konfirmasi, kode baru dikirim. Periksa inbox dan spam.')
        setCooldown(60)
      }
    } catch {
      setError('Layanan pengiriman belum dapat dihubungi. Coba lagi sebentar.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#1c222e] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Usahaku beranda"><UsahakuLogo /></Link>
          <Link href="/signup" className="inline-flex items-center gap-2 text-sm text-[#c5cbd5] hover:text-[#24cbc5]"><ArrowLeft aria-hidden="true" /> Kembali ke pendaftaran</Link>
        </div>
      </header>
      <section className="mx-auto flex min-h-[calc(100vh-136px)] max-w-xl items-center px-5 py-14">
        <div className="w-full rounded-2xl border border-white/10 bg-[#273242] p-6 sm:p-10">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#273242] text-[#24cbc5]"><MailCheck aria-hidden="true" /></div>
          <h1 className="mt-6 text-3xl font-normal tracking-tight">Verifikasi email Anda</h1>
          <p className="mt-3 leading-7 text-[#c5cbd5]">Kami telah mengirim kode verifikasi ke email Anda. Masukkan kode tersebut untuk melanjutkan.</p>
          <p className="mt-3 rounded-lg bg-[#273242] px-3 py-2 text-sm text-[#24cbc5]">{email || 'Email pendaftaran Anda'}</p>
          <form onSubmit={handleVerify} className="mt-8">
            <div className="flex justify-between gap-2" aria-label="Kode verifikasi email">
              {code.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element }} value={digit} disabled={pending} autoComplete={index === 0 ? 'one-time-code' : 'off'} onFocus={event => event.currentTarget.select()} onChange={(event) => updateCode(index, event.target.value)} onKeyDown={(event) => handleKeyDown(index, event)} inputMode="numeric" maxLength={OTP_LENGTH} aria-label={`Digit ${index + 1} dari ${OTP_LENGTH}`} className={`h-14 ${OTP_LENGTH === 8 ? 'min-w-0 flex-1 max-w-12 sm:max-w-14' : 'w-12 sm:w-14'} rounded-xl border border-white/10 bg-[#1c222e] text-center text-xl font-normal outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#1835d9]/30`} />)}
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg border border-[#f56f6a]/30 bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}</p>}
            {message && <p role="status" className="mt-4 rounded-lg bg-[#173d3c] p-3 text-sm text-[#7de3dc]">{message}</p>}
            <button disabled={pending || code.join('').length !== OTP_LENGTH || !email} className="mt-6 h-12 w-full rounded-xl bg-[#1835d9] font-normal text-white hover:bg-[#132c9e] disabled:cursor-not-allowed disabled:opacity-60">{pending ? 'Memproses...' : 'Verifikasi Email'}</button>
          </form>
          <button type="button" disabled={pending || cooldown > 0 || !email} onClick={resendCode} className="mt-4 w-full text-sm font-normal text-[#24cbc5] disabled:cursor-not-allowed disabled:opacity-50">{cooldown ? `Kirim ulang kode (${cooldown} dtk)` : 'Kirim ulang kode'}</button>
          <p className="mt-5 text-center text-sm text-[#a4a7ac]">Periksa kotak masuk atau folder spam jika email belum terlihat.</p>
        </div>
      </section>
    </main>
  )
}
