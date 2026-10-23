# Contoh dashboard dengan palet landing

Branch `preview/dashboard-landing-palette`, worktree `.cache/dashboard-landing-palette`. Checkout utama tetap `main`; file utama tidak diubah. Source lokal terbaru disalin ke worktree agar perbaikan akun/onboarding sebelumnya tetap tersedia sebagai baseline. Tidak menyalin env, secret, atau data akun.

Contoh dibuka di `/preview/dashboard-palette`, memakai komponen dashboard yang sama dengan website dan data ilustrasi berlabel. Tidak ada login bypass pada route `/dashboard`, tidak membaca/menulis Supabase. Tujuan contoh hanya menilai palet sebelum penerapan ke aplikasi.

Warna: latar `#1C222E`, panel `#273242`, border `#454D5B`, teks putih/`#C5CBD5`, turquoise `#24CBC5` untuk aksen/tautan/grafik, biru `#1835D9` untuk CTA. Struktur, ukuran, tipografi, logo, dan tindakan dashboard dipertahankan. Grafik memakai tinggi pixel terukur agar batang terlihat; perhitungan metrik tidak diubah. ENERGY 1 / RHYTHM 1 / MOTION 1, mengikuti arah visual landing yang diberikan pengguna.

Build produksi dan pemeriksaan browser lulus: warna latar/teks/tombol terukur, Inter termuat, tujuh batang grafik terlihat, tidak ada overflow mobile 390px, menu akun dan navigasi mobile dapat dibuka. Screenshot desktop 1600px dan mobile tersimpan di `artifacts/dashboard-palette/`. Seluruh angka adalah data contoh.

Untuk menjalankan dari folder worktree: `npm run start -- --port 3100`, setelah `npm run build`. Preview tersedia di `http://localhost:3100/preview/dashboard-palette`. Tidak perlu `.env.local` untuk contoh ini. Belum di-commit, di-push, atau di-merge.

Catatan integrasi: uraian di atas merekam tahap contoh awal. Pengguna kemudian menyetujui penerapan seluruh aplikasi dan merge ke main. Lihat docs/PALETTE-APP.md untuk status terbaru dan cara menjalankan di port 3000.
