# Palet seluruh aplikasi — 23 Oktober 2026

Pengguna menyetujui contoh dashboard yang mengikuti landing, kemudian meminta penerapan pada semua halaman dan komponen. Persetujuan terbaru ini menggantikan aturan lama untuk mempertahankan palet berbeda per halaman. Implementasi disiapkan pada branch `feat/landing-palette-app`, worktree `.cache/dashboard-landing-palette`. Pengguna kemudian menyetujui penggabungannya ke `main`; integrasi lokal mempertahankan perubahan onboarding/WebP yang sudah ada sebelumnya. Tidak ada push ke remote dalam pekerjaan ini.

## Warna dan cakupan

- Latar navy `#1C222E`, panel `#273242` / `#303640`, teks putih, teks sekunder `#C5CBD5`, teks redup `#A4A7AC`.
- Aksen/link turquoise `#24CBC5`, tombol utama biru `#1835D9`, hover `#132C9E`, border `#454D5B`.
- Token terpusat dan aturan form di `app/palette.css`; komponen yang sebelumnya memakai warna literal disesuaikan dengan palet tersebut.
- Meliputi landing, login owner/staf, signup, verifikasi OTP, pemulihan akun, onboarding, dashboard, katalog, inventori, POS, transaksi, pelanggan, laporan, pengaturan, akun dan dialog terkait. Halaman prototipe loyalty/asisten turut mengikuti palet; penerapan warna tidak menambah kemampuan backend pada prototipe.
- Ilustrasi dashboard putih pada landing dipertahankan. Cetak laporan/struk memakai kertas putih dengan teks gelap. Warna status/peringatan dan logo resmi dipertahankan sesuai fungsi.
- Layout, ukuran tipografi, Inter lokal, isi teks dan integrasi backend dipertahankan. Baris checklist setup diberi wrapping pada mobile untuk mencegah overflow. Batang grafik memakai tinggi piksel karena tinggi persentase sebelumnya tidak memiliki induk dengan tinggi tetap; data grafik tidak diubah.

## Pengujian aktual

- Production build dan TypeScript berhasil; 19 pengujian lokal backend/database berhasil.
- `tests/browser/palette-app.spec.ts`: 28 tampilan pada 1440×1000 dan 390×844, tidak ada overflow horizontal; Inter terdeteksi; pilihan tema sistem terang/gelap tidak mengganti palet yang disetujui. Dialog staf, produk, pelanggan, legal dan konfirmasi keluar turut diperiksa.
- Alur owner draf tetap menuju onboarding/summary, akses dashboard ditolak sebelum tombol “Buka dashboard” menyelesaikan onboarding. Akses anonim tetap diarahkan ke login.
- Empat suite browser aktual berhasil: katalog/inventori, pelanggan, POS/transaksi, dan laporan. Mencakup pecahan stok, persistensi gambar, retry tanpa duplikasi, checkout/pembatalan, pembatasan kasir, staf nonaktif, pemisahan usaha, ekspor CSV dan PDF.
- PDF laporan memuat seluruh 33 transaksi pada enam halaman, termasuk baris di luar pagination layar; semua referensi terdeteksi dan catatan privat tidak ikut diekspor. Enam halaman dirender dan diperiksa secara visual.
- Tes memakai akun dan data uji baru, membersihkan ID milik tes sendiri; snapshot usaha lama tidak berubah. Tidak ada migrasi database baru untuk palet.

Bukti ada di `artifacts/palette-app/`, `artifacts/catalog/`, `artifacts/customers/`, `artifacts/pos/` dan `artifacts/reports/`. OTP diuji sebatas tampilan enam digit pada pengujian palet; pengiriman email dan pemulihan akun melalui inbox tidak diuji ulang dalam pekerjaan ini.

## Menjalankan preview

Preview terakhir berjalan di `http://localhost:3000` agar redirect autentikasi cocok dengan konfigurasi lokal. Setelah integrasi, jalankan dari folder utama dengan `npm run dev -- --port 3000` atau `npm run build` diikuti `npm run start -- --port 3000`. Hentikan server preview lama sebelum memakai port yang sama. Konfigurasi lingkungan lokal tetap diabaikan Git.

Worktree membawa salinan perubahan onboarding/WebP yang sebelumnya sudah ada di workspace utama agar preview memakai perilaku aplikasi terbaru. Perbedaan file backend/migrasi onboarding terhadap HEAD berasal dari baseline tersebut, bukan perubahan palet ini; jangan menganggap semua selisih worktree sebagai kode baru untuk palet.
