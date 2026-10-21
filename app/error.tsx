'use client'
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="min-h-screen bg-[#f8fafc] px-5 py-16 text-[#0f172a]"><div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-semibold">Halaman belum dapat dimuat</h1><p className="mt-4 text-sm leading-7 text-slate-600">Koneksi atau data akses belum dapat diperiksa. Tidak ada perubahan yang dapat dipastikan dari pesan ini. Muat ulang untuk memeriksa hasil sebelum mengulang tindakan.</p><button onClick={reset} className="mt-6 rounded-xl bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white">Coba lagi</button><a href="/login" className="ml-4 text-sm text-[#0f766e] underline">Halaman masuk</a></div></main>
}
