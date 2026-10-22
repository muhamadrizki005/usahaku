'use client'

import { FormEvent, useMemo, useState, useActionState, useEffect, startTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CalendarDays, Eye, EyeOff, ShieldCheck, Store, UsersRound } from 'lucide-react'
import { UsahakuLogo } from '@/components/usahaku-logo'
import { LegalModal, type LegalModalType } from '@/components/legal-modal'
import { registerOwner, loginWithGoogle } from '@/app/actions'

export default function OriginalSignup() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [legalModal, setLegalModal] = useState<LegalModalType>(null)
  const [authState, dispatchSignup, authPending] = useActionState(registerOwner, {})
  const [googleState, dispatchGoogle, googlePending] = useActionState(loginWithGoogle, {})
  const pending = authPending || googlePending
  useEffect(() => { setError(authState.error || googleState.error || '') }, [authState, googleState])
  useEffect(() => {
    if (!authState.success) return
    window.sessionStorage.setItem('usahaku_signup_sent_at', String(Date.now()))
    router.replace('/signup/verify')
  }, [authState.success, router])

  const validName = form.name.trim().length >= 2
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const validPhone = /^(?:08|\+62)[0-9]{8,13}$/.test(form.phone.replace(/[\s-]/g, ''))
  const strongPassword = form.password.length >= 10
  const matchingPassword = form.password.length > 0 && form.password === form.confirmPassword
  const canSubmit = validName && validEmail && (!form.phone.trim() || validPhone) && strongPassword && matchingPassword && !pending
  const strength = useMemo(() => [form.password.length >= 10, /[A-Za-z]/.test(form.password), /\d/.test(form.password), form.password.length >= 12], [form.password])

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  function handleGoogleSignUp() {
    setError('')
    startTransition(() => dispatchGoogle(new FormData()))
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    const data = new FormData()
    for (const key of ['name', 'email', 'phone', 'password'] as const) data.set(key, form[key])
    data.set('confirmation', form.confirmPassword)
    window.sessionStorage.setItem('usahaku_signup_email', form.email)
    setError('')
    startTransition(() => dispatchSignup(data))
  }

  return <main className="min-h-screen bg-[#1c222e] text-white"><header className="border-b border-white/10 bg-[#1c222e]"><div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12"><Link href="/" aria-label="Usahaku beranda"><UsahakuLogo /></Link><Link href="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[#c5cbd5] hover:bg-[#273242] hover:text-[#24cbc5]"><ArrowLeft aria-hidden="true" /> Kembali ke beranda</Link></div></header>
    <div className="grid lg:grid-cols-[42%_58%]"><section className="bg-[#202938] px-5 py-12 sm:px-10 lg:flex lg:min-h-[calc(100vh-136px)] lg:items-center lg:px-16 xl:px-24"><div className="mx-auto w-full max-w-xl"><p className="text-xs font-semibold tracking-[0.18em] text-[#1665cf]">RUANG UNTUK USAHA ANDA</p><h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">Langkah pertama untuk<br />usaha yang lebih<br />tertata.</h1><p className="mt-6 max-w-md text-lg leading-8 text-[#c5cbd5]">Satu platform untuk mengelola usaha, pelanggan, dan pertumbuhan bisnis.</p><div className="mt-10 rounded-2xl border border-white/10 bg-[#1c222e] p-6 shadow-sm"><h2 className="text-base font-semibold">Mengikuti cara usaha Anda bekerja</h2><div className="mt-6 flex flex-col gap-5"><Benefit icon={Store} title="Toko & laundry" description="Stok, transaksi, atau progres pesanan." /><Benefit icon={CalendarDays} title="Usaha berbasis jadwal" description="Reservasi dan janji temu sesuai layanan." /><Benefit icon={UsersRound} title="Pemilik tetap memegang kendali" description="Pelanggan, laporan, dan akses staf." /></div></div><p className="mt-6 flex items-center gap-2 text-sm text-[#c5cbd5]"><ShieldCheck className="text-[#1665cf]" aria-hidden="true" /> Akses operasional staf mengikuti izin yang Anda tetapkan.</p></div></section>
    <section className="bg-[#1c222e] px-5 py-12 sm:px-10 lg:px-16 lg:py-16 xl:px-24"><div className="mx-auto w-full max-w-[610px]"><div className="flex items-center gap-3 text-sm"><span className="rounded-full bg-[#1835d9] px-3 py-1.5 font-semibold text-white">01 Akun pemilik</span><span className="h-px w-8 bg-white/15" /><span className="font-medium text-[#98a2b3]">02 Pengaturan usaha</span></div><h2 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">Mulai dengan akun Anda</h2><p className="mt-3 max-w-lg leading-7 text-[#c5cbd5]">Daftar sebagai pemilik. Detail dan kategori usaha akan diatur setelah akun Anda dibuat.</p><form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>{authState.success && <p role="status" className="rounded-xl border border-[#24cbc5]/30 bg-[#202938] p-4 text-sm text-[#c5cbd5]">{authState.success}</p>}{error && <div role="alert" className="rounded-xl border border-[#f56f6a]/30 bg-[#4a252b] p-4 text-sm text-[#ffb4ae]">{error}</div>}<Field label="Nama pemilik" htmlFor="name"><div className="relative"><input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#1c222e] px-4 pr-11 outline-none placeholder:text-[#98a2b3] focus:border-[#1835d9] focus:ring-2 focus:ring-[#1835d9]/15" placeholder="Nama lengkap Anda" />{validName && <span className="absolute right-4 top-3.5 text-[#24cbc5]" aria-label="Nama valid">✓</span>}</div></Field><Field label="Email" htmlFor="email"><input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#1c222e] px-4 outline-none placeholder:text-[#98a2b3] focus:border-[#1835d9] focus:ring-2 focus:ring-[#1835d9]/15" placeholder="nama@usaha.com" />{validEmail && <p className="text-xs text-[#1665cf]">Format email sudah sesuai.</p>}</Field><Field label="Nomor telepon" htmlFor="phone"><input id="phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#1c222e] px-4 outline-none placeholder:text-[#98a2b3] focus:border-[#1835d9] focus:ring-2 focus:ring-[#1835d9]/15" placeholder="08 atau +62" /><p className="text-xs text-[#c5cbd5]">Gunakan nomor aktif, diawali 08 atau +62.</p></Field><Field label="Kata sandi" htmlFor="password"><PasswordInput id="password" value={form.password} visible={showPassword} onChange={(value) => update('password', value)} onToggle={() => setShowPassword((visible) => !visible)} /><div className="mt-2 flex gap-1.5" aria-label="Kekuatan kata sandi">{strength.map((active, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${active ? 'bg-[#24cbc5]' : 'bg-[#e5eaf2]'}`} />)}</div><p className={`text-xs ${strongPassword ? 'text-[#1665cf]' : 'text-[#c5cbd5]'}`}>Kuat • Minimal 10 karakter, dengan huruf dan angka.</p></Field><Field label="Konfirmasi kata sandi" htmlFor="confirmPassword"><PasswordInput id="confirmPassword" value={form.confirmPassword} visible={showConfirm} onChange={(value) => update('confirmPassword', value)} onToggle={() => setShowConfirm((visible) => !visible)} />{matchingPassword && <p className="text-xs text-[#1665cf]">Kata sandi sudah cocok.</p>}</Field><p className="text-xs leading-5 text-[#c5cbd5]">Dengan membuat akun, Anda menyetujui <button type="button" onClick={() => setLegalModal('terms')} className="font-medium text-[#1835d9] hover:underline">Syarat Penggunaan</button> dan <button type="button" onClick={() => setLegalModal('privacy')} className="font-medium text-[#1835d9] hover:underline">Kebijakan Privasi</button> Usahaku.</p><button disabled={!canSubmit} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1835d9] font-semibold text-white transition-colors hover:bg-[#132c9e] disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Membuat akun...' : 'Buat Akun Pemilik'} <ArrowRight aria-hidden="true" /></button><div className="flex items-center gap-3 text-xs text-[#98a2b3]"><span className="h-px flex-1 bg-white/10" />atau daftar dengan email<span className="h-px flex-1 bg-white/10" /></div><button type="button" disabled={pending} onClick={handleGoogleSignUp} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#d0d5dd] bg-white px-4 font-semibold text-[#1c222e] transition-colors hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#24cbc5] disabled:cursor-not-allowed disabled:opacity-60"><GoogleMark />{pending ? 'Menghubungkan...' : 'Daftar dengan Google'}</button><p className="text-center text-sm text-[#c5cbd5]">Sudah punya akun? <Link href="/login" className="font-semibold text-[#1835d9] hover:underline">Masuk</Link></p><p className="text-center text-xs text-[#98a2b3]">Aktivasi akun menggunakan kode OTP yang dikirim ke email Anda.</p></form></div></section></div><footer className="border-t border-white/10 bg-[#1c222e]"><div className="mx-auto flex min-h-16 max-w-[1440px] flex-col justify-center gap-3 px-5 py-4 text-sm text-[#c5cbd5] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><span>© 2026 Usahaku</span><div className="flex flex-wrap gap-5"><button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-[#1835d9]">Kebijakan Privasi</button><button type="button" onClick={() => setLegalModal('terms')} className="hover:text-[#1835d9]">Syarat Penggunaan</button></div></div></footer><LegalModal type={legalModal} onClose={() => setLegalModal(null)} onSwitchType={(type) => setLegalModal(type)} /></main>
}

function GoogleMark() { return <span aria-hidden="true" className="text-lg font-bold text-[#4285f4]">G</span> }

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <label htmlFor={htmlFor} className="flex flex-col gap-2 text-sm font-semibold text-white">{label}{children}</label> }
function PasswordInput({ id, value, visible, onChange, onToggle }: { id: string; value: string; visible: boolean; onChange: (value: string) => void; onToggle: () => void }) { return <div className="relative"><input aria-label={id === 'confirmPassword' ? 'Konfirmasi kata sandi' : 'Kata sandi'} id={id} type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#1c222e] px-4 pr-12 font-normal outline-none placeholder:text-[#98a2b3] focus:border-[#1835d9] focus:ring-2 focus:ring-[#1835d9]/15" placeholder="Minimal 10 karakter" /><button type="button" onClick={onToggle} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#c5cbd5] hover:text-[#1835d9]" aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div> }
function Benefit({ icon: Icon, title, description }: { icon: typeof Store; title: string; description: string }) { return <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#273242] text-[#1835d9]"><Icon aria-hidden="true" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-5 text-[#c5cbd5]">{description}</p></div></div> }
