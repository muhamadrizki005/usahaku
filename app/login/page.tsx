import OriginalOwnerLogin from '@/components/original/login'
import { LoginFrame } from '@/components/original/login-frame'
import { AuthForm } from '@/components/account-forms'
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; notice?: string }> }) {
  const { mode, notice } = await searchParams
  const staff = mode === 'staff'
  if (!staff) return <OriginalOwnerLogin notice={notice} />
  return <LoginFrame mode="staff" title={staff ? 'Masuk sebagai staf' : 'Masuk ke Usahaku'} description={staff ? 'Gunakan kode toko, username, dan sandi yang diberikan pemilik.' : 'Lanjutkan mengelola aktivitas usaha Anda dengan akun yang sudah terdaftar.'}><div className="mt-8">{notice === 'password-updated' && <p role="status" className="mb-5 rounded-lg bg-[#173d3c] p-3 text-sm text-[#7de3dc]">Kata sandi berhasil diperbarui. Silakan masuk kembali.</p>}{notice === 'configuration' && <p role="alert" className="mb-5 text-sm text-amber-300">Konfigurasi Supabase belum lengkap.</p>}<AuthForm key={staff ? 'staff' : 'owner'} mode={staff ? 'staff' : 'owner'} /></div></LoginFrame>
}
