import OriginalOwnerLogin from '@/components/original/login'
import Link from 'next/link'
import { LoginFrame } from '@/components/original/login-frame'
import { AuthForm } from '@/components/account-forms'
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; notice?: string }> }) {
  const { mode, notice } = await searchParams
  const staff = mode === 'staff'
  if (!staff) return <OriginalOwnerLogin notice={notice} />
  return <LoginFrame title={staff ? 'Masuk sebagai staf' : 'Masuk ke Usahaku'} description={staff ? 'Gunakan kode toko, username, dan sandi yang diberikan pemilik.' : 'Lanjutkan mengelola aktivitas usaha Anda dengan akun yang sudah terdaftar.'}><nav className="mt-8 mb-6 flex gap-3 text-sm" aria-label="Jenis akun"><Link href="/login" aria-current={!staff ? 'page' : undefined} className={!staff ? 'rounded-lg bg-[#273242] px-4 py-2 text-white' : 'px-4 py-2'}>Pemilik</Link><Link href="/login?mode=staff" aria-current={staff ? 'page' : undefined} className={staff ? 'rounded-lg bg-white/10 px-4 py-2 text-[#24cbc5]' : 'px-4 py-2'}>Staf</Link></nav>{notice === 'password-updated' && <p role="status" className="mb-5 rounded-lg bg-[#173d3c] p-3 text-sm text-[#7de3dc]">Kata sandi berhasil diperbarui. Silakan masuk kembali.</p>}{notice === 'configuration' && <p role="alert" className="mb-5 text-sm text-amber-300">Konfigurasi Supabase belum lengkap.</p>}<AuthForm key={staff ? 'staff' : 'owner'} mode={staff ? 'staff' : 'owner'} /></LoginFrame>
}
