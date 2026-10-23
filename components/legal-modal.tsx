'use client'

import { useEffect } from 'react'
import { X, ShieldCheck, FileText } from 'lucide-react'

export type LegalModalType = 'privacy' | 'terms' | null

interface LegalModalProps {
  type: LegalModalType
  onClose: () => void
  onSwitchType?: (type: 'privacy' | 'terms') => void
}

export function LegalModal({ type, onClose, onSwitchType }: LegalModalProps) {
  useEffect(() => {
    if (!type) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [type, onClose])

  if (!type) return null

  const isPrivacy = type === 'privacy'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1c222e] text-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#273242] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#1835d9]/20 text-[#24cbc5]">
              {isPrivacy ? <ShieldCheck className="size-5" /> : <FileText className="size-5" />}
            </div>
            <div>
              <h2 id="legal-modal-title" className="text-lg font-semibold tracking-tight text-white">
                {isPrivacy ? 'Kebijakan Privasi' : 'Syarat & Ketentuan Penggunaan'}
              </h2>
              <p className="text-xs text-[#a4a7ac]">Platform Usahaku • Berlaku mulai Oktober 2026</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-[#a4a7ac] transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Tutup jendela"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab switcher inside modal for easy reading */}
        {onSwitchType && (
          <div className="flex border-b border-white/10 bg-[#191e28] px-6 pt-2">
            <button
              type="button"
              onClick={() => onSwitchType('privacy')}
              className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                isPrivacy
                  ? 'border-[#1835d9] text-white'
                  : 'border-transparent text-[#a4a7ac] hover:text-white'
              }`}
            >
              Kebijakan Privasi
            </button>
            <button
              type="button"
              onClick={() => onSwitchType('terms')}
              className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                !isPrivacy
                  ? 'border-[#1835d9] text-white'
                  : 'border-transparent text-[#a4a7ac] hover:text-white'
              }`}
            >
              Syarat Penggunaan
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="overflow-y-auto px-6 py-6 text-sm leading-relaxed text-[#c5cbd5] space-y-6">
          {isPrivacy ? (
            <>
              <section className="rounded-xl border border-white/5 bg-[#273242]/60 p-4 text-xs text-[#a4a7ac]">
                Kebijakan Privasi ini mengatur bagaimana platform <span className="font-semibold text-white">Usahaku</span> mengumpulkan, memproses, menyimpan, dan menjaga kerahasiaan data pribadi pemilik usaha, operasional usaha, dan pelanggan Anda.
              </section>

              <div>
                <h3 className="font-semibold text-white text-base">1. Informasi yang Kami Kumpulkan</h3>
                <p className="mt-1.5">
                  Untuk mendukung kelancaran operasional usaha Anda di platform Usahaku, kami mengumpulkan:
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-xs sm:text-sm">
                  <li><strong className="text-white">Data Pemilik Usaha:</strong> Nama lengkap, alamat email aktif, nomor kontak WhatsApp / telepon, dan kata sandi yang disimpan terenkripsi.</li>
                  <li><strong className="text-white">Data Profil Usaha:</strong> Nama toko/bisnis, alamat operasional, kategori usaha, jam operasional, serta pengaturan metode pembayaran (QRIS, transfer bank, e-wallet, tunai).</li>
                  <li><strong className="text-white">Data Katalog & Inventori:</strong> Nama produk, SKU, barcode, harga jual, jumlah stok fisik, dan riwayat penyesuaian stok.</li>
                  <li><strong className="text-white">Data Transaksi & Pelanggan:</strong> Riwayat catatan transaksi kasir POS, nomor faktur, data kontak pelanggan serta akumulasi poin loyalitas.</li>
                  <li><strong className="text-white">Data Akun Staf:</strong> Nama staf, username akses kasir, dan peran yang ditentukan oleh pemilik.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">2. Penggunaan & Pemrosesan Data</h3>
                <p className="mt-1.5">Data yang dikumpulkan dimanfaatkan secara eksklusif untuk:</p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-xs sm:text-sm">
                  <li>Memvalidasi pendaftaran dan keamanan akun melalui pengiriman kode OTP email.</li>
                  <li>Menjalankan fitur operasional sistem kasir, manajemen stok, dan laporan berkala.</li>
                  <li>Membantu analisis usaha melalui modul Asisten Bisnis AI berdasarkan data riil usaha Anda.</li>
                  <li>Mencegah aktivitas mencurigakan atau akses ilegal ke data usaha Anda.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">3. Keamanan & Enkripsi Data</h3>
                <p className="mt-1.5">
                  Kami menerapkan langkah pengamanan berstandar industri dengan teknologi Row-Level Security (RLS) pada basis data terenkripsi. Kata sandi akun tidak pernah disimpan secara terbuka. Akses staf (Admin/Kasir) diatur ketat oleh pemilik usaha sehingga tidak dapat mengakses area di luar kewenangannya.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">4. Kerahasiaan & Pihak Ketiga</h3>
                <p className="mt-1.5">
                  Usahaku menjunjung tinggi kerahasiaan bisnis Anda. Kami <strong className="text-white">tidak pernah menjual atau menyewakan</strong> data bisnis atau data pelanggan Anda kepada pihak ketiga. Pembagian data ke pihak ketiga hanya dilakukan untuk layanan infrastruktur inti (seperti otentikasi Google atau penyedia pengiriman email OTP).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">5. Hak Pemilik Usaha</h3>
                <p className="mt-1.5">
                  Anda memiliki hak penuh untuk mengunduh/mengekspor data katalog produk Anda (CSV), memperbarui profil usaha, mencabut akses staf, atau mengajukan permohonan penutupan akun beserta penghapusan data secara permanen.
                </p>
              </div>
            </>
          ) : (
            <>
              <section className="rounded-xl border border-white/5 bg-[#273242]/60 p-4 text-xs text-[#a4a7ac]">
                Syarat Penggunaan ini merupakan perjanjian hukum antara Anda (pemilik usaha atau perwakilan yang sah) dengan platform <span className="font-semibold text-white">Usahaku</span>. Dengan menggunakan layanan kami, Anda menyetujui seluruh ketentuan di bawah ini.
              </section>

              <div>
                <h3 className="font-semibold text-white text-base">1. Ketentuan Akun & Tanggung Jawab Pengguna</h3>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-xs sm:text-sm">
                  <li>Pendaftaran akun pemilik mewajibkan informasi yang akurat dan email aktif untuk verifikasi kode OTP.</li>
                  <li>Pemilik usaha bertanggung jawab penuh atas keamanan kata sandi dan seluruh aktivitas yang terjadi pada akunnya.</li>
                  <li>Setiap penambahan staf (Admin atau Kasir) merupakan wewenang dan tanggung jawab penuh dari pemilik usaha.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">2. Hak Milik & Kekayaan Intelektual</h3>
                <p className="mt-1.5">
                  Seluruh hak cipta, merek dagang, desain antarmuka, dan kode aplikasi Usahaku adalah hak milik eksklusif platform Usahaku. Sementara itu, seluruh konten, foto produk, merek dagang toko, dan data transaksi yang diunggah pengguna tetap menjadi hak milik sah pengguna/pemilik usaha.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">3. Larangan Penggunaan</h3>
                <p className="mt-1.5">Pengguna dilarang keras untuk:</p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-xs sm:text-sm">
                  <li>Menggunakan platform Usahaku untuk pencatatan atau penjualan produk/jasa yang dilarang oleh hukum Republik Indonesia.</li>
                  <li>Melakukan tindakan peretasan, manipulasi data transaksi secara ilegal, atau upaya membahayakan infrastruktur server Usahaku.</li>
                  <li>Menyalahgunakan kredensial akun staf untuk transaksi fiktif atau merugikan pihak lain.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">4. Ketersediaan Layanan & Pembaruan</h3>
                <p className="mt-1.5">
                  Usahaku berkomitmen menjaga ketersediaan layanan sistem kasir dan pencatatan operasional secara optimal. Pemeliharaan berkala atau pembaruan fitur akan dilakukan secara terencana demi menjaga stabilitas dan kecepatan aplikasi.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-base">5. Batasan Tanggung Jawab</h3>
                <p className="mt-1.5">
                  Usahaku bertindak sebagai sarana pembantu operasional usaha (SaaS). Keputusan operasional, penetapan harga jual, pemenuhan pesanan pelanggan, serta kepatuhan pajak usaha tetap menjadi tanggung jawab mandiri pemilik usaha.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-[#273242] px-6 py-4">
          <p className="text-xs text-[#a4a7ac]">
            Perlu bantuan lebih lanjut? Hubungi dukungan Usahaku.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#1835d9] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#132c9e]"
          >
            Saya Mengerti
          </button>
        </div>
      </div>
    </div>
  )
}
